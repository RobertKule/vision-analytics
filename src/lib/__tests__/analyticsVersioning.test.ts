import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_TRIGGERS,
  buildAnalyticsSnapshot,
  computeAnalyticsMetrics,
  endOfDayIso,
  isPerimeterChange,
  nextVersionNumber,
  perimeterFingerprint,
  sameAnalyticState,
  selectVersionAsOfDate,
  versionLabel,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type SnapshotPoint,
} from '@/lib/analyticsVersioning'

/**
 * PARTIE J — VERSIONNAGE DES ANALYSES (fonctions PURES, aucune base).
 *
 * Scénario fondamental de la mission :
 *   Type 100 m, 10 fenêtres, 1 observateur, 8 détections → 10 possibles, 80 %.
 *   L'ADMIN ajoute une 11ᵉ fenêtre → 8 détections / 11 possibles = 72,73 %.
 *   Une nouvelle détection réelle sur la fenêtre 11 → 9 / 11 = 81,82 %.
 *
 * RÈGLE À NE JAMAIS VIOLER : ajouter une fenêtre ne supprime pas le passé. Le
 * système ne revient JAMAIS à 0 détection et ne calcule JAMAIS l'analyse nouvelle
 * uniquement avec les nouvelles observations.
 */

const TYPE = '100m'

/** Fenêtre `n` du type 100 m (10 s de large, sans chevauchement). */
function windowOf(index: number): SnapshotPoint {
  return {
    id: `w${index}`,
    label: `Point ${index}`,
    trameDebut: index * 10,
    trameFin: index * 10 + 9,
    videoId: 'video-100m',
    videoName: 'VIDEO_100M.mp4',
    type: TYPE,
  }
}

/** Configuration à `count` fenêtres pour le type 100 m. */
function configWith(count: number): AnalyticsPerimeterConfig {
  return {
    projectId: 'p1',
    projectTitle: 'Étude Virunga',
    observationTypes: [TYPE],
    points: Array.from({ length: count }, (_, index) => windowOf(index + 1)),
    videos: [{ id: 'video-100m', name: 'VIDEO_100M.mp4', typeLabel: TYPE, orderIndex: 0 }],
  }
}

/** Détection valide de l'observateur A sur la fenêtre `index`. */
function detection(index: number, at = '2026-04-10T10:00:00.000Z'): AnalyticsObservationRow {
  return {
    id: `obs-${index}`,
    userId: 'observerA',
    username: 'Observateur A',
    email: 'a@example.test',
    anonymousId: 'anon-a',
    timestampTotal: index * 10 + 3,
    observationType: TYPE,
    isGhostPoint: false,
    pointId: `w${index}`,
    pointLabel: `Point ${index}`,
    imageUrl: '/api/captures/obs/image',
    driveFileId: `drive-${index}`,
    videoName: 'VIDEO_100M.mp4',
    createdAt: at,
  }
}

/** Les 8 détections initiales (fenêtres 1 à 8). */
const EIGHT_DETECTIONS = Array.from({ length: 8 }, (_, i) => detection(i + 1))

describe('J1–J3 — ajouter une fenêtre augmente le dénominateur, jamais le numérateur', () => {
  it('J1 : 10 fenêtres / 8 détections → 10 possibles, probabilité 80 %', () => {
    const metrics = computeAnalyticsMetrics(configWith(10), EIGHT_DETECTIONS)
    expect(metrics.configuredPoints).toBe(10)
    expect(metrics.observerCount).toBe(1)
    expect(metrics.possibleObservations).toBe(10)
    expect(metrics.detections).toBe(8)
    expect(metrics.detectionProbability).toBeCloseTo(0.8, 10)
  })

  it('J2–J3 : ajout de la fenêtre 11 → 11 possibles, TOUJOURS 8 détections (72,73 %)', () => {
    const metrics = computeAnalyticsMetrics(configWith(11), EIGHT_DETECTIONS)
    expect(metrics.configuredPoints).toBe(11)
    expect(metrics.possibleObservations).toBe(11)
    // Le numérateur ne bouge pas : les détections passées restent comptabilisées.
    expect(metrics.detections).toBe(8)
    expect(metrics.detectionProbability).toBeCloseTo(8 / 11, 10)
    expect(Math.round((metrics.detectionProbability ?? 0) * 10000) / 100).toBe(72.73)
  })

  it('J9 : le système ne revient jamais à 0 détection après un ajout de fenêtre', () => {
    for (const count of [11, 12, 20, 50]) {
      expect(computeAnalyticsMetrics(configWith(count), EIGHT_DETECTIONS).detections).toBe(8)
    }
  })
})

