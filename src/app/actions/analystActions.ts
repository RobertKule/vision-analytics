'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { Prisma, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { recordAudit, AUDIT_ACTIONS, type AuditLogInput } from '@/lib/audit'
import { notify } from '@/lib/notify'
import { ANALYTICS_TRIGGERS, type AnalyticsTrigger } from '@/lib/analyticsVersioning'
import {
  captureAnalyticsSnapshot,
  recordConfigChangeVersions,
} from '@/lib/analyticsVersionStore'
import { reclassifyGhostsForNewWindow } from '@/lib/observationReclassify'
import {
  MAX_WINDOWS_PER_SUBMISSION,
  validateWindowBounds,
  windowBoundsKeys,
  type WindowBoundsError,
} from '@/lib/windowDraft'
import type { ActionResult, AnalystProjectDto } from '@/lib/types'
import { defaultLocale, type Locale } from '@/lib/i18n'

const msg = (locale: Locale, en: string, fr: string) => (locale === 'fr' ? fr : en)

/** Trace une action d'audit dont l'acteur est la session courante (best effort). */
async function actorAudit(input: Omit<AuditLogInput, 'userId'>): Promise<void> {
  const session = await getCurrentSession()
  await recordAudit({ ...input, userId: session?.uid ?? null })
}

/**
 * Encadre une modification de configuration par le VERSIONNAGE ANALYTIQUE :
 * l'état d'avant est figé, la mutation s'applique, l'état d'après est figé.
 * Les observations et détections déjà réalisées ne sont jamais touchées.
 */
async function versionedConfigChange<T>(
  projectId: string,
  trigger: AnalyticsTrigger,
  mutate: () => Promise<T>,
): Promise<T> {
  const before = await captureAnalyticsSnapshot(projectId)
  const result = await mutate()
  const session = await getCurrentSession()
  await recordConfigChangeVersions({
    projectId,
    before,
    trigger,
    actorId: session?.uid ?? null,
  })
  return result
}

/** Doit rester synchronisé avec observationActions.ts (lectures observateur). */
const BLIND_PROJECTS_TAG = 'blind-projects'

/**
 * Traduit un motif de refus de `lib/windowDraft` en message bilingue.
 *
 * La RÈGLE vit dans le noyau pur (partagé avec l'interface) ; seuls les libellés
 * sont propres à cette surface.
 */
