/**
 * RESTAURATION DE SESSION — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * Quand une session est interrompu puis réactivée, l'observateur doit retrouver
 * ses captures déjà persistées (images + horodatages + types + passes) au lieu de
 * repartir de zéro. Ce module transforme les captures lues côté serveur
 * (`ObserverSessionCaptureDto`) en `CaptureRecord` prêtes à être affichées par
 * l'annotateur, marquées « déjà synchronisées » (jamais re-téléversées).
 *
 * La géométrie de capture n'étant pas persistée (observation indépendante), les
 * cercles sont déjà « cuits » dans l'image annotée : on ne restaure que l'image,
 * l'horodatage, le type et la passe vidéo — pas la liste des cercles.
 */

import type { CaptureRecord } from '@/lib/types'

export type PersistedSessionCapture = {
  id: string
  clientKey: string | null
  timestamp: number
  observationType: string | null
  videoId: string | null
  /** Adresse d'affichage SÉCURISÉE (`/api/captures/<id>/image`). */
  imageEndpoint: string
}

/**
 * Convertit une capture persistée en `CaptureRecord` locale. L'identifiant local
 * réutilise la `clientKey` d'origine (idempotence de re-soumission) ; l'aperçu
 * utilise l'endpoint sécurisé (les fichiers Drive restent privés).
 */
export function mapPersistedCaptureToRecord(capture: PersistedSessionCapture): CaptureRecord {
  return {
    id: capture.clientKey?.trim() || capture.id,
    timestamp: capture.timestamp,
    // L'endpoint sert d'aperçu dans le carrousel (<img src>) — jamais un lien Drive direct.
    imageDataUrl: capture.imageEndpoint,
    circleCount: 1,
    observationType: capture.observationType,
    videoId: capture.videoId,
  }
}

export type RestoredSyncMap = Record<string, { status: 'synced' }>

/**
 * Construit l'état de synchronisation des captures restaurées : toutes « synced »
 * (elles sont déjà persistées côté serveur et ne doivent jamais être re-téléversées).
 */
export function buildRestoredSyncStates(
  captures: readonly PersistedSessionCapture[],
): RestoredSyncMap {
  const map: RestoredSyncMap = {}
  for (const capture of captures) {
    const key = capture.clientKey?.trim() || capture.id
    map[key] = { status: 'synced' }
  }
  return map
}
