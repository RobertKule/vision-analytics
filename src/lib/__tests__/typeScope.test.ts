import { describe, expect, it } from 'vitest'
import {
  ALL_TYPES,
  consultationTypeOptions,
  countDistinctObservers,
  isAllScope,
  normalizeScope,
  scopeObservationsByType,
  scopePointsOfType,
  scopeVideosByType,
} from '@/lib/typeScope'

/**
 * Tests de la « consultation par type » (Partie S) — miroir des tests W 16 & 17 :
 *   W16  le sélecteur offre un filtre mono-type piloté par les données ;
 *   W17  une fois le type choisi, SEUL ce type est affiché (config, vidéos,
 *        fenêtres, observations) — aucun mélange.
 */

const rows = [
  { id: 'r1', observationType: '100 m' },
  { id: 'r2', observationType: '100 m' },
  { id: 'r3', observationType: '250 m' },
  { id: 'r4', observationType: null },
]

const videos = [
  { id: 'v-100', typeLabel: '100 m' },
  { id: 'v-250', typeLabel: '250 m' },
  { id: 'v-generic', typeLabel: null },
]

const points = [
  { id: 'pt-1', videoId: 'v-100' },
  { id: 'pt-2', videoId: 'v-250' },
  { id: 'pt-legacy', videoId: null },
]

describe('consultationTypeOptions — piloté par les données (W16)', () => {
  it('offre « Tous les types » puis les types configurés, ordre stable, sans doublon ni vide', () => {
    expect(consultationTypeOptions(['100 m', '100 m', '', ' 250 m '])).toEqual(['', '100 m', '250 m'])
    expect(consultationTypeOptions([])).toEqual([''])
  })

  it('normalise les valeurs du sélecteur (espaces extérieurs, vide → tous)', () => {
    expect(normalizeScope('  100 m ')).toBe('100 m')
    expect(normalizeScope('')).toBe(ALL_TYPES)
    expect(normalizeScope(null)).toBe(ALL_TYPES)
    expect(isAllScope('')).toBe(true)
    expect(isAllScope('100 m')).toBe(false)
  })
})

describe('scopeObservationsByType (W17)', () => {
  it('en portée « tous », conserve toutes les observations', () => {
    expect(scopeObservationsByType(rows, '')).toHaveLength(4)
  })

  it('en portée « 100 m », n’affiche QUE les observations de ce type — rien de mélangé', () => {
    const scoped = scopeObservationsByType(rows, '100 m')
    expect(scoped.map((row) => row.id)).toEqual(['r1', 'r2'])
    // La ligne non typée (r4) n’appartient pas au type choisi.
  })

  it('ignore les lignes d’un autre type et les lignes sans type', () => {
    const scoped = scopeObservationsByType(rows, '250 m')
    expect(scoped.map((row) => row.id)).toEqual(['r3'])
  })

  it('comparaison exacte sur la valeur normalisée (jamais un préfixe)', () => {
    expect(scopeObservationsByType([{ id: 'x', observationType: '100' }], '100 m')).toHaveLength(0)
  })
})

describe('scopeVideosByType (W17)', () => {
  it('conserve tout en portée « tous »', () => {
    expect(scopeVideosByType(videos, '')).toHaveLength(3)
  })

  it('en portée « 100 m », n’affiche que la passe du type (les génériques restent masquées)', () => {
    const scoped = scopeVideosByType(videos, '100 m')
    expect(scoped.map((video) => video.id)).toEqual(['v-100'])
  })
})

describe('scopePointsOfType (W17)', () => {
  it('ne garde que les fenêtres rattachées aux passes du type choisi', () => {
    const scoped = scopePointsOfType(points, videos, '100 m')
    expect(scoped.map((point) => point.id)).toEqual(['pt-1'])
    // La fenêtre « générique » (sans passe) n’est jamais mélangée à un type.
  })

  it('conserve tout (y compris la fenêtre générique) en portée « tous »', () => {
    expect(scopePointsOfType(points, videos, '')).toHaveLength(3)
  })
})

describe('countDistinctObservers', () => {
  it('compte les observateurs distincts d’un relevé', () => {
    const activity = [
      { observerId: 'u1' },
      { observerId: 'u1' },
      { observerId: 'u2' },
      { observerId: null },
    ]
    expect(countDistinctObservers(activity)).toBe(2)
    expect(countDistinctObservers([])).toBe(0)
  })
})
