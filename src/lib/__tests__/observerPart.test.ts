import { describe, expect, it } from 'vitest'
import {
  GENERIC_PART_KEY,
  PART_STATUS,
  allPartsSubmitted,
  computePartSummaries,
  computeRequiredTypes,
  countOpenParts,
  derivePartStatus,
  isPartSubmitted,
  openPartLabels,
  partKeyOf,
  type PartDescriptor,
} from '@/lib/observerPart'

/**
 * PARTIE 13 — ENVOI PAR PARTIE + ENVOI FINAL (noyau PUR).
 *
 * Règle métier : ENVOYER UNE PARTIE ≠ TERMINER LA SESSION.
 * Une partie envoyée (SUBMITTED) est verrouillée sans verrouiller les autres ;
 * « Envoyer tout » ne termine la session que lorsque tout est envoyé.
 */

const PASSES: PartDescriptor[] = [
  { key: 'video-1', label: 'Vidéo 1' },
  { key: 'video-2', label: 'Vidéo 2' },
  { key: 'video-3', label: 'Vidéo 3' },
  { key: 'video-4', label: 'Vidéo 4' },
]

describe('statut d’une partie (NOT_STARTED / IN_PROGRESS / SUBMITTED)', () => {
  it('2 : une partie sans capture ni envoi est NOT_STARTED', () => {
    expect(derivePartStatus({ submitted: false, hasCaptures: false })).toBe(
      PART_STATUS.NOT_STARTED,
    )
  })

  it('une partie avec captures mais non envoyée est IN_PROGRESS', () => {
    expect(derivePartStatus({ submitted: false, hasCaptures: true })).toBe(
      PART_STATUS.IN_PROGRESS,
    )
  })

  it('3–4 : une partie envoyée est SUBMITTED, avec ou sans capture', () => {
    expect(derivePartStatus({ submitted: true, hasCaptures: true })).toBe(PART_STATUS.SUBMITTED)
    expect(derivePartStatus({ submitted: true, hasCaptures: false })).toBe(PART_STATUS.SUBMITTED)
  })

  it('isPartSubmitted ne reconnaît que SUBMITTED', () => {
    expect(isPartSubmitted(PART_STATUS.SUBMITTED)).toBe(true)
    expect(isPartSubmitted(PART_STATUS.IN_PROGRESS)).toBe(false)
    expect(isPartSubmitted(PART_STATUS.NOT_STARTED)).toBe(false)
    expect(isPartSubmitted(null)).toBe(false)
  })
})

describe('clé canonique d’une partie', () => {
  it('une passe vidéo réelle garde son identifiant', () => {
    expect(partKeyOf('video-1')).toBe('video-1')
  })

  it('la passe générique héritée (null) se réduit à la clé réservée « »', () => {
    expect(partKeyOf(null)).toBe(GENERIC_PART_KEY)
    expect(partKeyOf(undefined)).toBe(GENERIC_PART_KEY)
    expect(partKeyOf('')).toBe(GENERIC_PART_KEY)
    expect(partKeyOf('   ')).toBe(GENERIC_PART_KEY)
  })
})

describe('3 — « Envoyer cette partie » : une seule partie, session ACTIVE', () => {
  it('seule la partie envoyée passe SUBMITTED ; les autres restent ouvertes', () => {
    const parts = computePartSummaries({
      passes: PASSES,
      submittedKeys: ['video-1'],
      capturesByKey: { 'video-1': 5, 'video-2': 3 },
    })
    expect(parts[0]).toMatchObject({ key: 'video-1', status: 'SUBMITTED', submitted: true })
    expect(parts[1]).toMatchObject({ key: 'video-2', status: 'IN_PROGRESS', submitted: false })
    expect(parts[2]).toMatchObject({ key: 'video-3', status: 'NOT_STARTED', submitted: false })
    expect(parts[3]).toMatchObject({ key: 'video-4', status: 'NOT_STARTED', submitted: false })
  })

  it('5–6 : la session globale n’est PAS clôturée par un envoi partiel', () => {
    // Une partie envoyée n'implique pas « toutes envoyées » : la session reste ACTIVE.
    const parts = computePartSummaries({
      passes: PASSES,
      submittedKeys: ['video-1'],
      capturesByKey: { 'video-1': 5 },
    })
    expect(allPartsSubmitted(parts)).toBe(false)
    expect(countOpenParts(parts)).toBe(3)
  })

  it('7 : après envoi, la reprise montre « Vidéo 1 envoyée », « Vidéo 2 en cours », etc.', () => {
    const parts = computePartSummaries({
      passes: PASSES,
      submittedKeys: ['video-1'],
      capturesByKey: { 'video-1': 5, 'video-2': 2 },
    })
    expect(parts.map((p) => p.status)).toEqual([
      'SUBMITTED',
      'IN_PROGRESS',
      'NOT_STARTED',
      'NOT_STARTED',
    ])
    expect(openPartLabels(parts)).toEqual(['Vidéo 2', 'Vidéo 3', 'Vidéo 4'])
  })
})

