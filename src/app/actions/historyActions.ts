'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import type { ObserverSessionSummaryDto } from '@/lib/types'

/**
 * Historique d'observations de la session connectée, groupé par projet.
 *
 * Associe la session à ses envois via l'email du compte : un observateur inscrit
 * qui choisit l'identité « email » dans la soumission retrouve ici ses sessions.
 */
export async function getObserverHistory(): Promise<ObserverSessionSummaryDto[]> {
  const session = await getCurrentSession()
  if (!session) return []

  const lowerEmail = session.email.toLowerCase()
  const observations = await prisma.observation.findMany({
    where: { user: { email: lowerEmail } },
    select: {
      isGhostPoint: true,
      createdAt: true,
      project: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const byProject = new Map<
    string,
    { projectId: string; projectTitle: string; count: number; valid: number; ghost: number; lastAt: string }
  >()

  for (const obs of observations) {
    const projectId = obs.project.id
    const entry = byProject.get(projectId)
    const iso = obs.createdAt.toISOString()
    if (!entry) {
      byProject.set(projectId, {
        projectId,
        projectTitle: obs.project.title,
        count: 1,
        valid: obs.isGhostPoint ? 0 : 1,
        ghost: obs.isGhostPoint ? 1 : 0,
        lastAt: iso,
      })
    } else {
      entry.count += 1
      if (obs.isGhostPoint) entry.ghost += 1
      else entry.valid += 1
      if (iso > entry.lastAt) entry.lastAt = iso
    }
  }

  return Array.from(byProject.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
}
