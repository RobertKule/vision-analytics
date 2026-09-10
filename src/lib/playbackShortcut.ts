/**
 * RACCOURCI CLAVIER « ESPACE » — noyau PUR (aucun DOM, testable).
 *
 * ─── RÈGLE (Partie G) ───────────────────────────────────────────────────────
 * ESPACE = LECTURE / PAUSE, ET RIEN D'AUTRE.
 *
 *   vidéo en pause   + Espace → lecture
 *   vidéo en lecture + Espace → pause
 *
 * Espace ne doit JAMAIS déclencher : capture, modification, suppression,
 * validation, passage au suivant, changement de type, changement de fenêtre, ni
 * aucune autre action métier. Cette fonction est le SEUL point de décision : elle
 * ne renvoie que `toggle-playback` ou `ignore`.
 *
 * Dans un champ de saisie (input, textarea, select, contenteditable), Espace
 * conserve son comportement naturel — la frappe n'est jamais interceptée.
 *
 * Le raccourci reste actif en plein écran : la décision ne dépend pas de l'état
 * plein écran, seulement de la cible du focus et des modificateurs.
 */

/** Décision prise pour une frappe clavier. */
export type ShortcutDecision =
  /** Basculer lecture ↔ pause (SEULE action possible pour Espace). */
  | 'toggle-playback'
  /** Ne rien faire (et laisser le navigateur agir normalement). */
  | 'ignore'

export type KeyContext = {
  /** `KeyboardEvent.code` (« Space », « KeyC »…). */
  code: string
  /** Vrai si le focus est dans un champ de saisie ou un contenu éditable. */
  inTextEntry: boolean
  /** Vrai si le focus est sur un contrôle activable (bouton, lien). */
  onInteractiveControl: boolean
  /** Modificateurs actifs : une combinaison n'est jamais un raccourci de lecture. */
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

/**
 * Décide de l'action d'une frappe. Espace est le seul code reconnu, et sa seule
 * issue possible est `toggle-playback`.
 */
export function decideShortcut(context: KeyContext): ShortcutDecision {
  if (context.code !== 'Space') return 'ignore'
  // Champ de saisie : l'espace doit rester un espace.
  if (context.inTextEntry) return 'ignore'
  // Bouton / lien focalisé : Espace conserve son rôle natif (activer le contrôle).
  if (context.onInteractiveControl) return 'ignore'
  // Une combinaison (Ctrl/Cmd/Alt/Maj + Espace) appartient au système ou au navigateur.
  if (context.ctrlKey || context.metaKey || context.altKey || context.shiftKey) return 'ignore'
  return 'toggle-playback'
}

/** Vrai si la frappe doit annuler le défilement natif de la page. */
export function shouldPreventDefault(decision: ShortcutDecision): boolean {
  return decision === 'toggle-playback'
}

/** Prochain état de lecture après application de la décision. */
export function nextPlaybackState(isPlaying: boolean, decision: ShortcutDecision): boolean {
  return decision === 'toggle-playback' ? !isPlaying : isPlaying
}

/** Sélecteur des cibles où Espace garde son comportement naturel. */
export const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

/** Sélecteur des contrôles activables par Espace (comportement natif conservé). */
export const INTERACTIVE_CONTROL_SELECTOR = 'button, a'
