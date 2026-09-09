import { describe, expect, it } from 'vitest'
import {
  addPendingSync,
  countSyncStates,
  hasPendingServerDelete,
  hasRetryableFailure,
  markFailed,
  markPending,
  markSynced,
  markSyncing,
  normalizeResumedSync,
  pendingServerDeleteIds,
  removeSyncEntry,
  requestServerDelete,
  selectNextToSync,
  type CaptureSyncMap,
} from '@/lib/captureSyncState'

describe('transitions de synchronisation', () => {
  it('ajoute une capture en pending puis la fait passer par syncing / synced', () => {
    let map: CaptureSyncMap = {}
    map = addPendingSync(map, 'a')
    expect(map.a).toEqual({ status: 'pending' })
    map = markSyncing(map, 'a')
    expect(map.a).toEqual({ status: 'syncing' })
    map = markSynced(map, 'a')
    expect(map.a).toEqual({ status: 'synced' })
  })

  it('marque un échec et retire une entrée', () => {
    let map: CaptureSyncMap = addPendingSync({}, 'a')
    map = markFailed(map, 'a')
    expect(map.a?.status).toBe('failed')
    map = removeSyncEntry(map, 'a')
    expect(map.a).toBeUndefined()
  })

  it('demande une suppression serveur sans perdre le statut en cours', () => {
    let map: CaptureSyncMap = addPendingSync({}, 'a')
    map = markSyncing(map, 'a')
    map = requestServerDelete(map, 'a')
    expect(map.a).toEqual({ status: 'syncing', pendingServerDelete: true })
    expect(hasPendingServerDelete(map, 'a')).toBe(true)
  })

  it('est sans effet sur une entrée inconnue', () => {
    expect(markSynced({}, 'x')).toEqual({})
    expect(removeSyncEntry({}, 'x')).toEqual({})
  })
})

describe('selectNextToSync', () => {
  const observations = [
    { id: 'c' }, // la plus récente (tête de liste)
    { id: 'b' },
    { id: 'a' }, // la plus ancienne
  ]

  it('traite d’abord la plus ancienne capture pending', () => {
    const map: CaptureSyncMap = {
      a: { status: 'pending' },
      b: { status: 'pending' },
      c: { status: 'pending' },
    }
    expect(selectNextToSync(map, observations, false)).toBe('a')
    expect(selectNextToSync(map, observations, true)).toBe('a')
  })

  it('ignore les failed sans retryFailed et les re-tente avec', () => {
    const map: CaptureSyncMap = { a: { status: 'failed' }, b: { status: 'synced' }, c: { status: 'pending' } }
    expect(selectNextToSync(map, observations, false)).toBe('c')
    expect(selectNextToSync(map, observations, true)).toBe('a')
  })

  it('ignore les entrées pendingServerDelete même en retry', () => {
    const map: CaptureSyncMap = { a: { status: 'failed', pendingServerDelete: true } }
    expect(selectNextToSync(map, observations, true)).toBeNull()
  })

  it('renvoie null quand tout est synchronisé', () => {
    const map: CaptureSyncMap = { a: { status: 'synced' }, b: { status: 'synced' }, c: { status: 'synced' } }
    expect(selectNextToSync(map, observations, true)).toBeNull()
  })
})

describe('countSyncStates', () => {
  it('compte les captures locales par statut', () => {
    const map: CaptureSyncMap = {
      a: { status: 'synced' },
      b: { status: 'pending' },
      c: { status: 'failed' },
    }
    expect(
      countSyncStates(map, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]),
    ).toEqual({ total: 4, pending: 1, syncing: 0, synced: 1, failed: 1 })
  })
})

describe('pendingServerDeleteIds & reprise', () => {
  it('liste les suppressions en attente dont la capture locale a disparu', () => {
    const map: CaptureSyncMap = {
      gone: { status: 'synced', pendingServerDelete: true },
      kept: { status: 'synced' },
    }
    expect(pendingServerDeleteIds(map, [{ id: 'kept' }])).toEqual(['gone'])
  })

  it('normalise un brouillon repris (syncing → pending) et conserve les suppressions orphelines', () => {
    const raw: CaptureSyncMap = {
      a: { status: 'syncing' },
      b: { status: 'synced' },
      ghost: { status: 'synced', pendingServerDelete: true },
    }
    const resumed = normalizeResumedSync(raw, [{ id: 'a' }, { id: 'b' }])
    expect(resumed.a).toEqual({ status: 'pending', pendingServerDelete: false, imageUrl: undefined })
    expect(resumed.b?.status).toBe('synced')
    expect(resumed.ghost).toEqual({
      status: 'pending',
      pendingServerDelete: true,
      imageUrl: undefined,
    })
  })

  it('traite un brouillon sans état de synchronisation (défaut pending)', () => {
    const resumed = normalizeResumedSync(undefined, [{ id: 'a' }])
    expect(resumed.a).toEqual({ status: 'pending', pendingServerDelete: false, imageUrl: undefined })
  })
})

