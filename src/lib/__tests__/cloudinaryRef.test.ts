import { describe, expect, it } from 'vitest'
import { cloudinaryPublicIdFromUrl } from '@/lib/cloudinaryRef'

describe('cloudinaryPublicIdFromUrl', () => {
  it('extrait le public_id d’une URL sécurisée versionnée (chemin complet)', () => {
    const url =
      'https://res.cloudinary.com/onafield/image/upload/v1726000000/vision-analytics/annotations/abc123.png'
    expect(cloudinaryPublicIdFromUrl(url)).toBe('vision-analytics/annotations/abc123')
  })

  it('gère une URL sans segment de version', () => {
    const url =
      'https://res.cloudinary.com/onafield/image/upload/vision-analytics/annotations/abc123.jpg'
    expect(cloudinaryPublicIdFromUrl(url)).toBe('vision-analytics/annotations/abc123')
  })

  it('renvoie null pour une URL hors Cloudinary', () => {
    expect(cloudinaryPublicIdFromUrl('https://example.com/capture.png')).toBeNull()
    expect(cloudinaryPublicIdFromUrl('')).toBeNull()
  })

  it('renvoie null pour une URL malformée', () => {
    expect(cloudinaryPublicIdFromUrl('https://res.cloudinary.com/image/upload')).toBeNull()
  })
})
