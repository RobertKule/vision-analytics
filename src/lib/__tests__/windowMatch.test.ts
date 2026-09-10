import { describe, expect, it } from 'vitest'
import {
  observationFallsInWindow,
  reclassificationForObservation,
  type ObservationRef,
  type WindowRef,
} from '@/lib/windowMatch'

/**
 * Réévaluation observation ↔ fenêtre : une observation certifiée hors-trame doit
 * devenir une DÉTECTION VALIDE quand une fenêtre qui la couvre est ajoutée après coup.
 */

const WINDOW: WindowRef = { id: 'w11', videoId: null, trameDebut: 100, trameFin: 110 }

function obs(partial: Partial<ObservationRef>): ObservationRef {
  return { videoId: null, timestampTotal: 105, ...partial }
}

describe('observationFallsInWindow', () => {
  it('une observation dans la fenêtre (même portée) correspond', () => {
    expect(observationFallsInWindow(obs({ timestampTotal: 100 }), WINDOW)).toBe(true)
    expect(observationFallsInWindow(obs({ timestampTotal: 105 }), WINDOW)).toBe(true)
    expect(observationFallsInWindow(obs({ timestampTotal: 110 }), WINDOW)).toBe(true)
  })

  it('une observation hors bornes ne correspond pas', () => {
    expect(observationFallsInWindow(obs({ timestampTotal: 99 }), WINDOW)).toBe(false)
    expect(observationFallsInWindow(obs({ timestampTotal: 111 }), WINDOW)).toBe(false)
  })

  it('la portée vidéo doit correspondre', () => {
    // Fenêtre générique (videoId null) ≠ observation d'une autre passe vidéo.
    expect(observationFallsInWindow(obs({ videoId: 'video-b' }), WINDOW)).toBe(false)
    // Fenêtre typée ≠ observation générique.
    const typedWindow: WindowRef = { id: 'w', videoId: 'video-b', trameDebut: 0, trameFin: 200 }
    expect(observationFallsInWindow(obs({ videoId: null }), typedWindow)).toBe(false)
    expect(observationFallsInWindow(obs({ videoId: 'video-b' }), typedWindow)).toBe(true)
  })
})

describe('reclassificationForObservation', () => {
  it('réévalue une observation fantôme tombant dans la fenêtre en détection valide', () => {
    expect(reclassificationForObservation(obs({ timestampTotal: 105 }), WINDOW)).toEqual({
      pointId: 'w11',
      isGhostPoint: false,
    })
  })

  it('ne réévalue pas une observation hors fenêtre', () => {
    expect(reclassificationForObservation(obs({ timestampTotal: 5 }), WINDOW)).toBeNull()
    expect(reclassificationForObservation(obs({ videoId: 'video-b' }), WINDOW)).toBeNull()
  })
})
