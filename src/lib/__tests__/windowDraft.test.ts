import { describe, expect, it } from 'vitest'
import {
  analyzeWindowDrafts,
  checkWindowDraft,
  isDraftDuplicate,
  MAX_WINDOW_ROWS,
  MAX_WINDOWS_PER_SUBMISSION,
  validateWindowBounds,
  windowBoundsKey,
  windowBoundsKeys,
} from '@/lib/windowDraft'

/**
 * RÈGLE DE SAISIE DES TRAMES (§2) — tests purs.
 *
 * La règle doit être IDENTIQUE côté interface et côté serveur ; ces tests la
 * verrouillent une seule fois, pour les deux surfaces.
 */

const NONE = new Set<string>()

// ——————————————————————————————————————————————————————————————
// S1. Bornes numériques (Server Actions)
// ——————————————————————————————————————————————————————————————

describe('S1 — validateWindowBounds : la règle des Server Actions', () => {
  it('accepte un lot de trames valides, dans l’ordre reçu', () => {
    const result = validateWindowBounds(
      [
        { trameDebut: 100, trameFin: 110 },
        { trameDebut: 120, trameFin: 130 },
      ],
      NONE,
    )
    expect(result).toEqual({
      ok: true,
      windows: [
        { trameDebut: 100, trameFin: 110 },
        { trameDebut: 120, trameFin: 130 },
      ],
    })
  })

  it('refuse une fin égale au début (« strictement supérieur »)', () => {
    expect(validateWindowBounds([{ trameDebut: 100, trameFin: 100 }], NONE)).toEqual({
      ok: false,
      error: 'bounds',
    })
  })

  it('refuse une fin antérieure au début', () => {
    expect(validateWindowBounds([{ trameDebut: 130, trameFin: 120 }], NONE)).toEqual({
      ok: false,
      error: 'bounds',
    })
  })

  it('refuse des bornes non entières ou négatives', () => {
    expect(validateWindowBounds([{ trameDebut: 1.5, trameFin: 10 }], NONE).ok).toBe(false)
    expect(validateWindowBounds([{ trameDebut: -1, trameFin: 10 }], NONE).ok).toBe(false)
    expect(validateWindowBounds([{ trameDebut: 'a', trameFin: 10 }], NONE).ok).toBe(false)
  })

  it('refuse un lot vide', () => {
    expect(validateWindowBounds([], NONE)).toEqual({ ok: false, error: 'empty' })
  })

  it('refuse un lot trop volumineux', () => {
    const huge = Array.from({ length: MAX_WINDOWS_PER_SUBMISSION + 1 }, (_, index) => ({
      trameDebut: index * 10,
      trameFin: index * 10 + 5,
    }))
    expect(validateWindowBounds(huge, NONE)).toEqual({ ok: false, error: 'count' })
  })

  it('refuse un doublon EXACT avec une trame existante, en nommant la trame fautive', () => {
    const existing = windowBoundsKeys([{ trameDebut: 100, trameFin: 110 }])
    expect(validateWindowBounds([{ trameDebut: 100, trameFin: 110 }], existing)).toEqual({
      ok: false,
      error: 'duplicate',
      conflict: { trameDebut: 100, trameFin: 110 },
    })
  })

  it('refuse un doublon INTERNE à la soumission', () => {
    const result = validateWindowBounds(
      [
        { trameDebut: 100, trameFin: 110 },
        { trameDebut: 100, trameFin: 110 },
      ],
      NONE,
    )
    expect(result).toEqual({
      ok: false,
      error: 'duplicate',
      conflict: { trameDebut: 100, trameFin: 110 },
    })
  })

  it('AUTORISE chevauchement et inclusion (le moteur les arbitre)', () => {
    const result = validateWindowBounds(
      [
        { trameDebut: 100, trameFin: 160 },
        { trameDebut: 120, trameFin: 130 },
        { trameDebut: 150, trameFin: 250 },
      ],
      NONE,
    )
    expect(result.ok).toBe(true)
  })

  it('la clé de bornes est stable et sans ambiguïté', () => {
    expect(windowBoundsKey({ trameDebut: 100, trameFin: 110 })).toBe('100-110')
    expect([...windowBoundsKeys([{ trameDebut: 1, trameFin: 2 }])]).toEqual(['1-2'])
  })
})

// ——————————————————————————————————————————————————————————————
// S2. Diagnostic de saisie (interface)
// ——————————————————————————————————————————————————————————————

describe('S2 — checkWindowDraft : diagnostic d’une ligne', () => {
  it('une ligne entièrement vide n’est ni une erreur ni une ligne remplie', () => {
    const check = checkWindowDraft('', '')
    expect(check.error).toBeNull()
    expect(check.started).toBe(false)
    expect(check.complete).toBe(false)
  })

  it('une ligne à moitié saisie est incomplète, jamais signalée en rouge', () => {
    const check = checkWindowDraft('01:40', '')
    expect(check.error).toBeNull()
    expect(check.started).toBe(true)
    expect(check.complete).toBe(false)
  })

  it('accepte MM:SS, M:SS et HH:MM:SS', () => {
    expect(checkWindowDraft('01:40', '02:10').error).toBeNull()
    expect(checkWindowDraft('1:40', '2:10').key).toBe('100-130')
    expect(checkWindowDraft('00:01:40', '00:02:10').key).toBe('100-130')
  })

  it('signale une borne illisible', () => {
    expect(checkWindowDraft('1:99', '02:10').error).toBe('timecode')
    expect(checkWindowDraft('abc', '02:10').error).toBe('timecode')
  })

  it('signale une fin qui ne suit pas le début', () => {
    expect(checkWindowDraft('02:10', '02:10').error).toBe('bounds')
    expect(checkWindowDraft('02:10', '01:40').error).toBe('bounds')
  })

  it('la clé de la ligne est celle des bornes résolues', () => {
    expect(checkWindowDraft('01:40', '02:10').key).toBe('100-130')
  })
})

