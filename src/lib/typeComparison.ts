/**
 * COMPARAISON DE PLUSIEURS TYPES D'UN MÊME PROJET (§14) — noyau PUR (aucune I/O).
 *
 * ─── CE QUE CE MODULE EST ────────────────────────────────────────────────────
 * Un AGRÉGEUR de sorties du moteur analytique partagé. Il ne calcule AUCUNE règle
 * statistique nouvelle : chaque type comparé est d'abord résolu par
 * `resolveAnalyticsView` (le point d'entrée unique du dashboard et de tous les
 * exports), et ce module se contente de METTRE EN REGARD les résultats obtenus.
 *
 * ─── CE QUE CE MODULE N'EST PAS ──────────────────────────────────────────────
 * Il n'existe PAS de « deuxième moteur statistique » (§14). Concrètement :
 *   — l'attribution capture → fenêtre est déjà faite (le relevé porte `pointId`) ;
 *   — le décompte des détections est celui du moteur (`countAnalyticDetections`) ;
 *   — les fenêtres, types, vidéos et déclassements viennent de la configuration
 *     résolue, jamais d'une relecture parallèle de la base.
 * Comparer deux types revient donc à résoudre deux fois la MÊME analyse, chacune
 * restreinte à un type, et à aligner les lignes — pas à recalculer quoi que ce soit.
 *
 * ─── UNITÉ DE COMPARAISON : LE POINT LOGIQUE ─────────────────────────────────
 * Un point scientifique peut apparaître sur plusieurs trames temporelles (§B/§C).
 * La matrice compare donc des POINTS LOGIQUES — identifiés par (passe vidéo, nom
 * normalisé), exactement comme `windowAttribution.logicalPointKey` — et non des
 * fenêtres isolées. Un point porté par trois trames reste UNE ligne de matrice, dont
 * les indicateurs agrègent les trois trames.
 */

import { countAnalyticDetections } from '@/lib/globalExportModel'
import type {
  AnalyticsObservationRow,
  AnalyticsPerimeterConfig,
  SnapshotPoint,
} from '@/lib/analyticsVersioning'
import { logicalPointKey, videoScopeKey } from '@/lib/windowAttribution'

/** Un type d'observation comparé, déjà résolu par le moteur partagé. */
export type TypeComparisonInput = {
  /** Libellé affiché du type ('' = passe générique du projet). */
  type: string
  /** Configuration du périmètre RÉSOLUE pour ce type (config actuelle ou figée). */
  config: AnalyticsPerimeterConfig
  /** Relevé attribué par le moteur pour ce type (attribution déjà appliquée). */
  rows: readonly AnalyticsObservationRow[]
  /** Observateurs distincts du jeu de ce type — dénominateur des taux. */
  observerCount: number
  /** Métriques globales du type, telles que calculées par le moteur. */
  metrics: {
    detections: number
    ghostEvents: number
    totalClaims: number
    configuredPoints: number
    windowsHit: number
    concordanceRate: number
    precision: number | null
    detectionProbability: number | null
    averageDetectionDelay: number | null
  }
}

/** Indicateurs d'un point logique pour UN type. `null` si le type ne porte pas ce point. */
export type TypePointCell = {
  /** Fenêtres/trames configurées du point pour ce type. */
  windowCount: number
  /** Détections analytiques (observateur × fenêtre), cumulées sur les trames du point. */
  detections: number
  /** Observateurs distincts ayant détecté AU MOINS UNE trame du point (union exacte). */
  observersDetected: number
  /** Taux de détection 0–100 = observateurs détecteurs / observateurs du type. */
  detectionRate: number
  /** Concordance 0–100 = moyenne des concordances de ses trames (règle du moteur). */
  concordanceRate: number
  /** Délai moyen de réaction (s) sur les événements validés du point ; null si aucun. */
  avgDelaySeconds: number | null
}

/** Une ligne de la matrice : un point logique du projet, vu par chaque type. */
export type TypePointRow = {
  /** Clé du point logique : (passe vidéo, nom normalisé). */
  pointKey: string
  pointLabel: string
  videoName: string | null
  byType: Record<string, TypePointCell | null>
  /** Écart max − min des taux de détection, sur les types qui portent ce point. */
  spread: number | null
  /** Type au meilleur taux de détection (départage alphabétique, donc déterministe). */
  bestType: string | null
}

/** Synthèse par type — les indicateurs de tête de colonne. */
export type TypeComparisonColumn = {
  type: string
  label: string
  configuredPoints: number
  /** Points logiques distincts portés par ce type. */
  logicalPointCount: number
  observerCount: number
  detections: number
  ghostEvents: number
  concordanceRate: number
  precision: number | null
  detectionProbability: number | null
  averageDetectionDelay: number | null
  /** Taux de détection moyen sur ses points logiques (0–100). */
  averageDetectionRate: number
}

