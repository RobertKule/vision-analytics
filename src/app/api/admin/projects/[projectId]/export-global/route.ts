import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getCurrentSession } from '@/lib/auth'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { brandFileName, sanitizeBaseName } from '@/lib/exportHelpers'
import type { ExportObservationRow } from '@/lib/exportHelpers'
import { buildObservationExportCsv } from '@/lib/exportHelpers'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import {
  buildObserverWorkbookBuffer,
  fetchStoredImage,
  mapLimited,
  MAX_CONCURRENCY,
  mmssFileToken,
  observerKeyName,
} from '@/lib/serverExport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ExportContext = {
  params: Promise<{ projectId: string }>
}

/** Fenêtres / observateurs rattachés à une observation, avec leur dossier d'export. */
type GroupedObserver = {
  userId: string
  folderName: string
  displayName: string
  username: string | null
  email: string | null
  anonymousId: string | null
  rows: Array<{
    id: string
    timestampTotal: number
    observationType: string | null
    isGhostPoint: boolean
    pointLabel: string | null
    imageUrl: string
    /** Référence Google Drive (fichier privé) — lecture serveur uniquement. */
    driveFileId: string | null
    createdAt: string
  }>
}

/**
 * « Export Global du Projet » : archive ZIP hiérarchique contenant
 *   [Titre]_Export_Global/
 *   ├── Rapport_Global_Projet.csv        (relevé complet, 11 colonnes)
 *   ├── Observateur_<Nom>/
 *   │   ├── Donnees_<Nom>.xlsx           (classeur individuel, colonnes exactes)
 *   │   └── Captures/capture_MMmSSs.png  (images annotées de l'observateur)
 *   └── manifest.json                    (métadonnées + protocole)
 *
 * Auto-authentification de la route `/api/*` : session + accès de gestion requis.
 */
