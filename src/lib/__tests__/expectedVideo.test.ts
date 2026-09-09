import { describe, expect, it } from 'vitest'
import {
  checkExpectedVideo,
  declaredVideoIdentity,
  expectedVideoClientState,
  EXPECTED_VIDEO_REFUSAL,
  normalizeVideoIdentity,
} from '@/lib/expectedVideo'

/**
 * Tests purs de la « validation vidéo attendue » (Parties Q + U) — miroir des tests
 * W 1–8 (serveur) et du contrôle client (U). La décision est comparée sur l'identité
 * complète (jamais un préfixe).
 */

const videos = [
  { id: 'v1', typeLabel: '100 m', source: 'https://media.example/VIRUNGA_100M_01.mp4' },
  { id: 'v2', typeLabel: '250 m', source: 'https://media.example/VIRUNGA_250M_01.mp4' },
]

const typed = (overrides: Partial<Parameters<typeof checkExpectedVideo>[0]> = {}) =>
  checkExpectedVideo({
    videoId: 'v1',
    observationType: '100 m',
    declaredSource: 'VIRUNGA_100M_01.mp4',
    videoUrl: null,
    videos,
    ...overrides,
  })

describe('normalizeVideoIdentity', () => {
  it('utilise le nom de fichier local exact', () => {
    expect(normalizeVideoIdentity('VID_100M_A.mp4')).toBe('VID_100M_A.mp4')
  })

  it('réduit une URL distante à son dernier segment décodé (sans query/hash)', () => {
    expect(
      normalizeVideoIdentity('https://cdn.example.test/x/VIRUNGA%20100M_01.mp4?token=abc#t'),
    ).toBe('VIRUNGA 100M_01.mp4')
  })

  it('retourne null pour une source vide', () => {
    expect(normalizeVideoIdentity('')).toBeNull()
    expect(normalizeVideoIdentity('   ')).toBeNull()
    expect(normalizeVideoIdentity(null)).toBeNull()
    expect(normalizeVideoIdentity(undefined)).toBeNull()
  })

  it('réduit un chemin local à son nom de fichier (jamais le dossier)', () => {
    expect(normalizeVideoIdentity('videos/VIRUNGA_100M_01.mp4')).toBe('VIRUNGA_100M_01.mp4')
    expect(normalizeVideoIdentity('C:\\captures\\legacy_2026.mp4')).toBe('legacy_2026.mp4')
  })
})