function windowBoundsMessage(locale: Locale, error: WindowBoundsError): string {
  switch (error) {
    case 'empty':
      return msg(locale, 'Add at least one window.', 'Ajoutez au moins une fenêtre.')
    case 'count':
      return msg(
        locale,
        `No more than ${MAX_WINDOWS_PER_SUBMISSION} windows at once.`,
        `Un point ne peut pas recevoir plus de ${MAX_WINDOWS_PER_SUBMISSION} fenêtres en une fois.`,
      )
    case 'not-integer':
      return msg(
        locale,
        'Bounds must be whole seconds ≥ 0.',
        'Les bornes doivent être des secondes entières positives.',
      )
    case 'bounds':
      return msg(
        locale,
        'The end must be strictly greater than the start.',
        'La fin de chaque fenêtre doit être strictement supérieure à son début.',
      )
    case 'duplicate':
      return msg(
        locale,
        'This window already exists for this video.',
        'Cette fenêtre existe déjà pour cette vidéo.',
      )
  }
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
    const myShare = project.accessList.find((access) => access.userId === session.uid)
    // Droit de modification effectif : ADMIN, propriétaire, ou partage avec édition.
    const canEdit = session.role === 'ADMIN' || isOwner || myShare?.canEdit === true
    return {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      observationTypes: project.observationTypes,
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
      canEdit,
      sharedWith: project.accessList
        .filter((a) => a.userId !== session.uid)
        .map((a) => ({
          userId: a.userId,
          username: a.user.username,
          email: a.user.email,
          canEdit: a.canEdit,
        })),
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
    await actorAudit({
      action: AUDIT_ACTIONS.projectCreated,
      entityType: 'project',
      entityId: project.id,
      metadata: { title },
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

/** Archive un projet — propriétaire, ADMIN, ou invité avec droit d'édition. */
export async function archiveOwnedProject(input: { projectId: string; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const permissions = await getCurrentProjectPermissions(input?.projectId ?? '')
  if (!permissions.canConfigure) {
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
      await actorAudit({
        action: AUDIT_ACTIONS.projectArchived,
        entityType: 'project',
        entityId: input.projectId,
      })
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

/**
 * Ajoute une fenêtre de validation temporelle.
 *
 * Réservé au propriétaire, à l'ADMIN, ou à un invité dont le partage donne
 * explicitement le droit d'édition. L'ajout est VERSIONNÉ : l'état analytique
 * précédent reste consultable à l'identique, et les détections déjà réalisées sont
 * conservées — seul le nombre d'observations possibles augmente.
 */
export async function addWindowToProject(input: {
  projectId: string
  pointName: string
  trameDebut: number
  trameFin: number
  locale?: Locale
}): Promise<ActionResult> {
  // Compatibilité : un seul intervalle = cas particulier d'un point à 1 fenêtre.
  return addWindowsToProject({
    projectId: input?.projectId,
    pointName: input?.pointName,
    windows: [{ trameDebut: input?.trameDebut, trameFin: input?.trameFin }],
    locale: input?.locale,
  })
}

/**
 * Ajoute PLUSIEURS fenêtres temporelles à un même point logique, en une fois (§2).
 *
 * Un point scientifique peut apparaître plusieurs fois dans la même vidéo
 * (00:10–00:20, 01:05–01:12, 03:40–03:55) : l'analyste saisit tous les intervalles
 * d'un seul geste. Les CHEVAUCHEMENTS et INCLUSIONS sont autorisés — le moteur
 * d'attribution les arbitre de façon déterministe — mais les DOUBLONS EXACTS
 * (même point portant deux fois les mêmes bornes) restent refusés.
 */
export async function addWindowsToProject(input: {
  projectId: string
  pointName: string
  windows: Array<{ trameDebut: number; trameFin: number }>
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const projectId = (input?.projectId ?? '').trim()
  const permissions = await getCurrentProjectPermissions(projectId)
  if (!permissions.canConfigure) {
    return { ok: false, error: msg(locale, 'Access denied.', 'Accès refusé.') }
  }
  const pointName = (input?.pointName ?? '').trim()
  const raw = Array.isArray(input?.windows) ? input.windows : []

  if (!projectId) return { ok: false, error: msg(locale, 'Invalid project.', 'Projet invalide.') }
  if (!pointName) {
    return { ok: false, error: msg(locale, 'The window name is required.', 'Le nom de la fenêtre est obligatoire.') }
  }

  // Bornes + volumétrie : règle UNIQUE partagée avec l'interface (`lib/windowDraft`).
  const bounds = validateWindowBounds(raw, [])
  if (!bounds.ok) return { ok: false, error: windowBoundsMessage(locale, bounds.error) }
  const windows = bounds.windows

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { isArchived: true } })
    if (!project) return { ok: false, error: msg(locale, 'Project not found.', 'Projet introuvable.') }
    if (project.isArchived) {
      return { ok: false, error: msg(locale, 'Archived project.', 'Projet archivé.') }
    }
    // Les fenêtres génériques (videoId null) partagent un même espace d'attribution.
    const existing = await prisma.projectPoint.findMany({
      where: { projectId, videoId: null },
      select: { trameDebut: true, trameFin: true },
    })
    // Même règle qu'à l'interface, appliquée ici contre les trames déjà enregistrées :
    // les doublons INTERNES à la soumission restent détectés par le même passage.
    const dupes = validateWindowBounds(windows, windowBoundsKeys(existing))
    if (!dupes.ok) return { ok: false, error: windowBoundsMessage(locale, dupes.error) }
    const created = await versionedConfigChange(
      projectId,
      ANALYTICS_TRIGGERS.windowAdded,
      async () => {
        const points: { id: string; videoId: string | null; trameDebut: number; trameFin: number }[] = []
        for (const window of windows) {
          points.push(
            await prisma.projectPoint.create({
              data: { projectId, pointName, trameDebut: window.trameDebut, trameFin: window.trameFin },
              select: { id: true, videoId: true, trameDebut: true, trameFin: true },
            }),
          )
        }
        // ——— Ajouter une fenêtre ne supprime pas le passé ———
        // Les observations déjà certifiées hors-trame qui tombent désormais dans une
        // nouvelle fenêtre redeviennent des DÉTECTIONS VALIDES (le numérateur
        // augmente). Fait DANS le callback pour que la version « après » le reflète.
        for (const point of points) {
          await reclassifyGhostsForNewWindow(projectId, point)
        }
        return points
      },
    )
    await actorAudit({
      action: AUDIT_ACTIONS.projectUpdated,
      entityType: 'project',
      entityId: projectId,
      metadata: {
        pointName,
        windowsAdded: created.length,
        windowIds: created.map((point) => point.id).join(','),
      },
    })
    revalidatePath('/analyst/projects')
    revalidatePath('/admin/projects')
    revalidatePath(`/admin/projects/${projectId}/analytics`)
    revalidatePath(`/analyst/projects/${projectId}/analytics`)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’ajout de la fenêtre :', error)
    return { ok: false, error: msg(locale, 'Unable to add the window.', 'Impossible d’ajouter la fenêtre.') }
  }
}

/**
 * Supprime une fenêtre de validation. Les observations restent en base (aucune
 * donnée supprimée), simplement plus rattachées au périmètre courant. La
 * suppression est versionnée : l'état d'avant reste consultable à l'identique.
 */
export async function deleteWindowFromProject(input: { pointId: string; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  try {
    const point = await prisma.projectPoint.findUnique({
      where: { id: input?.pointId ?? '' },
      select: { projectId: true },
    })
    if (!point) return { ok: false, error: msg(locale, 'Window not found.', 'Fenêtre introuvable.') }
    const permissions = await getCurrentProjectPermissions(point.projectId)
    if (!permissions.canConfigure) {
      return { ok: false, error: msg(locale, 'Access denied.', 'Accès refusé.') }
    }
    await versionedConfigChange(point.projectId, ANALYTICS_TRIGGERS.windowRemoved, () =>
      prisma.projectPoint.delete({ where: { id: input.pointId } }),
    )
    await actorAudit({
      action: AUDIT_ACTIONS.projectUpdated,
      entityType: 'project',
      entityId: point.projectId,
      metadata: { windowRemoved: input.pointId },
    })
    revalidatePath('/analyst/projects')
    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la suppression de la fenêtre :', error)
    return { ok: false, error: msg(locale, 'Unable to delete the window.', 'Impossible de supprimer la fenêtre.') }
  }
}

/**
 * Partage une expérience avec un collègue analyste (par nom d'utilisateur).
 *
 * Le partage donne TOUJOURS la consultation, l'analyse et l'export. Le droit de
 * MODIFICATION n'est accordé que si `canEdit` est explicitement demandé — sans quoi
 * l'invité ne peut ni configurer, ni re-partager, ni créer de clé observateur.
 * Seuls le propriétaire, un ADMIN ou un invité disposant du droit d'édition peuvent
 * partager. La gestion des UTILISATEURS reste réservée à l'ADMIN.
 */
export async function shareProjectWithUser(input: {
  projectId: string
  username: string
  /** Droit d'édition explicite accordé à l'invité (défaut : consultation seule). */
  canEdit?: boolean
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const projectId = (input?.projectId ?? '').trim()
  const username = (input?.username ?? '').trim()
  const permissions = await getCurrentProjectPermissions(projectId)
  if (!permissions.canShare) {
    return { ok: false, error: msg(locale, 'Access denied.', 'Accès refusé.') }
  }
  const canEdit = input?.canEdit === true

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
      create: { projectId, userId: colleague.id, canEdit },
      update: { canEdit },
    })

    await actorAudit({
      action: AUDIT_ACTIONS.experienceShared,
      entityType: 'share',
      entityId: colleague.id,
      metadata: { projectId, sharedWith: colleague.email, canEdit },
    })
    // ——— Notification in-app + email à l'analyste invité (Partie S) ———
    await notify({
      inApp: {
        userId: colleague.id,
        type: 'EXPERIENCE_SHARED',
        title: 'Expérience partagée',
        message: `Une expérience vous a été partagée.`,
      },
      email: {
        to: colleague.email,
        kind: 'EXPERIENCE_SHARED',
        context: { recipientName: colleague.email },
      },
    })
    revalidatePath('/analyst/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du partage :', error)
    return { ok: false, error: msg(locale, 'Unable to share the project.', 'Impossible de partager le projet.') }
  }
}

/** Retire l'accès d'un collègue au projet (propriétaire ou administrateur). */
export async function unshareProjectFromUser(input: {
  projectId: string
  userId: string
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const projectId = (input?.projectId ?? '').trim()
  const permissions = await getCurrentProjectPermissions(projectId)
  if (permissions.level !== 'owner' && permissions.level !== 'admin') {
    return { ok: false, error: msg(locale, 'Only the owner can unshare.', 'Seul le propriétaire peut retirer un accès.') }
  }
  try {
    await prisma.projectAccess.deleteMany({
      where: { projectId, userId: input.userId },
    })
    await actorAudit({
      action: AUDIT_ACTIONS.experienceShareRevoked,
      entityType: 'share',
      entityId: input.userId,
      metadata: { projectId, unsharedWith: input.userId },
    })
    revalidatePath('/analyst/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du retrait d’accès :', error)
    return { ok: false, error: msg(locale, 'Unable to remove the access.', 'Impossible de retirer l’accès.') }
  }
}