describe('8–12 — « Envoyer tout » : toutes les parties, puis COMPLETED', () => {
  it('9–11 : toutes les parties envoyées → la session peut être clôturée', () => {
    const parts = computePartSummaries({
      passes: PASSES,
      submittedKeys: ['video-1', 'video-2', 'video-3', 'video-4'],
      capturesByKey: { 'video-1': 3, 'video-2': 2, 'video-3': 4, 'video-4': 1 },
    })
    expect(allPartsSubmitted(parts)).toBe(true)
    expect(countOpenParts(parts)).toBe(0)
    expect(openPartLabels(parts)).toEqual([])
  })

  it('15 : « Envoyer tout » avec des parties manquantes est refusé', () => {
    const parts = computePartSummaries({
      passes: PASSES,
      submittedKeys: ['video-1', 'video-2'],
      capturesByKey: { 'video-1': 3, 'video-2': 2 },
    })
    expect(allPartsSubmitted(parts)).toBe(false)
    expect(openPartLabels(parts)).toEqual(['Vidéo 3', 'Vidéo 4'])
  })

  it('12 : une fois COMPLETED, toutes les parties sont verrouillées en lecture seule', () => {
    // Le verrouillage final est porté par le statut du jeton (COMPLETED) — ici on
    // vérifie que « tout envoyé » est l'état qui précède la clôture.
    const parts = computePartSummaries({
      passes: PASSES,
      submittedKeys: PASSES.map((p) => p.key),
      capturesByKey: { 'video-1': 1, 'video-2': 1, 'video-3': 1, 'video-4': 1 },
    })
    expect(parts.every((p) => p.submitted)).toBe(true)
  })
})

describe('20 — une partie envoyée est verrouillée, les autres non', () => {
  it('le verrouillage est PAR partie, jamais global', () => {
    const parts = computePartSummaries({
      passes: PASSES,
      submittedKeys: ['video-1'],
      capturesByKey: { 'video-1': 2, 'video-2': 1 },
    })
    expect(parts.find((p) => p.key === 'video-1')?.submitted).toBe(true)
    expect(parts.find((p) => p.key === 'video-2')?.submitted).toBe(false)
    // La partie verrouillée n'affecte pas l'ouverture des autres.
    expect(openPartLabels(parts)).toContain('Vidéo 2')
  })
})

describe('projets sans partie réelle (passe générique unique)', () => {
  it('la passe générique héritée est une partie à part entière', () => {
    const parts = computePartSummaries({
      passes: [{ key: GENERIC_PART_KEY, label: 'Vidéo générique' }],
      submittedKeys: [GENERIC_PART_KEY],
      capturesByKey: { [GENERIC_PART_KEY]: 4 },
    })
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ status: 'SUBMITTED', submitted: true })
    expect(allPartsSubmitted(parts)).toBe(true)
  })

  it('une liste de parties vide n’est jamais « tout envoyé »', () => {
    expect(allPartsSubmitted([])).toBe(false)
  })
})

describe('types requis « couvrables » (validation « Envoyer tout »)', () => {
  it('sans type configuré, aucun type n’est requis', () => {
    expect(
      computeRequiredTypes({
        passes: [{ typeLabel: null }],
        observationTypes: [],
      }),
    ).toEqual([])
  })

  it('une passe générique rend tous les types requis couvrables', () => {
    expect(
      computeRequiredTypes({
        passes: [{ typeLabel: null }, { typeLabel: '100m' }],
        observationTypes: ['100m', '250m'],
      }),
    ).toEqual(['100m', '250m'])
  })

  it('sans passe générique, seuls les types liés à une passe typée sont exigibles', () => {
    expect(
      computeRequiredTypes({
        passes: [{ typeLabel: '100m' }, { typeLabel: '250m' }],
        observationTypes: ['100m', '250m', 'Faune'],
      }),
    ).toEqual(['100m', '250m'])
  })

  it('les types en double sont ignorés', () => {
    expect(
      computeRequiredTypes({
        passes: [{ typeLabel: null }],
        observationTypes: ['100m', '100m', '250m'],
      }),
    ).toEqual(['100m', '250m'])
  })
})

describe('déterminisme', () => {
  it('le même état produit toujours le même résultat (pur)', () => {
    const input = {
      passes: PASSES,
      submittedKeys: ['video-1'],
      capturesByKey: { 'video-1': 2 },
    }
    expect(computePartSummaries(input)).toEqual(computePartSummaries(input))
  })
})
