import { describe, expect, it } from 'vitest'
import {
  addPendingSync,
  countSyncStates,
  hasPendingServerDelete,
  markFailed,
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
