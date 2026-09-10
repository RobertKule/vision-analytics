/**
 * Google Drive — couche serveur d'upload / suppression / lecture des captures annotées.
 *
 * REMPLACE Cloudinary comme stockage des nouvelles captures (mission de finalisation ONA Field).
 *
 * Architecture & règles :
 *  — SERVEUR UNIQUEMENT. Ce module utilise un compte de service Google et son `access_token` ;
 *    il ne doit JAMAIS être importé depuis du code client (`'use client'`) ni exposer un
 *    identifiant au navigateur.
 *  — La configuration (email + clé privée du compte de service, dossier cible) est résolue
 *    PAresseusement, au moment d'une opération réelle — un environnement sans stockage
 *    configuré peut démarrer (les opérations de stockage échouent alors avec un message clair).
 *  — La base ne conserve QUE des références (`driveFileId` + lien « view » Drive), jamais le binaire.
 *  — Les fichiers restent PRIVÉS : aucune permission publique n'est jamais posée. L'affichage
 *    des captures dans l'application passe par l'endpoint serveur sécurisé
 *    `/api/captures/<id>/image` (vérification de session + autorisation, puis lecture
 *    authentifiée des octets). Les exports conservent, eux, le `driveFileId` et le lien Drive.
 *  — Suppression ciblée par `fileId` ; un fichier déjà absent (404) est considéré supprimé.
 *  — Les erreurs TRANSITOIRES (réseau, 5xx, 429, 401 sans rétablissement) sont levées : l'appelant
 *    doit alors conserver la référence en base (jamais de suppression silencieuse → pas d'orphelin).
 *  — Lecture des octets bruts via `alt=media` authentifié (fiable côté serveur, sans dépendre du
 *    partage public) — utilisée par les exports qui incorporent les captures.
 */

import { resolveDriveConfig, type DriveConfig } from '@/lib/driveConfig'
import { requestDriveAccessToken } from '@/lib/driveAuth'
import {
  driveFileIdFromReference,
  driveMediaApiUrl,
  driveViewUrl,
  isDriveFileId,
} from '@/lib/driveRef'
import { createCaptureFolderResolver, DRIVE_FOLDER_MIME_TYPE } from '@/lib/driveLayout'

const DRIVE_API_ROOT = 'https://www.googleapis.com'

/** Borne de sécurité : aucune capture ne dépasse 15 Mo décodés (WebP compressé ≪ cette borne). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

const REQUEST_TIMEOUT_MS = 45_000
const TOKEN_SKEW_SECONDS = 60

export type { DriveConfig }

/** Erreur liée à la configuration du stockage (message utilisable tel quel). */
export class DriveConfigError extends Error {}

/** Erreur HTTP Drive (statut conservé pour distinguer 404/401/transitoire). */
export class DriveHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'DriveHttpError'
    this.status = status
  }
}

/** Vrai si le stockage Google Drive est configuré (identifiants présents). */
export function isDriveConfigured(): boolean {
  return resolveDriveConfig() !== null
}

/** Jeton bearer en cache, rattaché à un compte de service donné. */
let cachedToken: { clientEmail: string; token: string; expiresAtMs: number } | null = null

/** Purge le cache de jeton (tests / reconnexion). */
export function resetDriveTokenCacheForTests(): void {
  cachedToken = null
}

async function acquireAccessToken(config: DriveConfig): Promise<string> {
  if (
    cachedToken &&
    cachedToken.clientEmail === config.clientEmail &&
    Date.now() < cachedToken.expiresAtMs
  ) {
    return cachedToken.token
  }
  const response = await requestDriveAccessToken({
    clientEmail: config.clientEmail,
    privateKeyPem: config.privateKeyPem,
  })
  cachedToken = {
    clientEmail: config.clientEmail,
    token: response.access_token,
    expiresAtMs: Date.now() + (response.expires_in - TOKEN_SKEW_SECONDS) * 1000,
  }
  return cachedToken.token
}

type DriveContext = { config: DriveConfig; token: string }

/** Résout la configuration OU lève une erreur explicite si le stockage n'est pas prêt. */
async function ensureDriveContext(): Promise<DriveContext> {
  const config = resolveDriveConfig()
  if (!config) {
    throw new DriveConfigError(
      'Stockage Google Drive non configuré. Renseignez GOOGLE_DRIVE_CLIENT_EMAIL et ' +
        'GOOGLE_DRIVE_PRIVATE_KEY (et GOOGLE_DRIVE_FOLDER_ID) puis redémarrez le serveur.',
    )
  }
  const token = await acquireAccessToken(config)
  return { config, token }
}

