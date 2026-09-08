import { describe, expect, it } from 'vitest'
import {
  LEDGER_HEADERS,
  buildGlobalObservations,
  buildObserverMatrix,
  buildProjectSummary,
  buildTypeStatistics,
  clockLabel,
  interObserverAgreementRate,
  type GlobalExportRow,
  type GlobalExportSource,
} from '@/lib/globalExportModel'

const project = {
  id: 'p1',
  title: 'Virunga test',
  description: null,
  videoUrl: null,
  observationTypes: ['Faune', 'Eau'],
  createdAt: '2026-08-01T00:00:00.000Z',
  definedPoints: 2,
}

function row(partial: Partial<GlobalExportRow>): GlobalExportRow {
  return {
    userId: 'u1',
    username: 'Obs 1',
    email: 'obs1@example.test',
    anonymousId: 'anon-1',
    timestampTotal: 60,
    observationType: 'Faune',
    isGhostPoint: false,
    pointId: 'pt-a',
    pointLabel: 'Point A',
    imageUrl: 'https://img.test/1.png',
    createdAt: '2026-08-10T10:00:00.000Z',
    ...partial,
  }
}

describe('LEDGER_HEADERS', () => {
  it('définit exactement les 11 colonnes persistées du classeur global', () => {
    expect(LEDGER_HEADERS).toHaveLength(11)
    expect(LEDGER_HEADERS[0]).toBe('Minuterie (MM:SS)')
    expect(LEDGER_HEADERS[1]).toBe("Type d'observation")
    expect(LEDGER_HEADERS[2]).toBe('Point trouvé ?')
    expect(LEDGER_HEADERS[7]).toBe('Coordonnées (X, Y)')
    expect(LEDGER_HEADERS[10]).toBe('Date de Capture')
  })
})

describe('interObserverAgreementRate', () => {
  it('renvoie null sans comparaison quand un seul observateur actif', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', pointId: 'pt-a', timestampTotal: 60 }),
        row({ userId: 'u1', pointId: 'pt-a', timestampTotal: 63 }),
      ],
    }
    const agreement = interObserverAgreementRate(source.rows)
    expect(agreement.rate).toBeNull()
    expect(agreement.pairs).toBe(0)
    expect(agreement.comparable).toBe(false)
  })

  it('calcule un accord parfait quand deux observateurs posent les mêmes détections', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', pointId: 'pt-a', timestampTotal: 60 }),
        row({ userId: 'u1', pointId: 'pt-b', timestampTotal: 100 }),
        row({ userId: 'u2', pointId: 'pt-a', timestampTotal: 61 }),
        row({ userId: 'u2', pointId: 'pt-b', timestampTotal: 101 }),
      ],
    }
    const agreement = interObserverAgreementRate(source.rows)
    expect(agreement.rate).toBe(1)
    expect(agreement.pairs).toBe(1)
    expect(agreement.comparable).toBe(true)
  })

  it('renvoie 0 pour deux observateurs sur des événements disjoints', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', pointId: 'pt-a', timestampTotal: 60 }),
        row({ userId: 'u2', pointId: 'pt-b', timestampTotal: 200 }),
      ],
    }
    expect(interObserverAgreementRate(source.rows).rate).toBe(0)
  })

  it('ne mappe que les détections rattachées à une fenêtre (pointId ≠ null)', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        // u1 et u2 coïncident sur pt-a, mais seulement sur du hors trame ailleurs.
        row({ userId: 'u1', pointId: 'pt-a', timestampTotal: 60 }),
        row({ userId: 'u1', pointId: null, timestampTotal: 500 }),
        row({ userId: 'u2', pointId: 'pt-a', timestampTotal: 62 }),
        row({ userId: 'u2', pointId: null, timestampTotal: 500 }),
      ],
    }
    expect(interObserverAgreementRate(source.rows).rate).toBe(1)
  })
})

describe('buildProjectSummary', () => {
  it('compte validées / hors trame / non typées et fenêtres distinctes', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', pointId: 'pt-a', isGhostPoint: false, observationType: 'Faune' }),
        row({ userId: 'u1', pointId: 'pt-a', isGhostPoint: true, observationType: 'Faune' }),
        row({ userId: 'u2', pointId: 'pt-b', isGhostPoint: false, observationType: 'Eau' }),
        row({ userId: 'u2', pointId: null, isGhostPoint: true, observationType: null }),
      ],
    }
    const summary = buildProjectSummary(source)
    expect(summary.totalObservations).toBe(4)
    expect(summary.validatedCount).toBe(2)
    expect(summary.ghostCount).toBe(2)
    expect(summary.untypedCount).toBe(1)
    expect(summary.observerCount).toBe(2)
    expect(summary.windowsHit).toBe(2)
  })

  it('répartit par type configuré même quand le type est hors liste (type imposé)', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ observationType: 'Faune' }),
        row({ observationType: 'Inconnu' }), // hors liste → ignoré dans perType
      ],
    }
    const summary = buildProjectSummary(source)
    const perType = Object.fromEntries(summary.perType.map((e) => [e.type, e.count]))
    expect(perType.Faune).toBe(1)
    expect(perType.Inconnu).toBeUndefined()
  })

  it('dénombre dynamiquement les types quand aucun type n’est imposé', () => {
    const source: GlobalExportSource = {
      project: { ...project, observationTypes: [] },
      rows: [row({ observationType: 'Libre A' }), row({ observationType: 'Libre A' })],
    }
    const summary = buildProjectSummary(source)
    expect(summary.perType).toEqual([{ type: 'Libre A', count: 2 }])
  })

  it('ne compte pas les observateurs sans fenêtre touchée deux fois', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', pointId: 'pt-a' }),
        row({ userId: 'u2', pointId: 'pt-a' }),
      ],
    }
    expect(buildProjectSummary(source).windowsHit).toBe(1)
  })
})

