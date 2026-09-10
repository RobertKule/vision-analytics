/**
 * Garde d'accès aux projets / expériences (code serveur uniquement).
 *
 * Toutes les autorisations sont vérifiées CÔTÉ SERVEUR, avant tout envoi de données
 * au frontend : modifier `projectId`, une URL, un paramètre ou une requête API ne
 * donne jamais accès à une expérience non autorisée.
 *
 * Niveaux :
 *  - 'none'   : aucune session, ou session sans droit sur le projet.
 *  - 'shared' : accès via un partage ProjectAccess (analyste invité).
 *  - 'owner'  : le projet appartient à la session courante.
 *  - 'admin'  : rôle ADMIN — accès total.
 *
 * La décision fine (consultation / analyse / export / configuration / partage /
 * clés observateur) est prise par le résolveur PUR `projectPermissions.ts`.
 */
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import {
  canManage,
  resolveProjectPermissions,
  type ProjectAccessLevel,
  type ProjectPermissions,
} from '@/lib/projectPermissions'

export type { ProjectAccessLevel, ProjectPermissions }
export { canManage }

/**
 * Droits complets de la session courante sur un projet — lecture unique en base
 * (propriétaire + partage), décision déléguée au résolveur pur.
 */
export async function getCurrentProjectPermissions(
  projectId: string,
): Promise<ProjectPermissions> {
  const session = await getCurrentSession()
  const id = typeof projectId === 'string' ? projectId.trim() : ''
  if (!session) {
    return resolveProjectPermissions({ role: null, userId: null, ownerId: null, share: null })
  }
  if (session.role === 'ADMIN') {
    return resolveProjectPermissions({
      role: 'ADMIN',
      userId: session.uid,
      ownerId: null,
      share: null,
    })
  }
  if (!id) {
    return resolveProjectPermissions({
      role: session.role,
      userId: session.uid,
      ownerId: null,
      share: null,
    })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { ownerId: true },
  })
  if (!project) {
    return resolveProjectPermissions({
      role: session.role,
      userId: session.uid,
      ownerId: null,
      share: null,
    })
  }

  const access =
    project.ownerId === session.uid
      ? null
      : await prisma.projectAccess.findUnique({
          where: { projectId_userId: { projectId: id, userId: session.uid } },
          select: { canEdit: true },
        })

  return resolveProjectPermissions({
    role: session.role,
    userId: session.uid,
    ownerId: project.ownerId,
    share: access ? { canEdit: access.canEdit } : null,
  })
}

/** Niveau d'accès de la session courante (API historique conservée). */
export async function getCurrentProjectAccess(projectId: string): Promise<ProjectAccessLevel> {
  const permissions = await getCurrentProjectPermissions(projectId)
  return permissions.level
}

/**
 * Garde de CONFIGURATION : propriétaire, ADMIN, ou invité dont le partage donne
 * explicitement le droit d'édition. Un invité en consultation est refusé.
 */
export async function canConfigureProject(projectId: string): Promise<boolean> {
  const permissions = await getCurrentProjectPermissions(projectId)
  return permissions.canConfigure
}