export type TypeComparisonModel = {
  columns: TypeComparisonColumn[]
  rows: TypePointRow[]
  /** Type le mieux détecté (moyenne des taux), départage alphabétique. */
  bestType: string | null
  /** Type le moins bien détecté — utile pour repérer un protocole en difficulté. */
  weakestType: string | null
  /** Types comparés qui ne portent aucun point configuré (colonne vide expliquée). */
  emptyTypes: string[]
}

/** Normalisation d'un type : l'espace et la casse ne créent pas deux types distincts. */
function normalizedType(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** Libellé affiché d'un type (la passe générique a un libellé explicite). */
export function typeColumnLabel(type: string): string {
  return normalizedType(type) || 'Générique'
}

/** Clé de regroupement d'un point logique, dérivée des données existantes. */
function pointKeyOf(point: SnapshotPoint): string {
  return logicalPointKey(
    { id: point.id, videoId: point.videoId ?? null, trameDebut: point.trameDebut, trameFin: point.trameFin },
    point.label,
  )
}

/**
 * Agrège les trames d'un point logique pour UN type.
 *
 * `detections` est la somme des détections de chaque trame : l'unité du moteur est
 * `(observateur, type, fenêtre)`, donc sommer des fenêtres DISTINCTES ne double
 * jamais compte. `observersDetected` est en revanche une UNION d'identifiants — un
 * observateur ayant capturé sur deux trames du même point ne compte qu'une fois.
 */
function aggregatePoint(
  windows: readonly SnapshotPoint[],
  rows: readonly AnalyticsObservationRow[],
  observerCount: number,
): TypePointCell {
  const observed = rows.filter(
    (row) => !row.isGhostPoint && row.pointId !== null && windows.some((w) => w.id === row.pointId),
  )
  const detectors = new Set(observed.map((row) => row.userId))

  // Concordance = moyenne des concordances de trames, comme `computeAnalyticsMetrics`.
  let concordanceSum = 0
  const delays: number[] = []
  for (const window of windows) {
    const matched = observed.filter((row) => row.pointId === window.id)
    const windowDetectors = new Set(matched.map((row) => row.userId))
    concordanceSum += observerCount > 0 ? Math.round((windowDetectors.size / observerCount) * 100) : 0
    for (const row of matched) delays.push(Math.max(0, row.timestampTotal - window.trameDebut))
  }

  return {
    windowCount: windows.length,
    detections: countAnalyticDetections(observed),
    observersDetected: detectors.size,
    detectionRate: observerCount > 0 ? Math.round((detectors.size / observerCount) * 100) : 0,
    concordanceRate: windows.length > 0 ? Math.round(concordanceSum / windows.length) : 0,
    avgDelaySeconds:
      delays.length > 0
        ? Math.round((delays.reduce((acc, delay) => acc + delay, 0) / delays.length) * 10) / 10
        : null,
  }
}

/**
 * Construit la matrice de comparaison à partir de types DÉJÀ RÉSOLUS par le moteur.
 * L'ordre des colonnes suit l'ordre d'entrée : l'appelant décide (ordre de
 * configuration du projet), ce qui rend l'affichage stable et déterministe.
 */
export function buildTypeComparison(inputs: readonly TypeComparisonInput[]): TypeComparisonModel {
  // ——— Colonnes ———
  const columns: TypeComparisonColumn[] = []
  const emptyTypes: string[] = []
  /** Clé de point logique → libellé/vidéo, pour construire les lignes. */
  const rowMeta = new Map<string, { pointLabel: string; videoName: string | null }>()
  /** Clé de point → type → cellules. */
  const cells = new Map<string, Map<string, TypePointCell>>()

  for (const input of inputs) {
    const type = normalizedType(input.type)
    const windowsByKey = new Map<string, SnapshotPoint[]>()
    for (const point of input.config.points) {
      const key = pointKeyOf(point)
      const list = windowsByKey.get(key)
      if (list) list.push(point)
      else windowsByKey.set(key, [point])
      if (!rowMeta.has(key)) {
        rowMeta.set(key, { pointLabel: point.label, videoName: point.videoName ?? null })
      }
    }

    if (windowsByKey.size === 0) emptyTypes.push(type)

    for (const [key, windows] of windowsByKey) {
      const cell = aggregatePoint(windows, input.rows, input.observerCount)
      const perType = cells.get(key)
      if (perType) perType.set(type, cell)
      else cells.set(key, new Map([[type, cell]]))
    }

    const rates = [...windowsByKey.keys()].map(
      (key) => cells.get(key)?.get(type)?.detectionRate ?? 0,
    )
    columns.push({
      type,
      label: typeColumnLabel(type),
      configuredPoints: input.metrics.configuredPoints,
      logicalPointCount: windowsByKey.size,
      observerCount: input.observerCount,
      detections: input.metrics.detections,
      ghostEvents: input.metrics.ghostEvents,
      concordanceRate: input.metrics.concordanceRate,
      precision: input.metrics.precision,
      detectionProbability: input.metrics.detectionProbability,
      averageDetectionDelay: input.metrics.averageDetectionDelay,
      averageDetectionRate:
        rates.length > 0 ? Math.round(rates.reduce((acc, rate) => acc + rate, 0) / rates.length) : 0,
    })
  }

  // ——— Lignes ———
  const rows: TypePointRow[] = [...rowMeta.entries()]
    .map(([pointKey, meta]) => {
      const perType = cells.get(pointKey) ?? new Map<string, TypePointCell>()
      const byType: Record<string, TypePointCell | null> = {}
      for (const column of columns) byType[column.type] = perType.get(column.type) ?? null

      const present = columns
        .map((column) => ({ type: column.type, cell: perType.get(column.type) }))
        .filter((entry): entry is { type: string; cell: TypePointCell } => entry.cell !== undefined)
      const rates = present.map((entry) => entry.cell.detectionRate)
      const best = present
        .slice()
        .sort(
          (a, b) =>
            b.cell.detectionRate - a.cell.detectionRate || a.type.localeCompare(b.type),
        )[0]

      return {
        pointKey,
        pointLabel: meta.pointLabel,
        videoName: meta.videoName,
        byType,
        spread: rates.length > 1 ? Math.max(...rates) - Math.min(...rates) : null,
        bestType: best ? best.type : null,
      }
    })
    .sort(
      (a, b) =>
        a.pointLabel.localeCompare(b.pointLabel) ||
        (a.videoName ?? '').localeCompare(b.videoName ?? '') ||
        a.pointKey.localeCompare(b.pointKey),
    )

  // ——— Type le mieux / le moins bien détecté (moyenne des taux, départage A→Z) ———
  const ranked = columns
    .slice()
    .sort(
      (a, b) =>
        b.averageDetectionRate - a.averageDetectionRate || a.type.localeCompare(b.type),
    )

  return {
    columns,
    rows,
    bestType: ranked.length > 0 ? ranked[0].type : null,
    weakestType: ranked.length > 0 ? ranked[ranked.length - 1].type : null,
    emptyTypes,
  }
}

/**
 * Indice de cohérence inter-types : 1 − écart moyen des taux de détection par point.
 * Vaut 1 quand tous les types détectent chaque point au même taux, tend vers 0 quand
 * ils divergent complètement. `null` si aucun point n'est porté par ≥ 2 types —
 * la question « les observations sont-elles cohérentes entre types ? » n'a alors
 * pas de sens, et il serait faux d'afficher 1.
 */
export function crossTypeAgreement(model: TypeComparisonModel): number | null {
  const spreads = model.rows
    .map((row) => row.spread)
    .filter((spread): spread is number => spread !== null)
  if (spreads.length === 0) return null
  const averageSpread = spreads.reduce((acc, spread) => acc + spread, 0) / spreads.length
  return Math.round((1 - averageSpread / 100) * 100) / 100
}

/**
 * Points les plus observés, tous types confondus : moyenne des taux de détection
 * sur les types qui portent le point. Sert à répondre à « quel point est le plus
 * souvent observé ? », sans introduire de pondération nouvelle.
 */
export function mostObservedPoints(
  model: TypeComparisonModel,
  limit = 5,
): Array<{ pointLabel: string; videoName: string | null; averageRate: number }> {
  return model.rows
    .map((row) => {
      const rates = Object.values(row.byType)
        .filter((cell): cell is TypePointCell => cell !== null)
        .map((cell) => cell.detectionRate)
      return {
        pointLabel: row.pointLabel,
        videoName: row.videoName,
        averageRate:
          rates.length > 0 ? Math.round(rates.reduce((acc, rate) => acc + rate, 0) / rates.length) : 0,
      }
    })
    .sort(
      (a, b) =>
        b.averageRate - a.averageRate ||
        a.pointLabel.localeCompare(b.pointLabel) ||
        (a.videoName ?? '').localeCompare(b.videoName ?? ''),
    )
    .slice(0, Math.max(0, limit))
}

/** Clé de passe vidéo d'un point (exposée pour l'affichage groupé par passe). */
export function pointVideoScope(point: SnapshotPoint): string {
  return videoScopeKey(point.videoId ?? null)
}
