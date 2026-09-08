import { describe, expect, it } from 'vitest'
import { cleanRequiredTypes, computeTypeCompletion } from '@/lib/captureCompletion'

describe('cleanRequiredTypes', () => {
  it('retire les entrées vides et les doublons en préservant l’ordre', () => {
    expect(cleanRequiredTypes([' Faune ', '', 'faune', 'Eau', '  '])).toEqual([
      'Faune',
      'Eau',
    ])
  })

  it('traite une liste vide', () => {
    expect(cleanRequiredTypes([])).toEqual([])
  })
})

describe('computeTypeCompletion', () => {
  it('signale la couverture complète quand chaque type requis est capturé', () => {
    const completion = computeTypeCompletion(['Faune', 'Eau'], [
      { observationType: 'Faune' },
      { observationType: 'eau' }, // insensible à la casse
    ])
    expect(completion.completedTypes).toEqual(['Faune', 'Eau'])
    expect(completion.pendingTypes).toEqual([])
    expect(completion.allRequiredCovered).toBe(true)
    expect(completion.completedCount).toBe(2)
    expect(completion.pendingCount).toBe(0)
    expect(completion.totalRequired).toBe(2)
    expect(completion.notApplicable).toBe(false)
    expect(completion.typeCounts).toEqual({ Faune: 1, Eau: 1 })
  })

  it('liste les types en attente et compte les non-typées', () => {
    const completion = computeTypeCompletion(['Faune', 'Eau', 'Oiseau'], [
      { observationType: 'Faune' },
      { observationType: null },
      { observationType: undefined },
      { observationType: '   ' },
    ])
    expect(completion.completedTypes).toEqual(['Faune'])
    expect(completion.pendingTypes).toEqual(['Eau', 'Oiseau'])
    expect(completion.pendingCount).toBe(2)
    expect(completion.completedCount).toBe(1)
    expect(completion.allRequiredCovered).toBe(false)
    expect(completion.untypedCount).toBe(3)
  })

  it('ignore les types capturés hors liste pour la couverture', () => {
    const completion = computeTypeCompletion(['Faune'], [{ observationType: 'Autre' }])
    expect(completion.completedTypes).toEqual([])
    expect(completion.pendingTypes).toEqual(['Faune'])
    expect(completion.untypedCount).toBe(0) // type fourni mais hors liste
  })

  it('est trivialement complet quand aucun type requis n’est configuré', () => {
    const completion = computeTypeCompletion([], [{ observationType: 'Libre' }])
    expect(completion.notApplicable).toBe(true)
    expect(completion.allRequiredCovered).toBe(true)
    expect(completion.pendingTypes).toEqual([])
    expect(completion.totalRequired).toBe(0)
  })

  it('supporte plusieurs captures du même type', () => {
    const completion = computeTypeCompletion(['Faune'], [
      { observationType: 'Faune' },
      { observationType: 'Faune' },
      { observationType: 'faune ' },
    ])
    expect(completion.typeCounts.Faune).toBe(3)
    expect(completion.completedCount).toBe(1)
  })
})