/** Exécute une requête Drive authentifiée ; rétablit une fois le jeton si 401. */
async function driveRequest(
  context: DriveContext,
  pathAndQuery: string,
  init: { method?: string; headers?: Record<string, string>; body?: BodyInit | null } = {},
): Promise<Response> {
  const attempt = async (token: string): Promise<Response> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await fetch(`${DRIVE_API_ROOT}${pathAndQuery}`, {
        method: init.method ?? 'GET',
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
        body: init.body ?? null,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  let response = await attempt(context.token)
  if (response.status === 401) {
    // Jeton expiré/révoqué : purge du cache et nouvel essai unique.
    resetDriveTokenCacheForTests()
    const fresh = await acquireAccessToken(context.config)
    response = await attempt(fresh)
  }
  return response
}

async function assertOk(response: Response, operation: string): Promise<unknown> {
  if (response.ok) {
    const text = await response.text().catch(() => '')
    return text ? JSON.parse(text) : {}
  }
  const body = await response.text().catch(() => '')
  throw new DriveHttpError(
    response.status,
    `Google Drive ${operation} — HTTP ${response.status}.${body ? ` ${body.slice(0, 300)}` : ''}`,
  )
}

function decodeDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl.trim())
  if (!match) {
    throw new Error('Format d’image invalide pour le stockage Google Drive.')
  }
  const mimeType = match[1] === 'jpg' ? 'image/jpeg' : `image/${match[1]}`
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength === 0) throw new Error('Image vide : rien à stocker.')
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Image trop volumineuse pour le stockage (${(buffer.byteLength / 1048576).toFixed(1)} Mo).`)
  }
  return { mimeType, buffer }
}

export type DriveUploadResult = {
  /** Identifiant Google Drive du fichier (persisté dans `Observation.driveFileId`). */
  driveFileId: string
  /**
   * Lien « view » Google Drive (persisté dans `Observation.imageUrl`). Le fichier
   * restant PRIVÉ, ce lien sert aux EXPORTS (ouverture par un profil autorisé sur
   * Drive) — jamais de `<img src>` : l'application affiche les captures via
   * l'endpoint serveur sécurisé `/api/captures/<id>/image`.
   */
  imageUrl: string
  mimeType: string
}

function captureFileBaseName(): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) // yyyymmddhhmmss
  const rand = Math.random().toString(36).slice(2, 8)
  return `capture-${stamp}-${rand}`
}

/**
 * Upload une capture annotée (data URL) vers Google Drive : création puis écriture des
 * octets. Le fichier reste PRIVÉ (aucune permission publique n'est posée) : l'affichage
 * dans l'application passe par l'endpoint serveur sécurisé `/api/captures/<id>/image`.
 * Renvoie `driveFileId` + le lien « view » Drive (conservé pour les exports).
 * En cas d'échec après création du fichier, un nettoyage best-effort supprime le fichier partiel.
 */
export async function uploadCaptureImage(
  dataUrl: string,
  options?: {
    fileName?: string
    /** Dossier cible (parent) de l'upload. Par défaut : la racine configurée. */
    parentFolderId?: string | null
  },
): Promise<DriveUploadResult> {
  const { mimeType, buffer } = decodeDataUrl(dataUrl)
  const context = await ensureDriveContext()
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]
  const name = `${options?.fileName?.trim() || captureFileBaseName()}.${extension}`
  const parentFolderId =
    options && options.parentFolderId !== undefined ? options.parentFolderId : context.config.folderId

  let createdId: string | null = null
  try {
    const metadata: Record<string, unknown> = { name, mimeType }
    if (parentFolderId) metadata.parents = [parentFolderId]

    // supportsAllDrives=true : accès aux dossiers situés dans un Google Shared Drive
    // (sans effet sur My Drive, requis sinon pour les fichiers de Shared Drives).
    console.log(`[DriveSync] UPLOAD_GOOGLE_DRIVE_START name="${name}" bytes=${buffer.byteLength} folder=${parentFolderId ? 'yes' : 'no'}`)
    const createResponse = await driveRequest(
      context,
      '/drive/v3/files?fields=id&supportsAllDrives=true',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) },
    )
    const created = (await assertOk(createResponse, 'création de fichier')) as { id?: string }
    if (!created.id) throw new Error('Réponse Google Drive sans identifiant de fichier.')
    createdId = created.id

    // Écriture des octets (upload media).
    const mediaResponse = await driveRequest(
      context,
      `/upload/drive/v3/files/${encodeURIComponent(createdId)}?uploadType=media&supportsAllDrives=true`,
      { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: new Uint8Array(buffer) },
    )
    await assertOk(mediaResponse, 'écriture des octets')

    // AUCUN PARTAGE PUBLIC : la capture reste PRIVÉE dans Google Drive. L'affichage
    // dans l'application passe par l'endpoint serveur sécurisé
    // (`/api/captures/<id>/image`), qui vérifie la session et l'autorisation puis lit
    // les octets avec le compte de service. `imageUrl` reste le lien « view » Drive,
    // conservé pour les exports (consultation par un profil autorisé sur Drive).

    console.log(`[DriveSync] UPLOAD_GOOGLE_DRIVE_SUCCESS fileId=${createdId} name="${name}"`)
    return { driveFileId: createdId, imageUrl: driveViewUrl(createdId), mimeType }
  } catch (error) {
    if (createdId) {
      try {
        await driveRequest(context, `/drive/v3/files/${encodeURIComponent(createdId)}?supportsAllDrives=true`, {
          method: 'DELETE',
        })
      } catch (cleanupError) {
        console.error('[DriveSync] CLEANUP_FAILED — fichier partiel non supprimé :', cleanupError)
      }
    }
    throw error
  }
}

// ————————————————————————————————————————————————————————————
// Organisation des captures en sous-dossiers `Projet` / `Type`
// (Mission « dossiers Google Drive »). Le dossier racine configuré
// (`GOOGLE_DRIVE_FOLDER_ID`) reste inchangé ; on ne fait que résoudre
// d'éventuels dossiers enfants pour déposer la capture.
// ————————————————————————————————————————————————————————————

/**
 * Échappe une valeur de nom pour une requête `q` Google Drive (littéral entre
 * apostrophes, antislash et apostrophe protégés).
 */
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Recherche l'id du dossier enfant `name` sous `parentId` (null s'il n'existe pas). */
async function findDriveChildFolderId(parentId: string, name: string): Promise<string | null> {
  const context = await ensureDriveContext()
  const query = `'${escapeDriveQueryValue(parentId)}' in parents and name = '${escapeDriveQueryValue(name)}' and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`
  const response = await driveRequest(
    context,
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  )
  const payload = (await assertOk(response, 'recherche de dossier')) as {
    files?: Array<{ id?: string }>
  }
  const first = payload.files?.[0]
  return first?.id ?? null
}

/** Crée un dossier `name` sous `parentId` et renvoie son id Drive. */
async function createDriveChildFolder(parentId: string, name: string): Promise<string> {
  const context = await ensureDriveContext()
  const metadata = { name, mimeType: DRIVE_FOLDER_MIME_TYPE, parents: [parentId] }
  console.log(`[DriveSync] FOLDER_CREATE name="${name}" parent=${parentId}`)
  const response = await driveRequest(context, '/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  })
  const created = (await assertOk(response, 'création de dossier')) as { id?: string }
  if (!created.id) throw new Error('Réponse Google Drive sans identifiant de dossier.')
  return created.id
}

/** I/O Drive réelle branchée sur le résolveur pur (dé-duplication + recherche avant création). */
const captureFolderResolver = createCaptureFolderResolver({
  findChildFolderId: findDriveChildFolderId,
  createChildFolder: createDriveChildFolder,
})

export type ResolveCaptureTargetInput = {
  projectTitle: string
  /** Nom du type d'observation ; vide ⇒ dépôt direct dans le dossier projet. */
  typeName?: string | null
}

/**
 * Résout le dossier de dépôt d'une nouvelle capture : `{Projet}` sous la racine puis,
 * si un type est fourni, `{Projet}/{Type}`. Renvoie l'id du dossier final (à passer à
 * `uploadCaptureImage` via `parentFolderId`), ou null si aucun dossier racine n'est
 * configuré (aucun sous-dossier : comportement hérité inchangé).
 */
export async function resolveCaptureTargetFolder(
  input: ResolveCaptureTargetInput,
): Promise<string | null> {
  const config = resolveDriveConfig()
  if (!config || !config.folderId) return null
  const target = await captureFolderResolver.resolveCaptureFolder({
    rootFolderId: config.folderId,
    projectTitle: input.projectTitle,
    typeName: input.typeName ?? null,
  })
  return target?.finalFolderId ?? null
}

export type DriveDeleteResult =
  | { ok: true; reason: 'deleted' | 'not-found' }
  | { ok: false; error: string }

/**
 * Supprime un fichier Google Drive par `fileId` ou URL publique. Un fichier déjà absent
 * (404) est considéré supprimé (état final identique). Erreur transitoire ⇒ promesse rejetée
 * (l'appelant conserve la référence en base). Une référence non-Drive ⇒ erreur explicite.
 */
export async function deleteDriveFile(reference: string): Promise<DriveDeleteResult> {
  const fileId = driveFileIdFromReference(reference)
  if (!fileId) {
    return {
      ok: false,
      error:
        'La référence ne correspond pas à un fichier Google Drive (asset de l’ancien stockage Cloudinary : ' +
        'suppression non prise en charge après migration).',
    }
  }
  const context = await ensureDriveContext()
  try {
    const response = await driveRequest(context, `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: 'DELETE',
    })
    if (response.status === 200 || response.status === 204) return { ok: true, reason: 'deleted' }
    if (response.status === 404) return { ok: true, reason: 'not-found' }
    throw new DriveHttpError(response.status, `Réponse Google Drive inattendue : HTTP ${response.status}.`)
  } catch (error) {
    if (error instanceof DriveConfigError) return { ok: false, error: error.message }
    if (error instanceof DriveHttpError && error.status === 404) return { ok: true, reason: 'not-found' }
    throw error
  }
}

