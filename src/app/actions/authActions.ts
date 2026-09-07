'use server'

import {
  closeAdminSession,
  getCurrentAdmin,
  openAdminSession,
  validateAdminCredentials,
} from '@/lib/auth'

export type AuthResult = { ok: true; email: string } | { ok: false; error: string }
export type SessionInfo = { email: string } | null

function isDemoLoginAllowed(): boolean {
  if (process.env.ALLOW_DEMO_LOGIN === 'true') return true
  return process.env.NODE_ENV !== 'production'
}

/**
 * Indique si la connexion « Démo Admin » en 1 clic est disponible
 * (permis de masquer le bouton en production).
 */
export async function isDemoLoginAvailable(): Promise<boolean> {
  return isDemoLoginAllowed()
}

/** Expose la session courante au Navbar (mode visiteur / administrateur). */
export async function getSessionInfo(): Promise<SessionInfo> {
  const session = await getCurrentAdmin()
  return session ? { email: session.email } : null
}

/** Connexion administrateur par email / mot de passe. */
export async function loginAdmin(input: {
  email: string
  password: string
}): Promise<AuthResult> {
  const email = (input?.email ?? '').trim()
  const password = typeof input?.password === 'string' ? input.password : ''

  if (!email || !password) {
    return { ok: false, error: 'Veuillez renseigner votre email et votre mot de passe.' }
  }

  const valid = await validateAdminCredentials(email, password)
  if (!valid) {
    return { ok: false, error: 'Identifiants invalides. Accès refusé.' }
  }

  const session = await openAdminSession()
  if (!session) {
    return {
      ok: false,
      error:
        'Compte administrateur indisponible. Vérifiez ADMIN_EMAIL et ADMIN_PASSWORD dans l’environnement.',
    }
  }
  return { ok: true, email: session.email }
}

/** Connexion « Démo Admin » en 1 clic (recette). Désactivée en production sauf ALLOW_DEMO_LOGIN. */
export async function loginDemo(): Promise<AuthResult> {
  if (!isDemoLoginAllowed()) {
    return { ok: false, error: 'La connexion de démonstration est désactivée en production.' }
  }

  const session = await openAdminSession()
  if (!session) {
    return {
      ok: false,
      error:
        'Compte administrateur indisponible. Vérifiez ADMIN_EMAIL et ADMIN_PASSWORD dans l’environnement.',
    }
  }
  return { ok: true, email: session.email }
}

/** Déconnexion : supprime le cookie de session. */
export async function logout(): Promise<{ ok: true }> {
  await closeAdminSession()
  return { ok: true }
}