describe('checkExpectedVideo — passe typée (type lié à une vidéo attendue)', () => {
  it('W1 : vidéo correspondant exactement à la configuration → acceptée', () => {
    expect(typed().ok).toBe(true)
    // Copie locale du même nom de fichier qu'une URL distante configurée → acceptée.
    expect(typed({ declaredSource: 'VIRUNGA_100M_01.mp4' }).ok).toBe(true)
    // URL distante diffusée telle quelle → acceptée.
    expect(typed({ declaredSource: videos[0].source }).ok).toBe(true)
  })

  it('W2 : vidéo différente → refusée (source-mismatch)', () => {
    const result = typed({ declaredSource: 'AUTRE_VIDEO.mp4' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('source-mismatch')
  })

  it('W7 : nom similaire mais différent (préfixe commun) → refusé', () => {
    // Attendu VIRUNGA_100M_01.mp4 — un simple préfixe ne suffit jamais.
    const result = typed({ declaredSource: 'VIRUNGA_100M_02.mp4' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('source-mismatch')
    const edited = typed({ declaredSource: 'VIRUNGA_100M_01_edition.mp4' })
    expect(edited.ok).toBe(false)
  })

  it('W7b : cas du nom explicitement donné en exemple (VID_100M_A vs VID_100M_B)', () => {
    const local = [{ id: 'l1', typeLabel: '100 m', source: 'VID_100M_A.mp4' }]
    expect(
      checkExpectedVideo({
        videoId: 'l1',
        observationType: '100 m',
        declaredSource: 'VID_100M_A.mp4',
        videoUrl: null,
        videos: local,
      }).ok,
    ).toBe(true)
    const other = checkExpectedVideo({
      videoId: 'l1',
      observationType: '100 m',
      declaredSource: 'VID_100M_B.mp4',
      videoUrl: null,
      videos: local,
    })
    expect(other.ok).toBe(false)
    if (!other.ok) expect(other.reason).toBe('source-mismatch')
  })

  it('W3 : vidéo d’un autre type → refusée (type-requires-its-video)', () => {
    const result = typed({ videoId: 'v2', observationType: '100 m' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('type-requires-its-video')
  })

  it('W4 : videoId modifié côté client (passe inconnue) → refusé (unknown-pass)', () => {
    const result = typed({ videoId: 'v-forge', declaredSource: videos[0].source })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unknown-pass')
  })

  it('W6 : type modifié côté client (incompatible avec la passe) → refusé', () => {
    const result = typed({ observationType: '250 m' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('type-requires-its-video')
  })

  it('source non déclarée alors qu’une vidéo est attendue → refusée (source-required)', () => {
    const result = typed({ declaredSource: null })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('source-required')
  })

  it('une source configurée avec un dossier reste égalée à son nom de fichier', () => {
    const nested = [
      { id: 'n1', typeLabel: '100 m', source: 'videos/VIRUNGA_100M_01.mp4' },
    ]
    expect(
      checkExpectedVideo({
        videoId: 'n1',
        observationType: '100 m',
        declaredSource: 'VIRUNGA_100M_01.mp4',
        videoUrl: null,
        videos: nested,
      }).ok,
    ).toBe(true)
  })
})

describe('checkExpectedVideo — projet moderne, sans videoId (contournement)', () => {
  it('refuse une capture générique d’un type lié à une vidéo attendue', () => {
    const result = checkExpectedVideo({
      videoId: null,
      observationType: '100 m',
      declaredSource: 'VIRUNGA_100M_01.mp4',
      videoUrl: null,
      videos,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('type-requires-its-video')
  })

  it('refuse un videoId absent quand le projet possède des passes réelles', () => {
    const result = checkExpectedVideo({
      videoId: null,
      observationType: 'Autre type',
      declaredSource: 'nimporte.mp4',
      videoUrl: null,
      videos,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unknown-pass')
  })
})

describe('checkExpectedVideo — projet hérité (vidéo unique, sans Video)', () => {
  const legacy = { videoUrl: 'https://media.example/legacy_2026.mp4', videos: [] as typeof videos }

  it('accepte la vidéo attendue (nom exact ou URL configurée)', () => {
    expect(
      checkExpectedVideo({
        videoId: null,
        observationType: '',
        declaredSource: 'legacy_2026.mp4',
        videoUrl: legacy.videoUrl,
        videos: legacy.videos,
      }).ok,
    ).toBe(true)
    expect(
      checkExpectedVideo({
        videoId: null,
        observationType: '',
        declaredSource: legacy.videoUrl,
        videoUrl: legacy.videoUrl,
        videos: legacy.videos,
      }).ok,
    ).toBe(true)
  })

  it('refuse un autre fichier', () => {
    const result = checkExpectedVideo({
      videoId: null,
      observationType: '',
      declaredSource: 'autre_video.mp4',
      videoUrl: legacy.videoUrl,
      videos: legacy.videos,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('source-mismatch')
  })

  it('aucune vidéo configurée → aucune contrainte (rien à refuser)', () => {
    expect(
      checkExpectedVideo({
        videoId: null,
        observationType: '',
        declaredSource: null,
        videoUrl: null,
        videos: [],
      }).ok,
    ).toBe(true)
  })
})

describe('EXPECTED_VIDEO_REFUSAL — vocabulaire utilisateur fixe (W8)', () => {
  it('ne divulgue aucun détail technique et reprend les phrases imposées', () => {
    const fr = EXPECTED_VIDEO_REFUSAL.fr
    expect(fr).toContain('Vidéo non autorisée')
    expect(fr).toContain('ne correspond pas à la vidéo configurée')
    expect(fr).toContain('Veuillez utiliser la vidéo fournie par l’administrateur')
    expect(fr).not.toMatch(/unknown-pass|source-mismatch|videoId|reason|prisma|error/i)
    expect(EXPECTED_VIDEO_REFUSAL.en).toContain('Video not authorized')
  })
})

describe('declaredVideoIdentity — identité réellement observée (Partie U, partagée)', () => {
  it('préfère le nom du fichier local dès qu’un fichier est chargé', () => {
    expect(declaredVideoIdentity('VIRUNGA_100M_01.mp4', 'blob:http://x/abc')).toBe(
      'VIRUNGA_100M_01.mp4',
    )
    expect(declaredVideoIdentity('VIRUNGA_100M_01.mp4', 'https://media.example/other.mp4')).toBe(
      'VIRUNGA_100M_01.mp4',
    )
  })

  it('retombe sur l’URL distante quand aucun fichier local n’est chargé', () => {
    expect(declaredVideoIdentity(null, 'https://media.example/VIRUNGA_100M_01.mp4')).toBe(
      'https://media.example/VIRUNGA_100M_01.mp4',
    )
    expect(declaredVideoIdentity('   ', 'https://media.example/VIRUNGA_100M_01.mp4')).toBe(
      'https://media.example/VIRUNGA_100M_01.mp4',
    )
  })

  it('ignore les URLs blob (source locale) et les valeurs vides', () => {
    expect(declaredVideoIdentity(null, 'blob:http://x/abc')).toBeNull()
    expect(declaredVideoIdentity(null, '')).toBeNull()
    expect(declaredVideoIdentity('', null)).toBeNull()
    expect(declaredVideoIdentity(null, null)).toBeNull()
  })
})

describe('expectedVideoClientState — contrôle client Type → vidéo attendue (Partie U)', () => {
  const expectedSource = 'https://media.example/VIRUNGA_100M_01.mp4'

  it('fichier local identique au fichier attendu (dernier segment) → aucune anomalie', () => {
    const state = expectedVideoClientState({
      expectedSource,
      fileName: 'VIRUNGA_100M_01.mp4',
      videoUrl: 'blob:http://x/abc',
    })
    expect(state.mismatch).toBe(false)
    expect(state.loadedIdentity).toBe('VIRUNGA_100M_01.mp4')
  })

  it('URL distante diffusée telle quelle → auto-conforme (jamais une fausse alerte)', () => {
    const state = expectedVideoClientState({
      expectedSource,
      fileName: null,
      videoUrl: expectedSource,
    })
    expect(state.mismatch).toBe(false)
  })

  it('fichier différent → anomalie (annotation désactivée, message serveur affiché)', () => {
    const state = expectedVideoClientState({
      expectedSource,
      fileName: 'AUTRE_VIDEO.mp4',
      videoUrl: 'blob:http://x/abc',
    })
    expect(state.mismatch).toBe(true)
    expect(state.expectedIdentity).toBe('VIRUNGA_100M_01.mp4')
  })

  it('nom similaire mais différent (préfixe commun) → anomalie, jamais une acceptation', () => {
    expect(
      expectedVideoClientState({
        expectedSource,
        fileName: 'VIRUNGA_100M_02.mp4',
        videoUrl: null,
      }).mismatch,
    ).toBe(true)
    expect(
      expectedVideoClientState({
        expectedSource,
        fileName: 'VIRUNGA_100M_01_edition.mp4',
        videoUrl: null,
      }).mismatch,
    ).toBe(true)
  })

  it('correspondance insensible aux dossiers (source configurée avec un chemin)', () => {
    const state = expectedVideoClientState({
      expectedSource: 'clips/VIRUNGA_100M_01.mp4',
      fileName: 'VIRUNGA_100M_01.mp4',
      videoUrl: null,
    })
    expect(state.mismatch).toBe(false)
  })

  it('aucune vidéo attendue configurée → aucune contrainte', () => {
    expect(
      expectedVideoClientState({ expectedSource: null, fileName: 'nimporte.mp4', videoUrl: null })
        .mismatch,
    ).toBe(false)
  })

  it('rien n’est encore chargé → pas d’anomalie (l’annotation est déjà bloquée sans vidéo)', () => {
    const state = expectedVideoClientState({ expectedSource, fileName: null, videoUrl: null })
    expect(state.mismatch).toBe(false)
    expect(state.loadedIdentity).toBeNull()
  })
})
