import { describe, expect, it } from 'vitest'
import {
  buildTypeComparison,
  crossTypeAgreement,
  mostObservedPoints,
  pointVideoScope,
  typeColumnLabel,
  type TypeComparisonInput,
} from '@/lib/typeComparison'
import {
  computeAnalyticsMetrics,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type SnapshotPoint,
} from '@/lib/analyticsVersioning'

/**
 * COMPARAISON DE PLUSIEURS TYPES (§14) — tests purs.
 *
 * Deux exigences structurent ces tests :
 *  1. AUCUN second moteur statistique : pour un type donné, la colonne de la matrice
 *     doit porter EXACTEMENT les indicateurs du moteur (`computeAnalyticsMetrics`),
 *     puisque c'est ce même calcul que le tableau de bord et les exports affichent ;
 *  2. l'unité de comparaison est le POINT LOGIQUE : plusieurs trames du même point
 *     forment UNE ligne, dont les indicateurs agrègent les trames sans jamais
 *     double-compter un observateur.
 */

const FAUNE = 'Faune'
const FLORE = 'Flore'

/** Fenêtre d'une passe vidéo typée (passe générique si `videoId` est null). */
function windowOf(
  id: string,
  label: string,
  debut: number,
  fin: number,
  type: string,
  videoId: string | null,
  videoName: string | null,
): SnapshotPoint {
  return { id, label, trameDebut: debut, trameFin: fin, videoId, videoName, type }
}

function configOf(points: SnapshotPoint[], types: string[]): AnalyticsPerimeterConfig {
  return {
    projectId: 'p1',
    projectTitle: 'Étude',
    observationTypes: types,
    points,
    videos: [
      { id: 'v1', name: 'Passe faune', typeLabel: FAUNE, orderIndex: 0 },
      { id: 'v2', name: 'Passe flore', typeLabel: FLORE, orderIndex: 1 },
    ],
  }
}

function row(partial: Partial<AnalyticsObservationRow> & { userId: string; timestampTotal: number }): AnalyticsObservationRow {
  return {
    id: `obs-${partial.userId}-${partial.timestampTotal}-${partial.pointId ?? 'x'}`,
    username: partial.userId,
    email: `${partial.userId}@example.test`,
    anonymousId: `anon-${partial.userId}`,
    observationType: FAUNE,
    isGhostPoint: false,
    pointId: null,
    pointLabel: null,
    imageUrl: '',
    videoId: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    ...partial,
  }
}

/** Construit une entrée de comparaison exactement comme le fait la Server Action. */
function inputOf(
  type: string,
  config: AnalyticsPerimeterConfig,
  rows: AnalyticsObservationRow[],
): TypeComparisonInput {
  const observerIds = new Set<string>()
  for (const item of rows) observerIds.add(item.userId)
  const metrics = computeAnalyticsMetrics(config, rows)
  return {
    type,
    config,
    rows,
    observerCount: observerIds.size,
    metrics: {
      detections: metrics.detections,
      ghostEvents: metrics.ghostEvents,
      totalClaims: metrics.totalClaims,
      configuredPoints: metrics.configuredPoints,
      windowsHit: metrics.windowsHit,
      concordanceRate: metrics.concordanceRate,
      precision: metrics.precision,
      detectionProbability: metrics.detectionProbability,
      averageDetectionDelay: metrics.averageDetectionDelay,
    },
  }
}

// ——————————————————————————————————————————————————————————————
// L1. Parité stricte avec le moteur partagé
// ——————————————————————————————————————————————————————————————

