'use server'

import { prisma } from '@/lib/prisma'
import type {
  GhostBucketDto,
  ObservationCaptureDto,
  ObserverMetricDto,
  PointConcordanceDto,
  ProjectAnalyticsDto,
} from '@/lib/types'

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Calcule et extrait l'ensemble des métriques scientifiques et de concordance pour un projet.
 */
export async function getProjectAnalytics(
  projectId: string,
): Promise<ProjectAnalyticsDto | null> {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    return null
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId.trim() },
    include: {
      points: {
        orderBy: { trameDebut: 'asc' },
      },
    },
  })

  if (!project) return null

  // Récupération de l'ensemble des observations liées au projet avec les données utilisateur
  const observations = await prisma.observation.findMany({
    where: { projectId: project.id },
    include: {
      user: {
        select: {
          id: true,
          anonymousId: true,
          email: true,
        },
      },
    },
    orderBy: { timestampTotal: 'asc' },
  })

  // Ensemble des observateurs distincts ayant soumis des données
  const observerMap = new Map<string, { id: string; anonymousId: string; email: string }>()
  for (const obs of observations) {
    if (obs.user && !observerMap.has(obs.user.id)) {
      observerMap.set(obs.user.id, obs.user)
    }
  }
  const totalObservers = observerMap.size

  const totalObservations = observations.length
  const validObservations = observations.filter((o) => !o.isGhostPoint)
  const ghostObservations = observations.filter((o) => o.isGhostPoint)

  const validObservationsCount = validObservations.length
  const ghostPointsCount = ghostObservations.length

  // ——— 1. Analyse par Point Cible (Concordance & Délais) ———
  const pointsAnalytics: PointConcordanceDto[] = project.points.map((point) => {
    const matching = observations.filter((o) => o.pointId === point.id)
    const distinctObserversOnPoint = new Set(matching.map((o) => o.userId)).size
    const concordanceRate =
      totalObservers > 0 ? Math.round((distinctObserversOnPoint / totalObservers) * 100) : 0

    const delays = matching.map((o) => Math.max(0, o.timestampTotal - point.trameDebut))
    const avgDelaySeconds =
      delays.length > 0
        ? Math.round((delays.reduce((acc, d) => acc + d, 0) / delays.length) * 10) / 10
        : null

    const timestamps = matching.map((o) => o.timestampTotal)
    const minTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null
    const maxTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null

    const captures: ObservationCaptureDto[] = matching.map((o) => ({
      id: o.id,
      timestampTotal: o.timestampTotal,
      delaySeconds: o.timestampTotal - point.trameDebut,
      imageUrl: o.imageUrl,
      observerAnonymousId: o.user.anonymousId,
      observerEmail: o.user.email,
      createdAt: o.createdAt.toISOString(),
      isGhostPoint: false,
    }))

    return {
      pointId: point.id,
      pointName: point.pointName,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      targetDuration: point.trameFin - point.trameDebut,
      observerCount: distinctObserversOnPoint,
      concordanceRate,
      avgDelaySeconds,
      minTimestamp,
      maxTimestamp,
      captures,
    }
  })

  // Calcul du taux moyen de concordance globale
  const overallConcordanceRate =
    pointsAnalytics.length > 0
      ? Math.round(
          pointsAnalytics.reduce((acc, p) => acc + p.concordanceRate, 0) /
            pointsAnalytics.length,
        )
      : 0

  const overallPrecisionRate =
    totalObservations > 0
      ? Math.round((validObservationsCount / totalObservations) * 100)
      : 0

  const allDelays = pointsAnalytics.flatMap((p) =>
    p.captures.map((c) => c.delaySeconds).filter((d): d is number => d !== null),
  )
  const averageDetectionDelay =
    allDelays.length > 0
      ? Math.round((allDelays.reduce((acc, d) => acc + d, 0) / allDelays.length) * 10) / 10
      : null

  // ——— 2. Analyse des Fausses Alertes (Points Fantômes) ———
  const maxObsTime =
    observations.length > 0 ? Math.max(...observations.map((o) => o.timestampTotal)) : 60
  const maxTimelineSeconds = Math.max(60, Math.ceil((maxObsTime + 10) / 10) * 10)

  const bucketSize = 10
  const bucketCount = Math.max(1, Math.ceil(maxTimelineSeconds / bucketSize))
  const ghostBuckets: GhostBucketDto[] = Array.from({ length: bucketCount }, (_, i) => {
    const start = i * bucketSize
    const end = start + bucketSize
    return {
      intervalLabel: `${formatSeconds(start)} - ${formatSeconds(end)}`,
      startSecond: start,
      endSecond: end,
      count: 0,
    }
  })

  for (const ghost of ghostObservations) {
    const bucketIndex = Math.min(
      Math.floor(ghost.timestampTotal / bucketSize),
      ghostBuckets.length - 1,
    )
    if (bucketIndex >= 0 && ghostBuckets[bucketIndex]) {
      ghostBuckets[bucketIndex].count++
    }
  }

  const ghostCaptures: ObservationCaptureDto[] = ghostObservations.map((o) => ({
    id: o.id,
    timestampTotal: o.timestampTotal,
    delaySeconds: null,
    imageUrl: o.imageUrl,
    observerAnonymousId: o.user.anonymousId,
    observerEmail: o.user.email,
    createdAt: o.createdAt.toISOString(),
    isGhostPoint: true,
  }))

  const ghostPointsAnalytics = {
    totalGhostPoints: ghostPointsCount,
    ghostRate:
      totalObservations > 0 ? Math.round((ghostPointsCount / totalObservations) * 100) : 0,
    timelineDistribution: ghostBuckets.filter(
      (b) => b.count > 0 || b.startSecond < maxTimelineSeconds,
    ),
    captures: ghostCaptures,
  }

  // ——— 3. Matrice de Performance des Observateurs ———
  const observersMetrics: ObserverMetricDto[] = Array.from(observerMap.values()).map(
    (observer) => {
      const userObs = observations.filter((o) => o.userId === observer.id)
      const validObs = userObs.filter((o) => !o.isGhostPoint)
      const ghostObs = userObs.filter((o) => o.isGhostPoint)
      const uniquePointsDetected = new Set(
        validObs.map((o) => o.pointId).filter((id): id is string => Boolean(id)),
      ).size

      const timestamps = userObs.map((o) => new Date(o.createdAt).getTime())
      const firstSessionAt =
        timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : ''
      const lastSessionAt =
        timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : ''

      return {
        userId: observer.id,
        anonymousId: observer.anonymousId,
        email: observer.email,
        totalObservations: userObs.length,
        validObservationsCount: validObs.length,
        ghostPointsCount: ghostObs.length,
        pointsDetectedCount: uniquePointsDetected,
        precisionRate:
          userObs.length > 0 ? Math.round((validObs.length / userObs.length) * 100) : 0,
        firstSessionAt,
        lastSessionAt,
      }
    },
  )

  observersMetrics.sort((a, b) => b.totalObservations - a.totalObservations)

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      createdAt: project.createdAt.toISOString(),
      totalDefinedPoints: project.points.length,
    },
    summary: {
      totalObservers,
      totalObservations,
      validObservationsCount,
      ghostPointsCount,
      overallConcordanceRate,
      overallPrecisionRate,
      averageDetectionDelay,
    },
    pointsAnalytics,
    ghostPointsAnalytics,
    observersMetrics,
  }
}
