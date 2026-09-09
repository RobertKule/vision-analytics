import { describe, expect, it } from 'vitest'
import { extractYoutubeVideoId, youtubeEmbedUrl } from '@/lib/youtube'

/**
 * Vidéo de démonstration (landing) — l'emplacement accepte une URL YouTube et
 * n'embarque aucun lecteur interne. Ces tests bornent l'extraction d'identifiant
 * (watch / youtu.be / embed / shorts / live) et l'URL d'intégration générée.
 */

describe('extractYoutubeVideoId', () => {
  it('extrait l’identifiant d’une URL classique ?v=', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
    expect(extractYoutubeVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=12')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  it('accepte youtu.be, embed, shorts et live', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
    expect(extractYoutubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    )
  })

  it('tolère www. et majuscules', () => {
    expect(extractYoutubeVideoId('https://www.YOUTUBE.com/watch?v=DQW4W9WGXCQ')).toBe(
      'DQW4W9WGXCQ',
    )
  })

  it('rejette les valeurs absentes / non-URL / autres domaines', () => {
    expect(extractYoutubeVideoId(null)).toBeNull()
    expect(extractYoutubeVideoId(undefined)).toBeNull()
    expect(extractYoutubeVideoId('')).toBeNull()
    expect(extractYoutubeVideoId('   ')).toBeNull()
    expect(extractYoutubeVideoId('pas une url')).toBeNull()
    expect(extractYoutubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(extractYoutubeVideoId('https://vimeo.com/123456789')).toBeNull()
  })

  it('rejette un identifiant mal formé (mauvaise longueur, chemin absent)', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=tropcourt')).toBeNull()
    expect(extractYoutubeVideoId('https://youtu.be/')).toBeNull()
    expect(extractYoutubeVideoId('https://www.youtube.com/watch')).toBeNull()
  })
})

describe('youtubeEmbedUrl', () => {
  it('construit une URL d’intégration no-cookie, lecture seule', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&color=white',
    )
  })

  it('ajoute l’autoplay quand demandé', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', true)).toContain('autoplay=1')
  })
})