// ——————————————————————————————————————————————————————————————
// S3. Synthèse du tiroir : bouton actif ou non
// ——————————————————————————————————————————————————————————————

describe('S3 — analyzeWindowDrafts : activation du bouton « Ajouter »', () => {
  it('une seule ligne complète suffit', () => {
    const analysis = analyzeWindowDrafts([{ start: '01:40', end: '02:10' }])
    expect(analysis.canSubmit).toBe(true)
    expect(analysis.completeCount).toBe(1)
    expect(analysis.totalDurationSeconds).toBe(30)
  })

  it('une ligne vierge empêche la soumission (rien n’est ignoré en silence)', () => {
    const analysis = analyzeWindowDrafts([
      { start: '01:40', end: '02:10' },
      { start: '', end: '' },
    ])
    expect(analysis.canSubmit).toBe(false)
    expect(analysis.completeCount).toBe(1)
    expect(analysis.startedCount).toBe(1)
  })

  it('une ligne à moitié remplie empêche la soumission', () => {
    expect(analyzeWindowDrafts([{ start: '01:40', end: '' }]).canSubmit).toBe(false)
  })

  it('une borne invalide empêche la soumission', () => {
    expect(analyzeWindowDrafts([{ start: '01:40', end: 'x' }]).canSubmit).toBe(false)
    expect(analyzeWindowDrafts([{ start: '02:10', end: '01:40' }]).canSubmit).toBe(false)
  })

  it('un doublon avec l’existant est signalé ET bloque', () => {
    const existing = windowBoundsKeys([{ trameDebut: 100, trameFin: 130 }])
    const analysis = analyzeWindowDrafts([{ start: '01:40', end: '02:10' }], existing)
    expect(analysis.canSubmit).toBe(false)
    expect([...analysis.duplicateKeys]).toEqual(['100-130'])
    expect(isDraftDuplicate(analysis.checks[0], analysis.duplicateKeys)).toBe(true)
  })

  it('un doublon INTERNE à la saisie est signalé pour les deux lignes', () => {
    const analysis = analyzeWindowDrafts([
      { start: '01:40', end: '02:10' },
      { start: '01:40', end: '02:10' },
    ])
    expect(analysis.canSubmit).toBe(false)
    expect(analysis.checks.map((check) => isDraftDuplicate(check, analysis.duplicateKeys))).toEqual([
      true,
      true,
    ])
  })

  it('la durée cumulée ignore les lignes en doublon ou en erreur', () => {
    const analysis = analyzeWindowDrafts(
      [
        { start: '00:00', end: '00:30' },
        { start: '00:00', end: '00:30' }, // doublon interne
        { start: '01:00', end: '01:45' },
      ],
      [],
    )
    // 30 s (première ligne) + 45 s (troisième) ; le doublon ne compte pas deux fois
    // au-delà de sa ligne d'origine : les deux lignes portant la même clé sont
    // écartées du cumul, seule la troisième compte.
    expect(analysis.totalDurationSeconds).toBe(45)
  })

  it('chevauchements et inclusions restent soumissibles', () => {
    const analysis = analyzeWindowDrafts([
      { start: '01:40', end: '02:40' },
      { start: '02:00', end: '02:10' },
    ])
    expect(analysis.canSubmit).toBe(true)
    expect(analysis.totalDurationSeconds).toBe(70)
  })

  it('le nombre de lignes affichables est borné', () => {
    const drafts = Array.from({ length: MAX_WINDOW_ROWS + 5 }, (_, index) => ({
      start: `${String(index).padStart(2, '0')}:00`,
      end: `${String(index).padStart(2, '0')}:30`,
    }))
    expect(analyzeWindowDrafts(drafts).checks).toHaveLength(MAX_WINDOW_ROWS)
  })

  it('aucune ligne ⇒ rien à soumettre', () => {
    expect(analyzeWindowDrafts([]).canSubmit).toBe(false)
  })
})

// ——————————————————————————————————————————————————————————————
// S4. Parité interface ⇄ serveur sur la MÊME saisie
// ——————————————————————————————————————————————————————————————

describe('S4 — la saisie validée à l’écran est celle acceptée par le serveur', () => {
  it('ce que l’interface accepte est accepté par la validation serveur', () => {
    const drafts = [
      { start: '01:40', end: '02:10' },
      { start: '02:00', end: '02:10' },
    ]
    const analysis = analyzeWindowDrafts(drafts)
    expect(analysis.canSubmit).toBe(true)
    const server = validateWindowBounds(
      analysis.checks.map((check) => ({ trameDebut: check.startSeconds, trameFin: check.endSeconds })),
      windowBoundsKeys([]),
    )
    expect(server.ok).toBe(true)
  })

  it('ce que l’interface refuse est refusé par le serveur (mêmes bornes)', () => {
    const analysis = analyzeWindowDrafts([{ start: '02:10', end: '02:10' }])
    expect(analysis.canSubmit).toBe(false)
    expect(validateWindowBounds([{ trameDebut: 130, trameFin: 130 }], [])).toEqual({
      ok: false,
      error: 'bounds',
    })
  })
})
