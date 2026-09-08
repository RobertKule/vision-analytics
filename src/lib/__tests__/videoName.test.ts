import { describe, expect, it } from 'vitest'
import { deriveObservationNameFromVideo } from '@/lib/videoName'

describe('deriveObservationNameFromVideo', () => {
  it('extrait le nom depuis une URL distante', () => {
    expect(deriveObservationNameFromVideo('https://cdn.example.test/x/100m_oblique_2026_08_15.mp4')).toBe(
      '100m_oblique_2026_08_15',
    )
  })

  it('retire la query string et l’ancre', () => {
    expect(deriveObservationNameFromVideo('https://cdn.example.test/clip.webm?token=abc#section')).toBe('clip')
  })

  it('gère un chemin de système de fichiers Windows', () => {
    expect(deriveObservationNameFromVideo('C:\\clips\\session nid  v2.webm')).toBe('session nid v2')
  })

  it('conserve les extensions non vidéo', () => {
    expect(deriveObservationNameFromVideo('notes.txt')).toBe('notes.txt')
  })

  it('retire les caractères hostiles mais garde lettres accentuées et chiffres', () => {
    expect(deriveObservationNameFromVideo('capture n°1 — éléphants🙂.mp4')).toBe('capture n1 éléphants')
  })

  it('normalise les espaces multiples et les tirets-bas', () => {
    expect(deriveObservationNameFromVideo('  a__b   c.mp4 ')).toBe('a_b c')
  })

  it('plafonne la longueur à 80 caractères', () => {
    const long = `${'x'.repeat(120)}.mp4`
    expect(deriveObservationNameFromVideo(long)?.length).toBe(80)
  })

  it('renvoie null pour les entrées vides ou sans nom de fichier', () => {
    expect(deriveObservationNameFromVideo(null)).toBeNull()
    expect(deriveObservationNameFromVideo(undefined)).toBeNull()
    expect(deriveObservationNameFromVideo('   ')).toBeNull()
    expect(deriveObservationNameFromVideo('https://cdn.example.test/')).toBeNull()
    expect(deriveObservationNameFromVideo('!!!.mp4')).toBeNull()
  })
})
