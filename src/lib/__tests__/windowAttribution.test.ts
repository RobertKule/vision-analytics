import { describe, expect, it } from 'vitest'
import {
  ancestorIds,
  assignWindows,
  buildWindowHierarchy,
  descendantIds,
  logicalPointKey,
  type AttributionRow,
  type AttributionWindow,
} from '@/lib/windowAttribution'
import {
  computeAnalyticsMetrics,
  rematchRowsToWindows,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type SnapshotPoint,
} from '@/lib/analyticsVersioning'
import { countAnalyticDetections } from '@/lib/globalExportModel'

/**
 * MOTEUR D'ATTRIBUTION DES TRAMES — tests purs.
 *
 * Le moteur doit garantir, dans tous les cas :
 *  — une capture n'est attribuée qu'à UNE SEULE fenêtre ;
 *  — l'ordre de priorité est total et déterministe ;
 *  — l'état « fenêtre satisfaite » est propre à chaque observateur ;
 *  — un point logique peut porter plusieurs fenêtres.
 */

const TYPE = 'Faune'

/** Fenêtre [debut, fin] sur la passe générique par défaut. */
function w(id: string, debut: number, fin: number, videoId: string | null = null): AttributionWindow {
  return { id, videoId, trameDebut: debut, trameFin: fin }
}

function row(partial: Partial<AttributionRow> & { timestampTotal: number }): AttributionRow {
  return {
    userId: 'A',
    videoId: null,
    observationType: TYPE,
    createdAt: '2026-09-11T10:00:00.000Z',
    ...partial,
  }
}

/** Identifiants retenus pour une liste de captures, dans l'ordre chronologique. */
function assigned(
  windows: readonly AttributionWindow[],
  rows: readonly AttributionRow[],
): (string | null)[] {
  return assignWindows(rows, windows).map((outcome) => outcome.windowId)
}

// ——————————————————————————————————————————————————————————————
// A. Une seule fenêtre
// ——————————————————————————————————————————————————————————————

describe('A. Une seule fenêtre', () => {
  const W = [w('w1', 100, 110)]

  it('capture dans la fenêtre ⇒ attribuée', () => {
    expect(assigned(W, [row({ timestampTotal: 100 })])).toEqual(['w1'])
  })

  it('bornes incluses', () => {
    expect(assigned(W, [row({ timestampTotal: 110 })])).toEqual(['w1'])
  })

  it('capture hors fenêtre ⇒ point fantôme', () => {
    const outcomes = assignWindows([row({ timestampTotal: 99 }), row({ timestampTotal: 111 })], W)
    expect(outcomes.map((o) => o.windowId)).toEqual([null, null])
    expect(outcomes.every((o) => o.isGhost)).toBe(true)
  })

  it('la portée de passe vidéo est respectée', () => {
    const windows = [w('w1', 100, 110, 'video-A')]
    expect(assigned(windows, [row({ timestampTotal: 105 })])).toEqual([null]) // capture générique
    expect(assigned(windows, [row({ timestampTotal: 105, videoId: 'video-A' })])).toEqual(['w1'])
  })
})

// ——————————————————————————————————————————————————————————————
// B. Plusieurs fenêtres pour un même point logique
// ——————————————————————————————————————————————————————————————

describe('B. Un point logique, plusieurs fenêtres', () => {
  const W = [w('p1a', 10, 20), w('p1b', 65, 72), w('p1c', 220, 235)]

  it('chaque intervalle reçoit sa capture', () => {
    expect(
      assigned(W, [
        row({ timestampTotal: 12 }),
        row({ timestampTotal: 68 }),
        row({ timestampTotal: 230 }),
      ]),
    ).toEqual(['p1a', 'p1b', 'p1c'])
  })

  it('les trois fenêtres relèvent du MÊME point logique', () => {
    const labels = new Map([
      ['p1a', 'Point 1'],
      ['p1b', 'Point 1'],
      ['p1c', 'Point 1'],
    ])
    const keys = W.map((window) => logicalPointKey(window, labels.get(window.id)))
    expect(new Set(keys).size).toBe(1)
  })

  it('une fenêtre déjà satisfaite n’absorbe pas indûment les autres intervalles', () => {
    // Deux captures dans p1a et une dans p1b : aucun double comptage.
    expect(
      assigned(W, [
        row({ timestampTotal: 12 }),
        row({ timestampTotal: 13 }),
        row({ timestampTotal: 68 }),
      ]),
    ).toEqual(['p1a', 'p1a', 'p1b'])
  })
})

