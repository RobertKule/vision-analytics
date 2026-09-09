'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import type { DashboardStats } from '@/lib/types'

/**
 * Statistiques réelles du tableau de bord (sections 20–21).
 *
 * Chaque compteur est calculé depuis la base au moment de l'appel — aucun
 * chiffre statique. Le périmètre dépend strictement du rôle :
 *  - ADMIN    → vue globale du système ;
 *  - ANALYST  → uniquement les projets possédés ou partagés avec lui ;
 *  - OBSERVER → uniquement sa propre activité d'observation.
 *
 * Règle de comptage des « sessions » : une session = un jeton `sessionRunId`
 * distinct (une soumission logique). Les observations héritées sans jeton
 * comptent pour une session minimale pour l'observateur concerné, afin de ne
 * jamais sous-représenter une activité réelle.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const session = await getCurrentSession()
  if (!session || session.role === 'OBSERVER') return observerStats(session?.uid ?? '')
  if (session.role === 'ADMIN') return adminStats()
  return analystStats(session.uid)
}

const roundRate = (valid: number, total: number): number =>
  total > 0 ? Math.round((valid / total) * 1000) / 10 : 0

const obsValidGhost = (
  groups: Array<{ isGhostPoint: boolean; _count: { _all: number } }>,
): { valid: number; ghost: number; total: number } => {
  const ghost = groups.find((g) => g.isGhostPoint)?._count._all ?? 0
  const valid = groups.find((g) => !g.isGhostPoint)?._count._all ?? 0
  return { valid, ghost, total: valid + ghost }
}

async function adminStats(): Promise<DashboardStats> {
  const [projectGroups, userGroups, videoCount, obsGroups, sessionRows] = await Promise.all([
    prisma.project.groupBy({ by: ['isArchived'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.video.count(),
    prisma.observation.groupBy({ by: ['isGhostPoint'], _count: { _all: true } }),
    prisma.observation.groupBy({
      by: ['userId', 'sessionRunId'],
      where: { sessionRunId: { not: null } },
    }),
  ])

  const { valid, ghost, total } = obsValidGhost(obsGroups)
  const archived = projectGroups.find((g) => g.isArchived)?._count._all ?? 0

  return {
    role: 'ADMIN',
    activeProjects: projectGroups.find((g) => !g.isArchived)?._count._all ?? 0,
    archivedProjects: archived,
    observers: userGroups.find((g) => g.role === 'OBSERVER')?._count._all ?? 0,
    analysts: userGroups.find((g) => g.role === 'ANALYST')?._count._all ?? 0,
    videos: videoCount,
    sessions: sessionRows.length,
    validObservations: valid,
    ghostObservations: ghost,
    observations: total,
    validationRate: roundRate(valid, total),
  }
}

async function analystStats(uid: string): Promise<DashboardStats> {
  // Même périmètre que l'espace analyste : possédé OU partagé (jamais « tous »).
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: uid }, { accessList: { some: { userId: uid } } }] },
    select: { id: true, isArchived: true },
  })

  const activeProjects = projects.filter((p) => !p.isArchived).length
  const archivedProjects = projects.length - activeProjects

  const base: DashboardStats = {
    role: 'ANALYST',
    activeProjects,
    archivedProjects,
    observers: 0,
    sessions: 0,
    validObservations: 0,
    ghostObservations: 0,
    observations: 0,
    validationRate: 0,
  }
  const ids = projects.map((p) => p.id)
  if (ids.length === 0) return base

  const [obsGroups, observerRows, sessionRows] = await Promise.all([
    prisma.observation.groupBy({
      by: ['isGhostPoint'],
      where: { projectId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.observation.groupBy({ by: ['userId'], where: { projectId: { in: ids } } }),
    prisma.observation.groupBy({
      by: ['userId', 'sessionRunId'],
      where: { projectId: { in: ids }, sessionRunId: { not: null } },
    }),
  ])

  const { valid, ghost, total } = obsValidGhost(obsGroups)
  return {
    ...base,
    observers: observerRows.length,
    sessions: sessionRows.length,
    validObservations: valid,
    ghostObservations: ghost,
    observations: total,
    validationRate: roundRate(valid, total),
  }
}

async function observerStats(uid: string): Promise<DashboardStats> {
  if (!uid) {
    return {
      role: 'OBSERVER',
      projectsParticipated: 0,
      sessions: 0,
      observations: 0,
      validObservations: 0,
      ghostObservations: 0,
      validationRate: 0,
    }
  }

  const [obsGroups, projectRows, sessionRows] = await Promise.all([
    prisma.observation.groupBy({ by: ['isGhostPoint'], where: { userId: uid }, _count: { _all: true } }),
    prisma.observation.findMany({
      where: { userId: uid },
      distinct: ['projectId'],
      select: { projectId: true },
    }),
    prisma.observation.groupBy({
      by: ['sessionRunId'],
      where: { userId: uid, sessionRunId: { not: null } },
    }),
  ])

  const { valid, ghost, total } = obsValidGhost(obsGroups)
  // Héritage sans jeton de session : des observations existent mais aucune
  // session dénombrée → on compte une session minimale réelle.
  const sessions = sessionRows.length > 0 || total === 0 ? sessionRows.length : 1

  return {
    role: 'OBSERVER',
    projectsParticipated: projectRows.length,
    sessions,
    observations: total,
    validObservations: valid,
    ghostObservations: ghost,
    validationRate: roundRate(valid, total),
  }
}
