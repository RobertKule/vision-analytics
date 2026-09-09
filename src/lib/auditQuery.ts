/**
 * Lecture du journal d'audit — côté serveur uniquement (aucune route `/api`
 * exposée pour l'historique : les pages serveur appellent ces fonctions et
 * appliquent elles-mêmes la règle d'accès).
 *
 * RÈGLES (§27–28 du cahier des exigences) :
 *  — un ADMIN voit tous les journaux ;
 *  — un ANALYSTE / OBSERVATEUR ne voit QUE ses propres journaux ;
 *  — personne ne peut passer un `userId` arbitraire : `listMyAuditLogs` interroge
 *    toujours `userId = session.uid`, jamais une valeur fournie par le client.
 *
 * Aucune écriture, modification ou suppression n'existe ici (journal append-only).
 */

import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import type { Prisma } from '@prisma/client'
import type { AuditEntityType, AuditMetadata } from '@/lib/audit'

export type AuditActorDto = {
  id: string
  username: string | null
  email: string | null
  anonymousId: string | null
  role: string
}

export type AuditLogRowDto = {
  id: string
  createdAt: string
  action: string
  entityType: AuditEntityType | null
  entityId: string | null
  metadata: AuditMetadata
  actor: AuditActorDto | null
}

export type AuditAdminFilters = {
  userId?: string
  action?: string
  entityType?: string
  projectId?: string
  from?: string
  to?: string
}

const actorSelect = {
  select: {
    id: true,
    username: true,
    email: true,
    anonymousId: true,
    role: true,
  },
} as const

/** Forme brute de la jointure utilisateur renvoyée par Prisma (rôle = enum). */
type ActorRaw = {
  id: string
  username: string | null
  email: string | null
  anonymousId: string | null
  role: unknown
}

/** Ne conserve du Json Prisma que les scalaires (jamais d'objet/tableau). */
function toMetadata(raw: Prisma.JsonValue | null): AuditMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: AuditMetadata = {}
  for (const [key, value] of Object.entries(raw)) {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value
    }
  }
  return out
}

function toActor(user: ActorRaw | null): AuditActorDto | null {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    anonymousId: user.anonymousId,
    role: typeof user.role === 'string' ? user.role : '',
  }
}

function toRow(log: {
  id: string
  createdAt: Date
  action: string
  entityType: string | null
  entityId: string | null
  metadata: Prisma.JsonValue | null
  user: ActorRaw | null
}): AuditLogRowDto {
  return {
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    action: log.action,
    entityType: (log.entityType as AuditEntityType | null) ?? null,
    entityId: log.entityId ?? null,
    metadata: toMetadata(log.metadata),
    actor: toActor(log.user),
  }
}

/**
 * Historique PROPRE d'un utilisateur connecté. Le filtre `userId` est toujours
 * la session courante — un appelant ne peut pas consulter le journal d'autrui.
 */