// ——————————————————————————————————————————————————————————————
// C. Fenêtres imbriquées — parent / enfant
// ——————————————————————————————————————————————————————————————

describe('C. Fenêtres imbriquées', () => {
  const PARENT = w('parent', 10, 20)
  const CHILD = w('child', 12, 15)

  it('parent seul ⇒ la capture va au parent', () => {
    expect(assigned([PARENT], [row({ timestampTotal: 13 })])).toEqual(['parent'])
  })

  it('enfant seul ⇒ la capture va à l’enfant', () => {
    expect(assigned([CHILD], [row({ timestampTotal: 13 })])).toEqual(['child'])
  })

  it('parent + enfant, 1 occurrence ⇒ l’ENFANT (le plus spécifique)', () => {
    expect(assigned([PARENT, CHILD], [row({ timestampTotal: 13 })])).toEqual(['child'])
  })

  it('parent + enfant, 2 occurrences ⇒ enfant = 1, parent = 1', () => {
    const result = assigned([PARENT, CHILD], [
      row({ timestampTotal: 13 }),
      row({ timestampTotal: 14 }),
    ])
    expect(result).toEqual(['child', 'parent'])
    // Aucune capture n'est comptée deux fois : 2 occurrences au total.
    expect(result.filter((id) => id === 'child')).toHaveLength(1)
    expect(result.filter((id) => id === 'parent')).toHaveLength(1)
  })

  it('parent + enfant, 3 occurrences ⇒ remontée puis repli sur la meilleure candidate', () => {
    const result = assigned([PARENT, CHILD], [
      row({ timestampTotal: 13 }),
      row({ timestampTotal: 14 }),
      row({ timestampTotal: 15 }),
    ])
    expect(result).toEqual(['child', 'parent', 'child'])
    // Détections analytiques distinctes = 2 (jamais 3).
    expect(new Set(result.filter((id): id is string => id !== null)).size).toBe(2)
  })

  it('l’ordre des captures ne dépend pas de l’ordre d’entrée (déterminisme)', () => {
    const rows = [
      row({ timestampTotal: 14, id: 'b' }),
      row({ timestampTotal: 13, id: 'a' }),
    ]
    expect(assigned([PARENT, CHILD], rows)).toEqual(['parent', 'child'])
    expect(
      assigned([PARENT, CHILD], [
        row({ timestampTotal: 13, id: 'a' }),
        row({ timestampTotal: 14, id: 'b' }),
      ]),
    ).toEqual(['child', 'parent'])
  })

  it('la hiérarchie est calculée depuis les intervalles', () => {
    const hierarchy = buildWindowHierarchy([PARENT, CHILD])
    expect(hierarchy.parentId.get('child')).toBe('parent')
    expect(hierarchy.parentId.get('parent')).toBeNull()
    expect(hierarchy.depth.get('parent')).toBe(0)
    expect(hierarchy.depth.get('child')).toBe(1)
    expect(descendantIds(hierarchy, 'parent')).toEqual(['child'])
    expect(ancestorIds(hierarchy, 'child')).toEqual(['parent'])
  })
})

// ——————————————————————————————————————————————————————————————
// D. Plusieurs niveaux — attribution progressive
// ——————————————————————————————————————————————————————————————

