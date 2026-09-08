import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getCurrentSession } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { sanitizeBaseName } from '@/lib/exportHelpers'
import {
  buildObserverWorkbookBuffer,
  fetchImage,
  formatClock,
  mapLimited,
  MAX_CONCURRENCY,
  mmssFileToken,
  observerKeyName,
  type CloudinaryImage,
} from '@/lib/serverExport'

export const dynamic = 'force-dynamic'

type CapturesContext = {
  params: Promise<{ projectId: string }>
}

/**
 * Téléchargement ZIP des captures d'un projet (ou d'un observateur donné).
 *
 * Le chemin `/api/*` n'étant pas couvert par la garde du proxy, ce gestionnaire
 * s'autorise lui-même : session requise + accès de gestion (owner / partagé / admin).
 * Les images Cloudinary sont récupérées côté serveur (impossible en lecture canvas cross-origin).
 */
export async function GET(_request: Request, ctx: CapturesContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })
  }

  const level = await getCurrentProjectAccess(projectId)
  if (!canManage(level)) {
    return NextResponse.json(
      { error: 'Accès de gestion requis sur ce projet.' },
      { status: 403 },
    )
  }

  const url = new URL(_request.url)
  const observerId = url.searchParams.get('observerId')

  const rows = await prisma.observation.findMany({
    where: {
      projectId,
      ...(observerId ? { userId: observerId } : {}),
    },
    include: {
      user: { select: { username: true, email: true, anonymousId: true } },
      point: { select: { pointName: true, trameDebut: true, trameFin: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Aucune capture à télécharger.' },
      { status: 404 },
    )
  }

  const title = sanitizeBaseName(project.title)
  const firstUser = rows[0].user
  const zipBasename = observerId
    ? `${title}_${observerKeyName({
        username: firstUser?.username ?? null,
        email: firstUser?.email ?? null,
        anonymousId: firstUser?.anonymousId ?? null,
      })}_captures`
    : `${title}_captures`
  const zipFilename = `${zipBasename}.zip`

  // ——— Récupération serveur des images (concurrence limitée) ———
  const downloaded = await mapLimited(rows, MAX_CONCURRENCY, (row) => fetchImage(row.imageUrl))
  const successes: Array<{ image: CloudinaryImage; index: number }> = []
  let failedCount = 0
  downloaded.forEach((image, index) => {
    if (image) successes.push({ image, index })
    else failedCount += 1
  })

  if (successes.length === 0) {
    return NextResponse.json(
      { error: `Aucune image n'a pu être récupérée (${failedCount} échec${failedCount > 1 ? 's' : ''}).` },
      { status: 502 },
    )
  }

  // ——— Assemblage du ZIP ———
  // Structure : captures/<observateur>/<MM>m<SS>s.png + manifest.json (métadonnées).
  // Les coordonnées spatiales (bounding boxes) et notes de capture ne sont PAS persistées
  // (procédure d'observation indépendante) → elles sont volontairement null dans le manifest.
  const zip = new JSZip()
  const frames: Array<Record<string, unknown>> = []
  const usedPaths = new Set<string>()

  for (const { image, index } of successes) {
    const row = rows[index]
    const folderName = observerKeyName({
      username: row.user?.username ?? null,
      email: row.user?.email ?? null,
      anonymousId: row.user?.anonymousId ?? null,
    })
    const token = mmssFileToken(row.timestampTotal)
    let fileName = `${token}.${image.extension}`
    let suffix = 2
    while (usedPaths.has(`${folderName}/${fileName}`)) {
      fileName = `${token}_${suffix}.${image.extension}`
      suffix += 1
    }
    usedPaths.add(`${folderName}/${fileName}`)
    const path = `captures/${folderName}/${fileName}`
    zip.file(path, image.buffer)

    frames.push({
      file: path,
      frameTimestampSeconds: row.timestampTotal,
      frameTimestampLabel: formatClock(row.timestampTotal),
      observationType: row.observationType ?? null,
      validationStatus: row.isGhostPoint ? 'POINT_FANTOME_FAUSSE_ALERTE' : 'VALIDEE',
      windowLabel: row.point?.pointName ?? null,
      observer: {
        username: row.user?.username ?? null,
        email: row.user?.email ?? null,
        anonymousId: row.user?.anonymousId ?? null,
      },
      capturedAt: row.createdAt,
      spatialBounds: { x: null, y: null, width: null, height: null }, // non persistées (observation indépendante)
      frameNote: null, // notes de capture non enregistrées
    })
  }

  // ZIP individuel d'un observateur : le classeur « Données » accompagne ses images.
  if (observerId) {
    const observerUser = {
      username: firstUser?.username ?? null,
      email: firstUser?.email ?? null,
      anonymousId: firstUser?.anonymousId ?? null,
    }
    const workbook = await buildObserverWorkbookBuffer(
      rows.map((row) => ({
        timestampTotal: row.timestampTotal,
        observationType: row.observationType,
        isGhostPoint: row.isGhostPoint,
        createdAt: row.createdAt,
      })),
    )
    zip.file(`Donnees_${observerKeyName(observerUser)}.xlsx`, workbook)
  }

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        project: { id: project.id, title: project.title },
        exportedAt: new Date().toISOString(),
        totalFrames: frames.length,
        protocolNote:
          'Coordonnées spatiales (X/Y), dimensions et notes de capture non enregistrées : ' +
          'la procédure d’observation indépendante ne persiste aucune géométrie. Les images ' +
          'annotées restent rattachées à leur horodatage vidéo et à leur statut de validation.',
        frames,
      },
      null,
      2,
    ),
  )

  const nodeBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
    'Content-Length': String(nodeBuffer.byteLength),
  })

  return new NextResponse(new Uint8Array(nodeBuffer), { status: 200, headers })
}
