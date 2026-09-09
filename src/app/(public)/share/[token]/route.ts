import { NextResponse } from 'next/server'
import { openObserverAccess } from '@/lib/observerAccess'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

/**
 * Ouverture d'un lien d'accès observateur : `/share/<JETON>`.
 *
 * — Le jeton brut n'est jamais exposé au client : seule l'ouverture passe ici.
 *   `openObserverAccess` contrôle l'empreinte SHA-256 en base, l'état du jeton
 *   (ACTIVE / COMPLETED / REVOKED / EXPIRED / projet clôturé), résout/crée
 *   l'observateur lié, émet la session logique et pose le cookie de portée
 *   signé `va_observer` (HttpOnly) avant la redirection.
 * — ACTIVE  → l'observateur arrive sur le projet (session de saisie).
 *   RESUMED → reprise d'une session déjà ouverte (même runId), navigateur d'origine.
 *   READONLY → le jeton est COMPLETED : le propriétaire (navigateur d'origine) revoit
 *     ses captures certifiées en lecture seule.
 * — Un lien déjà rattaché à un observateur et rouvert depuis un AUTRE navigateur est
 *   refusé (`USED` → « lien déjà utilisé ») : une autre personne ne rejoint ni la
 *   session en cours, ni la consultation d'une session soumise.
 * — Toute autre issue (lien inconnu, révoqué, expiré) mène à une page d'erreur
 *   explicite, sans jamais révéler le jeton ni créer de session.
 */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const { token } = await context.params
  const result = await openObserverAccess(token)

  if (result.kind === 'open' || result.kind === 'resumed' || result.kind === 'readonly') {
    return NextResponse.redirect(
      new URL(`/observe/${result.project.id}`, request.url),
      303,
    )
  }

  const reason = result.kind // 'used' | 'invalid' | 'revoked' | 'expired'
  return NextResponse.redirect(
    new URL(`/share/invalid?reason=${reason}`, request.url),
    303,
  )
}