const BULK_DELETE_CONCURRENCY = 4

export type DriveBulkDeleteResult = {
  deleted: number
  failed: number
  /** Lignes sans `fileId` Drive (stockage historique Cloudinary) — non traitables. */
  skipped: number
}

/**
 * Suppression groupée « best effort » (purge de projet…) : chaque fichier Drive est tenté
 * individuellement ; un échec réseau sur UN fichier n'interrompt pas les autres. Les échecs
 * restants sont comptés et signalés (jamais traités en silence) pour un nettoyage ultérieur.
 */
export async function deleteManyDriveFiles(
  references: Array<{ driveFileId?: string | null; imageUrl?: string | null }>,
): Promise<DriveBulkDeleteResult> {
  const targeted: string[] = []
  let skipped = 0
  for (const ref of references) {
    const fileId = isDriveFileId(ref.driveFileId ?? null)
      ? (ref.driveFileId as string)
      : driveFileIdFromReference(ref.imageUrl)
    if (fileId) targeted.push(fileId)
    else skipped += 1
  }

  let deleted = 0
  let failed = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < targeted.length) {
      const current = cursor++
      try {
        const result = await deleteDriveFile(targeted[current])
        if (result.ok) deleted += 1
        else failed += 1
      } catch (error) {
        failed += 1
        console.error('[drive] Suppression groupée : fichier ignoré', targeted[current], error)
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(BULK_DELETE_CONCURRENCY, Math.max(1, targeted.length)) },
    () => worker(),
  )
  await Promise.all(workers)
  return { deleted, failed, skipped }
}

/**
 * Télécharge les octets bruts d'une capture Google Drive (`alt=media`, authentifié serveur).
 * Renvoie null si le fichier n'existe pas (404). Erreur transitoire ⇒ promesse rejetée.
 * Utilisé par les exports serveur (embarquement d'images dans XLSX/PDF/ZIP).
 */
export async function fetchDriveFileBytes(
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const context = await ensureDriveContext()
  const response = await driveRequest(
    context,
    `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new DriveHttpError(response.status, `Lecture Google Drive : HTTP ${response.status}.`)
  const bytes = await response.arrayBuffer()
  const mimeType = response.headers.get('content-type')?.toLowerCase() ?? 'image/png'
  return { buffer: Buffer.from(bytes), mimeType }
}

/** URL média API Drive d'un `fileId` (helper exposé pour la cohérence serveur). */
export function driveMediaUrl(fileId: string): string {
  return driveMediaApiUrl(fileId)
}

export { driveViewUrl } from '@/lib/driveRef'
