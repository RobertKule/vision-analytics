/**
 * Helpers d'authentification administrateur (côté serveur uniquement).
 * - Identifiants administrateur pilotés par l'environnement (ADMIN_EMAIL / ADMIN_PASSWORD).
 * - Compte `User` (role ADMIN) provisionné automatiquement dans la BDD à la première connexion.
 * - Cookie de session signé via src/lib/session.ts.
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
  type AdminSession,
} from '@/lib/session'

export const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 h — doit correspondre à session.ts

const DEFAULT_ADMIN_EMAIL = 'admin@vision-analytics.app'
const DEFAULT_ADMIN_PASSWORD = 'VisionAnalytics#2026'

type AdminCredentials = { email: string; password: string }

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

/** Ouvre une session administrateur (crée le compte si nécessaire). */
export async function openAdminSession(): Promise<AdminSession | null> {
  const admin = await getOrCreateAdminUser()
  if (!admin) return null
  const token = await createSessionToken({ uid: admin.id, email: admin.email, role: 'ADMIN' })
  await setSessionCookie(token)
  return { uid: admin.id, email: admin.email, role: 'ADMIN' }
}

/** Clôture la session en supprimant le cookie. */
export async function closeAdminSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE_NAME)
}

/** Lit la session courante à partir du cookie signé. Retourne null si non connecté. */
export async function getCurrentAdmin(): Promise<AdminSession | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE_NAME)?.value
  return parseSessionToken(token)
}