describe('D. Trois niveaux (parent → enfant → petit-enfant)', () => {
  const P = w('P', 10, 20)
  const E = w('E', 12, 18)
  const PE = w('PE', 14, 16)

  it('profondeurs : 0, 1, 2', () => {
    const hierarchy = buildWindowHierarchy([P, E, PE])
    expect(hierarchy.depth.get('P')).toBe(0)
    expect(hierarchy.depth.get('E')).toBe(1)
    expect(hierarchy.depth.get('PE')).toBe(2)
    expect(ancestorIds(hierarchy, 'PE')).toEqual(['E', 'P'])
    expect(descendantIds(hierarchy, 'P').sort()).toEqual(['E', 'PE'])
  })

  it('3 occurrences dans la zone commune ⇒ petit-enfant, enfant, parent', () => {
    expect(
      assigned([P, E, PE], [
        row({ timestampTotal: 14 }),
        row({ timestampTotal: 15 }),
        row({ timestampTotal: 16 }),
      ]),
    ).toEqual(['PE', 'E', 'P'])
  })

  it('une 4ᵉ occurrence reste sur la meilleure candidate sans créer de détection', () => {
    // Traitées chronologiquement : 14, 14.5, 15 puis 16 — le résultat est écrit À
    // L'INDEX DE LA CAPTURE, donc dans l'ordre d'entrée.
    const result = assigned([P, E, PE], [
      row({ timestampTotal: 14 }), // → PE
      row({ timestampTotal: 15 }), // → P (PE puis E déjà satisfaites)
      row({ timestampTotal: 16 }), // → repli sur PE (toutes satisfaites)
      row({ timestampTotal: 14.5 }), // → E
    ])
    expect(result).toEqual(['PE', 'P', 'PE', 'E'])
    // 4 captures, mais seulement 3 cibles analytiques distinctes.
    expect(new Set(result).size).toBe(3)
    expect(result).toHaveLength(4)
  })

  it('hors du petit-enfant mais dans l’enfant ⇒ l’enfant', () => {
    expect(assigned([P, E, PE], [row({ timestampTotal: 13 })])).toEqual(['E'])
  })

  it('hors de l’enfant mais dans le parent ⇒ le parent', () => {
    expect(assigned([P, E, PE], [row({ timestampTotal: 19 })])).toEqual(['P'])
  })
})

// ——————————————————————————————————————————————————————————————
// E. Fenêtres qui se chevauchent sans imbrication
// ——————————————————————————————————————————————————————————————

describe('E. Chevauchement A [10,20] / B [16,25]', () => {
  const A = w('A', 10, 20)
  const B = w('B', 16, 25)

  it('aucune des deux ne contient l’autre ⇒ même niveau', () => {
    const hierarchy = buildWindowHierarchy([A, B])
    expect(hierarchy.depth.get('A')).toBe(0)
    expect(hierarchy.depth.get('B')).toBe(0)
    expect(hierarchy.parentId.get('A')).toBeNull()
    expect(hierarchy.parentId.get('B')).toBeNull()
  })

  it('capture dans l’intersection ⇒ celle qui SE TERME LE PLUS TÔT (A)', () => {
    expect(assigned([A, B], [row({ timestampTotal: 17 })])).toEqual(['A'])
  })

  it('seconde occurrence dans l’intersection ⇒ B (A déjà satisfaite)', () => {
    expect(
      assigned([A, B], [row({ timestampTotal: 17 }), row({ timestampTotal: 18 })]),
    ).toEqual(['A', 'B'])
  })

  it('capture hors intersection ⇒ la seule couvrante', () => {
    expect(assigned([A, B], [row({ timestampTotal: 12 })])).toEqual(['A'])
    expect(assigned([A, B], [row({ timestampTotal: 23 })])).toEqual(['B'])
  })

  it('scénario 8 du cahier des charges : A/B/C et trois captures', () => {
    // A [10,20] · B [16,25] · C [17,18]
    const C = w('C', 17, 18)
    expect(
      assigned([A, B, C], [
        row({ timestampTotal: 17.17 }),
        row({ timestampTotal: 17.5 }),
        row({ timestampTotal: 18.5 }),
      ]),
    ).toEqual(['C', 'A', 'B'])
  })
})

// ——————————————————————————————————————————————————————————————
// F. Égalités — identifiant stable
// ——————————————————————————————————————————————————————————————

describe('F. Égalités entre fenêtres candidates', () => {
  it('intervalles IDENTIQUES ⇒ départage par identifiant stable', () => {
    const x = w('x', 10, 20)
    const y = w('y', 10, 20)
    // L'égalité exacte n'est pas une inclusion : même niveau.
    const hierarchy = buildWindowHierarchy([x, y])
    expect(hierarchy.depth.get('x')).toBe(0)
    expect(hierarchy.depth.get('y')).toBe(0)
    expect(assigned([x, y], [row({ timestampTotal: 15 })])).toEqual(['x'])
    expect(assigned([x, y], [row({ timestampTotal: 15 }), row({ timestampTotal: 16 })])).toEqual([
      'x',
      'y',
    ])
  })

  it('l’ordre d’entrée des fenêtres ne change pas le résultat', () => {
    const x = w('x', 10, 20)
    const y = w('y', 10, 20)
    expect(assigned([y, x], [row({ timestampTotal: 15 })])).toEqual(['x'])
  })

  it('même début ⇒ la plus SPÉCIFIQUE (incluse) gagne', () => {
    const outer = w('outer', 10, 25)
    const inner = w('inner', 10, 20)
    expect(assigned([outer, inner], [row({ timestampTotal: 15 })])).toEqual(['inner'])
    expect(assigned([outer, inner], [row({ timestampTotal: 15 }), row({ timestampTotal: 16 })])).toEqual(
      ['inner', 'outer'],
    )
  })
})

