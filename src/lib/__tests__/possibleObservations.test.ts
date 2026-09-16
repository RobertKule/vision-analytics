import { describe, expect, it } from 'vitest'
import {
  buildDetectionProbabilityTable,
  buildObserverSynthesisRows,
  computeTypeParticipation,
  detectionProbability,
  observerParticipatedTypes,
  possibleObservationsForObserver,
  totalPossibleObservations,
  type GlobalExportPoint,
  type GlobalExportRow,
  type GlobalExportSource,
} from '@/lib/globalExportModel'
import { computeAnalyticsMetrics, toExportSource } from '@/lib/analyticsVersioning'
import type { AnalyticsPerimeterConfig } from '@/lib/analyticsVersioning'

/**
 * CALCUL DES POINTS POSSIBLES — dénominateur de participation RÉELLE.
 *
 * La règle corrigée est, type par type :
 *
 *     possibles(type)  = pointsConfigurés(type) × observateursParticipants(type)
 *     possibles(total) = Σ possibles(type)
 *
 * et JAMAIS `pointsTotaux × observateursTotaux` (réunion ou maximum des
 * observateurs pris comme base commune). Ces tests échouent si l'ancienne
 * formule — celle qui gonflait le dénominateur des types les moins suivis —
 * est réintroduite quelque part.
 */

function point(type: string, index: number): GlobalExportPoint {
  return {
    id: `${type}-pt-${index}`,
    label: `${type} Point ${index}`,
    trameDebut: index * 10,
    trameFin: index * 10 + 5,
    videoName: `Passe ${type}`,
    type,
  }
}

function row(partial: Partial<GlobalExportRow>): GlobalExportRow {
  return {
    userId: 'u1',
    username: 'Observateur',
    email: null,
    anonymousId: 'anon',
    timestampTotal: 0,
    observationType: 'A',
    isGhostPoint: false,
    pointId: null,
    pointLabel: null,
    imageUrl: 'https://img.test/x.png',
    createdAt: '2026-08-10T10:00:00.000Z',
    ...partial,
  }
}

/**
 * Périmètre du §4.2 : Type A = 10 points / 5 participants, Type B = 8 points /
 * 3 participants. Le total attendu est 74 — et surtout PAS 90.
 */
function scenarioSource(options?: { participantsA?: number; participantsB?: number }) {
  const participantsA = options?.participantsA ?? 5
  const participantsB = options?.participantsB ?? 3
  const points = [
    ...Array.from({ length: 10 }, (_, i) => point('A', i + 1)),
    ...Array.from({ length: 8 }, (_, i) => point('B', i + 1)),
  ]
  const rows: GlobalExportRow[] = []
  for (let i = 0; i < participantsA; i += 1) {
    rows.push(row({ userId: `a${i}`, observationType: 'A', pointId: `A-pt-${i + 1}` }))
  }
  for (let i = 0; i < participantsB; i += 1) {
    rows.push(row({ userId: `b${i}`, observationType: 'B', pointId: `B-pt-${i + 1}` }))
  }
  const source: GlobalExportSource = {
    project: {
      id: 'p-possible',
      title: 'Points possibles',
      description: null,
      videoUrl: null,
      observationTypes: ['A', 'B'],
      createdAt: '2026-08-01T00:00:00.000Z',
      definedPoints: points.length,
      points,
      definedPointsByType: { A: 10, B: 8 },
    },
    rows,
  }
  return source
}