describe('J4 + J7 — les versions historiques restent IMMUABLES', () => {
  it('J4 : la version figée avant l’ajout reste 10 fenêtres / 8 détections / 10 possibles', () => {
    const v1 = buildAnalyticsSnapshot({
      config: configWith(10),
      rows: EIGHT_DETECTIONS,
      dataCutoffAt: '2026-04-20T09:00:00.000Z',
    })
    // On avance : configuration à 11 fenêtres et une détection de plus.
    const later = computeAnalyticsMetrics(configWith(11), [
      ...EIGHT_DETECTIONS,
      detection(11, '2026-04-23T10:00:00.000Z'),
    ])

    // L'instantané v1 n'est pas affecté par ce qui s'est passé après lui.
    expect(v1.metrics.configuredPoints).toBe(10)
    expect(v1.metrics.detections).toBe(8)
    expect(v1.metrics.possibleObservations).toBe(10)
    expect(later.detections).toBe(9)
    expect(later.possibleObservations).toBe(11)
  })

  it('J7 : la version « 11 fenêtres / 8 détections » reste inchangée après une nouvelle détection', () => {
    const v2 = buildAnalyticsSnapshot({
      config: configWith(11),
      rows: EIGHT_DETECTIONS,
      dataCutoffAt: '2026-04-20T09:00:01.000Z',
    })
    const snapshotJson = JSON.stringify(v2)

    // Nouvelle détection réelle plus tard : l'instantané n'est jamais recalculé.
    computeAnalyticsMetrics(configWith(11), [...EIGHT_DETECTIONS, detection(11)])

    expect(JSON.stringify(v2)).toBe(snapshotJson)
    expect(v2.metrics.configuredPoints).toBe(11)
    expect(v2.metrics.detections).toBe(8)
    expect(v2.metrics.possibleObservations).toBe(11)
  })
})

describe('J5–J6 — une nouvelle détection réelle augmente le numérateur', () => {
  it('J5–J6 : détection sur la fenêtre 11 → 9 / 11 = 81,82 %', () => {
    const rows = [...EIGHT_DETECTIONS, detection(11, '2026-04-23T10:00:00.000Z')]
    const metrics = computeAnalyticsMetrics(configWith(11), rows)
    expect(metrics.detections).toBe(9)
    expect(metrics.possibleObservations).toBe(11)
    expect(Math.round((metrics.detectionProbability ?? 0) * 10000) / 100).toBe(81.82)
  })

  it('l’analyse actuelle combine ANCIENNES + NOUVELLES données valides', () => {
    const anciennes = EIGHT_DETECTIONS
    const nouvelles = [detection(11, '2026-04-23T10:00:00.000Z')]
    const seulementNouvelles = computeAnalyticsMetrics(configWith(11), nouvelles)
    const combinees = computeAnalyticsMetrics(configWith(11), [...anciennes, ...nouvelles])

    // Calculer avec les seules nouvelles observations serait FAUX (1 au lieu de 9).
    expect(seulementNouvelles.detections).toBe(1)
    expect(combinees.detections).toBe(9)
  })
})

