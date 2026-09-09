import { describe, expect, it } from 'vitest'
import { classifyObserverLink, type ObserverLinkClaim } from '@/lib/observerLinkClaim'

/**
 * Tests purs du cycle de vie d'un lien d'accès observateur.
 * Règle : un lien ouvre UNE session pour UN observateur. Dès qu'il est rattaché à un
 * observateur (premier passage), seul le navigateur d'origine (cookie de portée
 * correspondant) peut le rouvrir ; tout autre navigateur est refusé — session en cours
 * ou déjà soumise — le lien est « déjà utilisé ».
 */

function claim(partial: Partial<ObserverLinkClaim>): ObserverLinkClaim {
  return {
    tokenId: 'token-1',
    claimedObserverId: 'observer-a',
    cookieTokenId: 'token-1',
    cookieUid: 'observer-a',
    ...partial,
  }
}

describe('classifyObserverLink — premier passage (lien jamais ouvert)', () => {
  it('lien non rattaché → peut être réclamé (aucun cookie requis)', () => {
    expect(
      classifyObserverLink({ tokenId: 't', claimedObserverId: null, cookieTokenId: null, cookieUid: null }),
    ).toEqual({ kind: 'claim' })
  })

  it('lien non rattaché mais cookie d’une autre session posé → rattachement possible', () => {
    expect(
      classifyObserverLink({ tokenId: 't', claimedObserverId: null, cookieTokenId: 'other', cookieUid: 'u' }),
    ).toEqual({ kind: 'claim' })
  })
})

describe('classifyObserverLink — propriétaire (même navigateur)', () => {
  it('cookie du navigateur d’origine correspondant au jeton et à l’observateur → owner', () => {
    expect(classifyObserverLink(claim({}))).toEqual({ kind: 'owner' })
  })
})

describe('classifyObserverLink — lien « déjà utilisé » (autre navigateur / autre personne)', () => {
  it('aucun cookie posé sur un lien déjà rattaché → used', () => {
    expect(
      classifyObserverLink({ tokenId: 'token-1', claimedObserverId: 'observer-a', cookieTokenId: null, cookieUid: null }),
    ).toEqual({ kind: 'used' })
  })

  it('cookie d’un AUTRE jeton → used', () => {
    expect(classifyObserverLink(claim({ cookieTokenId: 'token-2' }))).toEqual({ kind: 'used' })
  })

  it('cookie portant un AUTRE observateur (même jeton) → used', () => {
    expect(classifyObserverLink(claim({ cookieUid: 'observer-b' }))).toEqual({ kind: 'used' })
  })

  it('cookie du mauvais jeton ET du mauvais observateur → used', () => {
    expect(
      classifyObserverLink({ tokenId: 'token-1', claimedObserverId: 'observer-a', cookieTokenId: 'other', cookieUid: 'stranger' }),
    ).toEqual({ kind: 'used' })
  })
})