describe('E. points possibles — une somme de dénominateurs, pas un maximum', () => {
  it('Type A 10 × 5 + Type B 8 × 3 = 74 possibles (jamais 90)', () => {
    const source = scenarioSource()
    const participation = computeTypeParticipation(source)

    expect(participation.get('A')).toMatchObject({
      pointCount: 10,
      participants: 5,
      possibleObservations: 50,
    })
    expect(participation.get('B')).toMatchObject({
      pointCount: 8,
      participants: 3,
      possibleObservations: 24,
    })

    expect(totalPossibleObservations(source)).toBe(74)
    // Ancienne formule : (10 + 8) × max(5, 3) = 90. Elle ne doit plus exister.
    expect(totalPossibleObservations(source)).not.toBe((10 + 8) * 5)
  })

  it('le tableau par type porte SON dénominateur et SES participants', () => {
    const table = buildDetectionProbabilityTable(scenarioSource())
    const a = table.find((entry) => entry.type === 'A')
    const b = table.find((entry) => entry.type === 'B')

    expect(a).toMatchObject({ pointCount: 10, observerCount: 5, possibleObservations: 50 })
    expect(b).toMatchObject({ pointCount: 8, observerCount: 3, possibleObservations: 24 })
    // Aucune ligne ne réutilise le nombre d'observateurs d'un autre type.
    expect(a?.observerCount).not.toBe(b?.observerCount)
  })

  it('H. aucun type n\'est calculé avec le maximum ou la réunion des observateurs', () => {
    const source = scenarioSource()
    const observers = new Set(source.rows.map((entry) => entry.userId))
    expect(observers.size).toBe(8) // réunion A ∪ B disjointe ici

    const table = buildDetectionProbabilityTable(source)
    for (const entry of table) {
      // Le dénominateur d'un type ne peut jamais dépasser ses points × SES participants.
      const unionBased = entry.pointCount * observers.size
      expect(entry.possibleObservations).toBeLessThan(unionBased)
      expect(entry.possibleObservations).toBe(entry.pointCount * entry.observerCount)
    }
  })

  it('trois types : chaque dénominateur reste le sien (50 + 24 + 48 = 122)', () => {
    const points = [
      ...Array.from({ length: 10 }, (_, i) => point('A', i + 1)),
      ...Array.from({ length: 8 }, (_, i) => point('B', i + 1)),
      ...Array.from({ length: 12 }, (_, i) => point('C', i + 1)),
    ]
    const rows: GlobalExportRow[] = []
    for (let i = 0; i < 5; i += 1) rows.push(row({ userId: `a${i}`, observationType: 'A' }))
    for (let i = 0; i < 3; i += 1) rows.push(row({ userId: `b${i}`, observationType: 'B' }))
    for (let i = 0; i < 4; i += 1) rows.push(row({ userId: `c${i}`, observationType: 'C' }))

    const source: GlobalExportSource = {
      project: {
        id: 'p-three',
        title: 'Trois types',
        description: null,
        videoUrl: null,
        observationTypes: ['A', 'B', 'C'],
        createdAt: '2026-08-01T00:00:00.000Z',
        definedPoints: points.length,
        points,
        definedPointsByType: { A: 10, B: 8, C: 12 },
      },
      rows,
    }

    expect(totalPossibleObservations(source)).toBe(122)
  })
})

describe('F. exclusions et réinclusions d’observateurs', () => {
  it('un observateur retiré du relevé sort aussi du dénominateur (10 × 4 = 40)', () => {
    const full = scenarioSource({ participantsA: 5, participantsB: 3 })
    expect(totalPossibleObservations(full)).toBe(74)

    // DÉCLASSEMENT : le moteur filtre le relevé EN AMONT (§13) — le dénominateur
    // suit, sans qu'aucune donnée n'ait été supprimée.
    const afterExclusion: GlobalExportSource = {
      ...full,
      rows: full.rows.filter((entry) => entry.userId !== 'a4'),
    }
    const excluded = computeTypeParticipation(afterExclusion)
    expect(excluded.get('A')).toMatchObject({ participants: 4, possibleObservations: 40 })
    expect(totalPossibleObservations(afterExclusion)).toBe(40 + 24)

    // RÉINCLUSION : le relevé retrouve ses 5 participants, donc 50.
    expect(totalPossibleObservations(full)).toBe(74)
    expect(computeTypeParticipation(full).get('A')?.possibleObservations).toBe(50)
  })
})

describe('G. pourcentage pondéré par les vrais dénominateurs', () => {
  it('40/50 + 12/24 → 52/74 = 70,27 %, jamais la moyenne 65 %', () => {
    const source = scenarioSource()
    // 40 détections sur A (4 observateurs × 10 points) et 12 sur B.
    const rows: GlobalExportRow[] = []
    for (let observer = 0; observer < 4; observer += 1) {
      for (let i = 1; i <= 10; i += 1) {
        rows.push(row({
          userId: `a${observer}`,
          observationType: 'A',
          pointId: `A-pt-${i}`,
          pointLabel: `A Point ${i}`,
        }))
      }
    }
    for (let observer = 0; observer < 3; observer += 1) {
      for (let i = 1; i <= 4; i += 1) {
        rows.push(row({
          userId: `b${observer}`,
          observationType: 'B',
          pointId: `B-pt-${i}`,
          pointLabel: `B Point ${i}`,
        }))
      }
    }

    // 5ᵉ participant au type A : il a observé la passe sans rien détecter — il
    // reste au DÉNOMINATEUR (10 × 5 = 50) sans rien ajouter au numérateur.
    rows.push(row({
      userId: 'a4',
      observationType: 'A',
      isGhostPoint: true,
      pointId: null,
      pointLabel: null,
    }))

    const withRows: GlobalExportSource = { ...source, rows }
    const possible = totalPossibleObservations(withRows)
    expect(possible).toBe(74)

    const globalRate = detectionProbability(40 + 12, possible)
    expect(globalRate).toBeCloseTo(52 / 74, 10)
    expect(Math.round((globalRate ?? 0) * 10000) / 100).toBe(70.27)

    // La moyenne naïve (80 % + 50 %) / 2 = 65 % est FAUSSE et ne doit jamais sortir.
    const naive = (40 / 50 + 12 / 24) / 2
    expect(Math.round(naive * 100)).toBe(65)
    expect(globalRate).not.toBeCloseTo(naive, 5)
  })

  it('computeAnalyticsMetrics expose le taux pondéré et la somme des dénominateurs', () => {
    const config: AnalyticsPerimeterConfig = {
      projectId: 'p-possible',
      projectTitle: 'Points possibles',
      observationTypes: ['A', 'B'],
      points: [
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `A-pt-${i + 1}`,
          label: `A Point ${i + 1}`,
          trameDebut: i * 10,
          trameFin: i * 10 + 5,
          videoId: null,
          videoName: null,
          type: 'A',
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `B-pt-${i + 1}`,
          label: `B Point ${i + 1}`,
          trameDebut: 100 + i * 10,
          trameFin: 100 + i * 10 + 5,
          videoId: null,
          videoName: null,
          type: 'B',
        })),
      ],
      videos: [],
      excludedObserverIds: [],
    }
    const rows = [
      ...Array.from({ length: 4 }, (_, observer) =>
        Array.from({ length: 10 }, (_, i) =>
          row({
            userId: `a${observer}`,
            observationType: 'A',
            pointId: `A-pt-${i + 1}`,
            timestampTotal: i * 10,
          }),
        ),
      ).flat(),
      ...Array.from({ length: 3 }, (_, observer) =>
        Array.from({ length: 4 }, (_, i) =>
          row({
            userId: `b${observer}`,
            observationType: 'B',
            pointId: `B-pt-${i + 1}`,
            timestampTotal: 100 + i * 10,
          }),
        ),
      ).flat(),
      // 5ᵉ participant du type A : présent au dénominateur, absent du numérateur.
      row({ userId: 'a4', observationType: 'A', isGhostPoint: true, pointId: null }),
    ]

    const metrics = computeAnalyticsMetrics(config, rows)
    expect(metrics.possibleObservations).toBe(74)
    expect(metrics.detections).toBe(52)
    expect(metrics.detectionProbability).toBeCloseTo(52 / 74, 10)
    // Le dénominateur n'est plus `configuredPoints × observerCount` : 18 × 7 = 126.
    expect(metrics.possibleObservations).not.toBe(metrics.configuredPoints * metrics.observerCount)
  })
})

