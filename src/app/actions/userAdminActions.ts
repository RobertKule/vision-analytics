'use server'

import { revalidatePath } from 'next/cache'
import { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { hashPassword } from '@/lib/passwords'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import type { ActionResult, UserAdminDto } from '@/lib/types'
import { defaultLocale, type Locale } from '@/lib/i18n'

const msg = (locale: Locale, en: string, fr: string) => (locale === 'fr' ? fr : en)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/

export type UserAdminRole = 'ADMIN' | 'ANALYST' | 'OBSERVER'

/** Portail /admin/users : réservé au rôle ADMIN. Chaque mutation se protège soi-même. */

async function requireAdmin(locale: Locale): Promise<ActionResult | null> {
  const session = await getCurrentSession()
  if (!session) {
    return { ok: false, error: msg(locale, 'Sign in required.', 'Connexion requise.') }
  }
  if (session.role !== 'ADMIN') {
    return { ok: false, error: msg(locale, 'Administrator access only.', 'Accès réservé aux administrateurs.') }
  }
  return null
}

/**
 * Liste tous les comptes (avec compteurs d'activité).
 *
 * Pour chaque compte, une « session d'observation » est un jeton `sessionRunId`
 * distinct émis par un passage du stepper (une session d'observation indépendante).
 * Les observations héritées sans jeton (sessionRunId null) comptent pour une
 * session minimale afin de ne jamais sous-représenter une activité réelle.
 * « Dernière activité » = date de la capture la plus récente (null si aucun dépôt).
 */
export async function listUsers(): Promise<UserAdminDto[]> {
  const session = await getCurrentSession()
  if (!session || session.role !== 'ADMIN') return []

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
      accountStatus: true,
      createdAt: true,
      _count: { select: { observations: true, ownedProjects: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (users.length === 0) return []

  const ids = users.map((user) => user.id)

  // Sessions distinctes par utilisateur : une ligne de regroupement (userId, sessionRunId).
  const sessionGroups = await prisma.observation.groupBy({
    by: ['userId', 'sessionRunId'],
    where: { userId: { in: ids }, sessionRunId: { not: null } },
  })
  const sessionsByUser = new Map<string, number>()
  for (const group of sessionGroups) {
    sessionsByUser.set(group.userId, (sessionsByUser.get(group.userId) ?? 0) + 1)
  }

  // Dernière activité par utilisateur (toutes observations confondues, jetons inclus).
  const lastActivityGroups = await prisma.observation.groupBy({
    by: ['userId'],
    where: { userId: { in: ids } },
    _max: { createdAt: true },
  })
  const lastActivityByUser = new Map<string, string | null>()
  for (const group of lastActivityGroups) {
    lastActivityByUser.set(group.userId, group._max.createdAt?.toISOString() ?? null)
  }

  return users.map((user) => {
    const observationCount = user._count.observations
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt.toISOString(),
      observationCount,
      ownedProjectsCount: user._count.ownedProjects,
      // Aucune session dénombrée mais des observations existent → héritage sans jeton.
      sessionsCount: observationCount > 0 ? (sessionsByUser.get(user.id) ?? 1) : 0,
      lastActivityAt: lastActivityByUser.get(user.id) ?? null,
    }
  })
}

/** Crée un compte (ADMIN / ANALYST / OBSERVER) avec mot de passe temporaire. */
export async function createUserByAdmin(input: {
  username: string
  email: string
  password: string
  role: UserAdminRole
  locale?: Locale
}): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const blocked = await requireAdmin(locale)
  if (blocked) return blocked

  const email = (input?.email ?? '').trim().toLowerCase()
  const username = (input?.username ?? '').trim()
  const password = typeof input?.password === 'string' ? input.password : ''
  const role = input?.role

  if (role !== 'ADMIN' && role !== 'ANALYST' && role !== 'OBSERVER') {
    return { ok: false, error: msg(locale, 'Invalid role.', 'Rôle invalide.') }
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: msg(locale, 'Enter a valid email address.', 'Renseignez une adresse email valide.') }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error: msg(locale, 'Username must be 3–24 characters (letters, digits, _ - .).', 'Le nom d’utilisateur doit faire 3 à 24 caractères (lettres, chiffres, _ - .).'),
    }
  }
  if (password.length < 8) {
    return { ok: false, error: msg(locale, 'Password must be at least 8 characters.', 'Le mot de passe doit contenir au moins 8 caractères.') }
  }

  const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (emailOwner) return { ok: false, error: msg(locale, 'This email is already used.', 'Cette adresse email est déjà utilisée.') }

  const usernameOwner = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true },
  })
  if (usernameOwner) return { ok: false, error: msg(locale, 'This username is already taken.', 'Ce nom d’utilisateur est déjà pris.') }

  const admin = await getCurrentSession()
  try {
    const created = await prisma.user.create({
      data: {
        email,
        username,
        password: await hashPassword(password),
        role: role as Role,
      },
    })
    await recordAudit({
      userId: admin?.uid ?? null,
      action: AUDIT_ACTIONS.userCreated,
      entityType: 'user',
      entityId: created.id,
      metadata: { email, username, role },
    })
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la création du compte :', error)
    return { ok: false, error: msg(locale, 'Unable to create the user.', 'Impossible de créer l’utilisateur.') }
  }
}