describe('J8 + J9 — plusieurs captures d’une même fenêtre = UNE détection', () => {
  it('J8 : 4 captures du même observateur dans la même fenêtre comptent pour 1', () => {
    const rows: AnalyticsObservationRow[] = [
      { ...detection(1), id: 'a', timestampTotal: 11 },
      { ...detection(1), id: 'b', timestampTotal: 12 },
      { ...detection(1), id: 'c', timestampTotal: 13 },
      { ...detection(1), id: 'd', timestampTotal: 14 },
    ]
    const metrics = computeAnalyticsMetrics(configWith(10), rows)
    expect(metrics.detections).toBe(1)
    // Le relevé BRUT conserve, lui, les 4 captures.
    expect(metrics.rawCaptureCount).toBe(4)
  })

  it('J9 : aucune détection artificielle — une fausse alerte n’est jamais une détection', () => {
    const ghost: AnalyticsObservationRow = {
      ...detection(1),
      id: 'ghost-1',
      pointId: null,
      pointLabel: null,
      isGhostPoint: true,
    }
    const metrics = computeAnalyticsMetrics(configWith(10), [...EIGHT_DETECTIONS, ghost])
    expect(metrics.detections).toBe(8)
    expect(metrics.ghostEvents).toBe(1)
    expect(metrics.totalClaims).toBe(9)
  })
})

describe('J10–J12 — filtre par date et sélection de la bonne version', () => {
  const versions = [
    { id: 'v1', versionNumber: 1, effectiveAt: '2026-04-10T08:00:00.000Z' },
    { id: 'v2', versionNumber: 2, effectiveAt: '2026-04-20T08:00:00.000Z' },
    { id: 'v3', versionNumber: 3, effectiveAt: '2026-04-23T08:00:00.000Z' },
  ]

  it('J10–J11 : « avant le 12 avril » sélectionne la dernière version disponible (V1)', () => {
    expect(selectVersionAsOfDate(versions, '2026-04-12')?.id).toBe('v1')
  })

  it('J11 : « avant le 25 avril » sélectionne V3 ; « avant le 20 avril » sélectionne V2', () => {
    expect(selectVersionAsOfDate(versions, '2026-04-25')?.id).toBe('v3')
    expect(selectVersionAsOfDate(versions, '2026-04-20')?.id).toBe('v2')
  })

  it('J12 : aucune version disponible à cette date → analyse actuelle (null)', () => {
    expect(selectVersionAsOfDate(versions, '2026-04-01')).toBeNull()
    expect(selectVersionAsOfDate(versions, 'pas-une-date')).toBeNull()
  })

  it('la borne du filtre est la FIN du jour sélectionné (filtre de versions inclusif)', () => {
    expect(endOfDayIso('2026-04-20')).toBe('2026-04-20T23:59:59.999Z')
    expect(endOfDayIso('2026-13-99')).toBeNull()
  })
})

describe('J13–J15 — exports alignés sur la version affichée', () => {
  it('J13 + J15 : l’export actuel utilise la configuration et les données actuelles', () => {
    const rows = [...EIGHT_DETECTIONS, detection(11, '2026-04-23T10:00:00.000Z')]
    const dashboard = computeAnalyticsMetrics(configWith(11), rows)
    // Un export « actuel » part exactement de la même configuration + mêmes lignes.
    const exportModel = computeAnalyticsMetrics(configWith(11), rows)
    expect(exportModel.detections).toBe(dashboard.detections)
    expect(exportModel.possibleObservations).toBe(dashboard.possibleObservations)
    expect(exportModel.detectionProbability).toBe(dashboard.detectionProbability)
  })

  it('J14 : l’export historique utilise la configuration FIGÉE de la version choisie', () => {
    const v1 = buildAnalyticsSnapshot({
      config: configWith(10),
      rows: EIGHT_DETECTIONS,
      dataCutoffAt: '2026-04-20T09:00:00.000Z',
    })
    // L'export rejoue la configuration figée + les lignes bornées à la version.
    const rejoue = computeAnalyticsMetrics(v1.configuration, EIGHT_DETECTIONS)
    expect(rejoue.configuredPoints).toBe(v1.metrics.configuredPoints)
    expect(rejoue.detections).toBe(v1.metrics.detections)
    expect(rejoue.possibleObservations).toBe(v1.metrics.possibleObservations)
    // Et surtout : jamais les 11 fenêtres de la configuration actuelle.
    expect(rejoue.possibleObservations).not.toBe(11)
  })
})

