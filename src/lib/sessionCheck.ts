/**
 * VÉRIFICATION DE SESSION — noyau PUR (aucune I/O, testable).
 *
 * Toute fonctionnalité nécessitant une session (annotation, capture, modification,
 * soumission) doit vérifier cette session CÔTÉ SERVEUR avant d'agir. Ce module
 * décide de l'issue et fournit le vocabulaire exact affiché à l'utilisateur ;
 * `sessionGuard.ts` l'applique en lisant les cookies et la base.
 *
 * Vocabulaire imposé :
 *   — aucune session valide : « Votre session n'est pas active. »
 *                             « Vérifiez votre session avant de commencer. »
 *   — session expirée      : « Votre session a expiré. »
 *                             « Veuillez vérifier votre session avant de continuer. »
 *
 * Aucun détail technique n'est jamais exposé (jeton, cookie, cause interne).
 */

import type { Locale } from '@/lib/i18n'

/** Issue de la vérification de session. */
export type SessionCheckOutcome =
  /** Session valide, écriture autorisée. */
  | 'active'
  /** Aucune session (cookie absent, jeton illisible, jeton révoqué / inconnu). */
  | 'missing'
  /** Session dont la durée de validité est dépassée. */
  | 'expired'
  /** Session valide mais sans droit sur le projet / l'expérience visé. */
  | 'unauthorized'
  /** Session d'observation terminée : consultation seule, écritures refusées. */
  | 'finished'

export type SessionCheckMessage = {
  /** Phrase principale. */
  title: string
  /** Consigne d'action. */
  hint: string
}

const MESSAGES: Record<Locale, Record<Exclude<SessionCheckOutcome, 'active'>, SessionCheckMessage>> = {
  fr: {
    missing: {
      title: 'Votre session n’est pas active.',
      hint: 'Vérifiez votre session avant de commencer.',
    },
    expired: {
      title: 'Votre session a expiré.',
      hint: 'Veuillez vérifier votre session avant de continuer.',
    },
    unauthorized: {
      title: 'Votre session n’est pas active.',
      hint: 'Vérifiez votre session avant de commencer.',
    },
    finished: {
      title: 'Cette session d’observation est terminée.',
      hint: 'Le projet est désormais en lecture seule.',
    },
  },
  en: {
    missing: {
      title: 'Your session is not active.',
      hint: 'Check your session before you start.',
    },
    expired: {
      title: 'Your session has expired.',
      hint: 'Please check your session before continuing.',
    },
    unauthorized: {
      title: 'Your session is not active.',
      hint: 'Check your session before you start.',
    },
    finished: {
      title: 'This observation session is finished.',
      hint: 'The project is now read-only.',
    },
  },
}

/** Message affichable d'une issue de vérification (jamais de détail technique). */
export function sessionCheckMessage(
  outcome: SessionCheckOutcome,
  locale: Locale = 'fr',
): SessionCheckMessage {
  const dictionary = MESSAGES[locale === 'en' ? 'en' : 'fr']
  if (outcome === 'active') return { title: '', hint: '' }
  return dictionary[outcome]
}

/** Une seule phrase (messages d'erreur des Server Actions). */
export function sessionCheckError(
  outcome: SessionCheckOutcome,
  locale: Locale = 'fr',
): string {
  const message = sessionCheckMessage(outcome, locale)
  return message.title ? `${message.title} ${message.hint}` : ''
}

/** État d'un jeton de session tel que diagnostiqué par `session.ts`. */
export type SessionTokenState = 'active' | 'missing' | 'expired'

/** État d'une portée observateur (lien d'accès) tel que relu en base. */
export type ObserverScopeState =
  | { present: false }
  | { present: true; valid: false }
  | { present: true; valid: true; completed: boolean }

export type SessionCheckInput = {
  /** Diagnostic du cookie de session applicatif. */
  token: SessionTokenState
  /** Portée observateur éventuelle (lien `/share`). */
  observer?: ObserverScopeState
  /**
   * Vrai si l'acteur a bien le droit demandé sur la ressource visée (projet /
   * expérience). Non fourni ⇒ non contraint (vérification de session seule).
   */
  authorized?: boolean
}

/**
 * Décide de l'issue de la vérification, dans cet ordre :
 *  1. une portée observateur VALIDE prime (le lien est l'autorisation) — terminée ⇒
 *     lecture seule ;
 *  2. une portée observateur présente mais invalide (jeton révoqué, expiré, autre
 *     projet) est un refus ;
 *  3. sinon le cookie de session applicatif : expiré ⇒ 'expired', absent ⇒ 'missing' ;
 *  4. enfin l'autorisation sur la ressource.
 */
export function classifySessionCheck(input: SessionCheckInput): SessionCheckOutcome {
  const observer = input.observer ?? { present: false }

  if (observer.present && observer.valid) {
    if (observer.completed) return 'finished'
    if (input.authorized === false) return 'unauthorized'
    return 'active'
  }

  if (observer.present && !observer.valid && input.token !== 'active') {
    return 'missing'
  }

  if (input.token === 'expired') return 'expired'
  if (input.token === 'missing') return 'missing'
  if (input.authorized === false) return 'unauthorized'
  return 'active'
}

/** Vrai si l'issue autorise une écriture (capture, modification, soumission). */
export function allowsWrite(outcome: SessionCheckOutcome): boolean {
  return outcome === 'active'
}

/** Vrai si l'issue autorise au moins la consultation (lecture seule incluse). */
export function allowsRead(outcome: SessionCheckOutcome): boolean {
  return outcome === 'active' || outcome === 'finished'
}