describe('L1 — la matrice ne fait que METTRE EN REGARD le moteur', () => {
  const faunePoints = [
    windowOf('f1', 'Éléphant', 0, 9, FAUNE, 'v1', 'Passe faune'),
    windowOf('f2', 'Bufflon', 20, 29, FAUNE, 'v1', 'Passe faune'),
  ]
  const fauneConfig = configOf(faunePoints, [FAUNE, FLORE])
  const fauneRows: AnalyticsObservationRow[] = [
    row({ userId: 'A', timestampTotal: 3, pointId: 'f1', videoId: 'v1' }),
    row({ userId: 'B', timestampTotal: 5, pointId: 'f1', videoId: 'v1' }),
    row({ userId: 'B', timestampTotal: 900, pointId: null, isGhostPoint: true, videoId: 'v1' }),
  ]

  it('les indicateurs de colonne sont CEUX du moteur, valeur pour valeur', () => {
    const metrics = computeAnalyticsMetrics(fauneConfig, fauneRows)
    const model = buildTypeComparison([inputOf(FAUNE, fauneConfig, fauneRows)])
    const column = model.columns[0]

    expect(column.detections).toBe(metrics.detections)
    expect(column.ghostEvents).toBe(metrics.ghostEvents)
    expect(column.configuredPoints).toBe(metrics.configuredPoints)
    expect(column.concordanceRate).toBe(metrics.concordanceRate)
    expect(column.precision).toBe(metrics.precision)
    expect(column.detectionProbability).toBe(metrics.detectionProbability)
    expect(column.averageDetectionDelay).toBe(metrics.averageDetectionDelay)
  })

  it('le taux de détection d’un point est la concordance du moteur pour ce point', () => {
    const metrics = computeAnalyticsMetrics(fauneConfig, fauneRows)
    const model = buildTypeComparison([inputOf(FAUNE, fauneConfig, fauneRows)])
    const elephant = model.rows.find((item) => item.pointLabel === 'Éléphant')

    expect(elephant?.byType[FAUNE]?.detectionRate).toBe(metrics.perPoint[0].concordanceRate)
    expect(elephant?.byType[FAUNE]?.observersDetected).toBe(metrics.perPoint[0].observersDetected)
    expect(elephant?.byType[FAUNE]?.avgDelaySeconds).toBe(metrics.perPoint[0].avgDelaySeconds)
    // 2 observateurs sur 3 présents (A, B, C).
    expect(elephant?.byType[FAUNE]?.observersDetected).toBe(2)
  })

  it('l’observateur C, sans détection, reste compté au dénominateur', () => {
    const rows = fauneRows.concat([
      row({ userId: 'C', timestampTotal: 700, pointId: null, isGhostPoint: true, videoId: 'v1' }),
    ])
    const model = buildTypeComparison([inputOf(FAUNE, fauneConfig, rows)])
    expect(model.columns[0].observerCount).toBe(3)
    expect(model.rows.find((item) => item.pointLabel === 'Éléphant')?.byType[FAUNE]?.detectionRate).toBe(67)
  })
})

// ——————————————————————————————————————————————————————————————
// L2. Le point LOGIQUE, pas la fenêtre isolée
// ——————————————————————————————————————————————————————————————

describe('L2 — un point porté par plusieurs trames reste UNE ligne', () => {
  // Même nom, même passe ⇒ même point logique, sur trois trames distinctes.
  const points = [
    windowOf('w1', 'Lion', 0, 9, FAUNE, 'v1', 'Passe faune'),
    windowOf('w2', 'Lion', 60, 69, FAUNE, 'v1', 'Passe faune'),
    windowOf('w3', 'Lion', 120, 129, FAUNE, 'v1', 'Passe faune'),
  ]
  const config = configOf(points, [FAUNE])
  /** A capture w1 ET w2 (même point) ; B ne capture que w3. */
  const rows: AnalyticsObservationRow[] = [
    row({ userId: 'A', timestampTotal: 4, pointId: 'w1', videoId: 'v1' }),
    row({ userId: 'A', timestampTotal: 64, pointId: 'w2', videoId: 'v1' }),
    row({ userId: 'B', timestampTotal: 124, pointId: 'w3', videoId: 'v1' }),
  ]

  const model = buildTypeComparison([inputOf(FAUNE, config, rows)])
  const lion = model.rows[0]

  it('une seule ligne de matrice pour les trois trames', () => {
    expect(model.rows).toHaveLength(1)
    expect(lion.pointLabel).toBe('Lion')
    expect(lion.byType[FAUNE]?.windowCount).toBe(3)
  })

  it('les détections se SOMMENT sur les trames distinctes (unité = fenêtre)', () => {
    // 3 trames × 1 observateur chacune = 3 détections analytiques distinctes.
    expect(lion.byType[FAUNE]?.detections).toBe(3)
  })

  it('les observateurs DÉTECTEURS sont une UNION : A ne compte qu’une fois', () => {
    expect(lion.byType[FAUNE]?.observersDetected).toBe(2)
    // 2 détecteurs sur 2 observateurs comptés.
    expect(lion.byType[FAUNE]?.detectionRate).toBe(100)
  })

  it('les trames du même nom mais d’une AUTRE passe ne sont pas fusionnées', () => {
    const other = configOf(
      points.concat([windowOf('w4', 'Lion', 30, 39, FAUNE, 'v2', 'Passe flore')]),
      [FAUNE],
    )
    const split = buildTypeComparison([inputOf(FAUNE, other, rows)])
    expect(split.rows).toHaveLength(2)
    expect(split.rows.map((item) => item.videoName).sort()).toEqual(['Passe faune', 'Passe flore'])
  })

  it('pointVideoScope identifie la passe vidéo du point (passe générique incluse)', () => {
    expect(pointVideoScope(points[0])).toBe(pointVideoScope(points[1]))
    expect(pointVideoScope(points[0])).not.toBe(
      pointVideoScope(windowOf('g', 'Lion', 0, 1, '', null, null)),
    )
  })
})

