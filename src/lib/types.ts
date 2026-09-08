import type { Locale } from '@/lib/i18n'

/** Types sérialisables échangés entre les Server Actions, la page serveur et le client. */

export type ProjectPointDto = {
  id: string
  pointName: string
  trameDebut: number
  trameFin: number
}

export type ProjectDto = {
  id: string
  title: string
  description: string | null
  videoUrl: string | null
  createdAt: string
  points: ProjectPointDto[]
  /** Nombre d'observations enregistrées (renseigné par la vue admin). */
  observationCount?: number
}

/** Partage d'accès vers un collègue analyste. */
export type SharedAccessDto = {
  userId: string
  username: string | null
  email: string
}

/** Projet vu depuis l'espace analyste (propriétaire ou partagé). */
export type AnalystProjectDto = ProjectDto & {
  ownerId: string | null
  ownerUsername: string | null
  isOwner: boolean
  isShared: boolean
  sharedWith: SharedAccessDto[]
}

/** Compte utilisateur vu depuis le portail d'administration. */
export type UserAdminDto = {
  id: string
  email: string
  username: string | null
  role: string
  isActive: boolean
  createdAt: string
  observationCount: number
  ownedProjectsCount: number
}

/** Synthèse d'un historique d'observateur, groupée par projet. */
export type ObserverSessionSummaryDto = {
  projectId: string
  projectTitle: string
  count: number
  valid: number
  ghost: number
  lastAt: string
}

/**
 * Projet en aveugle (Blind Testing) :
 * Ne contient JAMAIS la liste des points ou des trames pour préserver l'intégrité scientifique.
 */
export type BlindProjectDto = {
  id: string
  title: string
  description: string | null
  videoUrl: string | null
  createdAt: string
}

/** Capture locale effectuée pendant la session d'observation. */
export type CaptureRecord = {
  id: string
  /** Horodatage vidéo en secondes au moment de la capture. */
  timestamp: number
  /** Capture PNG encodée en Base64 (data:image/png;base64,…). */
  imageDataUrl: string
  /** Nombre de cercles d'intérêt portés par la capture. */
  circleCount: number
}

/** Données nécessaires pour soumettre les observations d'une session. */
export type SubmitObservationsInput = {
  projectId: string
  observerIdentifier: string
  observations: Array<{
    timestamp: number
    imageDataUrl: string
  }>
  /** Langue de l'interface, pour renvoyer des messages d'erreur localisés. */
  locale?: Locale
}

/** Résultat de la soumission d'une session d'observations. */
export type SubmissionResultDto =
  | {
      ok: true
      submittedCount: number
      message?: string
    }
  | {
      ok: false
      error: string
    }

/** Résultat standardisé des mutations côté serveur (affichage d'erreur sans boundary). */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

// ——— Types pour le Moteur d'Analyse Scientifique (Phase 5) ———

/** Capture d'observation détaillée pour l'analyse administrateur. */
export type ObservationCaptureDto = {
  id: string
  timestampTotal: number
  delaySeconds: number | null // Décalage temporel par rapport à trameDebut
  imageUrl: string
  observerAnonymousId: string
  observerEmail?: string | null
  createdAt: string
  isGhostPoint: boolean
}

/** Statistiques de concordance scientifique par point cible. */
export type PointConcordanceDto = {
  pointId: string
  pointName: string
  trameDebut: number
  trameFin: number
  targetDuration: number
  observerCount: number // Nombre d'observateurs distincts ayant validé cette cible
  concordanceRate: number // Taux en pourcentage (0-100) par rapport au total des observateurs
  avgDelaySeconds: number | null // Délai moyen de détection en secondes
  minTimestamp: number | null
  maxTimestamp: number | null
  captures: ObservationCaptureDto[]
}

/** Répartition temporelle par tranche pour les fausses alertes (Points Fantômes). */
export type GhostBucketDto = {
  intervalLabel: string
  startSecond: number
  endSecond: number
  count: number
}

/** Synthèse des fausses alertes (Points Fantômes) d'un projet. */
export type GhostPointAnalyticsDto = {
  totalGhostPoints: number
  ghostRate: number // Pourcentage par rapport au total des observations (0-100)
  timelineDistribution: GhostBucketDto[]
  captures: ObservationCaptureDto[]
}

/** Métrique de précision et de participation par observateur. */
export type ObserverMetricDto = {
  userId: string
  anonymousId: string
  email: string
  totalObservations: number
  validObservationsCount: number
  ghostPointsCount: number
  pointsDetectedCount: number // Nombre de cibles distinctes détectées
  precisionRate: number // % d'observations valides (0-100)
  firstSessionAt: string
  lastSessionAt: string
}

/** Données complètes d'analyse d'un projet d'observation. */
export type ProjectAnalyticsDto = {
  project: {
    id: string
    title: string
    description: string | null
    videoUrl: string | null
    createdAt: string
    totalDefinedPoints: number
  }
  summary: {
    totalObservers: number
    totalObservations: number
    validObservationsCount: number
    ghostPointsCount: number
    overallConcordanceRate: number // Moyenne des taux de concordance des points cibles
    overallPrecisionRate: number // % d'observations valides vs total
    averageDetectionDelay: number | null // Moyenne globale des délais de réaction
  }
  pointsAnalytics: PointConcordanceDto[]
  ghostPointsAnalytics: GhostPointAnalyticsDto
  observersMetrics: ObserverMetricDto[]
}

// ——— Types pour l'Espace Projet Admin & les Exports (Phase 6) ———

/** Observation « à plat » d'un projet — alimente les onglets, filtres et exports. */
export type ProjectObservationRowDto = {
  id: string
  /** Horodatage vidéo en secondes. */
  timestampTotal: number
  isGhostPoint: boolean
  /** URL Cloudinary de la capture annotée. */
  imageUrl: string
  /** Date de soumission (ISO). */
  createdAt: string
  pointId: string | null
  /** Nom du point de validation rattaché (null ⇒ fausse alerte / hors trame). */
  pointLabel: string | null
  observerId: string
  observerUsername: string | null
  observerEmail: string | null
  observerAnonymousId: string
}

/** Données complètes d'un projet pour l'espace d'administration détaillé. */
export type AdminProjectDetailDto = {
  project: {
    id: string
    title: string
    description: string | null
    videoUrl: string | null
    isArchived: boolean
    createdAt: string
    observationCount: number
    observerCount: number
    pointsCount: number
  }
  points: ProjectPointDto[]
  /** Relevé complet des observations, plus récentes d'abord. */
  rows: ProjectObservationRowDto[]
}
