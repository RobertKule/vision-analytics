/**
 * Helpers d'authentification (côté serveur uniquement), multi-rôles :
 * ADMIN, ANALYST, OBSERVER.
 *
 * - Le compte ADMIN est piloté par l'environnement (ADMIN_EMAIL / ADMIN_PASSWORD)
 *   et provisionné automatiquement en BDD à la première connexion.
 * - Les comptes ANALYST / OBSERVER sont créés par inscription (registerUser) —
 *   jamais de rôle ADMIN via l'inscription publique.
 * - Cookie de session signé via src/lib/session.ts (unique pour tous les rôles).
 *
 * En production, ADMIN_EMAIL / ADMIN_PASSWORD / AUTH_SECRET doivent être renseignés.
 * En développement, des valeurs par défaut raisonnables sont utilisées.
 */

import { cookies } from 'next/headers'
import { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/passwords'
import {
  createSessionToken,
  parseSessionToken,
  SESSION_COOKIE_NAME,
  type Session,
  type SessionRole,
} from '@/lib/session'

export const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 h — doit correspondre à session.ts

const DEFAULT_ADMIN_EMAIL = 'admin@vision-analytics.app'
const DEFAULT_ADMIN_PASSWORD = 'VisionAnalytics#2026'

type AdminCredentials = { email: string; password: string }

const ROLE_TO_SESSION: Record<Role, SessionRole> = {
  [Role.ADMIN]: 'ADMIN',
  [Role.ANALYST]: 'ANALYST',
  [Role.OBSERVER]: 'OBSERVER',
}

/** Rôles ouverts à l'inscription publique (ADMIN est réservé à l'environnement). */
export type RegisterableRole = 'ANALYST' | 'OBSERVER'

// ——— Compte ADMIN piloté par l'environnement ———

/** Récupère les identifiants admin configurés, ou des valeurs par défaut en développement. */
function resolveAdminCredentials(): AdminCredentials | null {
  const email = (process.env.ADMIN_EMAIL ?? '').trim()
  const password = process.env.ADMIN_PASSWORD ?? ''

  if (email && password) return { email, password }

  if (process.env.NODE_ENV !== 'production') {
    return { email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD }
  }
  return null
}

/** Vérifie un couple email / mot de passe saisi contre la configuration. */
export async function validateAdminCredentials(
  email: string,
  password: string,
): Promise<boolean> {
  const creds = resolveAdminCredentials()
  if (!creds) return false
  return email.trim().toLowerCase() === creds.email.toLowerCase() && password === creds.password
}

/** Retrouve (ou crée) le compte administrateur en BDD à partir des identifiants configurés. */
export async function getOrCreateAdminUser(): Promise<{ id: string; email: string } | null> {
  const creds = resolveAdminCredentials()
  if (!creds) return null

  const email = creds.email.toLowerCase()

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== Role.ADMIN) {
      await prisma.user.update({ where: { id: existing.id }, data: { role: Role.ADMIN } })
    }
    // Maintient le hachage synchronisé avec l'environnement (rotation de mot de passe).
    const passwordOk = await verifyPassword(creds.password, existing.password).catch(
      () => false,
    )
    if (!passwordOk) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { password: await hashPassword(creds.password) },
      })
    }
    return { id: existing.id, email }
  }

  const created = await prisma.user.create({
    data: {
      email,
      password: await hashPassword(creds.password),
      role: Role.ADMIN,
    },
  })
  return { id: created.id, email }
}

// ——— Cookies de session ———

async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

/** Ouvre une session pour n'importe quel compte (ADMIN / ANALYST / OBSERVER). */
export async function openSessionForUser(user: {
  id: string
  email: string
  username: string | null
  role: Role
}): Promise<Session> {
  const session: Session = {
    uid: user.id,
    email: user.email,
    username: user.username,
    role: ROLE_TO_SESSION[user.role],
  }
  const token = await createSessionToken(session)
  await setSessionCookie(token)
  return session
}

