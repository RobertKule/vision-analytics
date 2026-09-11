/**
 * RÈGLE DE SAISIE DES TRAMES (§2) — noyau PUR, partagé par TOUTES les surfaces.
 *
 * Un point scientifique peut apparaître plusieurs fois dans une vidéo : la saisie
 * accepte donc N trames d'un seul geste. Deux règles seulement s'appliquent, et
 * elles doivent être STRICTEMENT les mêmes côté interface et côté serveur — sinon
 * une saisie acceptée à l'écran serait refusée par l'action, ou l'inverse.
 *
 *   1. BORNES : la fin est strictement supérieure au début (`MM:SS` / `HH:MM:SS`).
 *      C'est la même règle que celle du moteur d'attribution.
 *   2. DOUBLON EXACT : deux trames de mêmes bornes sont refusées — avec l'existant
 *      comme à l'intérieur d'une même soumission. Elles n'apporteraient rien et
 *      rendraient l'attribution ambiguë pour rien.
 *
 * En revanche, les CHEVAUCHEMENTS et les INCLUSIONS sont AUTORISÉS : un point large
 * (100–160) et sa trame précise (120–130) coexistent, et c'est le moteur
 * (`windowAttribution`) qui arbitre la hiérarchie parent/enfant de façon
 * déterministe. Ce module ne les interdit donc jamais.
 *
 * Ce module ne connaît AUCUN libellé : il renvoie des CODES, que chaque surface
 * traduit (i18n) ou transforme en message serveur.
 */

import { parseTimecodeToSeconds } from '@/lib/timecode'

/** Bornes numériques d'une trame, en secondes entières. */
export type WindowBounds = { trameDebut: number; trameFin: number }

/** Garde-fou serveur : au-delà, une seule soumission devient déraisonnable. */
export const MAX_WINDOWS_PER_SUBMISSION = 200

/** Garde-fou d'interface : lisibilité du tiroir de saisie (bien en deçà du serveur). */
export const MAX_WINDOW_ROWS = 50

/** Motif de refus d'un lot de trames (traduit par l'appelant). */
export type WindowBoundsError =
  /** Au moins une borne n'est pas une seconde entière ≥ 0. */
  | 'not-integer'
  /** Fin ≤ début : le début doit précéder la fin. */
  | 'bounds'
  /** Bornes identiques à une trame existante ou à une autre ligne du lot. */
  | 'duplicate'
  /** Aucune trame fournie. */
  | 'empty'
  /** Lot trop volumineux. */
  | 'count'

/** Clé d'identité d'une trame : deux bornes égales = un doublon exact. */
export function windowBoundsKey(bounds: {
  trameDebut: number
  trameFin: number
}): string {
  return `${bounds.trameDebut}-${bounds.trameFin}`
}

/** Clés des trames déjà définies, prêtes pour la détection de doublons. */
export function windowBoundsKeys(bounds: Iterable<{ trameDebut: number; trameFin: number }>): Set<string> {
  const keys = new Set<string>()
  for (const item of bounds) keys.add(windowBoundsKey(item))
  return keys
}

