import type { Locale } from '@/lib/i18n'

/**
 * Normalise une exception remontée depuis un appel de Server Action / fetch côté
 * client en un message lisible, localisé, distinct par classe de panne.
 *
 * Une Server Action ne lève presque jamais hors de son `return` : les erreurs
 * métier remontent déjà sous forme `{ ok: false, error }`. Un lancer ici trahit
 * donc un échec de TRANSPORT (réseau, serveur redémarré/redéployé, proxy, délai,
 * taille de corps HTTP…). On convertit alors le rejet en un message explicite au
 * lieu de laisser une « Failed to fetch » non gérée dans la console.
 *
 * À utiliser UNIQUEMENT dans le `catch` d'un appel action/fetch.
 */
export function friendlyActionError(error: unknown, locale: Locale): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const low = raw.toLowerCase()

  if (/(tim(e|ed)? ?out|aborted|abort)/.test(low)) {
    return locale === 'fr'
      ? 'Le serveur met trop de temps à répondre. Réessayez dans un instant.'
      : 'The server took too long to respond. Please try again shortly.'
  }
  if (/(failed to fetch|fetch failed|load failed|networkerror|network request failed|connection|quota)/.test(low)) {
    return locale === 'fr'
      ? 'Serveur injoignable. Vérifiez votre connexion puis réessayez — vos saisies sont conservées.'
      : 'The server is unreachable. Check your connection and try again — your input is kept.'
  }
  if (/4\d\d|5\d\d|response/.test(low)) {
    return locale === 'fr'
      ? 'Le serveur a renvoyé une erreur. Rechargez la page puis réessayez.'
      : 'The server returned an error. Reload the page and try again.'
  }

  return locale === 'fr'
    ? 'Une erreur inattendue est survenue. Réessayez.'
    : 'An unexpected error occurred. Please try again.'
}