// ——————————————————————————————————————————————————————————————
// G. Plusieurs observateurs — états « satisfaite » indépendants
// ——————————————————————————————————————————————————————————————

describe('G. Plusieurs observateurs', () => {
  const PARENT = w('parent', 10, 20)
  const CHILD = w('child', 12, 15)

  it('chaque observateur possède son propre état « fenêtre satisfaite »', () => {
    const result = assigned([PARENT, CHILD], [
      row({ userId: 'A', timestampTotal: 13 }),
      row({ userId: 'B', timestampTotal: 13 }),
      row({ userId: 'A', timestampTotal: 14 }),
      row({ userId: 'B', timestampTotal: 14 }),
    ])
    // Chaque observateur remonte SA propre échelle : enfant puis parent. S'il n'y
    // avait qu'un état partagé, A satisferait l'enfant pour tout le monde.
    expect(result).toEqual(['child', 'child', 'parent', 'parent'])
    expect(result.filter((id) => id === 'child')).toHaveLength(2)
    expect(result.filter((id) => id === 'parent')).toHaveLength(2)
  })

  it('un observateur qui ne capture qu’une fois n’épuise pas l’enfant des autres', () => {
    const result = assigned([PARENT, CHILD], [
      row({ userId: 'A', timestampTotal: 13 }),
      row({ userId: 'B', timestampTotal: 14 }),
    ])
    expect(result).toEqual(['child', 'child'])
  })

  it('le type d’observation sépare aussi l’état « satisfaite »', () => {
    const result = assigned([PARENT, CHILD], [
      row({ userId: 'A', timestampTotal: 13, observationType: 'Faune' }),
      row({ userId: 'A', timestampTotal: 14, observationType: 'Flore' }),
    ])
    // Types différents ⇒ chacun satisfait l'enfant de son côté.
    expect(result).toEqual(['child', 'child'])
  })
})

// ——————————————————————————————————————————————————————————————
// Scénario scientifique minimal (section 21 du cahier des charges)
// ——————————————————————————————————————————————————————————————

describe('Scénario scientifique minimal (section 21)', () => {
  const F1 = w('F1', 10, 20)
  const F2 = w('F2', 12, 15)
  const F3 = w('F3', 16, 25)

  it('F1/F2 : deux captures ⇒ enfant = 1, parent = 1', () => {
    const result = assigned([F1, F2], [row({ timestampTotal: 13 }), row({ timestampTotal: 14 })])
    expect(result.filter((id) => id === 'F2')).toHaveLength(1)
    expect(result.filter((id) => id === 'F1')).toHaveLength(1)
  })

  it('F1/F3 : la capture de 00:17 va à F1 (fin la plus précoce)', () => {
    expect(assigned([F1, F3], [row({ timestampTotal: 17 })])).toEqual(['F1'])
  })

  it('F1 déjà satisfaite ⇒ la capture de 00:18 va à F3', () => {
    expect(
      assigned([F1, F3], [row({ timestampTotal: 17 }), row({ timestampTotal: 18 })]),
    ).toEqual(['F1', 'F3'])
  })

  it('le résultat est stable sur 20 exécutions', () => {
    const rows = [
      row({ timestampTotal: 13 }),
      row({ timestampTotal: 14 }),
      row({ timestampTotal: 17 }),
      row({ timestampTotal: 18 }),
    ]
    const reference = assigned([F1, F2, F3], rows)
    for (let i = 0; i < 20; i += 1) {
      expect(assigned([F1, F2, F3], rows)).toEqual(reference)
    }
  })
})

// ——————————————————————————————————————————————————————————————
// Intégration avec le moteur analytique (rows + métriques)
// ——————————————————————————————————————————————————————————————

function snapshotPoint(
  id: string,
  label: string,
  debut: number,
  fin: number,
  videoId: string | null = null,
): SnapshotPoint {
  return { id, label, trameDebut: debut, trameFin: fin, videoId, videoName: null, type: videoId ? TYPE : '' }
}

