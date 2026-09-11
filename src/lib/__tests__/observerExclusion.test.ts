import { describe, expect, it } from 'vitest'
import {
  applyObserverExclusions,
  buildInclusionSummary,
  excludedObserverIds,
  isObserverExcluded,
  type ObserverInclusionRecord,
} from '@/lib/observerExclusion'
import {
  computeAnalyticsMetrics,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type SnapshotPoint,
} from '@/lib/analyticsVersioning'

/**
 * DÉCLASSEMENT SCIENTIFIQUE D'UN OBSERVATEUR (H) — tests purs.
 *
 * DÉCLASSER N'EST PAS SUPPRIMER. Deux garanties doivent tenir, quelle que soit la
 * situation :
 *  1. rien n'est effacé : le relevé est FILTRÉ, jamais réécrit ;
 *  2. le dénominateur suit le numérateur (§13) : un observateur écarté sort AUSSI
 *     du nombre d'observateurs comptés, sinon la performance de tous les autres
 *     serait artificiellement sous-estimée.
 */

const TYPE = 'Faune'

function windowOf(id: string, debut: number, fin: number): SnapshotPoint {
  return { id, label: `Point ${id}`, trameDebut: debut, trameFin: fin, videoId: null, videoName: null, type: TYPE }
}

const CONFIG: AnalyticsPerimeterConfig = {
  projectId: 'p1',
  projectTitle: 'Étude',
  observationTypes: [TYPE],
  points: [windowOf('w1', 0, 9), windowOf('w2', 10, 19)],
  videos: [],
}

function row(partial: Partial<AnalyticsObservationRow> & { userId: string }): AnalyticsObservationRow {
  return {
    id: `obs-${partial.userId}-${partial.timestampTotal ?? 0}`,
    username: partial.userId,
    email: `${partial.userId}@example.test`,
    anonymousId: `anon-${partial.userId}`,
    timestampTotal: 5,
    observationType: TYPE,
    isGhostPoint: false,
    pointId: 'w1',
    pointLabel: 'Point w1',
    imageUrl: '',
    videoId: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    ...partial,
  }
}

/** Observateur A : une détection sur w1. Observateur B : une fausse alerte. */
const ROWS: AnalyticsObservationRow[] = [
  row({ userId: 'A', timestampTotal: 4, pointId: 'w1', isGhostPoint: false }),
  row({ userId: 'B', timestampTotal: 500, pointId: null, isGhostPoint: true }),
]

// ——————————————————————————————————————————————————————————————
// Filtrage pur
// ——————————————————————————————————————————————————————————————

describe('H1 — filtrage pur du relevé', () => {
  it('ne retient que les statuts EXCLUDED', () => {
    const records: ObserverInclusionRecord[] = [
      { userId: 'A', status: 'EXCLUDED' },
      { userId: 'B', status: 'INCLUDED' },
    ]
    expect([...excludedObserverIds(records)]).toEqual(['A'])
    expect(isObserverExcluded(records, 'A')).toBe(true)
    expect(isObserverExcluded(records, 'B')).toBe(false)
    // Aucune ligne = INCLUDED : le comportement historique est préservé.
    expect(isObserverExcluded(records, 'C')).toBe(false)
  })

  it('retire UNIQUEMENT les lignes de l’observateur écarté', () => {
    const kept = applyObserverExclusions(ROWS, new Set(['B']))
    expect(kept).toHaveLength(1)
    expect(kept[0].userId).toBe('A')
  })

  it('sans exclusion, renvoie le relevé intact (copie, jamais la même référence)', () => {
    const kept = applyObserverExclusions(ROWS, new Set())
    expect(kept).toEqual(ROWS)
    expect(kept).not.toBe(ROWS)
  })
})

// ——————————————————————————————————————————————————————————————
// §13 — le dénominateur suit le numérateur
// ——————————————————————————————————————————————————————————————

