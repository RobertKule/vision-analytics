'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { Prisma, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import type { ActionResult, AnalystProjectDto } from '@/lib/types'
import { defaultLocale, type Locale } from '@/lib/i18n'

const msg = (locale: Locale, en: string, fr: string) => (locale === 'fr' ? fr : en)

/** Doit rester synchronisé avec observationActions.ts (lectures observateur). */
const BLIND_PROJECTS_TAG = 'blind-projects'

function parseSeconds(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

/**
 * Espace analyste : chaque mutation exige une session ANALYST ou ADMIN et un
 * droit de gestion (propriétaire, partagé ou administrateur) sur le projet.
 */

/** Liste les projets visibles : mes projets + ceux qui me sont partagés (ADMIN : tout). */
export async function listAnalystProjects(): Promise<AnalystProjectDto[]> {
  const session = await getCurrentSession()
  if (!session) return []
  if (session.role !== 'ANALYST' && session.role !== 'ADMIN') return []

  const where: Prisma.ProjectWhereInput = { isArchived: false }
  if (session.role !== 'ADMIN') {
    where.OR = [{ ownerId: session.uid }, { accessList: { some: { userId: session.uid } } }]
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      points: { orderBy: { trameDebut: 'asc' } },
      owner: { select: { id: true, username: true, email: true } },
      accessList: {
        include: { user: { select: { id: true, username: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return projects.map((project) => {
    const isOwner = project.ownerId === session.uid
    const ownerId = project.ownerId
    return {
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
      ownerId,
      ownerUsername: project.owner?.username ?? project.owner?.email ?? null,
      isOwner,
      isShared: !isOwner && project.ownerId !== null,
      sharedWith: project.accessList
        .filter((a) => a.userId !== session.uid)
        .map((a) => ({ userId: a.userId, username: a.user.username, email: a.user.email })),
    }
  })
}

/** Crée un projet appartenant à la session (ANALYST ou ADMIN). */
export async function createOwnedProject(input: {
  title: string
  description?: string | null
  videoUrl?: string | null
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const session = await getCurrentSession()
  if (!session || (session.role !== 'ANALYST' && session.role !== 'ADMIN')) {
    return { ok: false, error: msg(locale, 'Access restricted to analysts.', 'Accès réservé aux analystes.') }
  }
  try {
    const title = (input?.title ?? '').trim()
    if (!title) {
      return { ok: false, error: msg(locale, 'The project title is required.', 'Le titre du projet est obligatoire.') }
    }
    const project = await prisma.project.create({
      data: {
        title,
        description: input?.description?.trim() || null,
        videoUrl: input?.videoUrl?.trim() || null,
        ownerId: session.uid,
      },
      select: { id: true },
    })
    revalidatePath('/analyst/projects')
    revalidatePath('/admin/projects')
    revalidatePath('/observe')
    updateTag(BLIND_PROJECTS_TAG)
    return { ok: true, id: project.id }
  } catch (error) {
    console.error('Erreur lors de la création du projet :', error)
    return { ok: false, error: msg(locale, 'Unable to create the project.', 'Impossible de créer le projet.') }
  }
}

/** Archive un projet (propriétaire, partagé ou administrateur). */
export async function archiveOwnedProject(input: { projectId: string; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const level = await getCurrentProjectAccess(input?.projectId ?? '')
  if (!canManage(level)) {
    return { ok: false, error: msg(locale, 'Access denied.', 'Accès refusé.') }
  }
  try {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { isArchived: true },
    })
    if (!project) return { ok: false, error: msg(locale, 'Project not found.', 'Projet introuvable.') }
    if (!project.isArchived) {
      await prisma.project.update({ where: { id: input.projectId }, data: { isArchived: true } })
    }
    revalidatePath('/analyst/projects')
    revalidatePath('/admin/projects')
    revalidatePath('/observe')
    updateTag(BLIND_PROJECTS_TAG)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’archivage :', error)
    return { ok: false, error: msg(locale, 'Unable to archive the project.', 'Impossible d’archiver le projet.') }
  }
}

/** Ajoute une fenêtre de validation temporelle (propriétaire, partagé ou admin). */
export async function addWindowToProject(input: {
  projectId: string
  pointName: string
  trameDebut: number
  trameFin: number
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const projectId = (input?.projectId ?? '').trim()
  const level = await getCurrentProjectAccess(projectId)
  if (!canManage(level)) {
    return { ok: false, error: msg(locale, 'Access denied.', 'Accès refusé.') }
  }
  const pointName = (input?.pointName ?? '').trim()
  const trameDebut = parseSeconds(input?.trameDebut)
  const trameFin = parseSeconds(input?.trameFin)

  if (!projectId) return { ok: false, error: msg(locale, 'Invalid project.', 'Projet invalide.') }
  if (!pointName) {
    return { ok: false, error: msg(locale, 'The window name is required.', 'Le nom de la fenêtre est obligatoire.') }
  }
  if (trameDebut === null || trameFin === null) {
    return {
      ok: false,
      error: msg(locale, 'Bounds must be whole seconds ≥ 0.', 'Les bornes doivent être des secondes entières positives.'),
    }
  }
  if (trameFin < trameDebut) {
    return {
      ok: false,
      error: msg(locale, 'The end must be ≥ the start.', 'La fin doit être supérieure ou égale au début.'),
    }
  }

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { isArchived: true } })
    if (!project) return { ok: false, error: msg(locale, 'Project not found.', 'Projet introuvable.') }
    if (project.isArchived) {
      return { ok: false, error: msg(locale, 'Archived project.', 'Projet archivé.') }
    }
    const existing = await prisma.projectPoint.findMany({
      where: { projectId },
      select: { trameDebut: true, trameFin: true },
    })
    const overlaps = existing.some((w) => w.trameDebut < trameFin && trameDebut < w.trameFin)
    if (overlaps) {
      return { ok: false, error: msg(locale, 'This window overlaps an existing one.', 'Cette fenêtre chevauche une fenêtre existante.') }
    }
    await prisma.projectPoint.create({ data: { projectId, pointName, trameDebut, trameFin } })
    revalidatePath('/analyst/projects')
    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’ajout de la fenêtre :', error)
    return { ok: false, error: msg(locale, 'Unable to add the window.', 'Impossible d’ajouter la fenêtre.') }
  }
}

/** Supprime une fenêtre de validation (les observations restent, sans point rattaché). */
export async function deleteWindowFromProject(input: { pointId: string; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  try {
    const point = await prisma.projectPoint.findUnique({
      where: { id: input?.pointId ?? '' },
      select: { projectId: true },
    })
    if (!point) return { ok: false, error: msg(locale, 'Window not found.', 'Fenêtre introuvable.') }
    const level = await getCurrentProjectAccess(point.projectId)
    if (!canManage(level)) return { ok: false, error: msg(locale, 'Access denied.', 'Accès refusé.') }
    await prisma.projectPoint.delete({ where: { id: input.pointId } })
    revalidatePath('/analyst/projects')
    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la suppression de la fenêtre :', error)
    return { ok: false, error: msg(locale, 'Unable to delete the window.', 'Impossible de supprimer la fenêtre.') }
  }
}

/** Partage un projet avec un collègue analyste (par nom d'utilisateur). */
export async function shareProjectWithUser(input: {
  projectId: string
  username: string
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const projectId = (input?.projectId ?? '').trim()
  const username = (input?.username ?? '').trim()
  const level = await getCurrentProjectAccess(projectId)
  if (!canManage(level)) {
    return { ok: false, error: msg(locale, 'Access denied.', 'Accès refusé.') }
  }

  try {
    const colleague = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        role: Role.ANALYST,
        isActive: true,
      },
      select: { id: true, email: true },
    })
    if (!colleague) {
      return {
        ok: false,
        error: msg(locale, 'No analyst found with this username.', 'Aucun analyste trouvé avec ce nom d’utilisateur.'),
      }
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } })
    if (project && project.ownerId === colleague.id) {
      return { ok: false, error: msg(locale, 'This user already owns the project.', 'Cet utilisateur possède déjà ce projet.') }
    }

    await prisma.projectAccess.upsert({
      where: { projectId_userId: { projectId, userId: colleague.id } },
      create: { projectId, userId: colleague.id },
      update: {},
    })

    revalidatePath('/analyst/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du partage :', error)
    return { ok: false, error: msg(locale, 'Unable to share the project.', 'Impossible de partager le projet.') }
  }
}

/** Retire l'accès d'un collègue au projet (propriétaire ou admin). */
export async function unshareProjectFromUser(input: {
  projectId: string
  userId: string
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const projectId = (input?.projectId ?? '').trim()
  const level = await getCurrentProjectAccess(projectId)
  if (level !== 'owner' && level !== 'admin') {
    return { ok: false, error: msg(locale, 'Only the owner can unshare.', 'Seul le propriétaire peut retirer un accès.') }
  }
  try {
    await prisma.projectAccess.deleteMany({
      where: { projectId, userId: input.userId },
    })
    revalidatePath('/analyst/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du retrait d’accès :', error)
    return { ok: false, error: msg(locale, 'Unable to remove the access.', 'Impossible de retirer l’accès.') }
  }
}
