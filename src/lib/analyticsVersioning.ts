/**
 * VERSIONNAGE DES ANALYSES — noyau PUR (aucune I/O, aucun Prisma, testable).
 *
 * ─── RÈGLE FONDAMENTALE (jamais violée) ─────────────────────────────────────
 * AJOUTER UNE FENÊTRE NE SUPPRIME PAS LE PASSÉ.
 *
 *  — Les observations valides déjà réalisées restent valides.
 *  — Les détections existantes restent comptabilisées (le NUMÉRATEUR ne baisse pas).
 *  — Le DÉNOMINATEUR (observations possibles) suit la configuration COURANTE :
 *        observations possibles = points/fenêtres configurés × observateurs
 *    Ajouter une fenêtre augmente donc le dénominateur, sans jamais remettre le
 *    numérateur à zéro. Le numérateur n'augmente que lorsqu'une nouvelle détection
 *    valide existe RÉELLEMENT.
 *  — L'analyse actuelle = ANCIENNES DONNÉES VALIDES + NOUVELLES DONNÉES VALIDES.
 *
 * ─── CE QU'EST UNE VERSION ──────────────────────────────────────────────────
 * Une version analytique est un INSTANTANÉ FIGÉ : une configuration (fenêtres,
 * types, passes vidéo) + les métriques calculées sur les observations valides
 * disponibles à un instant `dataCutoffAt`. Elle est IMMUABLE : ce module ne
 * fournit aucune fonction capable de recalculer une version déjà écrite.
 *
 * Une modification de configuration produit DEUX instantanés (voir
 * `analyticsVersionStore.ts`) :
 *   — `previous` : l'état analytique JUSTE AVANT la modification (l'historique est
 *     conservé exactement : « 10 fenêtres / 8 détections / 10 possibles ») ;
 *   — `current`  : l'état analytique JUSTE APRÈS (« 11 fenêtres / 8 détections /
 *     11 possibles ») — les 8 détections passées sont conservées.
 *
 * Une NOUVELLE CAPTURE ne crée AUCUNE version : elle met à jour les données et
 * l'analyse actuelle (calculée en direct), qui devient « 11 fenêtres / 9
 * détections / 11 possibles » dès qu'une détection valide existe réellement.
 *
 * ─── UNE SEULE SOURCE ANALYTIQUE ────────────────────────────────────────────
 * Les métriques sont calculées par les primitives de `globalExportModel` — les
 * mêmes que le tableau de bord, l'Excel global, l'Excel observateur et le PDF.
 * Aucun export ne recalcule quoi que ce soit de son côté.
 */

import {
  buildDetectionProbabilityTable,
  cleanConfiguredTypes,
  computeDefinedPointsByType,
  countAnalyticDetections,
  countGhostEvents,
  countWindowsHit,
  detectionProbability,
  interpretationBand,
  observerDisplayLabel,
  type DetectionProbabilityRow,
  type GlobalExportPoint,
  type GlobalExportProject,
  type GlobalExportRow,
  type GlobalExportSource,
} from '@/lib/globalExportModel'
import {
  attributeOccurrences,
  buildAttributionPlan,
  type AttributionOutcome,
  type AttributionPlan,
} from '@/lib/windowAttribution'

/** Déclencheurs de version (modifications de configuration du périmètre analytique). */
export const ANALYTICS_TRIGGERS = {
  windowAdded: 'WINDOW_ADDED',
  windowRemoved: 'WINDOW_REMOVED',
  pointAdded: 'POINT_ADDED',
  pointRemoved: 'POINT_REMOVED',
  typesUpdated: 'TYPES_UPDATED',
  videoAdded: 'VIDEO_ADDED',
  videoUpdated: 'VIDEO_UPDATED',
  videoRemoved: 'VIDEO_REMOVED',
  videoDuplicated: 'VIDEO_DUPLICATED',
  /** Déclassement d'un observateur dans les analyses du projet (§12). */
  observerExcluded: 'OBSERVER_EXCLUDED',
  /** Rétablissement d'un observateur précédemment déclassé. */
  observerIncluded: 'OBSERVER_INCLUDED',
} as const

export type AnalyticsTrigger = (typeof ANALYTICS_TRIGGERS)[keyof typeof ANALYTICS_TRIGGERS]

/** Étape d'un instantané : avant ou après la modification de configuration. */
export type AnalyticsVersionStage = 'previous' | 'current'

/** Fenêtre/point configuré tel que figé dans un instantané. */
export type SnapshotPoint = {
  id: string
  label: string
  trameDebut: number
  trameFin: number
  videoId: string | null
  videoName: string | null
  /** Type/décalage porté par la passe vidéo de la fenêtre ('' = passe générique). */
  type: string
}

