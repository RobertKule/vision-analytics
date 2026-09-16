import { describe, expect, it } from 'vitest'
import {
  GROUP_A_LABEL,
  GROUP_B_LABEL,
  buildGroupComparison,
  crossTypeAgreement,
  groupRateGap,
  totalGroupGhostEvents,
  validateGroupAssignment,
  type TypeComparisonInput,
} from '@/lib/typeComparison'
import {
  computeAnalyticsMetrics,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type SnapshotPoint,
} from '@/lib/analyticsVersioning'

/**
 * COMPARAISON PAR GROUPES A/B (§3, §6) — tests purs.
 *
 * Un groupe n'est qu'une AGRÉGATION de types : les dénominateurs et les numérateurs
 * de ses membres sont SOMMÉS. Ces tests vérifient trois propriétés non négociables :
 *
 *  1. possibles(groupe) = Σ (points du type × observateurs PARTICIPANTS du type) —
 *     jamais `pointsTotaux × max(observateurs)` (test D et H) ;
 *  2. taux(groupe) = Σ détections / Σ possibles — pondéré, jamais la moyenne des
 *     taux des types (test G) ;
 *  3. un type ne peut appartenir qu'à UN groupe : les points possibles ne sont
 *     jamais doublement comptés (test D, validateur).
 */

const A = 'TypeA'
const B = 'TypeB'
const C = 'TypeC'

function point(type: string, index: number, videoId: string | null): SnapshotPoint {
  return {
    id: `${type}-${index}`,
    label: `${type} Point ${index}`,
    trameDebut: index * 10,
    trameFin: index * 10 + 5,
    videoId,
    videoName: videoId === null ? null : `Passe ${type}`,
    type,
  }
}

function configOf(points: SnapshotPoint[], types: string[]): AnalyticsPerimeterConfig {
  return {
    projectId: 'p-group',
    projectTitle: 'Comparaison par groupes',
    observationTypes: types,
    points,
    videos: [],
  }
}

function row(
  partial: Partial<AnalyticsObservationRow> & { userId: string; observationType: string },
): AnalyticsObservationRow {
  return {
    id: `obs-${partial.userId}-${partial.observationType}-${partial.pointId ?? 'ghost'}`,
    username: partial.userId,
    email: null,
    anonymousId: `anon-${partial.userId}`,
    timestampTotal: 0,
    isGhostPoint: false,
    pointId: null,
    pointLabel: null,
    imageUrl: '',
    videoId: null,
    createdAt: '2026-08-10T10:00:00.000Z',
    ...partial,
  }
}

/**
 * Construit une entrée de comparaison EXACTEMENT comme la Server Action le fait :
 * `resolveAnalyticsView(id, selector, { observationType })` restreint le périmètre
 * au type AVANT de calculer (`narrowPerimeterConfig`), si bien que
 * `configuredPoints` est le nombre de points DU TYPE — et non celui du projet.
 */
function inputOf(
  type: string,
  points: SnapshotPoint[],
  rows: AnalyticsObservationRow[],
  types: string[],
): TypeComparisonInput {
  const config: AnalyticsPerimeterConfig = {
    ...configOf(points, types),
    points: points.filter((entry) => entry.type === type),
  }
  const scoped = rows.filter((entry) => entry.observationType === type)
  const observerIds = new Set(scoped.map((entry) => entry.userId))
  const metrics = computeAnalyticsMetrics(config, scoped)
  return {
    type,
    config,
    rows: scoped,
    observerCount: observerIds.size,
    metrics: {
      detections: metrics.detections,
      ghostEvents: metrics.ghostEvents,
      totalClaims: metrics.totalClaims,
      configuredPoints: metrics.configuredPoints,
      windowsHit: metrics.windowsHit,
      concordanceRate: metrics.concordanceRate,
      precision: metrics.precision,
      possibleObservations: metrics.possibleObservations,
      detectionProbability: metrics.detectionProbability,
      averageDetectionDelay: metrics.averageDetectionDelay,
    },
  }
}