describe('participation par observateur', () => {
  it('les fenêtres possibles d’un observateur sont celles des types qu’IL a rejoints', () => {
    const source = scenarioSource()
    // Un observateur du type B (8 points) n'hérite pas des 10 fenêtres du type A.
    expect(possibleObservationsForObserver(source, 'b0')).toBe(8)
    expect([...observerParticipatedTypes(source, 'b0')]).toEqual(['B'])
    // Un observateur du type A n'hérite pas des fenêtres du type B.
    expect(possibleObservationsForObserver(source, 'a0')).toBe(10)

    const synthesis = buildObserverSynthesisRows(source)
    const b0 = synthesis.find((entry) => entry.observerId === 'b0')
    expect(b0?.pointsPossible).toBe(8)
  })

  it('un observateur ayant capturé sur les deux types cumule les deux périmètres', () => {
    const base = scenarioSource()
    const source: GlobalExportSource = {
      ...base,
      rows: [...base.rows, row({ userId: 'both', observationType: 'B', pointId: 'B-pt-1' })],
    }
    expect(possibleObservationsForObserver(source, 'both')).toBe(8)
    const both: GlobalExportSource = {
      ...source,
      rows: [...source.rows, row({ userId: 'both', observationType: 'A', pointId: 'A-pt-1' })],
    }
    expect(possibleObservationsForObserver(both, 'both')).toBe(18)
  })

  it('un observateur exclu du relevé ne compte nulle part', () => {
    const source = scenarioSource()
    const without = { ...source, rows: source.rows.filter((entry) => entry.userId !== 'b0') }
    const table = buildDetectionProbabilityTable(without)
    expect(table.find((entry) => entry.type === 'B')?.observerCount).toBe(2)
    expect(possibleObservationsForObserver(without, 'b0')).toBe(0)
  })

  it('une capture hors trame (fausse alerte) reste une participation au type', () => {
    const source = scenarioSource()
    const withGhost: GlobalExportSource = {
      ...source,
      rows: [...source.rows, row({ userId: 'ghost-obs', observationType: 'B', isGhostPoint: true })],
    }
    // L'observateur a bien observé la passe B : il entre au dénominateur de B.
    expect(computeTypeParticipation(withGhost).get('B')?.participants).toBe(4)
  })
})

describe('cohérence avec la source d’export', () => {
  it('toExportSource suffit à recalculer le dénominateur, sans second moteur', () => {
    const base = scenarioSource()
    const config: AnalyticsPerimeterConfig = {
      projectId: 'p-possible',
      projectTitle: 'Points possibles',
      observationTypes: ['A', 'B'],
      points: base.project.points.map((entry) => ({
        id: entry.id,
        label: entry.label,
        trameDebut: entry.trameDebut,
        trameFin: entry.trameFin,
        videoId: null,
        videoName: entry.videoName,
        type: entry.type,
      })),
      videos: [],
      excludedObserverIds: [],
    }
    const source = toExportSource(config, base.rows.map((entry) => ({ ...entry, createdAt: '2026-08-10T10:00:00.000Z' })))
    expect(totalPossibleObservations(source)).toBe(74)
  })
})
