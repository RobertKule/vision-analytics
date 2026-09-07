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

/** Résultat standardisé des mutations côté serveur (affichage d'erreur sans boundary). */
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }
