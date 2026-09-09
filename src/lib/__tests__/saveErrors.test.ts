import { describe, expect, it } from 'vitest'
import { DriveConfigError, DriveHttpError } from '@/lib/drive'
import { isNetworkLikeError } from '@/lib/netError'
import { classifySaveError, saveErrorMessage } from '@/lib/saveErrors'

describe('classifySaveError — distinction stockage / réseau / base', () => {
  it('configuration manquante ⇒ STORAGE_CONFIG, jamais re-tenté seul', () => {
    expect(classifySaveError(new DriveConfigError('Non configuré.'))).toEqual({
      code: 'STORAGE_CONFIG',
      retryable: false,
    })
  })

  it('HTTP Drive 401/403 ⇒ permission (définitif), 404 ⇒ dossier (définitif)', () => {
    expect(classifySaveError(new DriveHttpError(401, 'auth'))).toEqual({
      code: 'STORAGE_PERMISSION',
      retryable: false,
    })
    expect(classifySaveError(new DriveHttpError(403, 'forbidden'))).toEqual({
      code: 'STORAGE_PERMISSION',
      retryable: false,
    })
    expect(classifySaveError(new DriveHttpError(404, 'File not found'))).toEqual({
      code: 'STORAGE_FOLDER',
      retryable: false,
    })
  })

  it('HTTP Drive 429/5xx ⇒ transitoire re-tentable, autre HTTP ⇒ stockage définitif', () => {
    expect(classifySaveError(new DriveHttpError(429, 'rate'))).toEqual({
      code: 'STORAGE_TRANSIENT',
      retryable: true,
    })
    expect(classifySaveError(new DriveHttpError(503, 'unavailable'))).toEqual({
      code: 'STORAGE_TRANSIENT',
      retryable: true,
    })
    expect(classifySaveError(new DriveHttpError(400, 'bad request'))).toEqual({
      code: 'STORAGE',
      retryable: false,
    })
  })

  it('Prisma : code de connexion ⇒ re-tentable, contrainte ⇒ définitif', () => {
    expect(classifySaveError(Object.assign(new Error('connexion'), { code: 'P1001' }))).toEqual({
      code: 'DATABASE',
      retryable: true,
    })
    expect(classifySaveError(Object.assign(new Error('violation'), { code: 'P2002' }))).toEqual({
      code: 'DATABASE',
      retryable: false,
    })
  })

  it('TypeError fetch / messages réseau ⇒ NETWORK re-tentable', () => {
    expect(classifySaveError(new TypeError('fetch failed'))).toEqual({
      code: 'NETWORK',
      retryable: true,
    })
    expect(classifySaveError(new Error('socket hang up'))).toEqual({
      code: 'NETWORK',
      retryable: true,
    })
  })

  it('toute autre erreur ⇒ SERVER re-tentable (jamais de message interne exposé)', () => {
    expect(classifySaveError(new Error('détail interne' ))).toEqual({
      code: 'SERVER',
      retryable: true,
    })
  })
})

describe('saveErrorMessage — vocabulaire fixe, jamais de détail interne', () => {
  it('NETWORK annonce une coupure et la conservation locale', () => {
    expect(saveErrorMessage('NETWORK', 'fr')).toBe(
      'Connexion interrompue. La capture est conservée localement.',
    )
    expect(saveErrorMessage('NETWORK', 'en')).toBe(
      'Connection interrupted. The capture is kept locally.',
    )
  })

  it('config/permission/dossier renvoie vers l’administrateur (action humaine)', () => {
    const fr = saveErrorMessage('STORAGE_PERMISSION', 'fr')
    expect(fr).toContain('Contactez l’administrateur')
    expect(saveErrorMessage('STORAGE_FOLDER', 'fr')).toBe(fr)
    expect(saveErrorMessage('STORAGE_CONFIG', 'en')).toBe(
      'Storage is not configured correctly. Contact the administrator.',
    )
  })

  it('stockage/transitoire = échec d’image, base/serveur = conservation locale', () => {
    expect(saveErrorMessage('STORAGE_TRANSIENT', 'en')).toBe(
      'The image could not be saved to storage.',
    )
    expect(saveErrorMessage('STORAGE', 'fr')).toBe(
      'Impossible d’enregistrer l’image dans le stockage.',
    )
    expect(saveErrorMessage('DATABASE', 'fr')).toBe(
      'Le serveur n’a pas pu enregistrer la capture. Elle a été conservée localement.',
    )
    expect(saveErrorMessage('SERVER', 'fr')).toBe(saveErrorMessage('DATABASE', 'fr'))
  })
})

describe('isNetworkLikeError — pur, importable côté client', () => {
  it('reconnaît les échecs de transport, pas les erreurs applicatives', () => {
    expect(isNetworkLikeError(new TypeError('fetch failed'))).toBe(true)
    expect(isNetworkLikeError(new Error('load failed'))).toBe(true)
    expect(isNetworkLikeError(Object.assign(new Error('timeout'), { name: 'AbortError' }))).toBe(true)
    expect(isNetworkLikeError(new Error('bogue applicatif'))).toBe(false)
    expect(isNetworkLikeError(null)).toBe(false)
    expect(isNetworkLikeError('texte')).toBe(false)
  })
})