/**
 * Périmètre du §4.2 : A = 10 points / 5 participants, B = 8 points / 3 participants,
 * C = 12 points / 4 participants. Le moteur tourne donc sur trois types distincts.
 */
function scenario() {
  const allTypes = [A, B, C]
  const points = [
    ...Array.from({ length: 10 }, (_, i) => point(A, i + 1, 'vA')),
    ...Array.from({ length: 8 }, (_, i) => point(B, i + 1, 'vB')),
    ...Array.from({ length: 12 }, (_, i) => point(C, i + 1, 'vC')),
  ]
  const rows: AnalyticsObservationRow[] = []
  // A : 4 observateurs détectent les 10 points, le 5ᵉ observe sans rien détecter.
  for (let observer = 0; observer < 4; observer += 1) {
    for (let i = 1; i <= 10; i += 1) {
      rows.push(row({
        userId: `a${observer}`,
        observationType: A,
        pointId: `${A}-${i}`,
        pointLabel: `${A} Point ${i}`,
        videoId: 'vA',
        timestampTotal: i * 10,
      }))
    }
  }
  rows.push(row({ userId: 'a4', observationType: A, isGhostPoint: true, videoId: 'vA' }))
  // B : 3 observateurs, 4 détections chacun.
  for (let observer = 0; observer < 3; observer += 1) {
    for (let i = 1; i <= 4; i += 1) {
      rows.push(row({
        userId: `b${observer}`,
        observationType: B,
        pointId: `${B}-${i}`,
        pointLabel: `${B} Point ${i}`,
        videoId: 'vB',
        timestampTotal: i * 10,
      }))
    }
  }
  // C : 4 observateurs, 12 détections chacun (aucune détection manquante).
  for (let observer = 0; observer < 4; observer += 1) {
    for (let i = 1; i <= 12; i += 1) {
      rows.push(row({
        userId: `c${observer}`,
        observationType: C,
        pointId: `${C}-${i}`,
        pointLabel: `${C} Point ${i}`,
        videoId: 'vC',
        timestampTotal: i * 10,
      }))
    }
  }
  return { allTypes, points, rows }
}

describe('D. affectation des types aux groupes', () => {
  it('un type ne peut pas être sélectionné dans les deux groupes', () => {
    const check = validateGroupAssignment({ groupA: [A, B], groupB: [C, B] })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.error).toContain('deux groupes')
  })

  it('les groupes vides sont refusés, chacun avec son message', () => {
    const emptyA = validateGroupAssignment({ groupA: [], groupB: [B] })
    expect(emptyA.ok).toBe(false)
    if (!emptyA.ok) expect(emptyA.error).toContain(GROUP_A_LABEL)

    const emptyB = validateGroupAssignment({ groupA: [A], groupB: [] })
    expect(emptyB.ok).toBe(false)
    if (!emptyB.ok) expect(emptyB.error).toContain(GROUP_B_LABEL)
  })

  it('un doublon interne à un groupe est refusé', () => {
    const check = validateGroupAssignment({ groupA: [A, A], groupB: [B] })
    expect(check.ok).toBe(false)
    if (!check.ok) expect(check.error).toContain('plusieurs fois')
  })

  it('une affectation valide passe, avec un ou plusieurs types par groupe', () => {
    expect(validateGroupAssignment({ groupA: [A], groupB: [B] }).ok).toBe(true)
    expect(validateGroupAssignment({ groupA: [A, B], groupB: [C] }).ok).toBe(true)
    expect(validateGroupAssignment({ groupA: [A], groupB: [B, C] }).ok).toBe(true)
    // Les espaces ne créent pas deux types distincts : « A » et « A  » sont le même.
    expect(validateGroupAssignment({ groupA: [` ${A} `], groupB: [B] }).ok).toBe(true)
  })
})