describe('H2 — §13 : l’observateur écarté sort du numérateur ET du dénominateur', () => {
  const before = computeAnalyticsMetrics(CONFIG, ROWS)
  const after = computeAnalyticsMetrics(CONFIG, applyObserverExclusions(ROWS, new Set(['B'])))

  it('deux observateurs comptés avant, un seul après', () => {
    expect(before.observerCount).toBe(2)
    expect(after.observerCount).toBe(1)
  })

  it('la fausse alerte de l’observateur écarté disparaît des déclarations', () => {
    expect(before.ghostEvents).toBe(1)
    expect(before.totalClaims).toBe(2)
    expect(after.ghostEvents).toBe(0)
    expect(after.totalClaims).toBe(1)
  })

  it('la détection de l’observateur RESTANT est conservée telle quelle', () => {
    expect(after.detections).toBe(before.detections)
    expect(after.detections).toBe(1)
  })

  it('la concordance est recalculée sur 1 observateur, pas sur 2 amputés', () => {
    // Avant : 1 détecteur / 2 observateurs = 50 %. Après : 1 / 1 = 100 %.
    expect(before.perPoint[0].concordanceRate).toBe(50)
    expect(after.perPoint[0].concordanceRate).toBe(100)
    // La concordance globale reste la MOYENNE des fenêtres : (100 + 0) / 2 = 50.
    expect(after.concordanceRate).toBe(50)
  })

  it('la précision devient celle du seul observateur retenu', () => {
    expect(before.precision).toBe(0.5)
    expect(after.precision).toBe(1)
  })
})

// ——————————————————————————————————————————————————————————————
// Réversibilité
// ——————————————————————————————————————————————————————————————

describe('H3 — réversibilité : rétablir ne recrée aucune donnée', () => {
  it('après rétablissement, les métriques retrouvent EXACTEMENT l’état initial', () => {
    const before = computeAnalyticsMetrics(CONFIG, ROWS)
    // Le relevé de base ne change JAMAIS : seule la liste des écartés varie.
    const excludedIds = new Set(['B'])
    expect(computeAnalyticsMetrics(CONFIG, applyObserverExclusions(ROWS, excludedIds))).not.toEqual(before)
    // Rétablissement = lire le même relevé avec un ensemble d'exclusions vide.
    const restored = applyObserverExclusions(ROWS, new Set())
    expect(computeAnalyticsMetrics(CONFIG, restored)).toEqual(before)
  })

  it('les captures RAW de l’observateur écarté existent toujours dans le relevé source', () => {
    applyObserverExclusions(ROWS, new Set(['B']))
    // Aucune fonction de ce module ne mute quoi que ce soit.
    expect(ROWS).toHaveLength(2)
    expect(ROWS.some((item) => item.userId === 'B')).toBe(true)
  })
})

// ——————————————————————————————————————————————————————————————
// §12/§13 — situation affichée aux administrateurs
// ——————————————————————————————————————————————————————————————

describe('H4 — situation analytique affichée (participants / comptés / écartés)', () => {
  const participants = [
    { userId: 'A', displayName: 'Alice' },
    { userId: 'B', displayName: 'Bruno' },
    { userId: 'C', displayName: 'Chloé' },
  ]
  const records: ObserverInclusionRecord[] = [
    { userId: 'B', status: 'EXCLUDED' },
    { userId: 'A', status: 'INCLUDED' },
  ]

  it('seuls les PARTICIPANTS entrent dans le dénominateur', () => {
    const summary = buildInclusionSummary({ participants, records })
    expect(summary.participating).toBe(3)
    expect(summary.included).toBe(2)
    expect(summary.excluded).toBe(1)
  })

  it('un compte sans aucune capture ne gonfle jamais le dénominateur', () => {
    // D n'a jamais capturé : il n'est pas participant, donc jamais compté.
    const summary = buildInclusionSummary({
      participants: participants.filter((item) => item.userId !== 'C'),
      records,
    })
    expect(summary.participating).toBe(2)
    expect(summary.included).toBe(1)
  })

  it('le motif et la date du déclassement sont restitués (traçabilité)', () => {
    const summary = buildInclusionSummary({
      participants,
      records,
      detail: [{ userId: 'B', reason: 'Protocole non respecté', excludedAt: '2026-09-01T08:00:00.000Z' }],
    })
    expect(summary.excludedObservers).toEqual([
      {
        userId: 'B',
        displayName: 'Bruno',
        reason: 'Protocole non respecté',
        excludedAt: '2026-09-01T08:00:00.000Z',
      },
    ])
  })

  it('un déclassement sans motif reste traçable (null, jamais masqué)', () => {
    const summary = buildInclusionSummary({ participants, records })
    expect(summary.excludedObservers[0].reason).toBeNull()
    expect(summary.excludedObservers[0].excludedAt).toBeNull()
  })

  it('aucune exclusion ⇒ dénominateur complet et liste vide', () => {
    const summary = buildInclusionSummary({ participants, records: [] })
    expect(summary).toEqual({
      participating: 3,
      included: 3,
      excluded: 0,
      excludedObservers: [],
    })
  })
})
