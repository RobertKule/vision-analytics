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
