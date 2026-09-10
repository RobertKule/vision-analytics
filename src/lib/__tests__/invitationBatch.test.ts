import { describe, expect, it } from 'vitest'
import {
  hasCreatableEmail,
  isValidEmail,
  normalizeEmail,
  processInvitationEmails,
} from '@/lib/invitationBatch'

/**
 * PARTIE X — INVITATIONS MULTIPLES (noyau PUR).
 *
 * UN EMAIL = UN TOKEN = UNE SESSION. Déduplication, signalement des invalides sans
 * annuler les autres, et isolation (chaque adresse = un accès indépendant).
 */

describe('normalisation / validation', () => {
  it('normalise en minuscules sans espaces', () => {
    expect(normalizeEmail('  Robert@Example.com ')).toBe('robert@example.com')
  })

  it('valide une adresse simple', () => {
    expect(isValidEmail('robert@example.com')).toBe(true)
    expect(isValidEmail('marie@example.com')).toBe(true)
  })

  it('rejette les adresses invalides', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
  })
})

describe('un email = un accès', () => {
  it('1 : un email valide → un accès à créer', () => {
    const result = processInvitationEmails({ emails: ['robert@example.com'] })
    expect(result.toCreate).toEqual(['robert@example.com'])
    expect(result.duplicates).toEqual([])
    expect(result.invalid).toEqual([])
  })

  it('2–3 : deux emails → deux accès distincts', () => {
    const result = processInvitationEmails({
      emails: ['robert@example.com', 'marie@example.com'],
    })
    expect(result.toCreate).toEqual(['robert@example.com', 'marie@example.com'])
  })

  it('trois emails → trois accès distincts', () => {
    const result = processInvitationEmails({
      emails: ['robert@example.com', 'marie@example.com', 'paul@example.com'],
    })
    expect(result.toCreate).toHaveLength(3)
    expect(new Set(result.toCreate).size).toBe(3)
  })

  it('chaque adresse reste isolée (jamais de mélange des destinataires)', () => {
    const result = processInvitationEmails({
      emails: ['robert@example.com', 'marie@example.com'],
    })
    // Aucun résultat n'associe l'email de l'un au token de l'autre.
    expect(result.outcomes.find((o) => o.kind === 'create' && o.email === 'robert@example.com')).toBeTruthy()
    expect(result.outcomes.find((o) => o.kind === 'create' && o.email === 'marie@example.com')).toBeTruthy()
  })
})

describe('déduplication', () => {
  it('12 : un email déjà actif est un doublon (jamais de second token)', () => {
    const result = processInvitationEmails({
      emails: ['robert@example.com', 'marie@example.com'],
      existingActiveEmails: ['robert@example.com'],
    })
    expect(result.toCreate).toEqual(['marie@example.com'])
    expect(result.duplicates).toEqual(['robert@example.com'])
  })

  it('le même email saisi deux fois dans le lot = un seul accès', () => {
    const result = processInvitationEmails({
      emails: ['robert@example.com', 'robert@example.com'],
    })
    expect(result.toCreate).toEqual(['robert@example.com'])
  })

  it('la casse ne crée pas de doublon', () => {
    const result = processInvitationEmails({
      emails: ['Robert@Example.com', 'robert@example.com'],
    })
    expect(result.toCreate).toEqual(['robert@example.com'])
  })
})

describe('adresses invalides (Partie N)', () => {
  it('11 : une adresse invalide est signalée sans annuler les autres', () => {
    const result = processInvitationEmails({
      emails: ['robert@example.com', 'pas-une-adresse', 'marie@example.com'],
    })
    expect(result.toCreate).toEqual(['robert@example.com', 'marie@example.com'])
    expect(result.invalid).toEqual(['pas-une-adresse'])
    expect(result.outcomes.some((o) => o.kind === 'invalid')).toBe(true)
  })

  it('hasCreatableEmail détecte au moins un accès à créer', () => {
    expect(hasCreatableEmail(processInvitationEmails({ emails: ['a@b.com'] }))).toBe(true)
    expect(hasCreatableEmail(processInvitationEmails({ emails: ['invalide'] }))).toBe(false)
  })
})
