/**
 * SOURCE ANALYTIQUE UNIQUE — chargement serveur du périmètre et des observations.
 *
 * Ce module est le SEUL endroit qui lit la configuration analytique et les
 * observations certifiées d'un projet. Le tableau de bord, l'Excel global, l'Excel
 * par observateur et le PDF passent tous par ici : pour une même version, ils
 * voient donc EXACTEMENT les mêmes données (Partie B — exports synchronisés).
 *
 * Deux modes de lecture :
 *  — ANALYSE ACTUELLE : configuration courante + TOUTES les observations valides
 *    (anciennes + nouvelles). C'est le mode par défaut.
 *  — VERSION HISTORIQUE : configuration FIGÉE de l'instantané + observations
 *    valides dont la date de capture ne dépasse pas la borne `dataCutoffAt` de cet
 *    instantané. Les chiffres affichés/exportés proviennent des métriques figées.
 *
 * Aucune écriture ici : lire une analyse ne crée jamais de version.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { videoDisplayName } from '@/lib/exportHelpers'
import type { GlobalExportRow } from '@/lib/globalExportModel'
import type {
  AnalyticsObservationRow,
  AnalyticsPerimeterConfig,
  SnapshotPoint,
  SnapshotVideo,
} from '@/lib/analyticsVersioning'

/** Passe générique héritée : `videoId` nul, représentée par '' côté client. */
export const LEGACY_GENERIC_VIDEO_ID = ''

/** Restriction de lecture (filtres du tableau de bord, appliqués côté serveur). */
export type AnalyticsRowFilter = {
  observationType?: string
  /** '' = passe générique héritée (videoId nul) ; absent = toutes les passes. */
  videoId?: string
  observerId?: string
}

/** Type/décalage d'une fenêtre : `typeLabel` de sa passe vidéo, sinon clé générique. */
function pointTypeOf(video: { typeLabel: string | null } | null): string {
  return video?.typeLabel?.trim() ?? ''
}

/**
 * Lit la configuration analytique COURANTE d'un projet (fenêtres, types, passes).
 * Renvoie null si le projet n'existe pas.
 */
export async function loadPerimeterConfig(
  projectId: string,
): Promise<AnalyticsPerimeterConfig | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      observationTypes: true,
      points: {
        orderBy: { trameDebut: 'asc' },
        select: {
          id: true,
          pointName: true,
          trameDebut: true,
          trameFin: true,
          videoId: true,
          video: { select: { id: true, name: true, typeLabel: true, orderIndex: true } },
        },
      },
      videos: {
        orderBy: { orderIndex: 'asc' },
        select: { id: true, name: true, typeLabel: true, orderIndex: true },
      },
    },
  })
  if (!project) return null

  const points: SnapshotPoint[] = project.points.map((point) => ({
    id: point.id,
    label: point.pointName,
    trameDebut: point.trameDebut,
    trameFin: point.trameFin,
    videoId: point.videoId ?? null,
    videoName: point.video ? videoDisplayName(point.video) : null,
    type: pointTypeOf(point.video),
  }))
  const videos: SnapshotVideo[] = project.videos.map((video) => ({
    id: video.id,
    name: video.name,
    typeLabel: video.typeLabel,
    orderIndex: video.orderIndex,
  }))

  return {
    projectId: project.id,
    projectTitle: project.title,
    observationTypes: project.observationTypes,
    points,
    videos,
  }
}

/**
 * Restreint une configuration à un sous-ensemble filtré (type / passe vidéo).
 *
 * Le DÉNOMINATEUR suit le filtre : quand l'analyse est restreinte à un type, seules
 * les fenêtres rattachées à ce type comptent comme observations possibles.
 */
export function narrowPerimeterConfig(
  config: AnalyticsPerimeterConfig,
  filter: AnalyticsRowFilter,
): AnalyticsPerimeterConfig {
  let points = config.points
  if (filter.videoId !== undefined) {
    points = points.filter((point) =>
      filter.videoId === LEGACY_GENERIC_VIDEO_ID
        ? point.videoId === null
        : point.videoId === filter.videoId,
    )
  }
  if (filter.observationType !== undefined) {
    points = points.filter((point) => point.type === filter.observationType)
  }
  return { ...config, points }
}

/** Lignes d'observation certifiées, avec la borne haute et les filtres demandés. */
export async function loadAnalyticsRows(
  projectId: string,
  options?: { cutoffAt?: Date | null; filter?: AnalyticsRowFilter | null },
): Promise<AnalyticsObservationRow[]> {
  const filter = options?.filter ?? {}
  const where: {
    projectId: string
    isVerified: boolean
    createdAt?: { lte: Date }
    observationType?: string
    userId?: string
    videoId?: string | null
  } = { projectId, isVerified: true }
  if (options?.cutoffAt) where.createdAt = { lte: options.cutoffAt }
  if (filter.observationType) where.observationType = filter.observationType
  if (filter.observerId) where.userId = filter.observerId
  if (filter.videoId !== undefined) {
    where.videoId = filter.videoId === LEGACY_GENERIC_VIDEO_ID ? null : filter.videoId
  }

  const observations = await prisma.observation.findMany({
    where,
    include: {
      user: { select: { id: true, username: true, email: true, anonymousId: true } },
      point: { select: { id: true, pointName: true } },
      video: { select: { id: true, name: true, typeLabel: true, orderIndex: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return observations.map<GlobalExportRow>((row) => ({
    id: row.id,
    userId: row.userId,
    username: row.user?.username ?? null,
    email: row.user?.email ?? null,
    anonymousId: row.user?.anonymousId ?? '—',
    timestampTotal: row.timestampTotal,
    observationType: row.observationType,
    isGhostPoint: row.isGhostPoint,
    pointId: row.pointId,
    pointLabel: row.point?.pointName ?? null,
    imageUrl: row.imageUrl,
    driveFileId: row.driveFileId,
    videoName: row.video ? videoDisplayName(row.video) : null,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * Restreint des lignes aux fenêtres d'une configuration figée.
 *
 * Une fenêtre supprimée après coup ne doit pas ressurgir dans une version
 * historique : une ligne rattachée à une fenêtre absente de l'instantané est
 * traitée comme hors périmètre (fausse alerte), jamais comme une détection.
 */
export function restrictRowsToConfig(
  rows: readonly AnalyticsObservationRow[],
  config: AnalyticsPerimeterConfig,
): AnalyticsObservationRow[] {
  const known = new Set(config.points.map((point) => point.id))
  return rows.map((row) =>
    row.pointId && !known.has(row.pointId)
      ? { ...row, pointId: null, pointLabel: null, isGhostPoint: true }
      : row,
  )
}
