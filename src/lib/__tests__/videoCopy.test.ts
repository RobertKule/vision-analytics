import { describe, expect, it } from 'vitest'
import {
  duplicateBaseLabel,
  resolveDuplicateName,
  resolveDuplicateTypeLabel,
} from '@/lib/videoCopy'

/**
 * Tests purs des décisions de duplication d'une configuration vidéo (Partie T).
 *
 * Les invariants d'intégrité portés par la transaction serveur `duplicateProjectVideo`
 * (W18–W22) — NOUVEL identifiant, fenêtres copiées, AUCUNE observation / capture /
 * driveFileId / clientKey / historique recopiés, copie indépendante de l'originale,
 * édition d'un type déjà observé sans altérer l'historique — sont des règles
 * structurelles (écritures limitées à `Video` + `ProjectPoint`, `createMany`,
 * jamais de réécriture des `Observation`). Ces tests bornent les décisions purement
 * calculables de la duplication : le libellé demandé (« … — Copie ») et le type cible
 * (même type, copie générique, ou AUTHRE type avec ses propres identifiants).
 */

describe('duplicateBaseLabel', () => {
  it('privilégie le nom lisible de la passe', () => {
    expect(duplicateBaseLabel('Prise A', '100 m', 'https://x/100m.mp4')).toBe('Prise A')
  })

  it('retombe sur le type verrouillé quand la passe n’a pas de nom (« 100 m »)', () => {
    expect(duplicateBaseLabel(null, '100 m', 'https://x/100m.mp4')).toBe('100 m')
    expect(duplicateBaseLabel('   ', '250 m', 'https://x/250m.mp4')).toBe('250 m')
  })

  it('dérive un libellé depuis la source vidéo en dernier recours', () => {
    expect(duplicateBaseLabel(null, null, 'https://media.example/VIRUNGA_100M_01.mp4')).toBe(
      'VIRUNGA_100M_01',
    )
  })

  it('repli stable quand rien n’est exploitable', () => {
    expect(duplicateBaseLabel(null, null, '')).toBe('Passe vidéo')
  })
})

describe('resolveDuplicateName — libellé de la copie (W18/W21 : nouvelle entité nommée)', () => {
  it('garde le nom demandé quand il est renseigné (jamais écrasé)', () => {
    expect(resolveDuplicateName('Prise B', 'Prise A', '100 m', 'https://x/100m.mp4')).toBe(
      'Prise B',
    )
  })

  it('sans nom demandé : « <type/état source> — Copie » (« 100 m — Copie »)', () => {
    expect(resolveDuplicateName(null, null, '100 m', 'https://x/100m.mp4')).toBe('100 m — Copie')
    expect(resolveDuplicateName('', 'Prise A', null, 'https://x/prised.mp4')).toBe(
      'Prise A — Copie',
    )
  })

  it('suffixe de copie distinctif quand le libellé vient de la source', () => {
    const name = resolveDuplicateName(null, null, null, 'https://x/VIRUNGA_100M_01.mp4')
    expect(name).toBe('VIRUNGA_100M_01 — Copie')
    expect(name).not.toBe('VIRUNGA_100M_01')
  })
})

describe('resolveDuplicateTypeLabel — type cible de la copie', () => {
  const configured = ['100 m', '250 m', 'Relais 4×100']

  it('cible absente ⇒ conserve le type de la source (copie « même type »)', () => {
    expect(resolveDuplicateTypeLabel('100 m', undefined, configured)).toEqual({
      ok: true,
      typeLabel: '100 m',
    })
  })

  it('cible null ⇒ copie générique (aucun type verrouillé)', () => {
    expect(resolveDuplicateTypeLabel('100 m', null, configured)).toEqual({
      ok: true,
      typeLabel: null,
    })
  })

  it('cible vide ⇒ copie générique', () => {
    expect(resolveDuplicateTypeLabel('100 m', '   ', configured)).toEqual({
      ok: true,
      typeLabel: null,
    })
  })

  it('W-dup-cross : duplication vers un AUTRE type configuré (Type B, ses propres ids)', () => {
    expect(resolveDuplicateTypeLabel('100 m', '250 m', configured)).toEqual({
      ok: true,
      typeLabel: '250 m',
    })
  })

  it('correspondance insensible à la casse et aux espaces multiples', () => {
    expect(resolveDuplicateTypeLabel('100 m', 'relais 4×100', configured)).toEqual({
      ok: true,
      typeLabel: 'relais 4×100',
    })
  })

  it('refuse un type absent de la configuration (aucune invention)', () => {
    const result = resolveDuplicateTypeLabel('100 m', '400 m', configured)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('« 400 m »')
  })
})
