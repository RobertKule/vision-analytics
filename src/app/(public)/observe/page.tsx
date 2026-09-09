import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AccessGate from '@/components/observer/AccessGate'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import {
  clearObserverScopeCookie,
  readObserverScopeFromCookies,
  resolveObserverGate,
} from '@/lib/observerAccess'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'Observation sessions' : 'Sessions d’observation',
    description:
      locale === 'en'
        ? 'Access a scientific observation session through your personal invitation link.'
        : 'Accédez à une session d’observation scientifique via votre lien d’accès personnel.',
  }
}

/**
 * Porte d'entrée des sessions d'observation.
 *
 * L'observation ne se choisit plus dans une liste publique : elle se rejoint par un
 * lien d'accès personnel (`/share/<JETON>`). Cette page ne fait donc que rediriger
 * vers le projet lié au jeton déjà ouvert dans ce navigateur, ou — sans jeton valide —
 * affiche le panneau « accès par invitation ».
 */
export default async function ObservePage() {
  // Les sessions connectées observent depuis la coquille applicative `/experience`.
  if (await getCurrentSession()) {
    redirect('/experience')
  }

  const locale = await getLocale()
  const d = getDictionary(locale)
  const share = d.shareAccess

  // Cookie de portée présent ? On vérifie SA validité en base (source de vérité) pour
  // éviter toute boucle de redirection avec un jeton révoqué/expiré/supprimé.
  const scope = await readObserverScopeFromCookies()
  if (scope) {
    const gate = await resolveObserverGate(scope.projectId)
    if (gate.ok) {
      redirect(`/observe/${scope.projectId}`)
    }
    // Jeton mort : on nettoie la portée locale, puis panneau d'invitation.
    await clearObserverScopeCookie()
  }

  return (
    <AccessGate
      text={{
        title: share.inviteOnlyTitle,
        body: share.inviteOnlyBody,
        contactHint: share.contactHint,
        ctaHome: share.ctaHome,
        ctaDocs: share.ctaDocs,
      }}
    />
  )
}
