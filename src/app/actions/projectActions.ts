'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import type { ActionResult, ProjectDto } from '@/lib/types'

type CreateProjectInput = {
  title: string
  description?: string | null
  videoUrl?: string | null
}

type AddProjectPointInput = {
  projectId: string
  pointName: string
  trameDebut: number
  trameFin: number
}

/**
 * Actions d'administration : zone réservée aux administrateurs authentifiés.
 * Chaque mutation commence par un garde `getCurrentAdmin()` (cookie de session signé,
 * cf. src/lib/session.ts). Par ailleurs chaque entrée est validée et normalisée côté
 * serveur : on ne fait jamais confiance au client.
 */

/** Liste des projets non archivés avec leurs fenêtres temporelles triées. */
export async function listProjects(): Promise<ProjectDto[]> {
  const projects = await prisma.project.findMany({
    where: { isArchived: false },
    include: {
      points: {
        orderBy: { trameDebut: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    description: project.description,
    videoUrl: project.videoUrl,
    createdAt: project.createdAt.toISOString(),
    points: project.points.map((point) => ({
      id: point.id,
      pointName: point.pointName,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
    })),
  }))
}

/** Crée un nouveau projet d'observation. */
export async function createProject(input: CreateProjectInput): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const title = (input?.title ?? '').trim()
    if (!title) {
      return { ok: false, error: 'Le titre du projet est obligatoire.' }
    }

    const project = await prisma.project.create({
      data: {
        title,
        description: input?.description?.trim() || null,
        videoUrl: input?.videoUrl?.trim() || null,
      },
      select: { id: true },
    })

    revalidatePath('/admin/projects')
    return { ok: true, id: project.id }
  } catch (error) {
    console.error('Erreur lors de la création du projet :', error)
    return { ok: false, error: 'Impossible de créer le projet. Réessayez.' }
  }
}

/** Archive un projet (les observations liées sont conservées). */
export async function archiveProject(projectId: string): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, error: 'Identifiant de projet invalide.' }
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { isArchived: true },
    })

    if (!project) {
      return { ok: false, error: 'Projet introuvable.' }
    }
    if (project.isArchived) {
      return { ok: true }
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { isArchived: true },
    })

    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’archivage du projet :', error)
    return { ok: false, error: 'Impossible d’archiver le projet. Réessayez.' }
  }
}

function parseSeconds(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

/** Ajoute une fenêtre de validation temporelle (point) à un projet. */
export async function addProjectPoint(input: AddProjectPointInput): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  const projectId = typeof input?.projectId === 'string' ? input.projectId.trim() : ''
  const pointName = (input?.pointName ?? '').trim()
  const trameDebut = parseSeconds(input?.trameDebut)
  const trameFin = parseSeconds(input?.trameFin)

  if (!projectId) {
    return { ok: false, error: 'Identifiant de projet invalide.' }
  }
  if (!pointName) {
    return { ok: false, error: 'Le nom du point est obligatoire (ex. « Point 1 »).' }
  }
  if (trameDebut === null || trameFin === null) {
    return { ok: false, error: 'Les bornes doivent être des secondes entières positives ou nulles.' }
  }
  if (trameFin < trameDebut) {
    return { ok: false, error: 'La fin de la fenêtre doit être supérieure ou égale à son début.' }
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { isArchived: true },
    })

    if (!project) {
      return { ok: false, error: 'Projet introuvable.' }
    }
    if (project.isArchived) {
      return { ok: false, error: 'Ce projet est archivé : ajoutez vos fenêtres avant archivage.' }
    }

    // Des fenêtres disjointes garantissent une attribution de point non ambiguë
    // à partir d'un horodatage (logique « ghost point » prévue ultérieurement).
    const existingWindows = await prisma.projectPoint.findMany({
      where: { projectId },
      select: { trameDebut: true, trameFin: true },
    })

    const overlaps = existingWindows.some(
      (window) => window.trameDebut < trameFin && trameDebut < window.trameFin,
    )
    if (overlaps) {
      return { ok: false, error: 'Cette fenêtre chevauche un point déjà défini.' }
    }

    await prisma.projectPoint.create({
      data: { projectId, pointName, trameDebut, trameFin },
    })

    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’ajout du point :', error)
    return { ok: false, error: 'Impossible d’ajouter le point. Réessayez.' }
  }
}

/** Supprime une fenêtre temporelle (les observations restent, sans point rattaché). */
export async function deleteProjectPoint(pointId: string): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof pointId !== 'string' || !pointId.trim()) {
      return { ok: false, error: 'Identifiant de point invalide.' }
    }

    await prisma.projectPoint.delete({ where: { id: pointId } })

    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la suppression du point :', error)
    return { ok: false, error: 'Point introuvable ou déjà supprimé.' }
  }
}
