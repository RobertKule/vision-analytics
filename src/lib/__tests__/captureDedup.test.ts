import { describe, expect, it } from 'vitest'
import {
  DUPLICATE_CAPTURE_TOLERANCE_S,
  findDuplicateCapture,
  type CaptureDedupRecord,
} from '@/lib/captureDedup'

/**
 * Tests purs de la garde anti-doublon de capture au même instant vidéo.
 * Règle : deux captures acceptées au même temps (même passe, même type, à la
 * tolérance près) constituent un doublon — on refuse la seconde avec un message
 * « vous venez juste d'enregistrer la capture pour ce temps ».
 */

describe('findDuplicateCapture — même passe, même type, même instant', () => {
  it('capture au temps exact déjà accepté → doublon détecté (renvoie l’enregistrement)', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 12.34, observationType: '100 m', videoId: 'v1' },
    ]
    const duplicate = findDuplicateCapture({
      records,
      videoId: 'v1',
      observationType: '100 m',
      timestamp: 12.34,
    })
    expect(duplicate).not.toBeNull()
    expect(duplicate?.id).toBe('a')
  })

  it('double clic sans seek : horodatage identique → bloqué', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'x', timestamp: 42.0, observationType: null, videoId: null },
    ]
    expect(
      findDuplicateCapture({ records, videoId: null, observationType: null, timestamp: 42.0 }),
    ).not.toBeNull()
  })

  it('instant voisin dans la tolérance (≈ même frame) → doublon', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 5.001, observationType: '100 m', videoId: 'v1' },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: 'v1',
        observationType: '100 m',
        timestamp: 5.05,
      }),
    ).not.toBeNull()
  })

  it('écart supérieur à la tolérance → aucune capture bloquée', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 10, observationType: '100 m', videoId: 'v1' },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: 'v1',
        observationType: '100 m',
        timestamp: 10 + DUPLICATE_CAPTURE_TOLERANCE_S + 0.001,
      }),
    ).toBeNull()
  })

  it('bord de tolérance inclus (écart === tolérance) → doublon', () => {
    // Valeurs exactement représentables en binaire (tolérance 0,5 ; temps 2 et 2,5) :
    // 0,1 n’étant pas représentable, 20 + 0,1 produirait un écart > 0,1 en virgule
    // flottante et fausserait ce test de borne.
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 2, observationType: '100 m', videoId: 'v1' },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: 'v1',
        observationType: '100 m',
        timestamp: 2.5,
        toleranceS: 0.5,
      }),
    ).not.toBeNull()
  })

  it('tolérance personnalisée (plus stricte) respectée', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 3, observationType: '100 m', videoId: 'v1' },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: 'v1',
        observationType: '100 m',
        timestamp: 3.05,
        toleranceS: 0.01,
      }),
    ).toBeNull()
  })
})

describe('findDuplicateCapture — séparation par passe vidéo et par type', () => {
  it('même instant sur une AUTRE passe (vidéo différente) → aucun doublon', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 8, observationType: '100 m', videoId: 'v1' },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: 'v2',
        observationType: '100 m',
        timestamp: 8,
      }),
    ).toBeNull()
  })

  it('passe générique (videoId null) vs passe typée (videoId réel) → aucun doublon', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'typed', timestamp: 2.5, observationType: '100 m', videoId: 'v1' },
      { id: 'generic', timestamp: 2.5, observationType: null, videoId: null },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: null,
        observationType: null,
        timestamp: 2.5,
      }),
    ).not.toBeNull()
    expect(duplicateId(records, 'v1', '100 m', 2.5)).toBe('typed')
    // La passe typée ne voit PAS la capture générique du même temps.
    const crossGeneric = findDuplicateCapture({
      records,
      videoId: 'v1',
      observationType: '100 m',
      timestamp: 2.5,
    })
    expect(crossGeneric?.id).toBe('typed')
  })

  it('même instant, types DIFFÉRENTS (passe générique) → aucun doublon', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 9, observationType: '100 m', videoId: null },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: null,
        observationType: '250 m',
        timestamp: 9,
      }),
    ).toBeNull()
  })

  it('aucune capture enregistrée → aucune garde déclenchée', () => {
    expect(
      findDuplicateCapture({
        records: [],
        videoId: 'v1',
        observationType: '100 m',
        timestamp: 1,
      }),
    ).toBeNull()
  })

  it('type comparé insensible à la casse et aux espaces (même normalisation que l’annotateur)', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 4, observationType: 'Relais 4×100', videoId: 'v1' },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: 'v1',
        observationType: 'relais  4×100',
        timestamp: 4,
      }),
    ).not.toBeNull()
  })

  it('un type absent (null) et un type vide restent équivalents côté passe générique', () => {
    const records: CaptureDedupRecord[] = [
      { id: 'a', timestamp: 7, observationType: '', videoId: undefined },
    ]
    expect(
      findDuplicateCapture({
        records,
        videoId: null,
        observationType: null,
        timestamp: 7,
      }),
    ).not.toBeNull()
  })
})

function duplicateId(
  records: readonly CaptureDedupRecord[],
  videoId: string | null,
  observationType: string | null,
  timestamp: number,
): string | null {
  return findDuplicateCapture({ records, videoId, observationType, timestamp })?.id ?? null
}