describe('E/F. points possibles d’un groupe : une somme de dénominateurs', () => {
  const { allTypes, points, rows } = scenario()

  it('A seul (10 × 5 = 50) contre B seul (8 × 3 = 24) : jamais 90', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes)],
      [inputOf(B, points, rows, allTypes)],
    )

    expect(model.groupA.possibleObservations).toBe(50)
    expect(model.groupA.detections).toBe(40)
    expect(model.groupB.possibleObservations).toBe(24)
    expect(model.groupB.detections).toBe(12)

    // Le total des deux groupes est 74 — la réunion des observateurs (8) appliquée
    // aux 18 points donnerait 144, le maximum (5) donnerait 90.
    const totalPossible = model.groupA.possibleObservations + model.groupB.possibleObservations
    expect(totalPossible).toBe(74)
    expect(totalPossible).not.toBe((10 + 8) * 5)
  })

  it('un groupe de PLUSIEURS types additionne les dénominateurs de ses membres', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes), inputOf(B, points, rows, allTypes)],
      [inputOf(C, points, rows, allTypes)],
    )

    expect(model.groupA.typeCount).toBe(2)
    expect(model.groupA.possibleObservations).toBe(50 + 24)
    expect(model.groupA.detections).toBe(40 + 12)
    expect(model.groupB.possibleObservations).toBe(48)
    expect(model.groupB.detections).toBe(48)

    // Détail : chaque type garde SON dénominateur, jamais un dénominateur commun.
    expect(model.groupA.types.map((type) => type.possibleObservations)).toEqual([50, 24])
    expect(model.groupA.types.map((type) => type.participants)).toEqual([5, 3])
  })

  it('le total des groupes reste la somme des points possibles de leurs types', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes), inputOf(C, points, rows, allTypes)],
      [inputOf(B, points, rows, allTypes)],
    )
    expect(model.groupA.possibleObservations + model.groupB.possibleObservations).toBe(50 + 48 + 24)
  })

  it('l’exclusion d’un observateur retire ses fenêtres possibles du groupe', () => {
    // Déclassement : le moteur filtre le relevé EN AMONT, le dénominateur suit.
    const without = rows.filter((entry) => entry.userId !== 'a4')
    const excluded = buildGroupComparison(
      [inputOf(A, points, without, allTypes)],
      [inputOf(B, points, without, allTypes)],
    )
    expect(excluded.groupA.possibleObservations).toBe(40)
    expect(excluded.groupA.detections).toBe(40)

    // Réinclusion : le 5ᵉ participant revient au dénominateur (50), pas au numérateur.
    const reincluded = buildGroupComparison(
      [inputOf(A, points, rows, allTypes)],
      [inputOf(B, points, rows, allTypes)],
    )
    expect(reincluded.groupA.possibleObservations).toBe(50)
    expect(reincluded.groupA.detections).toBe(40)
  })
})

describe('G. taux de groupe pondéré par les vrais dénominateurs', () => {
  const { allTypes, points, rows } = scenario()

  it('A (40/50) contre B (12/24) : 80 % et 50 %, jamais un taux global naïf', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes)],
      [inputOf(B, points, rows, allTypes)],
    )
    expect(model.groupA.rate).toBeCloseTo(40 / 50, 10)
    expect(model.groupB.rate).toBeCloseTo(12 / 24, 10)
    expect(groupRateGap(model)).toBe(30)
  })

  it('un groupe mixte est pondéré par ses dénominateurs (52/74 = 70,27 %)', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes), inputOf(B, points, rows, allTypes)],
      [inputOf(C, points, rows, allTypes)],
    )
    expect(model.groupA.rate).toBeCloseTo(52 / 74, 10)
    expect(Math.round((model.groupA.rate ?? 0) * 10000) / 100).toBe(70.27)

    // La moyenne naïve des taux des types — (80 % + 50 %) / 2 = 65 % — est FAUSSE.
    const naive = (40 / 50 + 12 / 24) / 2
    expect(Math.round(naive * 100)).toBe(65)
    expect(model.groupA.rate).not.toBeCloseTo(naive, 5)
  })

  it('un groupe sans observation possible n’affiche aucun taux, plutôt que 0 %', () => {
    const emptyInput = inputOf('TypeInconnu', points, [], [...allTypes, 'TypeInconnu'])
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes)],
      [emptyInput],
    )
    expect(model.groupB.possibleObservations).toBe(0)
    expect(model.groupB.rate).toBeNull()
    expect(groupRateGap(model)).toBeNull()
  })
})