/** Passe vidéo figée dans un instantané (jamais le benchmark : hors périmètre analytique). */
export type SnapshotVideo = {
  id: string
  name: string | null
  typeLabel: string | null
  orderIndex: number
}

/**
 * Configuration du périmètre analytique à un instant donné. C'est exactement ce
 * qui, lorsqu'il change, justifie une nouvelle version.
 */
export type AnalyticsPerimeterConfig = {
  projectId: string
  projectTitle: string
  observationTypes: string[]
  points: SnapshotPoint[]
  videos: SnapshotVideo[]
  /**
   * Observateurs DÉCLASSÉS (EXCLUDED) de l'analyse, triés.
   *
   * Optionnel et absent des instantanés antérieurs au déclassement — d'où le
   * `?? []` partout. Sa présence dans l'empreinte du périmètre garantit qu'une
   * exclusion produit bien une version, et son figement dans `configuration`
   * garantit qu'une version historique conserve les exclusions de son époque :
   * une exclusion prononcée AUJOURD'HUI ne réécrit JAMAIS une version passée.
   */
  excludedObserverIds?: string[]
}

/** Ligne d'observation valide (certifiée) alimentant un instantané. */
export type AnalyticsObservationRow = GlobalExportRow

/** Métriques par fenêtre figées dans un instantané. */
export type SnapshotPointMetric = {
  pointId: string
  pointName: string
  trameDebut: number
  trameFin: number
  type: string
  videoName: string | null
  /** Observateurs distincts ayant ≥ 1 détection analytique sur la fenêtre. */
  observersDetected: number
  /** Détections analytiques sur la fenêtre. */
  detections: number
  /** Taux de concordance 0–100 = observateurs détecteurs / observateurs du jeu. */
  concordanceRate: number
  /** Délai moyen (s) par événement validé de la fenêtre ; null si aucun. */
  avgDelaySeconds: number | null
}

/** Métriques par observateur figées dans un instantané. */
export type SnapshotObserverMetric = {
  observerId: string
  displayName: string
  email: string | null
  anonymousId: string
  /** Détections analytiques (observateur, type, fenêtre). */
  detections: number
  /** Fausses alertes (événements hors trame). */
  ghostEvents: number
  /** Déclarations = détections + fausses alertes. */
  totalClaims: number
  /** Précision 0..1 ; null si aucune déclaration. */
  precision: number | null
  /** Observations possibles pour CET observateur = fenêtres configurées. */
  possibleObservations: number
  firstSubmittedAt: string | null
  lastSubmittedAt: string | null
}

/**
 * Métriques analytiques figées d'une version. Tous les compteurs suivent la règle
 * produit « une détection = (observateur, type, fenêtre) ».
 */
export type AnalyticsVersionMetrics = {
  /** Observateurs distincts présents dans les données de l'instantané. */
  observerCount: number
  /** Fenêtres/points configurés du périmètre (dénominateur de base). */
  configuredPoints: number
  /** Observations possibles = configuredPoints × observerCount. */
  possibleObservations: number
  /** Détections analytiques (NUMÉRATEUR) — conservées d'une version à l'autre. */
  detections: number
  /** Fausses alertes (chaque capture hors trame = 1 événement). */
  ghostEvents: number
  /** Déclarations = détections + fausses alertes. */
  totalClaims: number
  /** Fenêtres distinctes touchées par ≥ 1 observateur (union). */
  windowsHit: number
  /** Précision 0..1 = détections / déclarations ; null si aucune déclaration. */
  precision: number | null
  /** Probabilité empirique = détections / (points configurés × observateurs). */
  detectionProbability: number | null
  /** Bande d'interprétation FR de la probabilité. */
  interpretation: string
  /** Moyenne des taux de concordance des fenêtres (0–100, entier). */
  concordanceRate: number
  /** Délai moyen de réaction par événement validé (s) ; null si aucun. */
  averageDetectionDelay: number | null
  /** Captures brutes certifiées incluses dans l'instantané (relevé, non dédupliqué). */
  rawCaptureCount: number
  firstSubmittedAt: string | null
  lastSubmittedAt: string | null
  /** Tableau « probabilités de détection » par type/décalage. */
  perType: DetectionProbabilityRow[]
  perPoint: SnapshotPointMetric[]
  perObserver: SnapshotObserverMetric[]
}

/** Instantané analytique complet, tel que persisté (immuable). */
export type AnalyticsVersionSnapshot = {
  configuration: AnalyticsPerimeterConfig
  metrics: AnalyticsVersionMetrics
  perimeterHash: string
  /** Borne haute (ISO) des observations incluses. */
  dataCutoffAt: string
}

