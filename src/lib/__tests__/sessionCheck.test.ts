import { describe, expect, it } from 'vitest'
import {
  allowsRead,
  allowsWrite,
  classifySessionCheck,
  sessionCheckError,
  sessionCheckMessage,
  type SessionCheckInput,
} from '@/lib/sessionCheck'

/**
 * PARTIE L — VÉRIFICATION DE SESSION (noyau PUR).
 *
 * Vocabulaire imposé :
 *   aucune session : « Votre session n'est pas active. »
 *                    « Vérifiez votre session avant de commencer. »
 *   session expirée : « Votre session a expiré. »
 *                     « Veuillez vérifier votre session avant de continuer. »
 *
 * Aucun détail technique (jeton, cookie, cause interne) ne doit fuiter.
 */

function check(partial: Partial<SessionCheckInput>): SessionCheckInput {
  return { token: 'active', ...partial }
}

describe('L1 — session valide', () => {
  it('un compte connecté autorisé passe la vérification', () => {
    const outcome = classifySessionCheck(check({ token: 'active', authorized: true }))
    expect(outcome).toBe('active')
    expect(allowsWrite(outcome)).toBe(true)
    expect(sessionCheckError(outcome, 'fr')).toBe('')
  })
})

describe('L2 — session absente', () => {
  it('bloque l’action et affiche le message « session pas active »', () => {
    const outcome = classifySessionCheck(check({ token: 'missing' }))
    expect(outcome).toBe('missing')
    expect(allowsWrite(outcome)).toBe(false)
    const message = sessionCheckMessage(outcome, 'fr')
    expect(message.title).toBe('Votre session n’est pas active.')
    expect(message.hint).toBe('Vérifiez votre session avant de commencer.')
  })
})

describe('L3 — session expirée', () => {
  it('distingue explicitement l’expiration de l’absence', () => {
    const outcome = classifySessionCheck(check({ token: 'expired' }))
    expect(outcome).toBe('expired')
    expect(allowsWrite(outcome)).toBe(false)
    const message = sessionCheckMessage(outcome, 'fr')
    expect(message.title).toBe('Votre session a expiré.')
    expect(message.hint).toBe('Veuillez vérifier votre session avant de continuer.')
  })

  it('les deux messages ne se confondent jamais', () => {
    expect(sessionCheckMessage('expired', 'fr').title).not.toBe(
      sessionCheckMessage('missing', 'fr').title,
    )
  })
})

describe('L4–L6 — jeton observateur', () => {
  it('L4 : un jeton valide autorise l’écriture, même sans compte connecté', () => {
    const outcome = classifySessionCheck({
      token: 'missing',
      observer: { present: true, valid: true, completed: false },
    })
    expect(outcome).toBe('active')
    expect(allowsWrite(outcome)).toBe(true)
  })

  it('L5 : un jeton invalide (autre projet, inconnu) est refusé', () => {
    const outcome = classifySessionCheck({
      token: 'missing',
      observer: { present: true, valid: false },
    })
    expect(outcome).toBe('missing')
    expect(allowsWrite(outcome)).toBe(false)
  })

  it('L6 : un jeton révoqué (portée présente mais invalide) est refusé', () => {
    const outcome = classifySessionCheck({
      token: 'missing',
      observer: { present: true, valid: false },
    })
    expect(allowsWrite(outcome)).toBe(false)
    expect(sessionCheckMessage(outcome, 'fr').title).toBe('Votre session n’est pas active.')
  })
})

describe('L7 — session terminée : lecture seule', () => {
  it('refuse l’écriture mais autorise la consultation', () => {
    const outcome = classifySessionCheck({
      token: 'missing',
      observer: { present: true, valid: true, completed: true },
    })
    expect(outcome).toBe('finished')
    expect(allowsWrite(outcome)).toBe(false)
    expect(allowsRead(outcome)).toBe(true)
  })
})

describe('L8–L9 — capture et modification sans session', () => {
  it('L8 : une capture sans session est bloquée', () => {
    expect(allowsWrite(classifySessionCheck({ token: 'missing' }))).toBe(false)
  })

  it('L9 : une modification sans session est bloquée', () => {
    expect(allowsWrite(classifySessionCheck({ token: 'missing', authorized: true }))).toBe(false)
  })

  it('une session expirée bloque aussi l’écriture', () => {
    expect(allowsWrite(classifySessionCheck({ token: 'expired', authorized: true }))).toBe(false)
  })
})

describe('L10 — projet non autorisé', () => {
  it('une session valide sans droit sur le projet est refusée', () => {
    const outcome = classifySessionCheck(check({ token: 'active', authorized: false }))
    expect(outcome).toBe('unauthorized')
    expect(allowsWrite(outcome)).toBe(false)
  })

  it('un jeton observateur valide mais hors périmètre est refusé', () => {
    const outcome = classifySessionCheck({
      token: 'missing',
      observer: { present: true, valid: true, completed: false },
      authorized: false,
    })
    expect(outcome).toBe('unauthorized')
    expect(allowsWrite(outcome)).toBe(false)
  })
})

describe('messages — aucun détail technique, bilingue', () => {
  it('ne mentionne jamais un jeton, un cookie ou une cause interne', () => {
    const forbidden = /jeton|token|cookie|sql|prisma|drive|secret/i
    for (const outcome of ['missing', 'expired', 'unauthorized', 'finished'] as const) {
      for (const locale of ['fr', 'en'] as const) {
        const message = sessionCheckMessage(outcome, locale)
        expect(message.title).not.toMatch(forbidden)
        expect(message.hint).not.toMatch(forbidden)
      }
    }
  })

  it('fournit une version anglaise cohérente', () => {
    expect(sessionCheckMessage('missing', 'en').title).toBe('Your session is not active.')
    expect(sessionCheckMessage('expired', 'en').title).toBe('Your session has expired.')
  })

  it('une session active ne produit aucun message', () => {
    expect(sessionCheckMessage('active', 'fr')).toEqual({ title: '', hint: '' })
  })
})