export async function GET(_request: Request, ctx: ExportContext): Promise<NextResponse> {
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

  // RBAC : ADMIN, propriétaire, ou analyste invité (un partage donne toujours la
  // consultation, l'analyse et l'export ; la configuration exige un droit d'édition).
  const permissions = await getCurrentProjectPermissions(projectId)
  if (!permissions.canExport) {
    return NextResponse.json(
      { error: 'Accès de gestion requis sur ce projet.' },
      { status: 403 },
    )
  }

  const rows = await prisma.observation.findMany({
    // Données CERTIFIÉES uniquement : le relevé brut conserve chaque capture
    // certifiée (`isVerified`), mais ignore les sessions « en cours ».
    where: { projectId, isVerified: true },
    include: {
      user: { select: { username: true, email: true, anonymousId: true } },
      point: { select: { pointName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Aucune observation à exporter.' },
      { status: 404 },
    )
  }

  const rootFolder = `${sanitizeBaseName(project.title)}_Export_Global`

  // ——— Regroupement par observateur (userId) ———
  const byObserver = new Map<string, GroupedObserver>()
  for (const row of rows) {
    const userId = row.userId ?? 'sans-compte'
    const userKey = observerKeyName({
      username: row.user?.username ?? null,
      email: row.user?.email ?? null,
      anonymousId: row.user?.anonymousId ?? null,
    })
    const existing = byObserver.get(userId)
    if (existing) {
      existing.rows.push({
        id: row.id,
        timestampTotal: row.timestampTotal,
        observationType: row.observationType,
        isGhostPoint: row.isGhostPoint,
        pointLabel: row.point?.pointName ?? null,
        imageUrl: row.imageUrl,
        driveFileId: row.driveFileId,
        createdAt: row.createdAt.toISOString(),
      })
    } else {
      byObserver.set(userId, {
        userId,
        folderName: `Observateur_${userKey}`,
        displayName: observerDisplayName(row.user),
        username: row.user?.username ?? null,
        email: row.user?.email ?? null,
        anonymousId: row.user?.anonymousId ?? null,
        rows: [
          {
            id: row.id,
            timestampTotal: row.timestampTotal,
            observationType: row.observationType,
            isGhostPoint: row.isGhostPoint,
            pointLabel: row.point?.pointName ?? null,
            imageUrl: row.imageUrl,
            driveFileId: row.driveFileId,
            createdAt: row.createdAt.toISOString(),
          },
        ],
      })
    }
  }
  const observers = Array.from(byObserver.values()).sort((a, b) =>
    a.folderName.localeCompare(b.folderName),
  )

  const zip = new JSZip()

  // ——— Rapport global du projet (relevé complet, 11 colonnes) ———
  const exportRows: ExportObservationRow[] = rows.map((row) => ({
    id: row.id,
    observerUsername: row.user?.username ?? null,
    observerEmail: row.user?.email ?? null,
    observerAnonymousId: row.user?.anonymousId ?? '—',
    timestampTotal: row.timestampTotal,
    pointLabel: row.point?.pointName ?? null,
    isGhostPoint: row.isGhostPoint,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt.toISOString(),
  }))

  const rapportCsv = buildObservationExportCsv(
    {
      id: project.id,
      title: project.title,
      description: null,
      videoUrl: null,
      createdAt: new Date().toISOString(),
      totalDefinedPoints: 0,
    },
    exportRows,
  )
  zip.file(`${rootFolder}/Rapport_Global_Projet.csv`, rapportCsv)

  // ——— Dossiers par observateur : Donnees.xlsx + Captures ———
  let writtenFrames = 0
  let failedImages = 0
  const usedPaths = new Set<string>()

  for (const observer of observers) {
    const workbook = await buildObserverWorkbookBuffer(
      observer.rows.map((row) => ({
        timestampTotal: row.timestampTotal,
        observationType: row.observationType,
        isGhostPoint: row.isGhostPoint,
        createdAt: row.createdAt,
      })),
    )
    zip.file(
      `${rootFolder}/${observer.folderName}/Donnees_${observer.folderName.replace(/^Observateur_/, '')}.xlsx`,
      workbook,
    )

    // Les fichiers Google Drive sont PRIVÉS : les octets sont lus côté serveur via
    // le compte de service (`alt=media`), jamais par une URL publique.
    const downloaded = await mapLimited(observer.rows, MAX_CONCURRENCY, (row) =>
      fetchStoredImage({ driveFileId: row.driveFileId, imageUrl: row.imageUrl }),
    )
    downloaded.forEach((image, index) => {
      if (!image) {
        failedImages += 1
        return
      }
      const row = observer.rows[index]
      const token = mmssFileToken(row.timestampTotal)
      let fileName = `capture_${token}.${image.extension}`
      let suffix = 2
      const basePath = `${rootFolder}/${observer.folderName}/Captures/`
      while (usedPaths.has(basePath + fileName)) {
        fileName = `capture_${token}_${suffix}.${image.extension}`
        suffix += 1
      }
      usedPaths.add(basePath + fileName)
      zip.file(basePath + fileName, image.buffer)
      writtenFrames += 1
    })
  }

  // ——— manifest.json ———
  zip.file(
    `${rootFolder}/manifest.json`,
    JSON.stringify(
      {
        project: { id: project.id, title: project.title },
        exportedAt: new Date().toISOString(),
        totalObservations: exportRows.length,
        totalFramesWritten: writtenFrames,
        failedImageDownloads: failedImages,
        observers: observers.map((observer) => ({
          folder: observer.folderName,
          displayName: observer.displayName,
          username: observer.username,
          email: observer.email,
          anonymousId: observer.anonymousId,
          observations: observer.rows.length,
          validated: observer.rows.filter((row) => !row.isGhostPoint).length,
          ghosts: observer.rows.filter((row) => row.isGhostPoint).length,
        })),
        files: {
          rapport: `${rootFolder}/Rapport_Global_Projet.csv`,
          dataSheets: observers.map(
            (observer) =>
              `${rootFolder}/${observer.folderName}/Donnees_${observer.folderName.replace(/^Observateur_/, '')}.xlsx`,
          ),
        },
        protocolNote:
          'Coordonnées spatiales (X/Y) et géométrie de capture non enregistrées : la ' +
          'procédure d’observation indépendante ne persiste aucune géométrie. Le champ ' +
          '« Coordonnées (X, Y) » des classeurs reste volontairement vide ; chaque capture ' +
          'reste identifiée par son horodatage vidéo (MM:SS), son type d’observation et son ' +
          'statut de validation (« Point trouvé ? »).',
      },
      null,
      2,
    ),
  )

  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.exportGlobal,
    entityType: 'export',
    entityId: project.id,
    metadata: {
      title: project.title,
      observations: exportRows.length,
      framesWritten: writtenFrames,
      failedImages,
    },
  })

  const nodeBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const filename = `${brandFileName(rootFolder)}.zip`

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(nodeBuffer.byteLength),
  })

  return new NextResponse(new Uint8Array(nodeBuffer), { status: 200, headers })
}

/** Libellé d'affichage d'un observateur (username → email → identifiant anonyme). */
function observerDisplayName(user: {
  username: string | null
  email: string | null
  anonymousId: string | null
} | null): string {
  return user?.username?.trim() || user?.email?.trim() || user?.anonymousId || 'observateur'
}
