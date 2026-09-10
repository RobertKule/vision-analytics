/**
 * MODE « MODIFIER » DE L'ANNOTATEUR — noyau PUR (aucun DOM, testable).
 *
 * ─── COMPORTEMENT ATTENDU (Partie F) ────────────────────────────────────────
 *   annotation sélectionnée → clic « Modifier » → LA MÊME annotation est TOUJOURS
 *   sélectionnée, son cercle reste visible, et le mode édition est actif.
 *
 * Entrer en mode Modifier ne doit JAMAIS appeler une logique qui efface la
 * sélection : `beginEdit` conserve `selectedAnnotationId`, la position courante,
 * le contexte (type, passe vidéo, horodatage) et la visibilité du cercle.
 *
 * Le déplacement conserve la MÊME annotation, le MÊME identifiant, la MÊME
 * observation et le MÊME contexte : seules les COORDONNÉES changent.
 *
 * « Annuler » revient à la position précédente, et la sélection reste cohérente
 * (le cercle d'origine redevient le cercle sélectionné).
 */

/** Cercle d'annotation (coordonnées en pixels CSS du calque). */
export type EditableCircle = {
  id: string
  x: number
  y: number
  r: number
  placedAt: number
}

/** Capture en cours de modification (identité analytique inchangée). */
export type EditSession = {
  /** Identifiant de la capture modifiée — jamais régénéré. */
  captureId: string
  /** Horodatage vidéo de la capture (la frame de référence de l'édition). */
  timestamp: number
  /** Type d'observation d'origine (contexte conservé). */
  observationType: string | null
  /** Passe vidéo d'origine (contexte conservé). */
  videoId: string | null
  /** Cercles tels qu'ils étaient à l'ouverture — base du « Annuler ». */
  originalCircles: EditableCircle[]
  /** Cercle sélectionné à l'ouverture — la sélection ne disparaît jamais. */
  originalSelectedId: string | null
}

/** État de dessin de l'annotateur pertinent pour l'édition. */
export type EditDrawingState = {
  circles: EditableCircle[]
  selectedId: string | null
}

export type BeginEditInput = {
  capture: {
    id: string
    timestamp: number
    observationType: string | null
    videoId?: string | null
    /** Cercles mémorisés à la capture (vide pour une capture historique). */
    circles?: readonly EditableCircle[] | null
  }
  /** Cercle actuellement sélectionné à l'écran, s'il appartient à cette capture. */
  currentSelectedId?: string | null
  /** Rayon par défaut si la capture ne porte aucune géométrie mémorisée. */
  fallbackRadius: number
  /** Dimensions du calque, pour placer un cercle de repli au centre. */
  layout: { width: number; height: number }
}

export type BeginEditResult = {
  session: EditSession
  drawing: EditDrawingState
}

/**
 * Entre en mode Modifier SANS jamais effacer la sélection.
 *
 * Les cercles de la capture sont restaurés sur le calque et l'un d'eux reste
 * sélectionné : celui déjà sélectionné s'il appartient à la capture, sinon le
 * premier cercle de la capture. Une capture sans géométrie mémorisée (ligne
 * historique) reçoit un cercle de repli centré, immédiatement sélectionné — le
 * cercle est donc TOUJOURS visible en entrant en édition.
 */
export function beginEdit(input: BeginEditInput): BeginEditResult {
  const stored = (input.capture.circles ?? []).map((circle) => ({ ...circle }))
  const circles: EditableCircle[] =
    stored.length > 0
      ? stored
      : [
          {
            id: `${input.capture.id}-edit`,
            x: Math.max(input.fallbackRadius, input.layout.width / 2),
            y: Math.max(input.fallbackRadius, input.layout.height / 2),
            r: input.fallbackRadius,
            placedAt: input.capture.timestamp,
          },
        ]

  const requested = input.currentSelectedId ?? null
  const keepsRequested = requested !== null && circles.some((circle) => circle.id === requested)
  const selectedId = keepsRequested ? requested : (circles[0]?.id ?? null)

  return {
    session: {
      captureId: input.capture.id,
      timestamp: input.capture.timestamp,
      observationType: input.capture.observationType,
      videoId: input.capture.videoId ?? null,
      originalCircles: circles.map((circle) => ({ ...circle })),
      originalSelectedId: selectedId,
    },
    drawing: { circles, selectedId },
  }
}

/**
 * Déplace le cercle sélectionné : MÊME identifiant, MÊME contexte — seules les
 * coordonnées changent. Un déplacement sans sélection est sans effet.
 */
export function moveSelected(
  drawing: EditDrawingState,
  delta: { dx: number; dy: number },
  bounds?: { width: number; height: number },
): EditDrawingState {
  const selectedId = drawing.selectedId
  if (!selectedId) return drawing
  const circles = drawing.circles.map((circle) => {
    if (circle.id !== selectedId) return circle
    const nextX = circle.x + delta.dx
    const nextY = circle.y + delta.dy
    if (!bounds) return { ...circle, x: nextX, y: nextY }
    return {
      ...circle,
      x: Math.min(Math.max(nextX, circle.r), Math.max(circle.r, bounds.width - circle.r)),
      y: Math.min(Math.max(nextY, circle.r), Math.max(circle.r, bounds.height - circle.r)),
    }
  })
  return { circles, selectedId }
}

/**
 * REMPLACEMENT de l'emplacement : le cercle sélectionné est repositionné à un
 * point absolu (clic sur une autre zone). L'annotation reste la même — aucune
 * nouvelle annotation n'est créée pendant une édition.
 */
export function placeSelectedAt(
  drawing: EditDrawingState,
  point: { x: number; y: number },
): EditDrawingState {
  const selectedId = drawing.selectedId
  if (!selectedId) return drawing
  return {
    selectedId,
    circles: drawing.circles.map((circle) =>
      circle.id === selectedId ? { ...circle, x: point.x, y: point.y } : circle,
    ),
  }
}

/** « Annuler » : restaure la position précédente ET la sélection d'origine. */
export function cancelEdit(session: EditSession): EditDrawingState {
  return {
    circles: session.originalCircles.map((circle) => ({ ...circle })),
    selectedId: session.originalSelectedId,
  }
}

/** Vrai si la géométrie a réellement bougé depuis l'ouverture de l'édition. */
export function hasMoved(session: EditSession, drawing: EditDrawingState): boolean {
  if (session.originalCircles.length !== drawing.circles.length) return true
  for (const circle of drawing.circles) {
    const original = session.originalCircles.find((item) => item.id === circle.id)
    if (!original) return true
    if (original.x !== circle.x || original.y !== circle.y || original.r !== circle.r) return true
  }
  return false
}

/**
 * Validation : décrit la capture à réécrire. L'identité analytique est conservée
 * intégralement (identifiant, horodatage, type, passe vidéo) — seule l'image
 * (donc les coordonnées du cercle) change.
 */
export type EditCommit = {
  captureId: string
  timestamp: number
  observationType: string | null
  videoId: string | null
  circles: EditableCircle[]
}

export function commitEdit(session: EditSession, drawing: EditDrawingState): EditCommit {
  return {
    captureId: session.captureId,
    timestamp: session.timestamp,
    observationType: session.observationType,
    videoId: session.videoId,
    circles: drawing.circles.map((circle) => ({ ...circle })),
  }
}
