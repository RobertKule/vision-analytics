'use server'

import { getCurrentSession } from '@/lib/auth'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { captureImageEndpoint } from '@/lib/captureImageAccess'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import { buildTypeComparison, typeColumnLabel, type TypeComparisonModel } from '@/lib/typeComparison'
import {
  auditVersionViewed,
  resolveAnalyticsView,
  type AnalyticsVersionSelector,
  type AnalyticsVersionSummary,
} from '@/lib/analyticsVersionStore'
import type { AnalyticsRowFilter } from '@/lib/analyticsSource'
import type { AnalyticsObservationRow } from '@/lib/analyticsVersioning'
import type {
  AnalyticsFilter,
  AnalyticsVideoContextDto,
  GhostBucketDto,
  ObservationCaptureDto,
  ObserverMetricDto,
  PointConcordanceDto,
  ProjectAnalyticsDto,
} from '@/lib/types'

/**
 * ANALYSES D'UN PROJET — LECTURE SEULE.
 *
 * Cette Server Action ne crée JAMAIS de version analytique : consulter le tableau
 * de bord, appliquer un filtre, consulter un type ou l'historique sont des lectures
 * pures. Seule une modification de configuration versionne (cf. `analyticsVersionStore`).
 *
 * Toutes les métriques proviennent de la SOURCE ANALYTIQUE UNIQUE
 * (`resolveAnalyticsView`) — la même que l'Excel global, l'Excel observateur et le
 * PDF. Pour une même version : dashboard = Excel = PDF.
 *
 * Deux modes :
 *  — « Analyse actuelle » : configuration courante + TOUTES les observations valides
 *    (anciennes + nouvelles). Ajouter une fenêtre augmente le dénominateur sans
 *    jamais effacer les détections déjà réalisées.
 *  — Version historique (identifiant exact, ou « afficher l'analyse avant le : ») :
 *    l'instantané IMMUABLE est renvoyé tel quel, jamais recalculé avec la
 *    configuration actuelle.
 */

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Garde-fou : au-delà, la matrice cesse d'être lisible et le coût de calcul inutile. */
const MAX_COMPARED_TYPES = 8

