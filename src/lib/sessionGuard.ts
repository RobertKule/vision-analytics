/**
 * VÉRIFICATION DE SESSION CÔTÉ SERVEUR (module serveur uniquement).
 *
 * Applique le noyau pur `sessionCheck.ts` aux cookies réels et à la base :
 *  — cookie de session applicatif (`va_session`, signé) → actif / expiré / absent ;
 *  — portée observateur (`va_observer`) recoupée en base par `resolveObserverGate`
 *    (jeton présent, rattaché à CE projet, non révoqué, non expiré) ;
 *  — autorisation sur le projet/l'expérience visé.
 *
 * Chaque vérification est tracée (SESSION_CHECK_SUCCESS / SESSION_CHECK_FAILURE)
 * avec des identifiants internes uniquement : jamais le jeton brut, jamais le
 * cookie, jamais un secret.
 */
import 'server-only'
import { cookies } from 'next/headers'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { SESSION_COOKIE_NAME, inspectSessionToken, type Session } from '@/lib/session'
import { resolveObserverGate, readObserverScopeFromCookies } from '@/lib/observerAccess'
import {
  allowsWrite,
  classifySessionCheck,
  sessionCheckError,
  type ObserverScopeState,
  type SessionCheckOutcome,
  type SessionTokenState,
} from '@/lib/sessionCheck'
import { defaultLocale, type Locale } from '@/lib/i18n'

export type VerifiedSession = {
  outcome: SessionCheckOutcome
  /** Session applicative si elle est valide (null pour un accès par lien seul). */
  session: Session | null
  /** Observateur résolu par le lien d'accès (jamais celui revendiqué par le client). */
  observer: { userId: string; tokenId: string; runId: string; completed: boolean } | null
  /** Message final localisé si l'action doit être bloquée ('' si autorisée). */
  error: string
  /** Vrai si l'action d'écriture demandée est autorisée. */
  ok: boolean
}

/** Diagnostic du cookie de session applicatif (actif / expiré / absent). */
export async function inspectCurrentSession(): Promise<{
  state: SessionTokenState
  session: Session | null
}> {
  const store = await cookies()
  const inspected = await inspectSessionToken(store.get(SESSION_COOKIE_NAME)?.value)
  if (inspected.state === 'active') return { state: 'active', session: inspected.session }
  return { state: inspected.state, session: null }
}

/**
 * Vérifie la session avant une action nécessitant un projet (annotation, capture,
 * modification, soumission). `requireWrite` distingue une écriture d'une simple
 * consultation : une session d'observation TERMINÉE autorise la lecture seule.
 */
export async function verifySessionForProject(input: {
  projectId: string
  requireWrite?: boolean
  /** Autorisation métier déjà résolue (RBAC projet) ; non fournie ⇒ non contrainte. */
  authorized?: boolean
  locale?: Locale
  /** Étiquette de la surface vérifiée (audit) : 'capture', 'finalize', 'image'… */
  surface: string
}): Promise<VerifiedSession> {
  const locale: Locale = input.locale === 'en' ? 'en' : defaultLocale
  const projectId = (input.projectId ?? '').trim()

  const [{ state, session }, gate, scope] = await Promise.all([
    inspectCurrentSession(),
    projectId ? resolveObserverGate(projectId) : Promise.resolve({ ok: false as const }),
    readObserverScopeFromCookies(),
  ])

  const observerState: ObserverScopeState = gate.ok
    ? { present: true, valid: true, completed: gate.completed }
    : scope
      ? { present: true, valid: false }
      : { present: false }

  const outcome = classifySessionCheck({
    token: state,
    observer: observerState,
    authorized: input.authorized,
  })

  const writeAllowed = allowsWrite(outcome)
  const ok = input.requireWrite === false ? outcome !== 'missing' && outcome !== 'expired' : writeAllowed

  await recordAudit({
    userId: gate.ok ? gate.userId : (session?.uid ?? null),
    action: ok ? AUDIT_ACTIONS.sessionCheckSuccess : AUDIT_ACTIONS.sessionCheckFailure,
    entityType: 'session',
    entityId: projectId || undefined,
    metadata: {
      surface: input.surface,
      outcome,
      via: gate.ok ? 'observer-link' : session ? 'account' : 'none',
    },
  })

  return {
    outcome,
    session,
    observer: gate.ok
      ? {
          userId: gate.userId,
          tokenId: gate.tokenId,
          runId: gate.runId,
          completed: gate.completed,
        }
      : null,
    error: ok ? '' : sessionCheckError(outcome, locale),
    ok,
  }
}

/**
 * Vérification « compte connecté » sans projet (espaces analyste / admin) :
 * distingue explicitement une session absente d'une session expirée.
 */
export async function verifyAccountSession(input: {
  surface: string
  locale?: Locale
}): Promise<VerifiedSession> {
  const locale: Locale = input.locale === 'en' ? 'en' : defaultLocale
  const { state, session } = await inspectCurrentSession()
  const outcome = classifySessionCheck({ token: state })
  const ok = allowsWrite(outcome)

  await recordAudit({
    userId: session?.uid ?? null,
    action: ok ? AUDIT_ACTIONS.sessionCheckSuccess : AUDIT_ACTIONS.sessionCheckFailure,
    entityType: 'session',
    metadata: { surface: input.surface, outcome, via: session ? 'account' : 'none' },
  })

  return {
    outcome,
    session,
    observer: null,
    error: ok ? '' : sessionCheckError(outcome, locale),
    ok,
  }
}
