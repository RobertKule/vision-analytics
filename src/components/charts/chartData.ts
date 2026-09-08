import type { GhostPointAnalyticsDto, PointConcordanceDto } from '@/lib/types'

/**
 * Transformations pures des DTO d'analyse en séries prêtes pour Recharts.
 * Aucun `window` ici : importable côté serveur sans risque. Les libellés
 * dépendent de la langue → chaque hôte passe les noms au moment du rendu.
 */

export type DetectionPoint = { label: string; valid: number; ghost: number }
export type SplitSlice = { id: 'valid' | 'ghost'; name: string; value: number }
export type WindowBar = { name: string; captures: number }

/** Largeur d'une tranche temporelle pour le graphique « Détections dans le temps ». */
const BUCKET_SECONDS = 10

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Agrège les captures validées (fenêtres cibles) et les points fantômes en
 * tranches de 10 secondes depuis le début de la vidéo jusqu'au dernier événement
 * (ou à la fin de la dernière fenêtre cible, selon ce qui est le plus tardif).
 */
export function buildDetectionSeries(
  points: PointConcordanceDto[],
  ghosts: GhostPointAnalyticsDto,
): DetectionPoint[] {
  let lastSecond = BUCKET_SECONDS
  const events: Array<{ t: number; kind: 'valid' | 'ghost' }> = []

  for (const point of points) {
    if (point.trameFin > lastSecond) lastSecond = point.trameFin
    for (const capture of point.captures) {
      events.push({ t: capture.timestampTotal, kind: 'valid' })
      if (capture.timestampTotal > lastSecond) lastSecond = capture.timestampTotal
    }
  }
  for (const capture of ghosts.captures) {
    events.push({ t: capture.timestampTotal, kind: 'ghost' })
    if (capture.timestampTotal > lastSecond) lastSecond = capture.timestampTotal
  }

  const count = Math.max(1, Math.ceil((lastSecond + 1) / BUCKET_SECONDS))
  const buckets: DetectionPoint[] = Array.from({ length: count }, (_, i) => ({
    label: mmss(i * BUCKET_SECONDS),
    valid: 0,
    ghost: 0,
  }))
  for (const event of events) {
    const index = Math.min(Math.floor(event.t / BUCKET_SECONDS), count - 1)
    buckets[index][event.kind] += 1
  }
  return buckets
}

/** Deux tranches pour le camembert « Valides vs Fantômes ». */
export function buildSplitSlices(
  validCount: number,
  ghostCount: number,
  names: { valid: string; ghost: string },
): SplitSlice[] {
  return [
    { id: 'valid', name: names.valid, value: validCount },
    { id: 'ghost', name: names.ghost, value: ghostCount },
  ]
}

/**
 * Une barre par fenêtre cible : nombre de captures validées. Lorsqu'un
 * `anonymousId` est fourni, seules les captures de cet observateur comptent.
 */
export function buildWindowBars(
  points: PointConcordanceDto[],
  anonymousId?: string,
): WindowBar[] {
  return points.map((point) => {
    const captures = anonymousId
      ? point.captures.filter((c) => c.observerAnonymousId === anonymousId)
      : point.captures
    return { name: point.pointName, captures: captures.length }
  })
}

/** Espacement des graduations de l'axe X pour garder ≤ ~8 étiquettes lisibles. */
export function tickIntervalFor(seriesLength: number): number {
  return Math.max(0, Math.ceil(seriesLength / 8) - 1)
}