/** Normalise le filtre envoyé par le client : vide / espaces ⇒ « tous ». */
function normalizeFilter(filter: unknown): AnalyticsFilter {
  const value = (key: keyof AnalyticsFilter): string | undefined => {
    if (!filter || typeof filter !== 'object') return undefined
    const raw = (filter as Record<string, unknown>)[key]
    if (typeof raw !== 'string') return undefined
    const trimmed = raw.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  const normalized: AnalyticsFilter = {
    observationType: value('observationType'),
    observerId: value('observerId'),
  }
  // '' est un marqueur RÉSERVÉ pour la passe générique héritée (videoId null).
  const rawVideo = (filter as Record<string, unknown>)?.videoId
  if (typeof rawVideo === 'string') {
    normalized.videoId = rawVideo.trim()
  }
  return normalized
}

/** Sélecteur de version normalisé (identifiant exact ou date `YYYY-MM-DD`). */
function normalizeSelector(input: unknown): AnalyticsVersionSelector {
  if (!input || typeof input !== 'object') return {}
  const raw = input as Record<string, unknown>
  const versionId = typeof raw.versionId === 'string' ? raw.versionId.trim() : ''
  const asOfDate = typeof raw.asOfDate === 'string' ? raw.asOfDate.trim() : ''
  return { versionId: versionId || null, asOfDate: asOfDate || null }
}

/** Traduit le filtre d'interface en restriction de lecture serveur. */
function toRowFilter(applied: AnalyticsFilter): AnalyticsRowFilter {
  const rowFilter: AnalyticsRowFilter = {}
  if (applied.observationType !== undefined) rowFilter.observationType = applied.observationType
  if (applied.videoId !== undefined) rowFilter.videoId = applied.videoId
  if (applied.observerId !== undefined) rowFilter.observerId = applied.observerId
  return rowFilter
}

/** Capture exposée à l'interface — image servie par l'endpoint SÉCURISÉ. */
function toCaptureDto(
  row: AnalyticsObservationRow,
  options: { delaySeconds: number | null; isGhostPoint: boolean },
): ObservationCaptureDto {
  return {
    id: row.id ?? '',
    timestampTotal: row.timestampTotal,
    delaySeconds: options.delaySeconds,
    // Jamais un lien Google Drive direct : les fichiers restent privés.
    imageUrl: row.id ? captureImageEndpoint(row.id) : '',
    observerAnonymousId: row.anonymousId,
    observerEmail: row.email,
    createdAt: row.createdAt,
    isGhostPoint: options.isGhostPoint,
  }
}

export type ProjectAnalyticsOptions = {
  /** Version historique exacte à afficher. */
  versionId?: string | null
  /** Filtre « afficher l'analyse avant le : » (date `YYYY-MM-DD`). */
  asOfDate?: string | null
}

/**
 * Métriques scientifiques et de concordance d'un projet, pour un contexte
 * éventuellement filtré (type / vidéo / observateur) et une version analytique
 * éventuellement historique.
 *
 * Les filtres sont appliqués CÔTÉ SERVEUR : toutes les métriques sont recalculées
 * sur le sous-ensemble réellement sélectionné — jamais une simple coupe frontend.
 */
export async function getProjectAnalytics(
  projectId: string,
  filter?: AnalyticsFilter | null,
  options?: ProjectAnalyticsOptions | null,
): Promise<ProjectAnalyticsDto | null> {
  const id = typeof projectId === 'string' ? projectId.trim() : ''
  if (!id) return null

  // Garde d'accès multi-rôles unifiée (ADMIN / propriétaire / analyste invité).
  // Vérifiée AVANT toute lecture : rien ne part vers le frontend sans elle.
  const permissions = await getCurrentProjectPermissions(id)
  if (!permissions.canAnalyze) return null

  const appliedFilter = normalizeFilter(filter)
  const selector = normalizeSelector(options)

  const view = await resolveAnalyticsView(id, selector, toRowFilter(appliedFilter))
  if (!view) return null

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      createdAt: true,
      observationTypes: true,
      videos: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          typeLabel: true,
          name: true,
          source: true,
          orderIndex: true,
          benchmarkSeconds: true,
          _count: {
            select: {
              // Seules les captures CERTIFIÉES comptent : une session « en cours »
              // (transitoire) n'est jamais visible des analyses.
              observations: { where: { isVerified: true } },
              points: true,
            },
          },
        },
      },
    },
  })
  if (!project) return null

  if (view.version) {
    const session = await getCurrentSession()
    await auditVersionViewed({
      actorId: session?.uid ?? null,
      projectId: id,
      version: view.version,
      surface: 'dashboard',
    })
  }

  const { config, rows, metrics } = view

  // ——— 1. Analyse par fenêtre cible (concordance & délais) ———
  const pointsAnalytics: PointConcordanceDto[] = config.points.map((point) => {
    const metric = metrics.perPoint.find((item) => item.pointId === point.id)
    const matching = rows.filter((row) => row.pointId === point.id)
    const timestamps = matching.map((row) => row.timestampTotal)
    return {
      pointId: point.id,
      pointName: point.label,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      targetDuration: point.trameFin - point.trameDebut,
      observerCount: metric?.observersDetected ?? 0,
      concordanceRate: metric?.concordanceRate ?? 0,
      avgDelaySeconds: metric?.avgDelaySeconds ?? null,
      minTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : null,
      maxTimestamp: timestamps.length > 0 ? Math.max(...timestamps) : null,
      captures: matching.map((row) =>
        toCaptureDto(row, {
          delaySeconds: row.timestampTotal - point.trameDebut,
          isGhostPoint: false,
        }),
      ),
    }
  })

  // ——— 2. Fausses alertes (points fantômes) ———
  const ghostRows = rows.filter((row) => row.isGhostPoint)
  const maxObsTime = rows.length > 0 ? Math.max(...rows.map((row) => row.timestampTotal)) : 60
  const maxTimelineSeconds = Math.max(60, Math.ceil((maxObsTime + 10) / 10) * 10)

  const bucketSize = 10
  const bucketCount = Math.max(1, Math.ceil(maxTimelineSeconds / bucketSize))
  const ghostBuckets: GhostBucketDto[] = Array.from({ length: bucketCount }, (_, index) => {
    const start = index * bucketSize
    return {
      intervalLabel: `${formatSeconds(start)} - ${formatSeconds(start + bucketSize)}`,
      startSecond: start,
      endSecond: start + bucketSize,
      count: 0,
    }
  })
  for (const ghost of ghostRows) {
    const index = Math.min(Math.floor(ghost.timestampTotal / bucketSize), ghostBuckets.length - 1)
    if (index >= 0 && ghostBuckets[index]) ghostBuckets[index].count += 1
  }

  const ghostPointsAnalytics = {
    totalGhostPoints: metrics.ghostEvents,
    ghostRate:
      metrics.totalClaims > 0 ? Math.round((metrics.ghostEvents / metrics.totalClaims) * 100) : 0,
    timelineDistribution: ghostBuckets.filter(
      (bucket) => bucket.count > 0 || bucket.startSecond < maxTimelineSeconds,
    ),
    captures: ghostRows.map((row) => toCaptureDto(row, { delaySeconds: null, isGhostPoint: true })),
  }

  // ——— 3. Matrice de performance des observateurs ———
  const observersMetrics: ObserverMetricDto[] = metrics.perObserver.map((observer) => ({
    userId: observer.observerId,
    anonymousId: observer.anonymousId,
    email: observer.email ?? '',
    totalObservations: observer.totalClaims,
    validObservationsCount: observer.detections,
    ghostPointsCount: observer.ghostEvents,
    pointsDetectedCount: observer.detections,
    precisionRate: observer.precision !== null ? Math.round(observer.precision * 100) : 0,
    firstSessionAt: observer.firstSubmittedAt ?? '',
    lastSessionAt: observer.lastSubmittedAt ?? '',
  }))

  const videosContext: AnalyticsVideoContextDto[] = project.videos.map((video) => ({
    id: video.id,
    typeLabel: video.typeLabel,
    name: video.name,
    source: video.source,
    orderIndex: video.orderIndex,
    projectId: project.id,
    benchmarkSeconds: video.benchmarkSeconds,
    captureCount: video._count.observations,
    pointCount: video._count.points,
  }))

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      createdAt: project.createdAt.toISOString(),
      totalDefinedPoints: metrics.configuredPoints,
      observationTypes: project.observationTypes,
      videos: videosContext,
    },
    summary: {
      totalObservers: metrics.observerCount,
      totalObservations: metrics.totalClaims,
      validObservationsCount: metrics.detections,
      ghostPointsCount: metrics.ghostEvents,
      overallConcordanceRate: metrics.concordanceRate,
      overallPrecisionRate: metrics.precision !== null ? Math.round(metrics.precision * 100) : 0,
      averageDetectionDelay: metrics.averageDetectionDelay,
      detectionProbability: metrics.detectionProbability,
      possibleObservations: metrics.possibleObservations,
      appliedFilter,
    },
    version: {
      mode: view.mode,
      frozen: view.frozen,
      versionId: view.version?.id ?? null,
      versionNumber: view.version?.versionNumber ?? null,
      effectiveAt: view.version?.effectiveAt ?? null,
      trigger: view.version?.trigger ?? null,
      asOfDate: selector.asOfDate ?? null,
      history: view.versions,
    },
    pointsAnalytics,
    ghostPointsAnalytics,
    observersMetrics,
    // §13 — dénominateur humain explicite : l'interface affiche combien d'observateurs
    // sont réellement comptés, et lesquels sont écartés (jamais masqué).
    observerInclusion: view.observerInclusion,
  }
}