// ——————————————————————————————————————————————————————————————
// L3. Types hétérogènes : un tiret, jamais un zéro trompeur
// ——————————————————————————————————————————————————————————————

describe('L3 — un point absent d’un type affiche un tiret, pas 0 %', () => {
  const fauneConfig = configOf(
    [windowOf('f1', 'Éléphant', 0, 9, FAUNE, 'v1', 'Passe faune')],
    [FAUNE, FLORE],
  )
  const floreConfig = configOf(
    [windowOf('r1', 'Orchidée', 0, 9, FLORE, 'v2', 'Passe flore')],
    [FAUNE, FLORE],
  )
  const fauneRows = [row({ userId: 'A', timestampTotal: 3, pointId: 'f1', videoId: 'v1' })]
  const floreRows = [
    row({ userId: 'A', timestampTotal: 3, pointId: 'r1', observationType: FLORE, videoId: 'v2' }),
  ]

  const model = buildTypeComparison([
    inputOf(FAUNE, fauneConfig, fauneRows),
    inputOf(FLORE, floreConfig, floreRows),
  ])

  it('chaque point n’est porté que par son type : l’autre cellule est null', () => {
    const elephant = model.rows.find((item) => item.pointLabel === 'Éléphant')
    const orchidee = model.rows.find((item) => item.pointLabel === 'Orchidée')
    expect(elephant?.byType[FAUNE]).not.toBeNull()
    expect(elephant?.byType[FLORE]).toBeNull()
    expect(orchidee?.byType[FLORE]).not.toBeNull()
    expect(orchidee?.byType[FAUNE]).toBeNull()
  })

  it('aucun point partagé ⇒ pas d’écart calculable (null, pas 0)', () => {
    expect(model.rows.every((item) => item.spread === null)).toBe(true)
    expect(crossTypeAgreement(model)).toBeNull()
  })

  it('les deux colonnes sont présentes, dans l’ordre demandé', () => {
    expect(model.columns.map((column) => column.type)).toEqual([FAUNE, FLORE])
    expect(model.columns.map((column) => column.label)).toEqual([FAUNE, FLORE])
  })
})

// ——————————————————————————————————————————————————————————————
// L4. Réponses aux questions scientifiques du §14
// ——————————————————————————————————————————————————————————————

describe('L4 — réponses scientifiques tirées de la matrice', () => {
  const points = [
    windowOf('f1', 'Éléphant', 0, 9, FAUNE, 'v1', 'Passe faune'),
    windowOf('f2', 'Bufflon', 20, 29, FAUNE, 'v1', 'Passe faune'),
  ]
  const config = configOf(points, [FAUNE, FLORE])
  /** A et B détectent l'éléphant ; A seul détecte le bufflon. */
  const rows: AnalyticsObservationRow[] = [
    row({ userId: 'A', timestampTotal: 3, pointId: 'f1', videoId: 'v1' }),
    row({ userId: 'B', timestampTotal: 4, pointId: 'f1', videoId: 'v1' }),
    row({ userId: 'A', timestampTotal: 23, pointId: 'f2', videoId: 'v1' }),
  ]

  const model = buildTypeComparison([inputOf(FAUNE, config, rows)])

  it('« quel point est le plus souvent observé ? » → classement par taux moyen', () => {
    const top = mostObservedPoints(model)
    expect(top[0].pointLabel).toBe('Éléphant')
    expect(top[0].averageRate).toBe(100)
    expect(top[1].pointLabel).toBe('Bufflon')
    expect(top[1].averageRate).toBe(50)
  })

  it('la liste est bornée par `limit` sans réordonner', () => {
    expect(mostObservedPoints(model, 1)).toHaveLength(1)
    expect(mostObservedPoints(model, 1)[0].pointLabel).toBe('Éléphant')
    expect(mostObservedPoints(model, 0)).toHaveLength(0)
  })

  it('« quel type est le mieux détecté ? » → meilleur taux moyen, départage alphabétique', () => {
    expect(model.bestType).toBe(FAUNE)
    expect(model.weakestType).toBe(FAUNE)
  })

  it('un type sans point configuré est signalé, pas compté comme 0 %', () => {
    // FLORE est comparée mais ne porte AUCUN point configuré : colonne vide assumée.
    const empty = configOf([], [FAUNE, FLORE])
    const modelWithEmpty = buildTypeComparison([
      inputOf(FAUNE, config, rows),
      inputOf(FLORE, empty, []),
    ])
    expect(modelWithEmpty.emptyTypes).toEqual([FLORE])
    // La colonne vide est bien CLASSÉE dernière (taux moyen 0), mais identifiable.
    expect(modelWithEmpty.weakestType).toBe(FLORE)
  })
})

