import type { Locale } from '@/lib/i18n'

/** Types sérialisables échangés entre les Server Actions, la page serveur et le client. */

export type ProjectPointDto = {
  id: string
  pointName: string
  trameDebut: number
  trameFin: number
  /** Passe vidéo à laquelle la fenêtre est rattachée ; null = fenêtre « générique » (vidéo héritée). */
  videoId?: string | null
}

/**
 * Passe vidéo d'un projet, côté observateur.
 *
 * On n'y expose JAMAIS le benchmark (`benchmarkSeconds`, confidentialité
 * scientifique) ni les fenêtres de validation : uniquement ce dont l'annotateur
 * a besoin pour offrir un onglet (libellé du type, source, nom, ordre).
 */
export type BlindVideoDto = {
  id: string
  typeLabel: string | null
  name: string | null
  source: string
  orderIndex: number
}

/**
 * Passe vidéo vue par un profil autorisé (admin / analyste).
 * Contient le benchmark (vérité terrain) et le nombre de captures enregistrées.
 */
export type VideoAdminDto = BlindVideoDto & {
  projectId: string
  benchmarkSeconds: number | null
  captureCount: number
  pointCount: number
  createdAt: string
}

export type ProjectDto = {
  id: string
  title: string
  description: string | null
  videoUrl: string | null
  createdAt: string
  /** Types d'observation configurables proposés aux observateurs (ex. « 100m oblique »). */
  observationTypes: string[]
  points: ProjectPointDto[]
  /** Nombre d'observations enregistrées (renseigné par la vue admin). */
  observationCount?: number
}

/** Partage d'accès vers un collègue analyste. */
export type SharedAccessDto = {
  userId: string
  username: string | null
  email: string
  /**
   * Vrai si ce partage donne le droit de MODIFICATION. Faux = consultation,
   * analyse et export uniquement (règle par défaut du partage d'expérience).
   */
  canEdit: boolean
}

/** Projet vu depuis l'espace analyste (propriétaire ou partagé). */
export type AnalystProjectDto = ProjectDto & {
  ownerId: string | null
  ownerUsername: string | null
  isOwner: boolean
  isShared: boolean
  /** Droit de modification effectif de la session courante sur cette expérience. */
  canEdit: boolean
  sharedWith: SharedAccessDto[]
}