describe('J16–J17 — ce qui crée (et ne crée pas) une version', () => {
  it('J16 : une nouvelle capture ne change PAS le périmètre analytique', () => {
    const config = configWith(11)
    const avant = perimeterFingerprint(config)
    // Une capture n'est qu'une donnée : la configuration est identique.
    const apres = perimeterFingerprint(configWith(11))
    expect(apres).toBe(avant)
    expect(isPerimeterChange(config, configWith(11))).toBe(false)
  })

  it('J17 : ajouter une fenêtre CHANGE le périmètre (⇒ nouvelle version)', () => {
    expect(isPerimeterChange(configWith(10), configWith(11))).toBe(true)
  })

  it('J17 : supprimer une fenêtre, changer les types ou le type d’une passe versionnent aussi', () => {
    const base = configWith(11)
    expect(isPerimeterChange(base, configWith(10))).toBe(true)
    expect(isPerimeterChange(base, { ...base, observationTypes: [TYPE, '250m'] })).toBe(true)
    expect(
      isPerimeterChange(base, {
        ...base,
        videos: [{ id: 'video-100m', name: 'VIDEO_100M.mp4', typeLabel: '250m', orderIndex: 0 }],
      }),
    ).toBe(true)
  })

  it('renommer le projet ne change pas le périmètre analytique (aucune version)', () => {
    const base = configWith(11)
    expect(isPerimeterChange(base, { ...base, projectTitle: 'Nouveau titre' })).toBe(false)
  })
})

describe('numérotation et comparaison des versions', () => {
  it('nextVersionNumber suit la plus grande version connue', () => {
    expect(nextVersionNumber([])).toBe(1)
    expect(
      nextVersionNumber([
        { versionNumber: 1, effectiveAt: '2026-04-10T08:00:00.000Z' },
        { versionNumber: 3, effectiveAt: '2026-04-20T08:00:00.000Z' },
      ]),
    ).toBe(4)
  })

  it('sameAnalyticState distingue deux états dont les détections diffèrent', () => {
    const a = buildAnalyticsSnapshot({
      config: configWith(11),
      rows: EIGHT_DETECTIONS,
      dataCutoffAt: '2026-04-20T09:00:00.000Z',
    })
    const b = buildAnalyticsSnapshot({
      config: configWith(11),
      rows: [...EIGHT_DETECTIONS, detection(11)],
      dataCutoffAt: '2026-04-23T09:00:00.000Z',
    })
    expect(sameAnalyticState(a, a)).toBe(true)
    expect(sameAnalyticState(a, b)).toBe(false)
  })

  it('versionLabel produit un libellé court et stable', () => {
    expect(versionLabel({ versionNumber: 2 })).toBe('V2')
  })

  it('les déclencheurs de version couvrent les modifications de configuration', () => {
    expect(ANALYTICS_TRIGGERS.windowAdded).toBe('WINDOW_ADDED')
    expect(ANALYTICS_TRIGGERS.windowRemoved).toBe('WINDOW_REMOVED')
    expect(ANALYTICS_TRIGGERS.typesUpdated).toBe('TYPES_UPDATED')
  })
})

describe('métriques détaillées d’un instantané', () => {
  it('conserve le détail par fenêtre et par observateur', () => {
    const rows = [...EIGHT_DETECTIONS, { ...detection(1), id: 'b2', userId: 'observerB', anonymousId: 'anon-b' }]
    const metrics = computeAnalyticsMetrics(configWith(11), rows)

    expect(metrics.observerCount).toBe(2)
    expect(metrics.possibleObservations).toBe(22)
    expect(metrics.detections).toBe(9)

    const first = metrics.perPoint.find((point) => point.pointId === 'w1')
    expect(first?.observersDetected).toBe(2)
    expect(first?.concordanceRate).toBe(100)

    const observerB = metrics.perObserver.find((entry) => entry.observerId === 'observerB')
    expect(observerB?.detections).toBe(1)
    expect(observerB?.possibleObservations).toBe(11)
  })
})