// ——————————————————————————————————————————————————————————————
// L5. Cohérence inter-types
// ——————————————————————————————————————————————————————————————

describe('L5 — cohérence entre types (1 − écart moyen)', () => {
  const shared = [windowOf('f1', 'Éléphant', 0, 9, FAUNE, 'v1', 'Passe faune')]

  it('types parfaitement alignés ⇒ 1', () => {
    const a = configOf(shared, [FAUNE, FLORE])
    const b = configOf(shared, [FAUNE, FLORE])
    const rows = [row({ userId: 'A', timestampTotal: 3, pointId: 'f1', videoId: 'v1' })]
    const model = buildTypeComparison([inputOf(FAUNE, a, rows), inputOf(FLORE, b, rows)])
    expect(crossTypeAgreement(model)).toBe(1)
  })

  it('divergence totale ⇒ 0', () => {
    const a = configOf(shared, [FAUNE, FLORE])
    const b = configOf(shared, [FAUNE, FLORE])
    const rows = [row({ userId: 'A', timestampTotal: 3, pointId: 'f1', videoId: 'v1' })]
    const model = buildTypeComparison([inputOf(FAUNE, a, rows), inputOf(FLORE, b, [])])
    // FAUNE : 100 % (1 détecteur / 1 observateur) ; FLORE : 0 % (aucun observateur).
    expect(model.rows[0].spread).toBe(100)
    expect(crossTypeAgreement(model)).toBe(0)
  })

  it('aucun point partagé ⇒ null (et non 1, qui serait faux)', () => {
    const a = configOf([windowOf('f1', 'Éléphant', 0, 9, FAUNE, 'v1', 'Passe faune')], [FAUNE])
    const b = configOf([windowOf('r1', 'Orchidée', 0, 9, FLORE, 'v2', 'Passe flore')], [FLORE])
    const model = buildTypeComparison([inputOf(FAUNE, a, []), inputOf(FLORE, b, [])])
    expect(crossTypeAgreement(model)).toBeNull()
  })
})

// ——————————————————————————————————————————————————————————————
// L6. Robustesse et déterminisme
// ——————————————————————————————————————————————————————————————

describe('L6 — déterminisme et entrées limites', () => {
  it('la passe générique reçoit un libellé explicite', () => {
    expect(typeColumnLabel('')).toBe('Générique')
    expect(typeColumnLabel('   ')).toBe('Générique')
    expect(typeColumnLabel('  Faune  ')).toBe('Faune')
  })

  it('l’espace et la casse ne créent pas deux types distincts', () => {
    const config = configOf([windowOf('f1', 'Éléphant', 0, 9, FAUNE, 'v1', 'Passe faune')], [FAUNE])
    const model = buildTypeComparison([inputOf(' Faune ', config, [])])
    expect(model.columns[0].type).toBe('Faune')
    expect(model.rows[0].byType['Faune']).toBeDefined()
  })

  it('les lignes sont triées de façon stable (point, puis passe)', () => {
    const config = configOf(
      [
        windowOf('b1', 'Zèbre', 0, 9, FAUNE, 'v1', 'Passe faune'),
        windowOf('a1', 'Antilope', 0, 9, FAUNE, 'v1', 'Passe faune'),
        windowOf('g1', 'Antilope', 0, 9, FAUNE, 'v2', 'Passe flore'),
      ],
      [FAUNE],
    )
    const model = buildTypeComparison([inputOf(FAUNE, config, [])])
    expect(model.rows.map((item) => `${item.pointLabel}|${item.videoName}`)).toEqual([
      'Antilope|Passe faune',
      'Antilope|Passe flore',
      'Zèbre|Passe faune',
    ])
  })

  it('aucune entrée ⇒ modèle vide, jamais une exception', () => {
    const model = buildTypeComparison([])
    expect(model).toEqual({
      columns: [],
      rows: [],
      bestType: null,
      weakestType: null,
      emptyTypes: [],
    })
  })

  it('un projet sans aucune détection reste calculable (taux 0, pas de division par zéro)', () => {
    const config = configOf([windowOf('f1', 'Éléphant', 0, 9, FAUNE, 'v1', 'Passe faune')], [FAUNE])
    const model = buildTypeComparison([inputOf(FAUNE, config, [])])
    const elephant = model.rows[0]
    expect(elephant.byType[FAUNE]?.detectionRate).toBe(0)
    expect(elephant.byType[FAUNE]?.observersDetected).toBe(0)
    expect(elephant.byType[FAUNE]?.avgDelaySeconds).toBeNull()
    expect(model.columns[0].precision).toBeNull()
  })
})
