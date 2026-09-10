import { describe, expect, it } from 'vitest'
import {
  computeAnalyticsMetrics,
  rematchRowsToWindows,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type SnapshotPoint,
} from '@/lib/analyticsVersioning'

/**
 * RECALCUL ANALYTIQUE DYNAMIQUE — une capture RAW historique est réévaluée contre
 * les fenêtres COURANTES, sans jamais être supprimée ni réécrite.
 *
 * Scénario de référence : 10 fenêtres / 8 détections ; on ajoute une 11ᵉ fenêtre ;
 * une capture existante (auparavant fantôme) tombe dans cette fenêtre ⇒ elle devient
 * une 9ᵉ détection VALIDE, le dénominateur passant à 11.
 */

const TYPE = '200m'

function windowOf(index: number, videoId: string | null = null): SnapshotPoint {
  return {
    id: `w${index}`,
    label: `Point ${index}`,
    // Fenêtre `index` = [ (index-1)*10 , (index-1)*10+9 ] → w1 = 0–9, w11 = 100–109.
    trameDebut: (index - 1) * 10,
    trameFin: (index - 1) * 10 + 9,
    videoId,
    videoName: null,
    type: videoId ? TYPE : '',
  }
}

function configWith(count: number, videoId: string | null = null): AnalyticsPerimeterConfig {
  return {
    projectId: 'p1',
    projectTitle: 'Étude',
    observationTypes: [TYPE],
    points: Array.from({ length: count }, (_, i) => windowOf(i + 1, videoId)),
    videos: videoId ? [{ id: videoId, name: 'VIDEO', typeLabel: TYPE, orderIndex: 0 }] : [],
  }
}

function row(partial: Partial<AnalyticsObservationRow>): AnalyticsObservationRow {
  return {
    id: partial.id ?? `obs-${partial.timestampTotal ?? 0}`,
    userId: 'observerA',
    username: 'Obs A',
    email: 'a@example.test',
    anonymousId: 'anon-a',
    timestampTotal: 5,
    observationType: TYPE,
    isGhostPoint: true,
    pointId: null,
    pointLabel: null,
    imageUrl: '',
    videoId: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    ...partial,
  }
}

describe('rematchRowsToWindows — recalcul dynamique', () => {
  it('une capture fantôme couverte par une fenêtre devient une DÉTECTION VALIDE', () => {
    const rows = [row({ timestampTotal: 105 })] // tombe dans w11 (100–109)
    const rematched = rematchRowsToWindows(rows, configWith(11))
    expect(rematched[0].isGhostPoint).toBe(false)
    expect(rematched[0].pointId).toBe('w11')
    expect(rematched[0].pointLabel).toBe('Point 11')
  })

  it('une capture hors de toute fenêtre reste un POINT FANTÔME', () => {
    const rows = [row({ timestampTotal: 999 })]
    const rematched = rematchRowsToWindows(rows, configWith(11))
    expect(rematched[0].isGhostPoint).toBe(true)
    expect(rematched[0].pointId).toBeNull()
  })

  it('une capture DÉJÀ validée est réévaluée à l’identique (idempotent)', () => {
    const rows = [row({ timestampTotal: 5, isGhostPoint: false, pointId: 'w1', pointLabel: 'Point 1' })]
    const rematched = rematchRowsToWindows(rows, configWith(11))
    expect(rematched[0]).toMatchObject({ isGhostPoint: false, pointId: 'w1' })
  })

  it('la portée vidéo est respectée (fenêtre d’une autre passe ignorée)', () => {
    const typed = configWith(11, 'video-A')
    const genericRow = row({ timestampTotal: 105, videoId: null })
    const rematched = rematchRowsToWindows([genericRow], typed)
    expect(rematched[0].isGhostPoint).toBe(true) // la fenêtre est sur video-A, la capture est générique
  })

  it('ne dépend PAS du pointId/isGhostPoint persisté (une capture mal classée est corrigée)', () => {
    // Persistée « fantôme » alors qu'une fenêtre la couvre → devient valide.
    const rows = [row({ timestampTotal: 25, isGhostPoint: true, pointId: null })] // w3 = 20–29
    const rematched = rematchRowsToWindows(rows, configWith(11))
    expect(rematched[0].isGhostPoint).toBe(false)
    expect(rematched[0].pointId).toBe('w3')
  })
})

describe('scénario 10 → 11 fenêtres, 8 → 9 détections', () => {
  const EIGHT_DETECTIONS = Array.from({ length: 8 }, (_, i) =>
    row({ id: `d${i + 1}`, timestampTotal: i * 10 + 5, isGhostPoint: false, pointId: `w${i + 1}` }),
  )
  // Une capture historique, auparavant fantôme, qui tombe dans la fenêtre 11 (100–109).
  const historical = row({ id: 'ghost-11', timestampTotal: 105, isGhostPoint: true, pointId: null })

  it('avant l’ajout : 10 fenêtres / 8 détections', () => {
    const metrics = computeAnalyticsMetrics(configWith(10), rematchRowsToWindows(EIGHT_DETECTIONS, configWith(10)))
    expect(metrics.configuredPoints).toBe(10)
    expect(metrics.detections).toBe(8)
  })

  it('après l’ajout (fenêtre 11) + capture couverte : 11 fenêtres / 9 détections', () => {
    const rows = [...EIGHT_DETECTIONS, historical]
    const rematched = rematchRowsToWindows(rows, configWith(11))
    const metrics = computeAnalyticsMetrics(configWith(11), rematched)
    expect(metrics.configuredPoints).toBe(11)
    expect(metrics.detections).toBe(9)
    // La capture historique est désormais VALIDE, jamais supprimée ni ignorée.
    expect(rematched.find((r) => r.id === 'ghost-11')).toMatchObject({
      isGhostPoint: false,
      pointId: 'w11',
    })
  })

  it('sans capture couverte : 11 fenêtres / 8 détections (le passé est conservé)', () => {
    const metrics = computeAnalyticsMetrics(configWith(11), rematchRowsToWindows(EIGHT_DETECTIONS, configWith(11)))
    expect(metrics.configuredPoints).toBe(11)
    expect(metrics.detections).toBe(8)
  })

  it('les métriques par fenêtre ET par observateur sont cohérentes', () => {
    const rows = [...EIGHT_DETECTIONS, historical]
    const rematched = rematchRowsToWindows(rows, configWith(11))
    const metrics = computeAnalyticsMetrics(configWith(11), rematched)

    const w11 = metrics.perPoint.find((p) => p.pointId === 'w11')
    expect(w11?.observersDetected).toBe(1)
    expect(w11?.detections).toBe(1)

    const observer = metrics.perObserver.find((o) => o.observerId === 'observerA')
    expect(observer?.detections).toBe(9)
    expect(observer?.ghostEvents).toBe(0)
  })
})