function parseWholeSeconds(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

/**
 * Valide un LOT de trames avant création — la règle unique des Server Actions.
 *
 * `existingKeys` provient des trames déjà rattachées à la MÊME passe vidéo (les
 * fenêtres génériques partagent un espace d'attribution commun ; les passes typées
 * ont chacune le leur). Les doublons internes au lot sont détectés par la même
 * passe, ce qui interdit d'envoyer deux fois la même trame d'un coup.
 */
export type WindowBoundsResult =
  | { ok: true; windows: WindowBounds[] }
  /** `conflict` porte la trame fautive : l'appelant peut la nommer dans son message. */
  | { ok: false; error: WindowBoundsError; conflict?: WindowBounds }

export function validateWindowBounds(
  candidates: readonly unknown[],
  existingKeys: Iterable<string>,
  options?: { maxWindows?: number },
): WindowBoundsResult {
  const maxWindows = options?.maxWindows ?? MAX_WINDOWS_PER_SUBMISSION
  const raw = Array.isArray(candidates) ? candidates : []
  if (raw.length === 0) return { ok: false, error: 'empty' }
  if (raw.length > maxWindows) return { ok: false, error: 'count' }

  const windows: WindowBounds[] = []
  for (const candidate of raw) {
    const trameDebut = parseWholeSeconds((candidate as { trameDebut?: unknown })?.trameDebut)
    const trameFin = parseWholeSeconds((candidate as { trameFin?: unknown })?.trameFin)
    if (trameDebut === null || trameFin === null) return { ok: false, error: 'not-integer' }
    if (trameFin <= trameDebut) return { ok: false, error: 'bounds' }
    windows.push({ trameDebut, trameFin })
  }

  const seen = new Set<string>(existingKeys)
  for (const window of windows) {
    const key = windowBoundsKey(window)
    if (seen.has(key)) return { ok: false, error: 'duplicate', conflict: window }
    seen.add(key)
  }

  return { ok: true, windows }
}

// ——————————————————————————————————————————————————————————————
// Volet INTERFACE : diagnostic ligne à ligne, avant tout appel serveur
// ——————————————————————————————————————————————————————————————

/** Motif d'erreur d'une ligne de saisie (codes ; l'interface traduit). */
export type WindowDraftError = 'timecode' | 'bounds'

/** Diagnostic d'une ligne de saisie. */
export type WindowDraftCheck = {
  startSeconds: number | null
  endSeconds: number | null
  error: WindowDraftError | null
  /** Clé de bornes, ou `null` tant que les deux bornes ne sont pas lisibles. */
  key: string | null
  /** Au moins une des deux bornes est saisie. */
  started: boolean
  /** Les DEUX bornes sont saisies (ligne en cours de frappe exclue). */
  complete: boolean
}

/**
 * Diagnostique UNE ligne.
 *
 * Une ligne entièrement vide n'est ni une erreur ni une ligne remplie. Une ligne
 * à MOITIÉ remplie n'est pas signalée en rouge (l'utilisateur est en train de
 * taper) : elle est simplement « incomplète », et bloque la soumission tant qu'elle
 * l'est. Une erreur n'apparaît que sur des bornes réellement saisies.
 */
export function checkWindowDraft(start: string, end: string): WindowDraftCheck {
  const startSeconds = parseTimecodeToSeconds(start)
  const endSeconds = parseTimecodeToSeconds(end)
  const hasStart = start.trim() !== ''
  const hasEnd = end.trim() !== ''
  const complete = hasStart && hasEnd
  if (!complete) {
    return { startSeconds, endSeconds, error: null, key: null, started: hasStart || hasEnd, complete: false }
  }
  if (startSeconds === null || endSeconds === null) {
    return { startSeconds, endSeconds, error: 'timecode', key: null, started: true, complete: true }
  }
  const key = `${startSeconds}-${endSeconds}`
  if (startSeconds >= endSeconds) {
    return { startSeconds, endSeconds, error: 'bounds', key, started: true, complete: true }
  }
  return { startSeconds, endSeconds, error: null, key, started: true, complete: true }
}

/** Synthèse d'un tiroir de saisie : ce qu'il faut pour activer (ou non) le bouton. */
export type WindowDraftAnalysis = {
  checks: WindowDraftCheck[]
  /** Clés en double : avec l'existant, ou entre deux lignes de la saisie. */
  duplicateKeys: ReadonlySet<string>
  /** Lignes commencées (au moins une borne saisie). */
  startedCount: number
  /** Lignes complètes (les deux bornes saisies). */
  completeCount: number
  /** Somme des durées des lignes valides, en secondes. */
  totalDurationSeconds: number
  /** Le lot peut-il être soumis ? (au moins une ligne, toutes complètes et valides) */
  canSubmit: boolean
}

/**
 * Analyse complète d'un tiroir de saisie. Source UNIQUE du bouton « Ajouter » :
 * aucune surface ne réimplémente la règle de bornes ou de doublon.
 */
export function analyzeWindowDrafts(
  drafts: readonly { start: string; end: string }[],
  existingKeys: Iterable<string> = [],
  options?: { maxWindows?: number },
): WindowDraftAnalysis {
  const maxWindows = options?.maxWindows ?? MAX_WINDOW_ROWS
  const rows = drafts.slice(0, Math.max(0, maxWindows))
  const checks = rows.map((draft) => checkWindowDraft(draft.start, draft.end))

  const occurrences = new Map<string, number>()
  for (const check of checks) {
    if (check.key === null) continue
    occurrences.set(check.key, (occurrences.get(check.key) ?? 0) + 1)
  }
  const existing = new Set(existingKeys)
  const duplicateKeys = new Set<string>()
  for (const [key, count] of occurrences) {
    if (count > 1 || existing.has(key)) duplicateKeys.add(key)
  }

  let totalDurationSeconds = 0
  let startedCount = 0
  let completeCount = 0
  for (const check of checks) {
    if (check.started) startedCount += 1
    if (check.complete) completeCount += 1
    if (check.error === null && check.key !== null && !duplicateKeys.has(check.key)) {
      totalDurationSeconds += (check.endSeconds ?? 0) - (check.startSeconds ?? 0)
    }
  }

  const canSubmit =
    rows.length > 0 &&
    completeCount === rows.length &&
    checks.every((check) => check.error === null && (check.key === null || !duplicateKeys.has(check.key)))

  return { checks, duplicateKeys, startedCount, completeCount, totalDurationSeconds, canSubmit }
}

/** Vrai si la ligne est marquée en double (à signaler visuellement). */
export function isDraftDuplicate(
  check: WindowDraftCheck,
  duplicates: ReadonlySet<string>,
): boolean {
  return check.key !== null && duplicates.has(check.key)
}
