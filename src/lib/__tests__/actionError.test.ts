import { describe, expect, it } from 'vitest'
import { friendlyActionError } from '@/lib/actionError'

describe('friendlyActionError', () => {
  it('classe un dépassement de délai', () => {
    expect(friendlyActionError(new Error('The operation timed out'), 'fr')).toContain('trop de temps')
    expect(friendlyActionError(new Error('Request aborted'), 'en')).toContain('too long')
  })

  it('classe un échec réseau en message distinct', () => {
    expect(friendlyActionError(new Error('Failed to fetch'), 'fr')).toContain('Serveur injoignable')
    expect(friendlyActionError(new Error('Network request failed'), 'en')).toContain('unreachable')
  })

  it('classe une erreur HTTP serveur', () => {
    expect(
      friendlyActionError(new Error('The server responded with a status of 500'), 'fr'),
    ).toContain('renvoyé une erreur')
    expect(friendlyActionError(new Error('The server responded with a status of 404'), 'en')).toContain(
      'returned an error',
    )
  })

  it('retombe sur un message générique pour tout le reste', () => {
    expect(friendlyActionError(new Error('kaboom'), 'fr')).toContain('inattendue')
    expect(friendlyActionError('weird string', 'en')).toContain('unexpected')
    expect(friendlyActionError(undefined, 'fr')).toContain('inattendue')
  })
})
