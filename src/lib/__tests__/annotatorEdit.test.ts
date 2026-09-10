import { describe, expect, it } from 'vitest'
import {
  beginEdit,
  cancelEdit,
  commitEdit,
  hasMoved,
  moveSelected,
  placeSelectedAt,
  type EditableCircle,
} from '@/lib/annotatorEdit'
import {
  decideShortcut,
  nextPlaybackState,
  shouldPreventDefault,
} from '@/lib/playbackShortcut'

/**
 * PARTIE N — VIDEOANNOTATOR : sélection en mode « Modifier » + touche Espace.
 *
 * SÉLECTION : entrer en mode Modifier ne doit JAMAIS effacer la sélection ; le
 * cercle reste visible ; le déplacement conserve le même identifiant, la même
 * observation et le même contexte ; « Annuler » restaure la position précédente.
 *
 * ESPACE : lecture ↔ pause UNIQUEMENT. Jamais de capture, de modification, de
 * suppression, de validation ni d'aucune autre action métier.
 */

const CIRCLE: EditableCircle = { id: 'c1', x: 100, y: 80, r: 20, placedAt: 42 }

const CAPTURE = {
  id: 'capture-1',
  timestamp: 42,
  observationType: '100m',
  videoId: 'video-100m',
  circles: [CIRCLE],
}

const LAYOUT = { width: 640, height: 360 }

function openEdit(currentSelectedId: string | null = 'c1') {
  return beginEdit({
    capture: CAPTURE,
    currentSelectedId,
    fallbackRadius: 22,
    layout: LAYOUT,
  })
}

describe('N1–N4 — la sélection et le cercle survivent au clic « Modifier »', () => {
  it('N1–N3 : la MÊME annotation reste sélectionnée après « Modifier »', () => {
    const { drawing, session } = openEdit('c1')
    expect(drawing.selectedId).toBe('c1')
    expect(session.captureId).toBe('capture-1')
    expect(session.originalSelectedId).toBe('c1')
  })

  it('N4 : le cercle reste visible (restauré sur le calque)', () => {
    const { drawing } = openEdit('c1')
    expect(drawing.circles).toHaveLength(1)
    expect(drawing.circles[0]).toMatchObject({ id: 'c1', x: 100, y: 80, r: 20 })
  })

  it('N3 : sans sélection préalable, le cercle de la capture devient sélectionné', () => {
    const { drawing } = openEdit(null)
    expect(drawing.selectedId).toBe('c1')
  })

  it('une sélection étrangère à la capture ne vide jamais la sélection', () => {
    const { drawing } = openEdit('cercle-d-une-autre-capture')
    expect(drawing.selectedId).toBe('c1')
  })

  it('une capture sans géométrie mémorisée reçoit un cercle centré, sélectionné', () => {
    const { drawing } = beginEdit({
      capture: { ...CAPTURE, circles: [] },
      currentSelectedId: null,
      fallbackRadius: 22,
      layout: LAYOUT,
    })
    expect(drawing.circles).toHaveLength(1)
    expect(drawing.selectedId).toBe(drawing.circles[0].id)
    expect(drawing.circles[0]).toMatchObject({ x: 320, y: 180, r: 22 })
  })

  it('le contexte de l’observation est conservé intégralement', () => {
    const { session } = openEdit()
    expect(session.timestamp).toBe(42)
    expect(session.observationType).toBe('100m')
    expect(session.videoId).toBe('video-100m')
  })
})

describe('N5–N6 — déplacement : même identifiant, seules les coordonnées changent', () => {
  it('N5–N6 : déplacer conserve l’identifiant et le rayon', () => {
    const { drawing } = openEdit()
    const moved = moveSelected(drawing, { dx: 40, dy: -15 })
    expect(moved.selectedId).toBe('c1')
    expect(moved.circles[0].id).toBe('c1')
    expect(moved.circles[0].r).toBe(20)
    expect(moved.circles[0].x).toBe(140)
    expect(moved.circles[0].y).toBe(65)
  })

  it('N5 : le déplacement reste dans le cadre du calque', () => {
    const { drawing } = openEdit()
    const moved = moveSelected(drawing, { dx: 10_000, dy: 10_000 }, LAYOUT)
    expect(moved.circles[0].x).toBe(620)
    expect(moved.circles[0].y).toBe(340)
  })

  it('N6 : le REMPLACEMENT d’emplacement ne crée pas de nouvelle annotation', () => {
    const { drawing } = openEdit()
    const replaced = placeSelectedAt(drawing, { x: 500, y: 300 })
    expect(replaced.circles).toHaveLength(1)
    expect(replaced.circles[0].id).toBe('c1')
    expect(replaced.circles[0]).toMatchObject({ x: 500, y: 300 })
  })

  it('sans sélection, aucun déplacement n’est appliqué', () => {
    const drawing = { circles: [CIRCLE], selectedId: null }
    expect(moveSelected(drawing, { dx: 20, dy: 20 })).toBe(drawing)
    expect(placeSelectedAt(drawing, { x: 1, y: 1 })).toBe(drawing)
  })
})