/** Version analytique persistée, telle que relue (lecture seule). */
export type AnalyticsVersionRecord = AnalyticsVersionSnapshot & {
  id: string
  versionNumber: number
  effectiveAt: string
  trigger: string
  stage: AnalyticsVersionStage
}

// ——— Empreinte du périmètre analytique ———

/**
 * Empreinte STABLE du périmètre analytique : deux configurations produisant le même
 * nombre de possibilités d'observation et les mêmes regroupements ont la même
 * empreinte. Sert à ne créer une version QUE si la modification change réellement
 * le périmètre (une simple consultation, un filtre ou une capture n'y touchent pas).
 */
export function perimeterFingerprint(config: AnalyticsPerimeterConfig): string {
  const types = cleanConfiguredTypes(config.observationTypes)
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .join('')
  const points = config.points
    .map(
      (point) =>
        `${point.id}:${point.trameDebut}-${point.trameFin}:${point.videoId ?? ''}:${point.type}`,
    )
    .sort((a, b) => a.localeCompare(b))
    .join('')
  const videos = config.videos
    .map((video) => `${video.id}:${(video.typeLabel ?? '').trim()}`)
    .sort((a, b) => a.localeCompare(b))
    .join('')
  // Les déclassements n'entrent dans l'empreinte que s'il y en a : un projet qui
  // n'exclut personne conserve EXACTEMENT l'empreinte historique, donc aucune
  // version parasite n'apparaît dans les projets déjà en service.
  const excluded = (config.excludedObserverIds ?? [])
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .join(',')
  const suffix = excluded ? `|o${excluded}` : ''
  return `p${config.points.length}|t${types}|w${points}|v${videos}${suffix}`
}

/** Vrai si la modification a réellement changé le périmètre analytique. */
export function isPerimeterChange(
  before: AnalyticsPerimeterConfig,
  after: AnalyticsPerimeterConfig,
): boolean {
  return perimeterFingerprint(before) !== perimeterFingerprint(after)
}

// ——— Construction d'un instantané ———

/** Convertit une fenêtre d'instantané vers le point du modèle d'export partagé. */
function toExportPoint(point: SnapshotPoint): GlobalExportPoint {
  return {
    id: point.id,
    label: point.label,
    trameDebut: point.trameDebut,
    trameFin: point.trameFin,
    videoName: point.videoName,
    type: point.type,
  }
}

/**
 * Projet d'export dérivé d'une configuration figée : c'est ce qui rend le
 * dashboard, l'Excel et le PDF strictement identiques pour une même version.
 */
export function toExportProject(config: AnalyticsPerimeterConfig): GlobalExportProject {
  const points = config.points.map(toExportPoint)
  return {
    id: config.projectId,
    title: config.projectTitle,
    description: null,
    videoUrl: null,
    observationTypes: config.observationTypes,
    createdAt: '',
    definedPoints: points.length,
    points,
    definedPointsByType: computeDefinedPointsByType(points),
  }
}

/** Source d'export (configuration + lignes) — l'unique entrée des calculs. */
export function toExportSource(
  config: AnalyticsPerimeterConfig,
  rows: readonly AnalyticsObservationRow[],
): GlobalExportSource {
  return { project: toExportProject(config), rows: rows.slice() }
}

/**
 * RECALCUL ANALYTIQUE DYNAMIQUE — réévalue chaque capture RAW contre les fenêtres
 * COURANTES, indépendamment du `pointId`/`isGhostPoint` persisté.
 *
 * RÈGLE MÉTIER : une capture ancienne reste valide et doit être réévaluée si une
 * fenêtre (ajoutée/modifiée plus tard) permet désormais de l'associer à une cible
 * analytique. Le calcul COURANT ne lit donc pas la classification persistée : il la
 * REDÉRIVE à partir de l'horodatage + de la passe vidéo de chaque capture.
 *
 *  — une capture dont l'horodatage tombe dans une ou plusieurs fenêtres de SA passe
 *    vidéo ⇒ VALIDE, rattachée à UNE SEULE de ces fenêtres ;
 *  — sinon ⇒ POINT FANTÔME (fausse alerte, pointId = null, isGhostPoint = true).
 *
 * L'attribution n'est plus « la première fenêtre couvrante » : elle suit le moteur
 * déterministe de `windowAttribution` (hiérarchie parent/enfant, chevauchements,
 * état « fenêtre satisfaite » par observateur et par type). Voir ce module pour la
 * règle complète. Aucune capture n'est jamais comptée deux fois.
 *
 * Une version HISTORIQUE, elle, reste immuable : elle ne passe jamais par ici.
 */
