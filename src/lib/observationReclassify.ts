/**
 * RÉÉVALUATION DES OBSERVATIONS APRÈS AJOUT D'UNE FENÊTRE — serveur uniquement.
 *
 * Quand l'administrateur (ou l'analyste) ajoute une fenêtre de validation, les
 * observations DÉJÀ CERTIFIÉES hors-trame (points fantômes, `isGhostPoint=true`,
 * `pointId=null`) dont l'horodatage tombe désormais dans cette fenêtre doivent
 * redevenir des DÉTECTIONS VALIDES : le numérateur (points valides) augmente, sans
 * jamais supprimer ni recréer de données.
 *
 * La portée vidéo est respectée : une fenêtre rattachée à une passe vidéo ne
 * réévalue que les observations de CETTE passe ; une fenêtre générique (videoId
 * null) ne réévalue que les observations génériques.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { WindowRef } from '@/lib/windowMatch'

/** Réévalue les observations fantômes certifiées et renvoie le nombre réévaluées. */
export async function reclassifyGhostsForNewWindow(
  projectId: string,
  window: WindowRef,
): Promise<number> {
  const result = await prisma.observation.updateMany({
    where: {
      projectId,
      isVerified: true,
      isGhostPoint: true,
      pointId: null,
      timestampTotal: { gte: window.trameDebut, lte: window.trameFin },
      videoId: window.videoId === null ? null : window.videoId,
    },
    data: {
      pointId: window.id,
      isGhostPoint: false,
    },
  })
  return result.count
}
