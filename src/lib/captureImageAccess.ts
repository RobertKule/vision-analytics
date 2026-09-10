/**
 * AFFICHAGE SÉCURISÉ DES CAPTURES — décision d'accès PURE (aucune I/O, testable).
 *
 * Les captures vivent dans Google Drive et RESTENT PRIVÉES : aucun fichier n'est
 * partagé publiquement. Un lien Drive privé (`https://drive.google.com/file/d/<id>/view`)
 * ne s'affiche pas dans une balise `<img>` : l'application passe donc par un endpoint
 * serveur qui vérifie la session et l'autorisation, lit les octets côté serveur, puis
 * renvoie l'image au navigateur.
 *
 * Ce module décide QUI peut voir QUELLE capture :
 *  — ADMIN            : toutes les captures ;
 *  — ANALYSTE         : les captures des projets qu'il possède ou qui lui sont partagés ;
 *  — OBSERVATEUR      : uniquement SES propres captures (session compte ou lien d'accès),
 *                       et uniquement dans le projet de sa portée ;
 *  — sans session     : refus.
 *
 * Un `captureId` falsifié ne permet donc jamais de voir la capture d'un autre projet :
 * la décision compare le projet RÉEL de la capture au périmètre autorisé.
 */

/** Profil du demandeur, tel que résolu côté serveur (jamais déclaré par le client). */
export type CaptureImageViewer =
  /** Rôle ADMIN — accès total. */
  | { kind: 'admin' }
  /**
   * Analyste (ou tout compte disposant d'un accès projet) : `authorizedProjectIds`
   * énumère les projets réellement autorisés par la garde RBAC serveur.
   */
  | { kind: 'analyst'; authorizedProjectIds: readonly string[] }
  /**
   * Observateur : ses propres captures uniquement. `scopedProjectId` borne l'accès au
   * projet de sa portée (lien d'accès) ; null = aucune borne de projet (compte connecté).
   */
  | { kind: 'observer'; userId: string; scopedProjectId: string | null }
  /** Aucune session exploitable. */
  | { kind: 'none' }

/** Capture visée, telle que lue en base (jamais depuis le client). */
export type CaptureImageTarget =
  | { exists: false }
  | {
      exists: true
      projectId: string
      /** Observateur auteur de la capture. */
      observerId: string
      /** Référence Google Drive de l'image (null = aucune image exploitable). */
      driveFileId: string | null
    }

export type CaptureImageRefusal =
  /** Aucune session valide. */
  | 'no-session'
  /** Session valide mais hors périmètre (autre projet, capture d'autrui). */
  | 'forbidden'
  /** Capture inexistante. */
  | 'not-found'
  /** Capture sans `driveFileId` exploitable (stockage historique, fichier retiré). */
  | 'no-file'

export type CaptureImageDecision =
  | { ok: true; driveFileId: string }
  | { ok: false; reason: CaptureImageRefusal; status: 401 | 403 | 404 }

const REFUSAL_STATUS: Record<CaptureImageRefusal, 401 | 403 | 404> = {
  'no-session': 401,
  forbidden: 403,
  'not-found': 404,
  'no-file': 404,
}

function refuse(reason: CaptureImageRefusal): CaptureImageDecision {
  return { ok: false, reason, status: REFUSAL_STATUS[reason] }
}

/**
 * Décide si `viewer` peut lire l'image de `target`.
 *
 * L'ordre est volontaire : la session d'abord (aucune fuite d'existence à un visiteur
 * non authentifié), puis l'existence, puis le périmètre, puis la présence du fichier.
 */
export function decideCaptureImageAccess(input: {
  viewer: CaptureImageViewer
  target: CaptureImageTarget
}): CaptureImageDecision {
  const { viewer, target } = input

  if (viewer.kind === 'none') return refuse('no-session')
  if (!target.exists) return refuse('not-found')

  if (viewer.kind === 'analyst') {
    if (!viewer.authorizedProjectIds.includes(target.projectId)) return refuse('forbidden')
  } else if (viewer.kind === 'observer') {
    // Un observateur ne voit QUE ses propres captures…
    if (viewer.userId !== target.observerId) return refuse('forbidden')
    // …et uniquement dans le projet de sa portée d'accès.
    if (viewer.scopedProjectId !== null && viewer.scopedProjectId !== target.projectId) {
      return refuse('forbidden')
    }
  }

  const fileId = target.driveFileId?.trim() ?? ''
  if (!fileId) return refuse('no-file')
  return { ok: true, driveFileId: fileId }
}

/** Types d'image autorisés en sortie de l'endpoint (aucun autre contenu n'est servi). */
const ALLOWED_IMAGE_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'] as const

/**
 * Content-Type sûr renvoyé au navigateur : le type déclaré par Google Drive n'est
 * accepté que s'il appartient à la liste blanche d'images. Une valeur absente retombe
 * sur `image/webp` (format des captures) ; toute autre valeur est servie en binaire
 * opaque plutôt qu'interprétée par le navigateur.
 */
export function safeImageContentType(rawMimeType: string | null | undefined): string {
  const mime = (rawMimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (!mime) return 'image/webp'
  const match = ALLOWED_IMAGE_TYPES.find((allowed) => allowed === mime)
  if (match) return match
  if (mime === 'image/jpg') return 'image/jpeg'
  return 'application/octet-stream'
}

/**
 * URL de l'endpoint sécurisé d'affichage d'une capture. C'est la SEULE source d'image
 * utilisée dans l'application (galeries, modales, aperçus, analyses, historique) —
 * les liens Google Drive restent réservés aux exports.
 */
export function captureImageEndpoint(captureId: string): string {
  return `/api/captures/${encodeURIComponent(captureId)}/image`
}

/**
 * En-tête de cache compatible avec des images PRIVÉES : le cache navigateur de
 * l'utilisateur peut conserver l'octet, jamais un cache partagé/CDN.
 */
export const PRIVATE_IMAGE_CACHE_CONTROL = 'private, max-age=300, must-revalidate'

/** Message unique affiché quand une capture n'est pas affichable (aucun détail technique). */
export const CAPTURE_IMAGE_UNAVAILABLE = 'Image indisponible'
