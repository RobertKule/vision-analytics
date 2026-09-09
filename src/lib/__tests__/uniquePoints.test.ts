import { describe, expect, it } from 'vitest'
import {
  countGhostEvents,
  countTotalClaims,
  countUniquePoints,
  countUniquePointsByType,
  countWindowsHit,
  precisionFromUniquePoints,
  type GlobalExportRow,
} from '@/lib/globalExportModel'

/**
 * Règle produit « point unique » :
 * pour UN observateur, plusieurs observations certifiées dans la MÊME fenêtre
 * temporelle (`pointId`) du MÊME type comptent pour UN point détecté, pas N.
 * Ces tests portent UNIQUEMENT sur les fonctions pures — aucune base.
 */

function row(partial: Partial<GlobalExportRow>): GlobalExportRow {
  return {
    userId: 'u1',
    username: 'Obs 1',
    email: 'obs1@example.test',
    anonymousId: 'anon-1',
    timestampTotal: 60,
    observationType: 'Faune',
    isGhostPoint: false,
    pointId: 'pt-a',
    pointLabel: 'Point A',
    imageUrl: 'https://img.test/1.png',
    createdAt: '2026-08-10T10:00:00.000Z',
    ...partial,
  }
}

describe('règle produit « point unique » (1 observateur)', () => {
  it('5 captures dont 4 dans la même fenêtre + 1 ailleurs = 2 points uniques (pas 5)', () => {
    const rows: GlobalExportRow[] = [
      row({ pointId: 'pt-a', timestampTotal: 100 }),
      row({ pointId: 'pt-a', timestampTotal: 105 }),
      row({ pointId: 'pt-a', timestampTotal: 110 }),
      row({ pointId: 'pt-a', timestampTotal: 115 }),
      row({ pointId: 'pt-b', timestampTotal: 200 }),
    ]
    expect(countUniquePoints(rows)).toBe(2)
  })

  it('une seule fenêtre capturée N fois = 1 point unique', () => {
    const rows: GlobalExportRow[] = [
      row({ pointId: 'pt-a' }),
      row({ pointId: 'pt-a' }),
      row({ pointId: 'pt-a' }),
    ]
    expect(countUniquePoints(rows)).toBe(1)
  })

  it('les fantômes (hors trame) ne créent aucun point unique', () => {
    const rows: GlobalExportRow[] = [
      row({ pointId: 'pt-a' }),
      row({ isGhostPoint: true, pointId: null }),
      row({ isGhostPoint: true, pointId: null }),
    ]
    expect(countUniquePoints(rows)).toBe(1)
    expect(countGhostEvents(rows)).toBe(2)
  })
})

describe('distinction observateur : union vs détections', () => {
  it('deux observateurs sur la même fenêtre = 2 points uniques mais 1 fenêtre touchée', () => {
    const rows: GlobalExportRow[] = [
      row({ userId: 'u1', pointId: 'pt-a' }),
      row({ userId: 'u2', anonymousId: 'anon-2', pointId: 'pt-a' }),
    ]
    expect(countUniquePoints(rows)).toBe(2)
    expect(countWindowsHit(rows)).toBe(1)
  })

  it('un observateur qui capture deux fenêtres puis deux observateurs sur une 3e', () => {
    const rows: GlobalExportRow[] = [
      row({ userId: 'u1', pointId: 'pt-a' }),
      row({ userId: 'u1', pointId: 'pt-b' }),
      row({ userId: 'u2', anonymousId: 'anon-2', pointId: 'pt-c' }),
      row({ userId: 'u3', anonymousId: 'anon-3', pointId: 'pt-c' }),
    ]
    expect(countUniquePoints(rows)).toBe(4)
    expect(countWindowsHit(rows)).toBe(3)
  })
})

describe('total « déclarations » et précision', () => {
  it('total = points uniques validés + fausses alertes ; précision cohérente', () => {
    const rows: GlobalExportRow[] = [
      row({ pointId: 'pt-a' }),
      row({ pointId: 'pt-a' }),
      row({ pointId: 'pt-b' }),
      row({ isGhostPoint: true, pointId: null }),
      row({ isGhostPoint: true, pointId: null }),
    ]
    expect(countUniquePoints(rows)).toBe(2)
    expect(countGhostEvents(rows)).toBe(2)
    expect(countTotalClaims(rows)).toBe(4)
    expect(precisionFromUniquePoints(rows)).toBeCloseTo(2 / 4, 5)
  })

  it('précision null quand aucune déclaration', () => {
    expect(precisionFromUniquePoints([])).toBeNull()
  })
})

describe('décomposition par type', () => {
  it('clé (observateur, fenêtre) par type : doublon de fenêtre du même type dédupliqué', () => {
    const rows: GlobalExportRow[] = [
      row({ observationType: 'Faune', pointId: 'pt-a' }),
      row({ observationType: 'Faune', pointId: 'pt-a' }), // doublon → ignoré
      row({ observationType: 'Faune', pointId: 'pt-b' }),
      row({ observationType: 'Eau', pointId: 'pt-a' }), // même fenêtre, autre type
    ]
    const byType = countUniquePointsByType(rows)
    expect(byType.get('Faune')).toBe(2)
    expect(byType.get('Eau')).toBe(1)
  })

  it('ignore les lignes sans type et les fantômes', () => {
    const rows: GlobalExportRow[] = [
      row({ observationType: null, pointId: 'pt-a' }),
      row({ observationType: 'Faune', isGhostPoint: true, pointId: null }),
    ]
    const byType = countUniquePointsByType(rows)
    expect(byType.size).toBe(0)
  })
})
