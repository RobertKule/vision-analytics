/**
 * CORRESPONDANCE OBSERVATION ↔ FENÊTRE — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * Une observation certifiée est « valide » (point réel) si son horodatage tombe
 * dans une fenêtre de validation de SA passe vidéo. Sinon elle est un « point
 * fantôme » (fausse alerte). Quand une fenêtre est AJOUTÉE après coup, les
 * observations déjà certifiées hors-trame doivent être réévaluées : celles qui
 * tombent désormais dans la nouvelle fenêtre redeviennent des DÉTECTIONS VALIDES.
 */

export type WindowRef = {
  id: string
  videoId: string | null
  trameDebut: number
  trameFin: number
}

export type ObservationRef = {
  videoId: string | null
  timestampTotal: number
}

/**
 * Vrai si l'observation tombe dans la fenêtre : même portée vidéo (passe) ET
 * horodatage compris dans [trameDebut, trameFin] (bornes incluses).
 */
export function observationFallsInWindow(
  observation: ObservationRef,
  window: WindowRef,
): boolean {
  const sameVideoScope = (observation.videoId ?? null) === (window.videoId ?? null)
  return (
    sameVideoScope &&
    observation.timestampTotal >= window.trameDebut &&
    observation.timestampTotal <= window.trameFin
  )
}

/**
 * Décrit la mise à jour à appliquer à une observation « fantôme » réévaluée après
 * l'ajout d'une fenêtre : elle devient une détection VALIDE rattachée à la fenêtre.
 */
export function reclassificationForObservation(
  observation: ObservationRef,
  window: WindowRef,
): { pointId: string; isGhostPoint: false } | null {
  if (!observationFallsInWindow(observation, window)) return null
  return { pointId: window.id, isGhostPoint: false }
}