/** Ouvre une session administrateur (crée le compte si nécessaire). */
export async function openAdminSession(): Promise<Session | null> {
  const admin = await getOrCreateAdminUser()
  if (!admin) return null
  return openSessionForUser({ id: admin.id, email: admin.email, username: null, role: Role.ADMIN })
}

/** Clôture la session en supprimant le cookie. */
export async function closeAdminSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE_NAME)
}

// ——— Lecture de session ———

/** Lit la session courante à partir du cookie signé. Retourne null si non connecté. */
export async function getCurrentSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE_NAME)?.value
  return parseSessionToken(token)
}

/** Alias rétro-compatible (helpers « admin » existants). */
export async function getCurrentAdmin(): Promise<Session | null> {
  return getCurrentSession()
}

// ——— Inscription publique (ANALYST / OBSERVER) ———

export type RegisterResult =
  | { ok: true; session: Session }
  | {
      ok: false
      code: 'invalid_email' | 'invalid_username' | 'weak_password' | 'email_taken' | 'username_taken' | 'invalid_role'
    }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Inscrit un compte ANALYST ou OBSERVER et ouvre immédiatement sa session. */
export async function registerUser(input: {
  username: string
  email: string
  password: string
  role: RegisterableRole
}): Promise<RegisterResult> {
  const email = normalizeEmail(input?.email ?? '')
  const username = (input?.username ?? '').trim()
  const password = typeof input?.password === 'string' ? input.password : ''
  const role = input?.role

  if (role !== 'ANALYST' && role !== 'OBSERVER') {
    return { ok: false, code: 'invalid_role' }
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, code: 'invalid_email' }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, code: 'invalid_username' }
  }
  if (password.length < 8) {
    return { ok: false, code: 'weak_password' }
  }

  const [emailOwner, usernameOwner] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    }),
  ])

  if (emailOwner) return { ok: false, code: 'email_taken' }
  if (usernameOwner) return { ok: false, code: 'username_taken' }

  try {
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: await hashPassword(password),
        role: role === 'ANALYST' ? Role.ANALYST : Role.OBSERVER,
      },
    })
    const session = await openSessionForUser({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    })
    return { ok: true, session }
  } catch (error) {
    console.error('Erreur lors de l’inscription :', error)
    return { ok: false, code: 'email_taken' }
  }
}

// ——— Connexion par identifiant (email OU username) + mot de passe ———

export type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; code: 'invalid_credentials' | 'account_inactive' }

/** Connecte un compte par email ou username. Le compte ADMIN de l'environnement est aussi accepté. */
export async function authenticateUser(input: {
  identifier: string
  password: string
}): Promise<LoginResult> {
  const identifier = (input?.identifier ?? '').trim()
  const password = typeof input?.password === 'string' ? input.password : ''
  if (!identifier || !password) {
    return { ok: false, code: 'invalid_credentials' }
  }

  const lower = identifier.toLowerCase()
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: lower },
        { username: { equals: identifier, mode: 'insensitive' } },
      ],
    },
  })

  // Compte ADMIN piloté par l'environnement : provisionné si absent, mot de passe synchronisé.
  if (!user && (await validateAdminCredentials(lower, password))) {
    const admin = await getOrCreateAdminUser()
    if (admin) {
      const session = await openSessionForUser({
        id: admin.id,
        email: admin.email,
        username: null,
        role: Role.ADMIN,
      })
      return { ok: true, session }
    }
    return { ok: false, code: 'invalid_credentials' }
  }

  if (!user) return { ok: false, code: 'invalid_credentials' }
  if (!user.isActive) return { ok: false, code: 'account_inactive' }

  const passwordOk = await verifyPassword(password, user.password).catch(() => false)
  if (!passwordOk) return { ok: false, code: 'invalid_credentials' }

  const session = await openSessionForUser({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  })
  return { ok: true, session }
}