describe('buildObserverMatrix', () => {
  it('produit des colonnes types dynamiques (configurées + observées inconnues)', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', observationType: 'Faune' }),
        row({ userId: 'u1', observationType: 'Sauvage' }), // dynamique, non configurée
      ],
    }
    const matrix = buildObserverMatrix(source)
    expect(matrix.types).toContain('Faune')
    expect(matrix.types).toContain('Eau')
    expect(matrix.types).toContain('Sauvage')
    expect(matrix.observers).toHaveLength(1)
    expect(matrix.observers[0].perType.Faune).toBe(1)
    expect(matrix.observers[0].perType.Sauvage).toBe(1)
    expect(matrix.observers[0].total).toBe(2)
  })

  it('calcule la précision = point trouvé / total (null sans capture)', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', isGhostPoint: false }),
        row({ userId: 'u1', isGhostPoint: false }),
        row({ userId: 'u1', isGhostPoint: true }),
      ],
    }
    const matrix = buildObserverMatrix(source)
    expect(matrix.observers[0].pointFound).toBe(2)
    expect(matrix.observers[0].ghosts).toBe(1)
    expect(matrix.observers[0].precision).toBeCloseTo(2 / 3, 5)
  })

  it('compte les fenêtres distinctes touchées par observateur', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ userId: 'u1', pointId: 'pt-a' }),
        row({ userId: 'u1', pointId: 'pt-a' }),
        row({ userId: 'u1', pointId: 'pt-b' }),
      ],
    }
    expect(buildObserverMatrix(source).observers[0].windowsHit).toBe(2)
  })
})

describe('buildGlobalObservations', () => {
  it('trie par date puis par horodatage et remplit les colonnes du relevé', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({
          userId: 'u1',
          timestampTotal: 3725,
          isGhostPoint: false,
          pointLabel: 'Point A',
          createdAt: '2026-08-10T12:00:00.000Z',
        }),
        row({
          userId: 'u2',
          timestampTotal: 60,
          isGhostPoint: true,
          createdAt: '2026-08-10T11:00:00.000Z',
        }),
      ],
    }
    const ledger = buildGlobalObservations(source)
    expect(ledger).toHaveLength(2)
    expect(ledger[0].capturedAt).toBe('2026-08-10T11:00:00.000Z')
    expect(ledger[1].timecode).toBe('62:05') // Minuterie MM:SS > 59 min conservée
    expect(ledger[1].pointFound).toBe('Oui')
    expect(ledger[1].pointLabel).toBe('Point A')
    expect(ledger[0].pointFound).toBe('Non')
    expect(ledger[0].status).toContain('Hors trame')
    expect(ledger[1].observationType).toBe('Faune')
  })
})

describe('clockLabel', () => {
  it('formate les minutes non bornées (contrat Minuterie MM:SS)', () => {
    expect(clockLabel(3725)).toBe('62:05')
    expect(clockLabel(59)).toBe('00:59')
  })
})

describe('buildTypeStatistics', () => {
  it('agrège par type : validées, hors trame, observateurs distincts, fenêtres distinctes', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ observationType: 'Faune', isGhostPoint: false, pointId: 'pt-a', userId: 'u1' }),
        // Même observateur, même fenêtre (compté une seule fois dans windowsHit).
        row({ observationType: 'Faune', isGhostPoint: false, pointId: 'pt-a', userId: 'u1', timestampTotal: 65 }),
        row({ observationType: 'Faune', isGhostPoint: true, pointId: null, userId: 'u2', anonymousId: 'anon-2' }),
        row({ observationType: 'Eau', isGhostPoint: false, pointId: 'pt-b', userId: 'u2', anonymousId: 'anon-2' }),
      ],
    }
    const stats = buildTypeStatistics(source)
    const faune = stats.find((entry) => entry.type === 'Faune')
    const eau = stats.find((entry) => entry.type === 'Eau')
    expect(faune).toMatchObject({ total: 3, validated: 2, ghosts: 1, observers: 2, windowsHit: 1 })
    expect(faune?.precision).toBeCloseTo(2 / 3)
    expect(eau).toMatchObject({ total: 1, validated: 1, ghosts: 0, observers: 1, windowsHit: 1 })
  })

  it('conserve les types configurés à zéro et ignore les lignes sans type', () => {
    const source: GlobalExportSource = {
      project,
      rows: [
        row({ observationType: null }),
        row({ observationType: '', isGhostPoint: true }),
      ],
    }
    const stats = buildTypeStatistics(source)
    expect(stats).toHaveLength(project.observationTypes.length)
    for (const entry of stats) {
      expect(entry).toMatchObject({ total: 0, validated: 0, ghosts: 0, observers: 0, windowsHit: 0 })
      expect(entry.precision).toBeNull()
    }
  })

  it('ajoute les types observés non configurés (projet à types libres), tri alphabétique', () => {
    const freeProject = { ...project, observationTypes: [] }
    const source: GlobalExportSource = {
      project: freeProject,
      rows: [
        row({ observationType: 'Zèbre' }),
        row({ observationType: 'Faune' }),
      ],
    }
    const stats = buildTypeStatistics(source)
    expect(stats.map((entry) => entry.type)).toEqual(['Faune', 'Zèbre'])
  })
})