export async function listMyAuditLogs(limit = 200): Promise<AuditLogRowDto[]> {
  const session = await getCurrentSession()
  if (!session) return []

  const rows = await prisma.auditLog.findMany({
    where: { userId: session.uid },
    include: { user: actorSelect },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((row) => toRow(row))
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00.000`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** Journal GLOBAL — réservé au rôle ADMIN (§25–26). */
export async function listAdminAuditLogs(
  filters: AuditAdminFilters,
  limit = 400,
): Promise<{ rows: AuditLogRowDto[]; truncated: boolean }> {
  const session = await getCurrentSession()
  if (!session || session.role !== 'ADMIN') return { rows: [], truncated: false }

  const where: Prisma.AuditLogWhereInput = {}
  if (filters.userId) where.userId = filters.userId
  if (filters.action) where.action = filters.action
  if (filters.entityType) where.entityType = filters.entityType

  const from = toDate(filters.from)
  const to = toDate(filters.to)
  if (from || to) {
    where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
  }

  // Filtre « Projet » : les journaux de projet/export portent `entityId` = id de
  // projet ; les journaux d'observation/partage/vidéo portent `metadata.projectId`.
  if (filters.projectId) {
    where.OR = [
      { entityId: filters.projectId },
      { metadata: { path: ['projectId'], equals: filters.projectId } },
    ]
  }

  const rows = await prisma.auditLog.findMany({
    where,
    include: { user: actorSelect },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })
  const truncated = rows.length > limit
  return {
    rows: rows.slice(0, limit).map((row) => toRow(row)),
    truncated,
  }
}

/** Options de filtres ADMIN : comptes actifs/anciens + projets référencés. */
export async function listAdminAuditOptions(): Promise<{
  users: AuditActorDto[]
  actions: string[]
  kinds: string[]
  projects: Array<{ id: string; title: string }>
}> {
  const session = await getCurrentSession()
  const empty = { users: [], actions: [], kinds: [], projects: [] }
  if (!session || session.role !== 'ADMIN') return empty

  const [actionGroups, kindGroups, userGroups] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['entityType'], _count: { _all: true } }),
    prisma.auditLog.groupBy({
      by: ['userId'],
      where: { userId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const userRows = (await prisma.user.findMany({
    where: { id: { in: userGroups.map((g) => g.userId as string) } },
    ...actorSelect,
  })) as ActorRaw[]

  // Projets référencés par `entityId` (type projet/export) ou `metadata.projectId`.
  const logMeta = await prisma.auditLog.findMany({
    select: { entityType: true, entityId: true, metadata: true },
  })
  const projectIds = new Set<string>()
  for (const log of logMeta) {
    if (
      log.entityType === 'project' ||
      log.entityType === 'export' ||
      log.entityType === 'observation'
    ) {
      if (log.entityId) projectIds.add(log.entityId)
    }
    const meta = log.metadata
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const pid = (meta as Record<string, unknown>).projectId
      if (typeof pid === 'string') projectIds.add(pid)
    }
  }
  const projectRows =
    projectIds.size > 0
      ? await prisma.project.findMany({
          where: { id: { in: Array.from(projectIds) } },
          select: { id: true, title: true },
          orderBy: { title: 'asc' },
        })
      : []

  return {
    users: userRows.map((user) => toActor(user)).filter((u): u is AuditActorDto => u !== null),
    actions: actionGroups.map((g) => g.action).sort(),
    kinds: kindGroups
      .map((g) => g.entityType)
      .filter((k): k is string => k !== null)
      .sort(),
    projects: projectRows,
  }
}

/** Ligne enrichie pour l'affichage : ressource lisible (titre projet / compte). */
export type ResolvedAuditResource = {
  kindKey: string
  label: string | null
}

/** Libellé d'affichage d'un compte (username → email → identifiant anonyme). */
function displayNameOf(user: { username: string | null; email: string | null; anonymousId: string | null } | null): string | null {
  if (!user) return null
  return user.username?.trim() || user.email?.trim() || user.anonymousId?.trim() || null
}

/**
 * Résout pour chaque ligne un libellé de ressource humainement lisible :
 *  — le titre du projet quand la ligne référence un projet (entityId de type
 *    projet/export/observation OU `metadata.projectId`) ;
 *  — le compte concerné pour les lignes `user` / `share` sans projet rattaché.
 * Le `kindKey` reste le `entityType` (clé du dictionnaire `audit.kinds`).
 */
export async function resolveAuditResources(
  rows: AuditLogRowDto[],
): Promise<Map<string, ResolvedAuditResource>> {
  const result = new Map<string, ResolvedAuditResource>()

  const projectIds = new Set<string>()
  const accountIds = new Set<string>()
  for (const row of rows) {
    const metaProjectId =
      typeof row.metadata.projectId === 'string' ? row.metadata.projectId : null
    if (metaProjectId) projectIds.add(metaProjectId)
    if (
      row.entityType === 'project' ||
      row.entityType === 'export' ||
      row.entityType === 'observation'
    ) {
      if (row.entityId) projectIds.add(row.entityId)
    }
    if (row.entityType === 'user' || row.entityType === 'share') {
      if (row.entityId) accountIds.add(row.entityId)
    }
  }

  const [projects, accounts] = await Promise.all([
    projectIds.size > 0
      ? prisma.project.findMany({
          where: { id: { in: Array.from(projectIds) } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    accountIds.size > 0
      ? prisma.user.findMany({
          where: { id: { in: Array.from(accountIds) } },
          select: { id: true, username: true, email: true, anonymousId: true },
        })
      : Promise.resolve([]),
  ])
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]))
  const account = new Map(accounts.map((a) => [a.id, displayNameOf(a)]))

  for (const row of rows) {
    const metaProjectId =
      typeof row.metadata.projectId === 'string' ? row.metadata.projectId : null
    let label: string | null = null

    if (metaProjectId) {
      label = projectTitle.get(metaProjectId) ?? null
    } else if (row.entityType === 'project' || row.entityType === 'export' || row.entityType === 'observation') {
      label = row.entityId ? (projectTitle.get(row.entityId) ?? null) : null
    } else if (row.entityType === 'user' || row.entityType === 'share') {
      label = row.entityId ? (account.get(row.entityId) ?? null) : null
    }

    // Aucune référence résolue : on garde un fragment stable (jamais de secret).
    if (!label && row.entityId && row.entityType && row.entityType !== 'auth') {
      label = row.entityId.length > 40 ? `${row.entityId.slice(0, 40)}…` : row.entityId
    }

    result.set(row.id, {
      kindKey: (row.entityType as string) ?? 'auth',
      label,
    })
  }
  return result
}
