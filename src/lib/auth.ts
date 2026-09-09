/**
 * Helpers d'authentification (côté serveur uniquement), multi-rôles :
 * ADMIN, ANALYST, OBSERVER.
 *
 * — Tous les comptes, administrateurs inclus, vivent en base de données
 *   (PostgreSQL / Prisma). Aucun identifiant ne provient de l'environnement :
 *   les variables ADMIN_EMAIL / ADMIN_PASSWORD ont été supprimées du projet.
 * — Le compte administrateur initial d'un environnement neuf est provisionné
 *   par le seed (`prisma/seed.ts`) à partir de SEED_ADMIN_EMAIL /
 *   SEED_ADMIN_PASSWORD (stratégie de bootstrap, optionnelle et idempotente),
 *   puis géré comme n'importe quel utilisateur de la base.
 * — L'inscription publique ne crée QUE des demandes de compte ANALYST (en attente
 *   de validation ADMIN). Les comptes OBSERVER sont créés par un ADMIN (users
 *   management) ou via le mécanisme d'accès par jeton projet ; ADMIN jamais par
 *   l'inscription publique.
 * — Cookie de session signé via src/lib/session.ts (unique pour tous les rôles).
 *
 * En production, AUTH_SECRET (clé de signature des sessions) est obligatoire.
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

const ROLE_TO_SESSION: Record<Role, SessionRole> = {
  [Role.ADMIN]: 'ADMIN',
  [Role.ANALYST]: 'ANALYST',
  [Role.OBSERVER]: 'OBSERVER',
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

/** Clôture la session en supprimant le cookie. */
export async function closeSession(): Promise<void> {
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

/**
 * Session dont le rôle est réellement ADMIN.
 *
 * Les opérations d'administration (création / édition / archivage / restauration /
 * suppression de projet, gestion des vidéos et benchmarks) doivent être gardées par
 * `requireAdmin()` et non par `getCurrentSession()` : une simple connexion (OBSERVER
 * ou ANALYST) ne doit jamais pouvoir exécuter une mutation d'administration en
 * devinant l'URL d'une Server Action (cf. mission « protection côté serveur »).
 */
export async function getCurrentAdmin(): Promise<Session | null> {
  const session = await getCurrentSession()
  return session?.role === 'ADMIN' ? session : null
}

// ——— Inscription publique (ANALYST uniquement, validée par un ADMIN) ———

export type RegisterResult =
  | { ok: true; userId: string; email: string }
  | {
      ok: false
      code:
        | 'invalid_email'
        | 'invalid_username'
        | 'weak_password'
        | 'email_taken'
        | 'username_taken'
    }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Dépose une DEMANDE de compte ANALYST (rôle unique de l'inscription publique).
 *
 * Le compte est créé inactif (`isActive = false`) en attente de validation
 * (`accountStatus = 'PENDING'`) et AUCUNE session n'est ouverte : un ADMIN doit
 * l'approuver (voir `approveUserAccount`) avant la première connexion. Les rôles
 * OBSERVER et ADMIN ne sont jamais créés par l'inscription publique — OBSERVER
 * provient d'un ADMIN ou du mécanisme d'accès par jeton projet.
 */
export async function registerUser(input: {
  username: string
  email: string
  password: string
}): Promise<RegisterResult> {
  const email = normalizeEmail(input?.email ?? '')
  const username = (input?.username ?? '').trim()
  const password = typeof input?.password === 'string' ? input.password : ''

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
        role: Role.ANALYST,
        isActive: false,
        accountStatus: 'PENDING',
      },
    })
    return { ok: true, userId: user.id, email: user.email }
  } catch (error) {
    console.error('Erreur lors de l’inscription :', error)
    return { ok: false, code: 'email_taken' }
  }
}

// ——— Connexion par identifiant (email OU username) + mot de passe ———

export type LoginResult =
  | { ok: true; session: Session }
  | {
      ok: false
      code:
        | 'invalid_credentials'
        | 'account_inactive' // Désactivé par un ADMIN (compte approuvé)
        | 'account_pending' // Inscription publique en attente de validation ADMIN
        | 'account_rejected' // Demande d'accès refusée par un ADMIN
    }

/**
 * Connecte un compte par email ou username en recherchant UNIQUEMENT l'utilisateur
 * en base de données (PostgreSQL / Prisma), puis en vérifiant son hachage de mot
 * de passe (scrypt) et son état (actif). Aucune dépendance aux variables
 * d'environnement ADMIN_EMAIL / ADMIN_PASSWORD : les administrateurs sont des
 * comptes comme les autres, gérés depuis la base.
 */
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

  if (!user) return { ok: false, code: 'invalid_credentials' }

  // Vérification du mot de passe AVANT toute révélation d'état : un compte inexistant
  // ou un mot de passe erroné retournent le même code (pas d'énumération de comptes).
  const passwordOk = await verifyPassword(password, user.password).catch(() => false)
  if (!passwordOk) return { ok: false, code: 'invalid_credentials' }

  // État de la demande d'accès (inscription publique → validation ADMIN).
  if (user.accountStatus === 'PENDING') return { ok: false, code: 'account_pending' }
  if (user.accountStatus === 'REJECTED') return { ok: false, code: 'account_rejected' }
  if (!user.isActive) return { ok: false, code: 'account_inactive' }

  const session = await openSessionForUser({
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  })
  return { ok: true, session }
}
