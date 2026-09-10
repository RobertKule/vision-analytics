import { describe, expect, it } from 'vitest'
import {
  buildRestoredSyncStates,
  mapPersistedCaptureToRecord,
  type PersistedSessionCapture,
} from '@/lib/sessionRestore'

/**
 * Restauration d'une session (reprise / réactivation) : les captures persistées
 * redeviennent visibles avec leur identifiant d'origine, sans jamais être
 * re-téléversées, et sans exposer la vérité de validation ni un lien Drive direct.
 */

const CAPTURE: PersistedSessionCapture = {
  id: 'obs-1',
  clientKey: 'local-key-1',
  timestamp: 154,
  observationType: '200m',
  videoId: 'video-200m',
  imageEndpoint: '/api/captures/obs-1/image',
}

describe('mapPersistedCaptureToRecord', () => {
  it('conserve l’horodatage, le type et la passe vidéo', () => {
    const record = mapPersistedCaptureToRecord(CAPTURE)
    expect(record.timestamp).toBe(154)
    expect(record.observationType).toBe('200m')
    expect(record.videoId).toBe('video-200m')
  })

  it('réutilise la clientKey comme identifiant local (idempotence)', () => {
    expect(mapPersistedCaptureToRecord(CAPTURE).id).toBe('local-key-1')
  })

  it('retombe sur l’identifiant d’observation quand la clientKey est absente', () => {
    const record = mapPersistedCaptureToRecord({ ...CAPTURE, clientKey: null })
    expect(record.id).toBe('obs-1')
  })

  it('l’aperçu pointe l’endpoint sécurisé, jamais un lien Drive', () => {
    const record = mapPersistedCaptureToRecord(CAPTURE)
    expect(record.imageDataUrl).toBe('/api/captures/obs-1/image')
    expect(record.imageDataUrl).not.toContain('drive.google.com')
  })
})

describe('buildRestoredSyncStates', () => {
  it('marque chaque capture restaurée comme déjà synchronisée', () => {
    const states = buildRestoredSyncStates([CAPTURE, { ...CAPTURE, id: 'obs-2', clientKey: 'local-key-2' }])
    expect(states['local-key-1']).toEqual({ status: 'synced' })
    expect(states['local-key-2']).toEqual({ status: 'synced' })
  })

  it('n’écrase pas deux captures distinctes', () => {
    const states = buildRestoredSyncStates([
      CAPTURE,
      { ...CAPTURE, id: 'obs-2', clientKey: 'local-key-2', timestamp: 200 },
    ])
    expect(Object.keys(states)).toHaveLength(2)
  })

  it('utilise l’identifiant d’observation quand la clientKey est absente', () => {
    const states = buildRestoredSyncStates([{ ...CAPTURE, clientKey: null }])
    expect(states['obs-1']).toEqual({ status: 'synced' })
  })
})
