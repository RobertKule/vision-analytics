'use server'

import {
  authenticateUser,
  closeAdminSession,
  getCurrentSession,
  registerUser,
  type RegisterableRole,
} from '@/lib/auth'
import type { SessionRole } from '@/lib/session'
import type { Locale } from '@/lib/i18n'

export type AuthResult =
  | { ok: true; email: string; username: string | null; role: SessionRole }
  | { ok: false; error: string }

export type SessionInfo = {
  email: string
  username: string | null
  role: SessionRole
} | null

/** Messages d'erreur localisés (EN / FR) selon la langue de l'interface. */
function loginMessages(locale: Locale, code: 'invalid_credentials' | 'account_inactive') {
  const en =
    code === 'invalid_credentials'
      ? 'Invalid email / username or password.'
      : 'This account has been deactivated. Please contact an administrator.'
  const fr =
    code === 'invalid_credentials'
      ? 'Email / nom d’utilisateur ou mot de passe invalide.'
      : 'Ce compte a été désactivé. Contactez un administrateur.'
  return locale === 'fr' ? fr : en
}

/** Expose la session courante au Navbar (mode visiteur / connecté). */
export async function getSessionInfo(): Promise<SessionInfo> {
  const session = await getCurrentSession()
  return session
    ? { email: session.email, username: session.username, role: session.role }
    : null
}

/** Connexion multi-rôles par email OU username + mot de passe. */
export async function login(input: {
  identifier: string
  password: string
  locale?: Locale
}): Promise<AuthResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : 'en'
  if (!input?.identifier?.trim() || !input?.password) {
    return { ok: false, error: loginMessages(locale, 'invalid_credentials') }
  }

  const result = await authenticateUser({ identifier: input.identifier, password: input.password })
  if (!result.ok) {
    return { ok: false, error: loginMessages(locale, result.code) }
  }
  return {
    ok: true,
    email: result.session.email,
    username: result.session.username,
    role: result.session.role,
  }
}

/** Inscription publique (ANALYST / OBSERVER) — ouvre la session immédiatement. */
export async function register(input: {
  username: string
  email: string
  password: string
  role: RegisterableRole
  locale?: Locale
}): Promise<AuthResult> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : 'en'
  const result = await registerUser({
    username: input?.username ?? '',
    email: input?.email ?? '',
    password: input?.password ?? '',
    role: input?.role ?? 'OBSERVER',
  })

  if (result.ok) {
    return {
      ok: true,
      email: result.session.email,
      username: result.session.username,
      role: result.session.role,
    }
  }

  /** Union des codes d'erreur retournés par registerUser (dérivée, sans dérive possible). */
  type RegisterErrorCode = Extract<Awaited<ReturnType<typeof registerUser>>, { ok: false }>['code']
  const messages: Record<RegisterErrorCode, [string, string]> = {
    invalid_email: ['Enter a valid email address.', 'Renseignez une adresse email valide.'],
    invalid_username: [
      'Username must be 3–24 characters (letters, digits, “_”, “-”, “.”).',
      'Le nom d’utilisateur doit faire 3 à 24 caractères (lettres, chiffres, « _ », « - », « . »).',
    ],
    weak_password: [
      'Password must be at least 8 characters.',
      'Le mot de passe doit contenir au moins 8 caractères.',
    ],
    email_taken: [
      'This email address is already registered.',
      'Cette adresse email est déjà utilisée.',
    ],
    username_taken: [
      'This username is already taken.',
      'Ce nom d’utilisateur est déjà pris.',
    ],
    invalid_role: [
      'This role cannot be created through registration.',
      'Ce rôle ne peut pas être créé par inscription.',
    ],
  }
  const [en, fr] = messages[result.code]
  return { ok: false, error: locale === 'fr' ? fr : en }
}

/** Connexion administrateur par email / mot de passe (compte de l'environnement). */
export async function loginAdmin(input: { email: string; password: string }): Promise<AuthResult> {
  const email = (input?.email ?? '').trim()
  if (!email || !input?.password) {
    return { ok: false, error: 'Veuillez renseigner votre email et votre mot de passe.' }
  }
  const result = await authenticateUser({ identifier: email, password: input.password })
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.code === 'account_inactive'
          ? 'Ce compte a été désactivé. Contactez un administrateur.'
          : 'Identifiants invalides. Accès refusé.',
    }
  }
  return {
    ok: true,
    email: result.session.email,
    username: result.session.username,
    role: result.session.role,
  }
}

/** Déconnexion : supprime le cookie de session. */
export async function logout(): Promise<{ ok: true }> {
  await closeAdminSession()
  return { ok: true }
}