export function rematchRowsToWindows(
  rows: readonly AnalyticsObservationRow[],
  config: AnalyticsPerimeterConfig,
): AnalyticsObservationRow[] {
  return attributeRowsToWindows(rows, config).rows
}

/**
 * Variante instrumentée : renvoie les lignes réattribuées ET le détail de
 * l'attribution de chaque capture (fenêtres candidates, remontée éventuelle).
 * Sert à l'inspection (audit du moteur) et aux tests — jamais à un calcul
 * parallèle : les lignes renvoyées sont exactement celles de
 * `rematchRowsToWindows`.
 */
export function attributeRowsToWindows(
  rows: readonly AnalyticsObservationRow[],
  config: AnalyticsPerimeterConfig,
): { rows: AnalyticsObservationRow[]; outcomes: AttributionOutcome[]; plan: AttributionPlan } {
  // Le plan (hiérarchie + index par passe vidéo) est construit UNE fois pour tout
  // le relevé : aucune requête, aucun balayage capture × fenêtre répété.
  const plan = buildAttributionPlan(config.points)
  const outcomes = attributeOccurrences(rows, plan)
  const labelById = new Map(config.points.map((point) => [point.id, point.label]))
  const rematched = rows.map((row, index) => {
    const windowId = outcomes[index].windowId
    if (windowId !== null) {
      return {
        ...row,
        pointId: windowId,
        pointLabel: labelById.get(windowId) ?? null,
        isGhostPoint: false,
      }
    }
    return { ...row, pointId: null, pointLabel: null, isGhostPoint: true }
  })
  return { rows: rematched, outcomes, plan }
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Calcule les métriques analytiques d'un périmètre + un jeu d'observations valides.
 *
 * Le dénominateur (`possibleObservations`) provient de la CONFIGURATION transmise ;
 * le numérateur (`detections`) provient des DONNÉES transmises. Ajouter une fenêtre
 * augmente donc le premier sans jamais toucher au second.
 */
export function computeAnalyticsMetrics(
  config: AnalyticsPerimeterConfig,
  rows: readonly AnalyticsObservationRow[],
): AnalyticsVersionMetrics {
  const source = toExportSource(config, rows)
  const observerIds = new Set<string>()
  for (const row of rows) observerIds.add(row.userId)
  const observerCount = observerIds.size
  const configuredPoints = config.points.length

  const detections = countAnalyticDetections(rows)
  const ghostEvents = countGhostEvents(rows)
  const totalClaims = detections + ghostEvents
  const probability = detectionProbability(detections, configuredPoints, observerCount)

  // ——— Par fenêtre ———
  const delays: number[] = []
  const perPoint: SnapshotPointMetric[] = config.points.map((point) => {
    const matched = rows.filter((row) => row.pointId === point.id && !row.isGhostPoint)
    const detectors = new Set(matched.map((row) => row.userId))
    const pointDelays = matched.map((row) => row.timestampTotal - point.trameDebut)
    for (const delay of pointDelays) delays.push(delay)
    const clamped = pointDelays.map((delay) => Math.max(0, delay))
    return {
      pointId: point.id,
      pointName: point.label,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      type: point.type,
      videoName: point.videoName,
      observersDetected: detectors.size,
      detections: countAnalyticDetections(matched),
      concordanceRate:
        observerCount > 0 ? Math.round((detectors.size / observerCount) * 100) : 0,
      avgDelaySeconds:
        clamped.length > 0
          ? roundTenth(clamped.reduce((acc, delay) => acc + delay, 0) / clamped.length)
          : null,
    }
  })

  const concordanceRate =
    perPoint.length > 0
      ? Math.round(perPoint.reduce((acc, point) => acc + point.concordanceRate, 0) / perPoint.length)
      : 0
  const averageDetectionDelay =
    delays.length > 0 ? roundTenth(delays.reduce((acc, d) => acc + d, 0) / delays.length) : null

  // ——— Par observateur ———
  const byObserver = new Map<string, AnalyticsObservationRow[]>()
  for (const row of rows) {
    const list = byObserver.get(row.userId)
    if (list) list.push(row)
    else byObserver.set(row.userId, [row])
  }
  const perObserver: SnapshotObserverMetric[] = Array.from(byObserver.entries())
    .map(([observerId, observerRows]) => {
      const sample = observerRows[0]
      const observerDetections = countAnalyticDetections(observerRows)
      const observerGhosts = countGhostEvents(observerRows)
      const claims = observerDetections + observerGhosts
      const dates = observerRows.map((row) => row.createdAt).sort((a, b) => a.localeCompare(b))
      return {
        observerId,
        displayName: observerDisplayLabel(sample),
        email: sample.email,
        anonymousId: sample.anonymousId,
        detections: observerDetections,
        ghostEvents: observerGhosts,
        totalClaims: claims,
        precision: claims > 0 ? observerDetections / claims : null,
        possibleObservations: configuredPoints,
        firstSubmittedAt: dates[0] ?? null,
        lastSubmittedAt: dates[dates.length - 1] ?? null,
      }
    })
    .sort((a, b) => b.totalClaims - a.totalClaims || a.displayName.localeCompare(b.displayName))

  let firstSubmittedAt: string | null = null
  let lastSubmittedAt: string | null = null
  for (const row of rows) {
    if (firstSubmittedAt === null || row.createdAt < firstSubmittedAt) firstSubmittedAt = row.createdAt
    if (lastSubmittedAt === null || row.createdAt > lastSubmittedAt) lastSubmittedAt = row.createdAt
  }

  return {
    observerCount,
    configuredPoints,
    possibleObservations: configuredPoints * observerCount,
    detections,
    ghostEvents,
    totalClaims,
    windowsHit: countWindowsHit(rows),
    precision: totalClaims > 0 ? detections / totalClaims : null,
    detectionProbability: probability,
    interpretation: interpretationBand(probability),
    concordanceRate,
    averageDetectionDelay,
    rawCaptureCount: rows.length,
    firstSubmittedAt,
    lastSubmittedAt,
    perType: buildDetectionProbabilityTable(source),
    perPoint,
    perObserver,
  }
}

/** Construit l'instantané complet (configuration + métriques + empreinte + borne). */
export function buildAnalyticsSnapshot(input: {
  config: AnalyticsPerimeterConfig
  rows: readonly AnalyticsObservationRow[]
  dataCutoffAt: string
}): AnalyticsVersionSnapshot {
  return {
    configuration: input.config,
    metrics: computeAnalyticsMetrics(input.config, input.rows),
    perimeterHash: perimeterFingerprint(input.config),
    dataCutoffAt: input.dataCutoffAt,
  }
}

// ——— Sélection d'une version (filtre par date / numéro) ———

type VersionLike = {
  versionNumber: number
  effectiveAt: string
}

/** Prochain numéro de version d'un projet (1 si aucun instantané). */
export function nextVersionNumber(versions: readonly VersionLike[]): number {
  let max = 0
  for (const version of versions) {
    if (version.versionNumber > max) max = version.versionNumber
  }
  return max + 1
}

/**
 * Fin de journée (UTC) d'une date `YYYY-MM-DD` — borne INCLUSIVE du filtre
 * « Afficher l'analyse avant le : ». Retourne null si la date est invalide.
 */
export function endOfDayIso(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? '').trim())
  if (!match) return null
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T23:59:59.999Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

