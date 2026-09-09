/**
 * Google Drive — références d'URL & identifiants de fichiers (fonctions PURES).
 *
 * Aucune dépendance réseau ni SDK : ces helpers normalisent les URLs publiques Google
 * Drive (affichage navigateur / téléchargement) et extraient le `fileId` d'une référence
 * stockée. Elles sont testées unitairement sans configuration.
 *
 * Le `fileId` Google Drive est un jeton opaque de 33 caractères environ (base64url).
 * L'URL « publique » d'une capture est toujours dérivable depuis son `fileId`.
 */

const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/

/** Hôtes Google Drive utilisés par nos URLs de partage public. */
const DRIVE_HOSTS = ['drive.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com']

/** Hôtes Google Cloud (API Drive, requêtes serveur) — hors URLs publiques exposées. */
const GOOGLEAPIS_HOST = 'www.googleapis.com'

/** Vrai si la chaîne ressemble à un `fileId` Google Drive. */
export function isDriveFileId(value: string | null | undefined): value is string {
  return typeof value === 'string' && FILE_ID_PATTERN.test(value.trim())
}

/** Vrai si l'URL est une URL publique Google Drive (partage « toute personne ayant le lien »). */
export function isDrivePublicUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) return false
  try {
    const host = new URL(url).hostname
    return DRIVE_HOSTS.includes(host)
  } catch {
    return false
  }
}

/**
 * Extrait le `fileId` d'une URL publique Google Drive. Formes supportées :
 *   https://drive.google.com/uc?export=view|download&id=FILEID[&…]
 *   https://drive.google.com/file/d/FILEID/view
 *   https://drive.google.com/open?id=FILEID
 *   https://drive.google.com/thumbnail?id=FILEID&sz=…
 *   https://drive.google.com/drive/folders/… (non un fichier → null)
 * Renvoie null si l'URL n'est pas exploitable.
 */
export function driveFileIdFromUrl(url: string | null | undefined): string | null {
  if (!isDrivePublicUrl(url)) return null
  let parsed: URL
  try {
    parsed = new URL(url!)
  } catch {
    return null
  }

  const idParam = parsed.searchParams.get('id')
  if (idParam && isDriveFileId(idParam)) return idParam

  // /file/d/<FILEID>/view
  const pathMatch = /\/file\/d\/([^/]+)/.exec(parsed.pathname)
  if (pathMatch && isDriveFileId(pathMatch[1])) return pathMatch[1]

  return null
}

/** Résout le `fileId` d'une référence (déjà un id, ou URL publique Google Drive). */
export function driveFileIdFromReference(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  if (isDriveFileId(trimmed)) return trimmed
  return driveFileIdFromUrl(trimmed)
}

/** URL publique de visualisation d'une capture (rendue dans un <img> navigateur). */
export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
}

/** URL publique de téléchargement direct (lien de partage « anyone with link »). */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
}

/** Endpoint API Drive — téléchargement des octets bruts (`alt=media`, authentifié serveur). */
export function driveMediaApiUrl(fileId: string): string {
  return `https://${GOOGLEAPIS_HOST}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`
}
