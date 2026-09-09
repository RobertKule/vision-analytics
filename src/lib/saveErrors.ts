/**
 * Classification des erreurs d'enregistrement d'une capture — pur, sans navigateur.
 *
 * Le client ne doit plus « tout » traiter comme une coupure réseau : une erreur de
 * stockage (dossier non partagé / identifiant invalide) n'est PAS re-tentée en boucle
 * au retour en ligne, et son message ne doit pas prétendre que l'appareil est hors
 * ligne. Chaque erreur est traduite en un `code` + un drapeau `retryable` :
 *
 *   VALIDATION           → refus métier (jamais re-tenté seul) ;
 *   NETWORK              → transport interrompu (re-tenté au retour en ligne) ;
 *   STORAGE_CONFIG       → stockage non configuré (définitif : action admin) ;
 *   STORAGE_PERMISSION   → 401/403 (définitif : partage/portée à corriger) ;
 *   STORAGE_FOLDER       → 404 dossier/identifiant (définitif : GOOGLE_DRIVE_FOLDER_ID
 *                          ou partage à corriger) ;
 *   STORAGE_TRANSIENT    → 429/5xx Google (re-tenté plus tard) ;
 *   STORAGE              → autre échec stockage ;
 *   DATABASE             → échec PostgreSQL (re-tentable si connexion, sinon définitif) ;
 *   SERVER               → erreur serveur imprévue (re-tentable).
 *
 * SÉCURITÉ : le message renvoyé à l'utilisateur ne provient jamais du `detail` d'une
 * erreur (aucun secret, aucun chemin interne) — il est choisi côté serveur dans un
 * vocabulaire fixe.
 */

import { DriveConfigError, DriveHttpError } from '@/lib/drive'
import { isNetworkLikeError } from '@/lib/netError'

export { isNetworkLikeError } from '@/lib/netError'

export type SaveErrorCode =
  | 'VALIDATION'
  | 'NETWORK'
  | 'STORAGE_CONFIG'
  | 'STORAGE_PERMISSION'
  | 'STORAGE_FOLDER'
  | 'STORAGE_TRANSIENT'
  | 'STORAGE'
  | 'DATABASE'
  | 'SERVER'

export type SaveErrorClass = {
  code: SaveErrorCode
  /** Vrai si l'envoi peut être re-tenté automatiquement (réseau, transitoire). */
  retryable: boolean
}

/** Statuts HTTP Google considérés transitoires (re-tentables). */
const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504])

/** Codes Prisma correspondant à des problèmes de connexion (re-tentables). */
const PRISMA_CONNECTION_CODES = new Set(['P1001', 'P1002', 'P1017'])

function isPrismaError(error: unknown): error is { code?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  )
}

/** Traduit n'importe quelle erreur en un couple `code` + `retryable`. */
export function classifySaveError(error: unknown): SaveErrorClass {
  if (error instanceof DriveConfigError) {
    return { code: 'STORAGE_CONFIG', retryable: false }
  }
  if (error instanceof DriveHttpError) {
    if (error.status === 401 || error.status === 403) {
      return { code: 'STORAGE_PERMISSION', retryable: false }
    }
    if (error.status === 404) {
      return { code: 'STORAGE_FOLDER', retryable: false }
    }
    if (RETRYABLE_HTTP_STATUS.has(error.status)) {
      return { code: 'STORAGE_TRANSIENT', retryable: true }
    }
    return { code: 'STORAGE', retryable: false }
  }
  if (isPrismaError(error)) {
    const code = error.code ?? ''
    return {
      code: 'DATABASE',
      retryable: PRISMA_CONNECTION_CODES.has(code),
    }
  }
  if (isNetworkLikeError(error)) {
    return { code: 'NETWORK', retryable: true }
  }
  return { code: 'SERVER', retryable: true }
}

type SaveLocale = 'en' | 'fr'

/**
 * Message FINAL localisé d'un code d'échec — vocabulaire fixe de la spécification,
 * jamais un détail interne (`error.message`), jamais un secret. Affiché tel quel à
 * l'observateur (étiquette de capture / bandeau) et conservé dans le brouillon local.
 */
export function saveErrorMessage(code: SaveErrorCode, locale: SaveLocale): string {
  const m = (en: string, fr: string) => (locale === 'en' ? en : fr)
  switch (code) {
    case 'NETWORK':
      return m(
        'Connection interrupted. The capture is kept locally.',
        'Connexion interrompue. La capture est conservée localement.',
      )
    case 'STORAGE_CONFIG':
    case 'STORAGE_PERMISSION':
    case 'STORAGE_FOLDER':
      return m(
        'Storage is not configured correctly. Contact the administrator.',
        'Le stockage n’est pas correctement configuré. Contactez l’administrateur.',
      )
    case 'STORAGE':
    case 'STORAGE_TRANSIENT':
      return m(
        'The image could not be saved to storage.',
        'Impossible d’enregistrer l’image dans le stockage.',
      )
    case 'VALIDATION':
    case 'DATABASE':
    case 'SERVER':
    default:
      return m(
        'The server could not save the capture. It has been kept locally.',
        'Le serveur n’a pas pu enregistrer la capture. Elle a été conservée localement.',
      )
  }
}
