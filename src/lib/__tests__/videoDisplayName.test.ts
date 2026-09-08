import { describe, expect, it } from 'vitest'
import { videoDisplayName } from '@/lib/exportHelpers'

describe('videoDisplayName', () => {
  it('privilégie le nom explicite de la passe', () => {
    expect(
      videoDisplayName({ id: 'v1', name: '600m altitude', typeLabel: '600m altitude', orderIndex: 0 }),
    ).toBe('600m altitude')
  })

  it('retombe sur le type d’observation rattaché', () => {
    expect(videoDisplayName({ id: 'v2', name: null, typeLabel: '100m oblique', orderIndex: 1 })).toBe(
      '100m oblique',
    )
  })

  it('libelle « Passe N » pour une passe générique sans type', () => {
    expect(videoDisplayName({ id: 'v3', name: null, typeLabel: null, orderIndex: 2 })).toBe('Passe 3')
  })

  it('tronque une source très longue en dernier recours', () => {
    const source = `https://cdn.example.com/very/long/path/${'a'.repeat(80)}.mp4`
    const label = videoDisplayName({ id: 'v4', source, orderIndex: null })
    expect(label).toMatch(/…$/)
    expect(label.length).toBeLessThan(source.length)
  })

  it('renvoie une chaîne vide pour null / undefined', () => {
    expect(videoDisplayName(null)).toBe('')
    expect(videoDisplayName(undefined)).toBe('')
  })
})