function config(points: SnapshotPoint[]): AnalyticsPerimeterConfig {
  return {
    projectId: 'p1',
    projectTitle: 'Étude',
    observationTypes: [TYPE],
    points,
    videos: [],
  }
}

function obsRow(partial: Partial<AnalyticsObservationRow> & { timestampTotal: number }): AnalyticsObservationRow {
  return {
    id: `obs-${partial.timestampTotal}-${partial.userId ?? 'A'}`,
    userId: 'A',
    username: 'Obs A',
    email: 'a@example.test',
    anonymousId: 'anon-a',
    observationType: TYPE,
    isGhostPoint: true,
    pointId: null,
    pointLabel: null,
    imageUrl: '',
    videoId: null,
    createdAt: '2026-09-11T10:00:00.000Z',
    ...partial,
  }
}

describe('Intégration : rematchRowsToWindows + métriques', () => {
  const points = [snapshotPoint('parent', 'Point 1', 10, 20), snapshotPoint('child', 'Point 2', 12, 15)]

  it('2 captures imbriquées ⇒ 2 détections distinctes (enfant + parent)', () => {
    const rows = [obsRow({ timestampTotal: 13 }), obsRow({ timestampTotal: 14 })]
    const rematched = rematchRowsToWindows(rows, config(points))
    expect(rematched.map((r) => r.pointId)).toEqual(['child', 'parent'])
    expect(rematched.every((r) => !r.isGhostPoint)).toBe(true)
    expect(countAnalyticDetections(rematched)).toBe(2)

    const metrics = computeAnalyticsMetrics(config(points), rematched)
    const child = metrics.perPoint.find((p) => p.pointId === 'child')
    const parent = metrics.perPoint.find((p) => p.pointId === 'parent')
    expect(child?.detections).toBe(1)
    expect(parent?.detections).toBe(1)
    expect(metrics.ghostEvents).toBe(0)
  })

  it('le relevé BRUT est intégralement conservé (aucune capture perdue)', () => {
    const rows = [obsRow({ timestampTotal: 13 }), obsRow({ timestampTotal: 14 }), obsRow({ timestampTotal: 99 })]
    const rematched = rematchRowsToWindows(rows, config(points))
    expect(rematched).toHaveLength(3)
    const computed = computeAnalyticsMetrics(config(points), rematched)
    expect(computed.rawCaptureCount).toBe(3)
    expect(computed.ghostEvents).toBe(1)
  })

  it('ajouter une fenêtre imbriquée reclasse les captures historiques', () => {
    const rows = [obsRow({ timestampTotal: 13 }), obsRow({ timestampTotal: 14 })]
    const before = rematchRowsToWindows(rows, config([snapshotPoint('parent', 'Point 1', 10, 20)]))
    expect(before.map((r) => r.pointId)).toEqual(['parent', 'parent'])
    const after = rematchRowsToWindows(rows, config(points))
    expect(after.map((r) => r.pointId)).toEqual(['child', 'parent'])
  })

  it('une fenêtre imbriquée AJOUTÉE ne multiplie jamais les occurrences', () => {
    const rows = [obsRow({ timestampTotal: 13 }), obsRow({ timestampTotal: 14 })]

    // Avant : une seule fenêtre. Les 2 captures y tombent, mais la règle produit
    // « une détection = (observateur, type, fenêtre) » n'en compte qu'UNE.
    const beforeConfig = config([snapshotPoint('parent', 'Point 1', 10, 20)])
    const before = computeAnalyticsMetrics(beforeConfig, rematchRowsToWindows(rows, beforeConfig))
    expect(before.detections).toBe(1)

    // Après : la fenêtre enfant reçoit la 1ʳᵉ occurrence, le parent la 2ᵉ.
    const afterConfig = config(points)
    const after = computeAnalyticsMetrics(afterConfig, rematchRowsToWindows(rows, afterConfig))
    expect(after.detections).toBe(2)

    // Dans TOUS les cas : aucune capture perdue, aucune fausse alerte inventée, et
    // jamais plus de détections que de captures.
    for (const computed of [before, after]) {
      expect(computed.rawCaptureCount).toBe(2)
      expect(computed.ghostEvents).toBe(0)
      expect(computed.detections).toBeLessThanOrEqual(computed.rawCaptureCount)
    }
    // Le DÉNOMINATEUR, lui, suit la configuration courante.
    expect(before.configuredPoints).toBe(1)
    expect(after.configuredPoints).toBe(2)
  })
})
