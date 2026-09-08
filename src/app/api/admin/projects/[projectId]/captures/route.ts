import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getCurrentSession } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { sanitizeBaseName } from '@/lib/exportHelpers'

export const dynamic = 'force-dynamic'

type CapturesContext = {
  params: Promise<{ projectId: string }>
}

const MAX_CONCURRENCY = 6
const FETCH_TIMEOUT_MS = 30_000

type CloudinaryImage = { buffer: Buffer; extension: string }

/** Télécharge une image distante avec délai d'abandon ; null si indisponible. */
async function fetchImage(url: string): Promise<CloudinaryImage | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    const content = await response.arrayBuffer()
    const mime = response.headers.get('content-type')?.toLowerCase() ?? ''
    const extension = extensionFromMime(mime) ?? extensionFromPath(url) ?? 'png'
    return { buffer: Buffer.from(content), extension }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function extensionFromMime(mime: string): string | null {
  if (mime.includes('image/png')) return 'png'
  if (mime.includes('image/jpeg') || mime.includes('image/jpg')) return 'jpg'
  if (mime.includes('image/webp')) return 'webp'
  if (mime.includes('image/gif')) return 'gif'
  return null
}

function extensionFromPath(url: string): string | null {
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url.split('?')[0] ?? url)
  return match?.[1]?.toLowerCase() ?? null
}

/** Exécute fn sur items avec au plus `limit` tâches simultanées. */
async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await fn(items[current], current)
    }
  }

  const poolSize = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))
  return results
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
  const zipBasename = observerId
    ? `${title}_${sanitizeBaseName(
        rows[0].user?.username?.trim() ||
          rows[0].user?.email?.trim() ||
          rows[0].user?.anonymousId ||
          'observateur',
      )}_captures`
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
  const zip = new JSZip()
  for (const { image, index } of successes) {
    const sequence = String(index + 1).padStart(4, '0')
    zip.file(`${sequence}-${sanitizeBaseName(rows[index].id)}.${image.extension}`, image.buffer)
  }
  const nodeBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
    'Content-Length': String(nodeBuffer.byteLength),
  })

  return new NextResponse(new Uint8Array(nodeBuffer), { status: 200, headers })
}