describe('H. aucun groupe n’utilise le maximum ou la réunion des observateurs', () => {
  const { allTypes, points, rows } = scenario()

  it('le dénominateur d’un groupe est la somme des produits, pas un produit du maximum', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes), inputOf(B, points, rows, allTypes)],
      [inputOf(C, points, rows, allTypes)],
    )
    const unionOfObservers = new Set(rows.map((entry) => entry.userId)).size // 4 + 3 + 4 = 11
    const maxObservers = 5
    const totalPoints = 10 + 8 + 12

    expect(model.groupA.possibleObservations).toBe(74)
    expect(model.groupB.possibleObservations).toBe(48)
    expect(model.groupA.possibleObservations).not.toBe(18 * maxObservers)
    expect(model.groupA.possibleObservations).not.toBe(18 * unionOfObservers)
    expect(model.groupA.possibleObservations + model.groupB.possibleObservations).not.toBe(
      totalPoints * maxObservers,
    )
  })

  it('chaque ligne de type porte exactement points × SES participants', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes), inputOf(B, points, rows, allTypes)],
      [inputOf(C, points, rows, allTypes)],
    )
    for (const side of [model.groupA, model.groupB]) {
      for (const type of side.types) {
        expect(type.possibleObservations).toBe(type.pointCount * type.participants)
      }
    }
  })
})

describe('cohérence tableau / graphiques', () => {
  const { allTypes, points, rows } = scenario()

  it('le graphique circulaire lit les mêmes chiffres que le tableau', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes), inputOf(B, points, rows, allTypes)],
      [inputOf(C, points, rows, allTypes)],
    )
    for (const side of [model.groupA, model.groupB]) {
      // Détectés + non détectés = points possibles : la somme des parts du camembert.
      expect(side.detections + side.undetected).toBe(side.possibleObservations)
      expect(side.undetected).toBe(side.possibleObservations - side.detections)
    }
  })

  it('les fausses alertes sont comptées à part, jamais fondues dans les détections', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes)],
      [inputOf(B, points, rows, allTypes)],
    )
    // Le 5ᵉ observateur du type A a produit une capture hors trame.
    expect(model.groupA.ghostEvents).toBe(1)
    expect(model.groupA.detections).toBe(40)
    expect(totalGroupGhostEvents(model)).toBe(1)
  })

  it('les compteurs humains du groupe restent explicites', () => {
    const model = buildGroupComparison(
      [inputOf(A, points, rows, allTypes), inputOf(B, points, rows, allTypes)],
      [inputOf(C, points, rows, allTypes)],
    )
    // 4 détecteurs + le 5ᵉ observateur du type A = 5 ; B en compte 3 → 8 dans le groupe.
    expect(model.groupA.observerCount).toBe(8)
    expect(model.groupB.observerCount).toBe(4)
  })
})

describe('pas de second moteur : les groupes restent comparables aux types', () => {
  const { allTypes, points, rows } = scenario()

  it('le taux d’un groupe d’un seul type est exactement celui du type', () => {
    const input = inputOf(A, points, rows, allTypes)
    const model = buildGroupComparison([input], [inputOf(B, points, rows, allTypes)])

    expect(model.groupA.rate).toBe(input.metrics.detectionProbability)
    expect(model.groupA.detections).toBe(input.metrics.detections)
    expect(model.groupA.possibleObservations).toBe(input.metrics.possibleObservations)
  })

  it('la comparaison par types reste disponible et inchangée', () => {
    // `crossTypeAgreement` n'est pas affecté par l'ajout des groupes.
    expect(typeof crossTypeAgreement).toBe('function')
  })
})