describe('échecs typés (motif + re-tentabilité)', () => {
  it('markFailed conserve le motif quand il est fourni et reste sans motif sinon', () => {
    let map: CaptureSyncMap = addPendingSync({}, 'a')
    map = markFailed(map, 'a', { retryable: false, message: 'Stockage à corriger.' })
    expect(map.a).toEqual({
      status: 'failed',
      failure: { retryable: false, message: 'Stockage à corriger.' },
    })

    let plain: CaptureSyncMap = addPendingSync({}, 'b')
    plain = markFailed(plain, 'b')
    expect(plain.b).toEqual({ status: 'failed' })
    expect(plain.b?.failure).toBeUndefined()
  })

  it('markPending repasse une capture en attente (nouvel essai manuel)', () => {
    let map: CaptureSyncMap = addPendingSync({}, 'a')
    map = markFailed(map, 'a', { retryable: false, message: 'Stockage à corriger.' })
    map = markPending(map, 'a')
    expect(map.a?.status).toBe('pending')
  })
})

describe('selectNextToSync — échecs re-tentables vs définitifs', () => {
  const observations = [{ id: 'c' }, { id: 'b' }, { id: 'a' }]

  it('ne re-tente jamais un échec définitif, sauf includePermanent explicite', () => {
    const permanent: CaptureSyncMap = {
      a: { status: 'failed', failure: { retryable: false, message: 'Stockage à corriger.' } },
      b: { status: 'synced' },
      c: { status: 'pending' },
    }
    // Une capture pendante existe : on la traite d'abord (l'échec définitif reste ignoré).
    expect(selectNextToSync(permanent, observations, false)).toBe('c')
    expect(selectNextToSync(permanent, observations, true)).toBe('c')
    expect(selectNextToSync(permanent, observations, true, true)).toBe('a')
  })

  it('re-tente un échec re-tentable uniquement avec retryFailed', () => {
    const transient: CaptureSyncMap = {
      a: { status: 'failed', failure: { retryable: true, message: 'Connexion interrompue.' } },
      b: { status: 'synced' },
      c: { status: 'synced' },
    }
    expect(selectNextToSync(transient, observations, false)).toBeNull()
    expect(selectNextToSync(transient, observations, true)).toBe('a')
  })

  it('hasRetryableFailure : vrai pour réseau/transitoire, faux pour un échec définitif seul', () => {
    const transient: CaptureSyncMap = {
      a: { status: 'failed', failure: { retryable: true, message: 'Connexion interrompue.' } },
    }
    const permanent: CaptureSyncMap = {
      a: { status: 'failed', failure: { retryable: false, message: 'Stockage à corriger.' } },
    }
    const mixed: CaptureSyncMap = {
      a: { status: 'failed', failure: { retryable: false, message: 'Stockage à corriger.' } },
      b: { status: 'failed', failure: { retryable: true, message: 'Connexion interrompue.' } },
    }
    const legacy: CaptureSyncMap = { a: { status: 'failed' } }
    expect(hasRetryableFailure(transient, observations)).toBe(true)
    expect(hasRetryableFailure(permanent, observations)).toBe(false)
    expect(hasRetryableFailure(mixed, observations)).toBe(true)
    expect(hasRetryableFailure(legacy, observations)).toBe(true)
  })
})

describe('reprise d’un brouillon — motif d’échec conservé', () => {
  it('conserve un échec définitif au rechargement (aucune re-tentative auto)', () => {
    const raw: CaptureSyncMap = {
      a: { status: 'failed', failure: { retryable: false, message: 'Stockage à corriger.' } },
      b: { status: 'failed', failure: { retryable: true, message: 'Connexion interrompue.' } },
    }
    const resumed = normalizeResumedSync(raw, [{ id: 'a' }, { id: 'b' }])
    expect(resumed.a?.status).toBe('failed')
    expect(resumed.a?.failure).toEqual({ retryable: false, message: 'Stockage à corriger.' })
    expect(resumed.b?.failure?.retryable).toBe(true)
  })
})
