'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import type {
  ActionResult,
  AdminProjectDetailDto,
  ProjectDto,
  ProjectObservationRowDto,
} from '@/lib/types'

/** Doit rester synchronisé avec observationActions.ts (lectures observateur). */
const BLIND_PROJECTS_TAG = 'blind-projects'

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
      _count: {
        select: { observations: true },
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
    observationCount: project._count.observations,
    points: project.points.map((point) => ({
      id: point.id,
      pointName: point.pointName,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
    })),
  }))
}

/**
 * Détail d'un projet pour l'espace administrateur (onglets + exports).
 *
 * Source unique des relevés « à plat » : les onglets Observations / Activité des
 * observateurs et les exports CSV / JSON en dérivent tous. La liste des points
 * (fenêtres secrètes) n'est renvoyée qu'aux profils autorisés (canManage) —
 * jamais aux pages observateur, qui restent sur getBlindProject().
 */
export async function getAdminProjectDetail(
  projectId: string,
): Promise<AdminProjectDetailDto | null> {
  const id = typeof projectId === 'string' ? projectId.trim() : ''
  if (!id) return null

  const accessLevel = await getCurrentProjectAccess(id)
  if (!canManage(accessLevel)) return null

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      points: {
        orderBy: { trameDebut: 'asc' },
      },
    },
  })
  if (!project) return null

  const observations = await prisma.observation.findMany({
    where: { projectId: project.id },
    include: {
      user: {
        select: { id: true, username: true, email: true, anonymousId: true },
      },
      point: {
        select: { pointName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const rows: ProjectObservationRowDto[] = observations.map((obs) => ({
    id: obs.id,
    timestampTotal: obs.timestampTotal,
    isGhostPoint: obs.isGhostPoint,
    imageUrl: obs.imageUrl,
    createdAt: obs.createdAt.toISOString(),
    pointId: obs.pointId,
    pointLabel: obs.point?.pointName ?? null,
    observerId: obs.user.id,
    observerUsername: obs.user.username,
    observerEmail: obs.user.email,
    observerAnonymousId: obs.user.anonymousId,
  }))

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      isArchived: project.isArchived,
      createdAt: project.createdAt.toISOString(),
      observationCount: rows.length,
      observerCount: new Set(rows.map((row) => row.observerId)).size,
      pointsCount: project.points.length,
    },
    points: project.points.map((point) => ({
      id: point.id,
      pointName: point.pointName,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
    })),
    rows,
  }
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
    revalidatePath('/observe')
    revalidatePath('/experience')
    updateTag(BLIND_PROJECTS_TAG)
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
    revalidatePath('/observe')
    revalidatePath('/experience')
    updateTag(BLIND_PROJECTS_TAG)
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
