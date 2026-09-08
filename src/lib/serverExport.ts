import ExcelJS from 'exceljs'
import { sanitizeBaseName } from '@/lib/exportHelpers'

/**
 * Utilitaires d'export exécutés CÔTÉ SERVEUR uniquement (route handlers d'API).
 * ExcelJS et le téléchargement d'images distantes ne doivent jamais entrer dans
 * un bundle client — n'importez ce module que depuis des routes `app/api/**`.
 */

export type CloudinaryImage = { buffer: Buffer; extension: string }

export const MAX_CONCURRENCY = 6
export const FETCH_TIMEOUT_MS = 30_000

/** Télécharge une image distante avec délai d'abandon ; null si indisponible. */
export async function fetchImage(url: string): Promise<CloudinaryImage | null> {
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

/** Libellé mm:ss lisible d'un horodatage vidéo. */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Jeton de fichier « MMmSSs » d'un horodatage vidéo (ex. 84 → « 01m24s »). */
export function mmssFileToken(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`
}

/** Exécute fn sur items avec au plus `limit` tâches simultanées. */
export async function mapLimited<T, R>(
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

/** Libellé d'affichage d'un observateur (username → email → identifiant anonyme). */
export function observerDisplayLabel(user: {
  username: string | null
  email: string | null
  anonymousId: string | null
}): string {
  return user.username?.trim() || user.email?.trim() || user.anonymousId || 'observateur'
}

/** Jeton de nom sûr (dossiers / fichiers) pour un observateur. */
export function observerKeyName(user: {
  username: string | null
  email: string | null
  anonymousId: string | null
}): string {
  return sanitizeBaseName(observerDisplayLabel(user))
}

/** Ligne de relevé par observateur alimentant le classeur Excel individuel. */
export type ObserverWorkbookRow = {
  timestampTotal: number
  observationType: string | null
  isGhostPoint: boolean
  createdAt: Date | string
}

/**
 * Colonnes EXACTES du classeur individuel d'un observateur.
 * « Coordonnées (X, Y) » reste vide : la géométrie de capture n'est jamais persistée.
 */
export const OBSERVER_WORKBOOK_HEADERS = [
  'Minuterie (MM:SS)',
  "Type d'observation",
  'Point trouvé ?',
  'Coordonnées (X, Y)',
  'Date de Capture',
] as const

/**
 * Construit le classeur `.xlsx` individuel d'un observateur (feuille « Données »),
 * trié chronologiquement, avec en-têtes en gras et colonnes dimensionnées.
 */
export async function buildObserverWorkbookBuffer(
  rows: ObserverWorkbookRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Vision Analytics'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Données')
  sheet.columns = OBSERVER_WORKBOOK_HEADERS.map((header) => ({
    header,
    key: header,
    width: Math.max(header.length + 4, 18),
  }))

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FF121417' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6ECD3' } }
  headerRow.alignment = { vertical: 'middle' }

  const ordered = rows
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.timestampTotal - b.timestampTotal)

  for (const row of ordered) {
    sheet.addRow({
      'Minuterie (MM:SS)': formatClock(row.timestampTotal),
      "Type d'observation": row.observationType?.trim() || '',
      'Point trouvé ?': row.isGhostPoint ? 'Non' : 'Oui',
      'Coordonnées (X, Y)': '', // non persistées (protocole) — documentées dans le manifest
      'Date de Capture': row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    })
  }

  // Numéros de ligne stables pour un style de pied de feuille lisibles par Excel.
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'middle' }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}