/**
 * Valide une demande d'accès (inscription publique) : le compte devient actif et
 * utilisable. Réservé à un ADMIN ; la cible doit être une demande non encore traitée
 * (`accountStatus = 'PENDING'`). Un ADMIN ne peut pas être créé par cette voie.
 */
export async function approveUserAccount(input: { userId: string; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const blocked = await requireAdmin(locale)
  if (blocked) return blocked

  const session = await getCurrentSession()
  const target = await prisma.user.findUnique({
    where: { id: input?.userId },
    select: { accountStatus: true, role: true },
  })
  if (!target) return { ok: false, error: msg(locale, 'User not found.', 'Utilisateur introuvable.') }
  if (target.accountStatus !== 'PENDING') {
    return {
      ok: false,
      error: msg(
        locale,
        'This access request was already processed.',
        'Cette demande d’accès a déjà été traitée.',
      ),
    }
  }
  try {
    await prisma.user.update({
      where: { id: input.userId },
      data: {
        accountStatus: 'APPROVED',
        isActive: true,
        approvedById: session?.uid ?? null,
        approvedAt: new Date(),
      },
    })
    await recordAudit({
      userId: session?.uid ?? null,
      action: AUDIT_ACTIONS.userAccessApproved,
      entityType: 'user',
      entityId: input.userId,
      metadata: { role: target.role },
    })
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la validation de la demande :', error)
    return { ok: false, error: msg(locale, 'Unable to approve this request.', 'Impossible de valider cette demande.') }
  }
}

/**
 * Refuse une demande d'accès (inscription publique). Le compte reste bloqué
 * (`accountStatus = 'REJECTED'`, inactif) : son titulaire ne peut pas se connecter.
 */
export async function rejectUserAccount(input: { userId: string; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const blocked = await requireAdmin(locale)
  if (blocked) return blocked

  const target = await prisma.user.findUnique({
    where: { id: input?.userId },
    select: { accountStatus: true },
  })
  if (!target) return { ok: false, error: msg(locale, 'User not found.', 'Utilisateur introuvable.') }
  if (target.accountStatus !== 'PENDING') {
    return {
      ok: false,
      error: msg(
        locale,
        'This access request was already processed.',
        'Cette demande d’accès a déjà été traitée.',
      ),
    }
  }
  const session = await getCurrentSession()
  try {
    await prisma.user.update({
      where: { id: input.userId },
      data: {
        accountStatus: 'REJECTED',
        isActive: false,
        approvedById: session?.uid ?? null,
        approvedAt: new Date(),
      },
    })
    await recordAudit({
      userId: session?.uid ?? null,
      action: AUDIT_ACTIONS.userAccessRejected,
      entityType: 'user',
      entityId: input.userId,
      metadata: { role: 'ANALYST' },
    })
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du refus de la demande :', error)
    return { ok: false, error: msg(locale, 'Unable to reject this request.', 'Impossible de refuser cette demande.') }
  }
}

/** Active / désactive un compte. Un administrateur ne peut pas se désactiver soi-même. */
export async function setUserActive(input: { userId: string; active: boolean; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const blocked = await requireAdmin(locale)
  if (blocked) return blocked

  const session = await getCurrentSession()
  if (session?.uid === input?.userId) {
    return { ok: false, error: msg(locale, 'You cannot modify your own account.', 'Vous ne pouvez pas modifier votre propre compte.') }
  }
  try {
    await prisma.user.update({
      where: { id: input.userId },
      data: { isActive: Boolean(input.active) },
    })
    await recordAudit({
      userId: session?.uid ?? null,
      action: input.active ? AUDIT_ACTIONS.userReactivated : AUDIT_ACTIONS.userDeactivated,
      entityType: 'user',
      entityId: input.userId,
      metadata: { active: Boolean(input.active) },
    })
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du changement de statut :', error)
    return { ok: false, error: msg(locale, 'Unable to update this account.', 'Impossible de mettre à jour ce compte.') }
  }
}

/** Change le rôle d'un compte. Un administrateur ne peut pas modifier son propre rôle. */
export async function setUserRole(input: { userId: string; role: UserAdminRole; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const blocked = await requireAdmin(locale)
  if (blocked) return blocked

  const role = input?.role
  if (role !== 'ADMIN' && role !== 'ANALYST' && role !== 'OBSERVER') {
    return { ok: false, error: msg(locale, 'Invalid role.', 'Rôle invalide.') }
  }
  const session = await getCurrentSession()
  if (session?.uid === input?.userId) {
    return { ok: false, error: msg(locale, 'You cannot modify your own account.', 'Vous ne pouvez pas modifier votre propre compte.') }
  }
  try {
    await prisma.user.update({ where: { id: input.userId }, data: { role: role as Role } })
    await recordAudit({
      userId: session?.uid ?? null,
      action: AUDIT_ACTIONS.userRoleChanged,
      entityType: 'user',
      entityId: input.userId,
      metadata: { role },
    })
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du changement de rôle :', error)
    return { ok: false, error: msg(locale, 'Unable to update this account.', 'Impossible de mettre à jour ce compte.') }
  }
}

/** Supprime un compte sans activité scientifique (sinon : désactivation conseillée). */
export async function deleteUserByAdmin(input: { userId: string; locale?: Locale }): Promise<ActionResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  const blocked = await requireAdmin(locale)
  if (blocked) return blocked

  const session = await getCurrentSession()
  if (session?.uid === input?.userId) {
    return { ok: false, error: msg(locale, 'You cannot delete your own account.', 'Vous ne pouvez pas supprimer votre propre compte.') }
  }
  try {
    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { _count: { select: { observations: true, ownedProjects: true } } },
    })
    if (!target) return { ok: false, error: msg(locale, 'User not found.', 'Utilisateur introuvable.') }
    if (target._count.observations > 0 || target._count.ownedProjects > 0) {
      return {
        ok: false,
        error: msg(
          locale,
          'This account holds observations or projects: deactivate it instead.',
          'Ce compte possède des observations ou projets : désactivez-le plutôt.',
        ),
      }
    }
    await prisma.user.delete({ where: { id: input.userId } })
    await recordAudit({
      userId: session?.uid ?? null,
      action: AUDIT_ACTIONS.userDeleted,
      entityType: 'user',
      entityId: input.userId,
    })
    revalidatePath('/admin/users')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la suppression du compte :', error)
    return { ok: false, error: msg(locale, 'Unable to delete this account.', 'Impossible de supprimer ce compte.') }
  }
}