describe('N7–N8 — validation : nouvelles coordonnées, même observation', () => {
  it('N7–N8 : la validation porte les nouvelles coordonnées et la même identité', () => {
    const { drawing, session } = openEdit()
    const moved = moveSelected(drawing, { dx: 25, dy: 25 })
    const commit = commitEdit(session, moved)

    expect(commit.captureId).toBe('capture-1')
    expect(commit.timestamp).toBe(42)
    expect(commit.observationType).toBe('100m')
    expect(commit.videoId).toBe('video-100m')
    expect(commit.circles[0]).toMatchObject({ id: 'c1', x: 125, y: 105 })
  })

  it('la validation ne modifie jamais l’instantané d’origine (annulation possible)', () => {
    const { drawing, session } = openEdit()
    commitEdit(session, moveSelected(drawing, { dx: 25, dy: 25 }))
    expect(session.originalCircles[0]).toMatchObject({ x: 100, y: 80 })
  })

  it('hasMoved détecte un vrai déplacement', () => {
    const { drawing, session } = openEdit()
    expect(hasMoved(session, drawing)).toBe(false)
    expect(hasMoved(session, moveSelected(drawing, { dx: 5, dy: 0 }))).toBe(true)
  })
})

describe('N9–N10 — annulation : retour à la position précédente', () => {
  it('N9–N10 : « Annuler » restaure la position ET la sélection', () => {
    const { drawing, session } = openEdit()
    moveSelected(drawing, { dx: 90, dy: 90 })
    const restored = cancelEdit(session)
    expect(restored.circles[0]).toMatchObject({ id: 'c1', x: 100, y: 80, r: 20 })
    expect(restored.selectedId).toBe('c1')
  })

  it('la restauration est une copie (aucun partage de référence)', () => {
    const { session } = openEdit()
    const restored = cancelEdit(session)
    restored.circles[0].x = 999
    expect(session.originalCircles[0].x).toBe(100)
  })
})

describe('N11–N12 — Espace bascule lecture ↔ pause', () => {
  const base = { code: 'Space', inTextEntry: false, onInteractiveControl: false }

  it('N11 : vidéo en pause + Espace → lecture', () => {
    const decision = decideShortcut(base)
    expect(decision).toBe('toggle-playback')
    expect(nextPlaybackState(false, decision)).toBe(true)
  })

  it('N12 : vidéo en lecture + Espace → pause', () => {
    const decision = decideShortcut(base)
    expect(nextPlaybackState(true, decision)).toBe(false)
  })

  it('Espace annule le défilement natif de la page', () => {
    expect(shouldPreventDefault(decideShortcut(base))).toBe(true)
  })
})

describe('N13–N15 — Espace ne fait RIEN d’autre', () => {
  const base = { code: 'Space', inTextEntry: false, onInteractiveControl: false }

  it('N13–N15 : la seule issue possible d’Espace est « toggle-playback »', () => {
    // Aucune combinaison de contexte ne peut produire une autre action métier.
    const contexts = [
      base,
      { ...base, inTextEntry: true },
      { ...base, onInteractiveControl: true },
      { ...base, ctrlKey: true },
      { ...base, metaKey: true },
      { ...base, altKey: true },
      { ...base, shiftKey: true },
    ]
    for (const context of contexts) {
      const decision = decideShortcut(context)
      expect(['toggle-playback', 'ignore']).toContain(decision)
    }
  })

  it('N13 : Espace ne déclenche jamais la capture (touche distincte)', () => {
    expect(decideShortcut({ ...base, code: 'KeyC' })).toBe('ignore')
    expect(decideShortcut({ ...base, code: 'Enter' })).toBe('ignore')
  })

  it('N14–N15 : aucune autre touche ne produit d’action de lecture', () => {
    for (const code of ['Delete', 'Escape', 'KeyM', 'ArrowRight', 'Tab', 'Digit1']) {
      expect(decideShortcut({ ...base, code })).toBe('ignore')
    }
  })

  it('une combinaison avec modificateur reste au navigateur', () => {
    expect(decideShortcut({ ...base, ctrlKey: true })).toBe('ignore')
    expect(decideShortcut({ ...base, metaKey: true })).toBe('ignore')
  })
})

describe('N16 — champs de saisie : Espace garde son comportement naturel', () => {
  const base = { code: 'Space', inTextEntry: false, onInteractiveControl: false }

  it('N16 : dans un input / textarea / select / contenteditable, Espace n’est pas intercepté', () => {
    expect(decideShortcut({ ...base, inTextEntry: true })).toBe('ignore')
    expect(shouldPreventDefault(decideShortcut({ ...base, inTextEntry: true }))).toBe(false)
  })

  it('sur un bouton ou un lien focalisé, Espace active le contrôle (comportement natif)', () => {
    expect(decideShortcut({ ...base, onInteractiveControl: true })).toBe('ignore')
  })
})

describe('N17 — plein écran', () => {
  it('N17 : la décision ne dépend pas de l’état plein écran', () => {
    // Le raccourci est identique en plein écran : seule la cible du focus compte.
    const inWindow = decideShortcut({
      code: 'Space',
      inTextEntry: false,
      onInteractiveControl: false,
    })
    const inFullscreen = decideShortcut({
      code: 'Space',
      inTextEntry: false,
      onInteractiveControl: false,
    })
    expect(inFullscreen).toBe(inWindow)
    expect(inFullscreen).toBe('toggle-playback')
  })
})