/**
 * FILTRE DE VERSIONS (et non de captures) : renvoie la DERNIÈRE version analytique
 * disponible à la date demandée — c'est-à-dire celle dont `effectiveAt` est la plus
 * récente sans dépasser la fin du jour sélectionné. Renvoie null si aucune version
 * n'existait encore à cette date (l'appelant affiche alors l'analyse actuelle).
 */
export function selectVersionAsOfDate<T extends VersionLike>(
  versions: readonly T[],
  date: string,
): T | null {
  const cutoff = endOfDayIso(date)
  if (cutoff === null) return null
  let best: T | null = null
  for (const version of versions) {
    if (version.effectiveAt > cutoff) continue
    if (best === null || version.effectiveAt > best.effectiveAt) best = version
    else if (version.effectiveAt === best.effectiveAt && version.versionNumber > best.versionNumber) {
      best = version
    }
  }
  return best
}

/** Vrai si deux instantanés décrivent exactement le même état analytique. */
export function sameAnalyticState(
  a: AnalyticsVersionSnapshot,
  b: AnalyticsVersionSnapshot,
): boolean {
  if (a.perimeterHash !== b.perimeterHash) return false
  return (
    a.metrics.detections === b.metrics.detections &&
    a.metrics.ghostEvents === b.metrics.ghostEvents &&
    a.metrics.observerCount === b.metrics.observerCount &&
    a.metrics.configuredPoints === b.metrics.configuredPoints &&
    a.metrics.rawCaptureCount === b.metrics.rawCaptureCount
  )
}

/** Libellé court d'une version pour l'interface et les noms de fichiers. */
export function versionLabel(version: { versionNumber: number }): string {
  return `V${version.versionNumber}`
}
