import type { SessionRole } from '@/lib/session'

/**
 * Routage d'accueil par rôle — après connexion/inscription, chaque profil arrive
 * sur son espace de travail.
 */
export function homeForRole(role: SessionRole): string {
  if (role === 'ADMIN') return '/admin/projects'
  if (role === 'ANALYST') return '/analyst/projects'
  return '/dashboard'
}

/** Destinations internes autorisées pour la redirection post-connexion (anti open-redirect). */
const SAFE_INTERNAL_PREFIXES = ['/admin', '/analyst', '/dashboard', '/observe', '/register']

export function resolvePostLoginRedirect(from: string | null, fallback: string): string {
  if (
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    SAFE_INTERNAL_PREFIXES.some((prefix) => from === prefix || from.startsWith(`${prefix}/`))
  ) {
    return from
  }
  return fallback
}
