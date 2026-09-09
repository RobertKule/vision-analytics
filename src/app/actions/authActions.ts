'use server'

import {
  authenticateUser,
  closeSession,
  getCurrentSession,
  registerUser,
  type RegisterableRole,
} from '@/lib/auth'
import type { SessionRole } from '@/lib/session'
import type { Locale } from '@/lib/i18n'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

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
    await recordAudit({
      userId: null,
      action: AUDIT_ACTIONS.loginFailure,
      entityType: 'auth',
      metadata: { identifier: input.identifier.trim(), code: result.code, method: 'standard' },
    })
    return { ok: false, error: loginMessages(locale, result.code) }
  }
  await recordAudit({
    userId: result.session.uid,
    action: AUDIT_ACTIONS.loginSuccess,
    entityType: 'auth',
    entityId: result.session.uid,
    metadata: { role: result.session.role, method: 'standard' },
  })
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
    await recordAudit({
      userId: result.session.uid,
      action: AUDIT_ACTIONS.userCreated,
      entityType: 'user',
      entityId: result.session.uid,
      metadata: { role: result.session.role, source: 'self-registration' },
    })
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

/**
 * Connexion administrateur par email / mot de passe (compte géré en base de données).
 *
 * Exige un rôle réellement ADMIN : si le compte authentifié est ANALYST ou OBSERVER,
 * la session ouverte par `authenticateUser` est immédiatement révoquée et l'accès
 * refusé — un non-administrateur ne doit jamais pénétrer la zone /admin, même en
 * passant par l'URL de cette Server Action.
 */
export async function loginAdmin(input: { email: string; password: string }): Promise<AuthResult> {
  const email = (input?.email ?? '').trim()
  if (!email || !input?.password) {
    return { ok: false, error: 'Veuillez renseigner votre email et votre mot de passe.' }
  }
  const result = await authenticateUser({ identifier: email, password: input.password })
  if (!result.ok) {
    await recordAudit({
      userId: null,
      action: AUDIT_ACTIONS.loginFailure,
      entityType: 'auth',
      metadata: { identifier: email, code: result.code, method: 'admin' },
    })
    return {
      ok: false,
      error:
        result.code === 'account_inactive'
          ? 'Ce compte a été désactivé. Contactez un administrateur.'
          : 'Identifiants invalides. Accès refusé.',
    }
  }
  if (result.session.role !== 'ADMIN') {
    await closeSession()
    await recordAudit({
      userId: result.session.uid,
      action: AUDIT_ACTIONS.loginFailure,
      entityType: 'auth',
      entityId: result.session.uid,
      metadata: { identifier: email, code: 'not_admin', method: 'admin' },
    })
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  await recordAudit({
    userId: result.session.uid,
    action: AUDIT_ACTIONS.loginSuccess,
    entityType: 'auth',
    entityId: result.session.uid,
    metadata: { role: result.session.role, method: 'admin' },
  })
  return {
    ok: true,
    email: result.session.email,
    username: result.session.username,
    role: result.session.role,
  }
}

/** Déconnexion : journalise puis supprime le cookie de session. */
export async function logout(): Promise<{ ok: true }> {
  const session = await getCurrentSession()
  await recordAudit({
    userId: session?.uid ?? null,
    action: AUDIT_ACTIONS.logout,
    entityType: 'auth',
    ...(session ? { entityId: session.uid } : {}),
  })
  await closeSession()
  return { ok: true }
}