/** Types comparables d'un projet, avec leur nombre de points configurés. */
export type ComparableTypesDto = {
  /** Libellé affiché (passe générique → « Générique »). */
  label: string
  /** Clé normalisée à renvoyer dans `compareAnalyticsTypes`. */
  type: string
  pointCount: number
  /** Faux si le type n'a AUCUN point configuré : comparer sa colonne n'a pas de sens. */
  comparable: boolean
}

/**
 * Liste les types comparables d'un projet : les types CONFIGURÉS, plus tout type
 * réellement observé. Le décompte des points vient de la configuration courante,
 * donc des mêmes données que le tableau de bord.
 */
export async function listComparableTypes(projectId: string): Promise<ComparableTypesDto[]> {
  const id = typeof projectId === 'string' ? projectId.trim() : ''
  if (!id) return []
  const permissions = await getCurrentProjectPermissions(id)
  if (!permissions.canAnalyze) return []

  const [project, views] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      select: {
        observationTypes: true,
        points: { select: { video: { select: { typeLabel: true } } } },
      },
    }),
    // Un type « observé mais non configuré » reste comparable : ses captures existent.
    prisma.observation.groupBy({
      by: ['observationType'],
      where: { projectId: id, isVerified: true },
      _count: { _all: true },
    }),
  ])
  if (!project) return []

  const countByType = new Map<string, number>()
  const bump = (type: string) => countByType.set(type, (countByType.get(type) ?? 0) + 1)
  for (const point of project.points) bump((point.video?.typeLabel ?? '').trim())
  for (const row of views) bump((row.observationType ?? '').trim())

  const configured = project.observationTypes.map((type) => type.trim())
  const observed = views.map((row) => (row.observationType ?? '').trim())
  const all = Array.from(new Set([...configured, ...observed]))

  return all
    .map((type) => ({
      type,
      label: typeColumnLabel(type),
      pointCount: countByType.get(type) ?? 0,
      comparable: (countByType.get(type) ?? 0) > 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * COMPARAISON DE PLUSIEURS TYPES (§14) — LECTURE SEULE.
 *
 * Chaque type sélectionné est résolu par `resolveAnalyticsView`, le point d'entrée
 * UNIQUE du tableau de bord, de l'inspection et de TOUS les exports. La matrice ne
 * fait ensuite que METTRE EN REGARD ces résultats (`buildTypeComparison`) : aucun
 * second moteur statistique, aucune requête parallèle, aucun recalcul de règle.
 *
 * Conséquence directe : pour un type donné, le taux affiché ici est EXACTEMENT celui
 * du tableau de bord filtré sur ce type, et celui de l'Excel/PDF exporté.
 */
export async function compareAnalyticsTypes(
  projectId: string,
  types: string[],
  options?: ProjectAnalyticsOptions | null,
): Promise<TypeComparisonModel | null> {
  const id = typeof projectId === 'string' ? projectId.trim() : ''
  if (!id) return null
  const permissions = await getCurrentProjectPermissions(id)
  if (!permissions.canAnalyze) return null

  const wanted = Array.from(
    new Set((Array.isArray(types) ? types : []).map((type) => String(type ?? '').trim())),
  ).slice(0, MAX_COMPARED_TYPES)
  if (wanted.length === 0) return null

  const selector = normalizeSelector(options)

  // Une résolution PAR TYPE : le moteur partagé, jamais une seconde implémentation.
  const resolved = await Promise.all(
    wanted.map(async (type) => {
      const view = await resolveAnalyticsView(id, selector, { observationType: type })
      if (!view) return null
      const observerIds = new Set<string>()
      for (const row of view.rows) observerIds.add(row.userId)
      return {
        type,
        config: view.config,
        rows: view.rows,
        observerCount: observerIds.size,
        metrics: {
          detections: view.metrics.detections,
          ghostEvents: view.metrics.ghostEvents,
          totalClaims: view.metrics.totalClaims,
          configuredPoints: view.metrics.configuredPoints,
          windowsHit: view.metrics.windowsHit,
          concordanceRate: view.metrics.concordanceRate,
          precision: view.metrics.precision,
          detectionProbability: view.metrics.detectionProbability,
          averageDetectionDelay: view.metrics.averageDetectionDelay,
        },
      }
    }),
  )

  const inputs = resolved.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (inputs.length === 0) return null

  const session = await getCurrentSession()
  await recordAudit({
    userId: session?.uid ?? null,
    action: AUDIT_ACTIONS.analyticsTypeCompared,
    entityType: 'analytics',
    entityId: id,
    // Uniquement des libellés de types et des compteurs — jamais de donnée sensible.
    metadata: {
      types: inputs.map((entry) => entry.type).join(','),
      typeCount: inputs.length,
      versionId: selector.versionId ?? null,
      asOfDate: selector.asOfDate ?? null,
    },
  })

  return buildTypeComparison(inputs)
}

/** Historique des versions analytiques d'un projet (sélecteur d'interface). */
export async function listProjectAnalyticsVersions(
  projectId: string,
): Promise<AnalyticsVersionSummary[]> {
  const id = typeof projectId === 'string' ? projectId.trim() : ''
  if (!id) return []
  const permissions = await getCurrentProjectPermissions(id)
  if (!permissions.canAnalyze) return []
  const view = await resolveAnalyticsView(id, null, null)
  return view?.versions ?? []
}
