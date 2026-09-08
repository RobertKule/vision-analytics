/**
 * Garde d'accès aux projets (code serveur uniquement).
 *
 * Niveaux :
 *  - 'none'   : aucune session, ou session sans droit sur le projet.
 *  - 'shared' : accès via un partage ProjectAccess (analyste invité).
 *  - 'owner'  : le projet appartient à la session courante.
 *  - 'admin'  : rôle ADMIN — accès total.
 */
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'

export type ProjectAccessLevel = 'none' | 'shared' | 'owner' | 'admin'

export async function getCurrentProjectAccess(projectId: string): Promise<ProjectAccessLevel> {
  const session = await getCurrentSession()
  if (!session) return 'none'
  if (session.role === 'ADMIN') return 'admin'

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  })
  if (!project) return 'none'
  if (project.ownerId === session.uid) return 'owner'

  const access = await prisma.projectAccess.findUnique({
    where: { projectId_userId: { projectId, userId: session.uid } },
    select: { id: true },
  })
  return access ? 'shared' : 'none'
}

/** Vrai si le niveau autorise la gestion (propriétaire, partagé, administrateur). */
export function canManage(level: ProjectAccessLevel): boolean {
  return level === 'owner' || level === 'shared' || level === 'admin'
}