/** Compte utilisateur vu depuis le portail d'administration. */
export type UserAdminDto = {
  id: string
  email: string
  username: string | null
  role: string
  isActive: boolean
  /** État de la demande d'accès (inscription publique → validation ADMIN). */
  accountStatus: 'APPROVED' | 'PENDING' | 'REJECTED'
  createdAt: string
  observationCount: number
  ownedProjectsCount: number
  /** Nombre de sessions d'observation distinctes (jetons `sessionRunId` non nuls). */
  sessionsCount: number
  /** Dernière activité d'observation (horodatage de la dernière capture), sinon null. */
  lastActivityAt: string | null
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
 * Projet de session d'observation indépendante :
 * Ne contient JAMAIS la liste des points ou des trames pour préserver l'intégrité scientifique.
 */
export type BlindProjectDto = {
  id: string
  title: string
  description: string | null
  videoUrl: string | null
  createdAt: string
  /** Types d'observation configurables proposés aux observateurs (jamais les fenêtres). */
  observationTypes: string[]
  /**
   * Passes vidéo du projet (au moins une si le projet est « publié »).
   * Chaque passe correspond à un onglet de l'annotateur. Une passe peut être
   * rattachée à un type (`typeLabel`) ou générique (`typeLabel = null`).
   */
  videos: BlindVideoDto[]
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
  /** Type d'observation choisi par l'observateur (issu de Project.observationTypes). */
  observationType: string | null
  /** Passe vidéo d'origine de la capture (null = passe « générique » héritée). */
  videoId?: string | null
  /**
   * Identité de la vidéo réellement observée à la capture (nom de fichier local ou
   * URL distante). Partie Q : conservée pour la validation serveur de la vidéo
   * attendue, jamais utilisée comme clé d'idempotence.
   */
  videoSource?: string | null
  /**
   * Position du foyer des cercles, normalisée 0–1 (axe x, axe y) par rapport à
   * la zone vidéo. Optionnel : utilisé uniquement pour une étiquette de zone dans
   * le carrousel, jamais transmis à la soumission.
   */
  centroid?: { x: number; y: number }
  /**
   * Géométrie des cercles au moment de la capture — MÉMOIRE LOCALE UNIQUEMENT
   * (brouillon du navigateur). Elle permet au mode « Modifier » de restaurer le
   * cercle exact et de garder la sélection active. Elle n'est JAMAIS transmise au
   * serveur ni persistée en base : le protocole n'enregistre aucune géométrie.
   */
  circles?: Array<{ id: string; x: number; y: number; r: number; placedAt: number }>
}

/** Données nécessaires pour soumettre les observations d'une session. */
export type SubmitObservationsInput = {
  projectId: string
  observerIdentifier: string
  observations: Array<{
    timestamp: number
    imageDataUrl: string
    /** Type d'observation choisi (doit appartenir à Project.observationTypes si renseigné). */
    observationType?: string | null
    /** Passe vidéo d'origine (null / absent = passe générique héritée). */
    videoId?: string | null
    /**
     * Identité de la vidéo réellement observée (nom de fichier local ou URL distante).
     * Partie Q : comparée côté serveur à la vidéo attendue du type.
     */
    videoSource?: string | null
    /**
     * Clé de déduplication émise par le client, stable pour cette capture (son `id`
     * local). Réutilisée à la reprise d'un brouillon : le serveur ignore les doublons.
     */
    clientKey?: string | null
  }>
  /**
   * Jeton de « session » logique partagé par tous les lots d'une même soumission
   * (toute passe confondue). Permet de compter les sessions sans doublon à la reprise.
   */
  runId?: string
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
//
// ─── SÉMANTIQUE « DÉTECTION ANALYTIQUE » (règle produit) ─────────────────────
// Une détection analytique = UNE par `(observateur, type d'observation, fenêtre)`.
// Pour UN observateur, plusieurs observations certifiées dans la MÊME fenêtre
// (`pointId`) SOUS LE MÊME `observationType` comptent pour UN point détecté, pas N.
// Partout dans ce DTO (résumé, observateurs) comme dans les exports (Excel/CSV/PDF),
// les compteurs « points / validées / fenêtres » dédupliquent par
// `(observateur, observationType, pointId)` ; les fausses alertes restent des
// événements (une capture hors trame = un événement) ; la précision =
// détections analytiques / (détections analytiques + fausses alertes).
// Le relevé brut (`pointsAnalytics[].captures`, `ghostPointsAnalytics.captures`)
// conserve, lui, chaque capture certifiée — aucune perte de données brutes.
// Probabilité empirique de détection = détections / (points configurés × observateurs).
// ─────────────────────────────────────────────────────────────────────────────

/** Capture d'observation détaillée pour l'analyse administrateur (donnée BRUTE). */
export type ObservationCaptureDto = {
  id: string
  timestampTotal: number
  delaySeconds: number | null // Décalage temporel par rapport à trameDebut
  /**
   * Adresse d'affichage de la capture : TOUJOURS l'endpoint serveur sécurisé
   * (`/api/captures/<id>/image`). Les fichiers Google Drive restent privés — aucun
   * lien Drive direct n'est transmis au navigateur (les exports, eux, conservent
   * le `driveFileId` et le lien Drive).
   */
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
  observerCount: number // Nombre d'observateurs distincts ayant validé cette cible (déjà unique par observateur)
  concordanceRate: number // Taux en pourcentage (0-100) par rapport au total des observateurs
  /**
   * Délai moyen de détection en secondes. Délai PAR ÉVÉNEMENT (chaque capture
   * validée de la fenêtre), pas par point unique : c'est une mesure de réaction.
   */
  avgDelaySeconds: number | null
  minTimestamp: number | null
  maxTimestamp: number | null
  /** Relevé BRUT des captures certifiées de la fenêtre (jamais dédupliqué). */
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
  /** Fausses alertes = événements (chaque capture hors trame compte pour 1). */
  totalGhostPoints: number
  /** Part des fausses alertes dans les « déclarations » (0-100), arrondie à l'entier. */
  ghostRate: number
  timelineDistribution: GhostBucketDto[]
  /** Relevé BRUT des captures fantômes (jamais dédupliqué). */
  captures: ObservationCaptureDto[]
}

/**
 * Métrique de précision et de participation par observateur. Les compteurs
 * « points » appliquent la règle du point unique : un observateur qui capture
 * plusieurs fois la même fenêtre (`pointId`) ne compte qu'UN point validé.
 */
export type ObserverMetricDto = {
  userId: string
  anonymousId: string
  email: string
  /** Déclarations de l'observateur = points uniques validés + fausses alertes. */
  totalObservations: number
  /** Points uniques validés : fenêtres distinctes (non fantômes) détectées. */
  validObservationsCount: number
  /** Fausses alertes de l'observateur (événements). */
  ghostPointsCount: number
  /** Nombre de cibles (fenêtres) distinctes détectées = `validObservationsCount`. */
  pointsDetectedCount: number
  /** % de précision = points uniques validés / déclarations (0-100). */
  precisionRate: number
  firstSessionAt: string
  lastSessionAt: string
}

/**
 * Filtre d'analyse. Toute valeur présente restreint les métriques à ce contexte ;
 * chaque sélecteur peut aussi représenter « tous » (valeur absente / chaîne vide).
 *
 * — `videoId` cible une passe vidéo précise ; la valeur `LEGACY_VIDEO_TOKEN` (une
 *   chaîne vide réservée) cible la passe générique héritée (`Video.videoId = null`).
 * — `observationType` cible un type d'observation configuré.
 * — `observerId` cible un observateur précis.
 */
export type AnalyticsFilter = {
  observationType?: string
  videoId?: string
  observerId?: string
}

/**
 * Version analytique disponible dans l'historique d'un projet (résumé).
 * Chaque entrée est un instantané IMMUABLE : ses chiffres ne changent jamais.
 */
export type AnalyticsVersionOptionDto = {
  id: string
  versionNumber: number
  /** Instant de figement (ISO) — base du filtre « afficher l'analyse avant le : ». */
  effectiveAt: string
  /** Cause du figement (ex. WINDOW_ADDED). */
  trigger: string
  /** `previous` = état d'avant la modification, `current` = état d'après. */
  stage: 'previous' | 'current'
  /** Fenêtres/points configurés à cet instant (dénominateur de base). */
  configuredPoints: number
  observerCount: number
  /** Détections analytiques figées (numérateur). */
  detections: number
  /** Observations possibles = fenêtres configurées × observateurs. */
  possibleObservations: number
  detectionProbability: number | null
}

/** Contexte de version de l'analyse affichée (actuelle ou historique). */
export type AnalyticsVersionContextDto = {
  /** `current` = analyse actuelle (calculée en direct) ; `version` = instantané figé. */
  mode: 'current' | 'version'
  /** Vrai si les chiffres proviennent tels quels d'un instantané immuable. */
  frozen: boolean
  versionId: string | null
  versionNumber: number | null
  effectiveAt: string | null
  trigger: string | null
  /** Date demandée par le filtre « avant le : » (`YYYY-MM-DD`), si utilisé. */
  asOfDate: string | null
  /** Historique complet disponible (plus ancienne d'abord). */
  history: AnalyticsVersionOptionDto[]
}

/** Contexte vidéo exposé aux vues autorisées (analytics / admin) : inclut le benchmark. */
export type AnalyticsVideoContextDto = BlindVideoDto & {
  projectId: string
  benchmarkSeconds: number | null
  /** Captures CERTIFIÉES (`isVerified`) de la passe — jamais les sessions en cours. */
  captureCount: number
  pointCount: number
}

/** Données complètes d'analyse d'un projet d'observation. */
/**
 * Situation analytique des observateurs d'un projet (§13). Permet d'AFFICHER le
 * dénominateur réellement retenu au lieu de laisser croire que tout le monde est
 * compté. `participating` est le dénominateur de `summary.totalObservers`.
 */
export type ObserverInclusionSummaryDto = {
  participating: number
  included: number
  excluded: number
  excludedObservers: {
    userId: string
    displayName: string
    reason: string | null
    excludedAt: string | null
  }[]
}

export type ProjectAnalyticsDto = {
  project: {
    id: string
    title: string
    description: string | null
    videoUrl: string | null
    createdAt: string
    totalDefinedPoints: number
    /** Types d'observation configurables (menu « Tous les types »). */
    observationTypes?: string[]
    /** Passes vidéo avec benchmarks (menus vidéo + contexte des graphiques). */
    videos?: AnalyticsVideoContextDto[]
  }
  summary: {
    totalObservers: number
    /**
     * Total des « déclarations » = points uniques validés + fausses alertes.
     * Nombre mixte (points dédupliqués + événements fantômes) : dénominateur de
     * la précision globale. Ce n'est PAS le nombre de captures brutes.
     */
    totalObservations: number
    /** Points uniques validés : couples distincts (observateur × fenêtre) non fantômes. */
    validObservationsCount: number
    /** Fausses alertes (événements fantômes) — une capture hors trame = 1. */
    ghostPointsCount: number
    overallConcordanceRate: number // Moyenne des taux de concordance des points cibles
    /**
     * % de précision globale = points uniques validés / déclarations
     * (points uniques validés + fausses alertes).
     */
    overallPrecisionRate: number
    /**
     * Moyenne globale des délais de réaction — PAR ÉVÉNEMENT (chaque capture
     * validée), pas par point unique : mesure de réaction au `trameDebut`.
     */
    averageDetectionDelay: number | null
    /**
     * Probabilité empirique de détection (0..1) sur le périmètre filtré :
     * `détections analytiques / (points configurés × observateurs distincts)`.
     * null si le dénominateur est nul (aucun point configuré ou aucun observateur).
     */
    detectionProbability?: number | null
    /**
     * Observations POSSIBLES du périmètre = fenêtres/points configurés × observateurs.
     * C'est le DÉNOMINATEUR : ajouter une fenêtre l'augmente, sans jamais toucher au
     * numérateur (`validObservationsCount`).
     */
    possibleObservations?: number
    /** Filtre réellement appliqué aux calculs (cohérence métriques ↔ contexte). */
    appliedFilter?: AnalyticsFilter
  }
  /**
   * Version analytique de ces chiffres. En mode `version`, les valeurs viennent
   * d'un instantané immuable et ne sont jamais remplacées par la configuration
   * actuelle. Les exports reçoivent la MÊME version (dashboard = Excel = PDF).
   */
  version?: AnalyticsVersionContextDto
  pointsAnalytics: PointConcordanceDto[]
  ghostPointsAnalytics: GhostPointAnalyticsDto
  observersMetrics: ObserverMetricDto[]
  /** Périmètre humain de l'analyse (§13) : participants, inclus, déclassés. */
  observerInclusion?: ObserverInclusionSummaryDto
}

// ——— Types pour l'Espace Projet Admin & les Exports (Phase 6) ———

/** Observation « à plat » d'un projet — alimente les onglets, filtres et exports. */
export type ProjectObservationRowDto = {
  id: string
  /** Horodatage vidéo en secondes. */
  timestampTotal: number
  isGhostPoint: boolean
  /**
   * Lien Google Drive de consultation de la capture — conservé pour les EXPORTS
   * (CSV / JSON / Excel). Le fichier reste privé : ce lien n'est jamais utilisé
   * comme source d'une balise `<img>`.
   */
  imageUrl: string
  /** Adresse d'affichage sécurisée dans l'application (`/api/captures/<id>/image`). */
  imageEndpoint: string
  /** Date de soumission (ISO). */
  createdAt: string
  /** Type d'observation choisi par l'observateur (null si non configuré). */
  observationType: string | null
  pointId: string | null
  /** Nom du point de validation rattaché (null ⇒ fausse alerte / hors trame). */
  pointLabel: string | null
  /** Passe vidéo d'origine (null = passe générique héritée). */
  videoId?: string | null
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
    observationTypes: string[]
    observationCount: number
    observerCount: number
    pointsCount: number
  }
  points: ProjectPointDto[]
  /**
   * Passes vidéo du projet avec leurs benchmarks (vérité terrain) et leurs
   * compteurs. Réservé aux profils autorisés (canManage).
   */
  videos: VideoAdminDto[]
  /** Relevé complet des observations, plus récentes d'abord. */
  rows: ProjectObservationRowDto[]
}

// ——— Statistiques réelles du tableau de bord par rôle (sections 20–21) ———

/**
 * Compteurs ADMIN — vue globale sur tout le système. Tous les chiffres sont
 * calculés depuis la base (jamais de valeurs statiques).
 */
export type AdminDashboardStats = {
  activeProjects: number
  archivedProjects: number
  observers: number
  analysts: number
  videos: number
  sessions: number
  validObservations: number
  ghostObservations: number
  /** total = observations valides + fausses alertes. */
  observations: number
  /** % d'observations tombées dans une fenêtre de validation (0–100, 1 décimale). */
  validationRate: number
}

/**
 * Compteurs ANALYST — restreints aux projets qu'il possède ou qui lui sont
 * partagés (aucune donnée hors de son périmètre).
 */
export type AnalystDashboardStats = {
  activeProjects: number
  archivedProjects: number
  observers: number
  sessions: number
  validObservations: number
  ghostObservations: number
  observations: number
  validationRate: number
}

/** Compteurs OBSERVER — uniquement sa propre activité d'observation. */
export type ObserverDashboardStats = {
  /** Nombre de projets/études distincts où il a déposé des observations. */
  projectsParticipated: number
  sessions: number
  observations: number
  validObservations: number
  ghostObservations: number
  validationRate: number
}

/** Statistiques du tableau de bord, discriminées par le rôle de la session. */
export type DashboardStats =
  | ({ role: 'ADMIN' } & AdminDashboardStats)
  | ({ role: 'ANALYST' } & AnalystDashboardStats)
  | ({ role: 'OBSERVER' } & ObserverDashboardStats)

