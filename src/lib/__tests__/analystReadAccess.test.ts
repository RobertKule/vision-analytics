import { describe, expect, it } from 'vitest'
import {
  resolveProjectAccessLevel,
  resolveProjectPermissions,
  type ProjectAccessInput,
} from '@/lib/projectPermissions'

/**
 * §1 — ACCÈS ANALYSTE EN LECTURE/ANALYSE SUR UN PROJET (tests A & B de la mission).
 *
 * L'ADMIN accorde explicitement un accès à un ANALYSTE. Cet accès donne la
 * consultation, l'analyse et l'export — jamais la configuration, jamais le partage,
 * jamais la création de liens observateur, jamais la gestion des comptes, et JAMAIS
 * une suppression.
 *
 * Le modèle testé ici est celui du serveur : `resolveProjectPermissions` est le
 * résolveur PUR appelé par `getCurrentProjectPermissions`, lui-même appelé AVANT
 * toute lecture ou mutation par les Server Actions et les routes API. Masquer un
 * bouton ne protège rien : c'est cette fonction qui décide.
 *
 * A. autorisation   : l'analyste autorisé voit le projet, ses fenêtres, ses
 *                     statistiques ; il ne peut ni supprimer ni administrer.
 * B. révocation     : sans partage, plus AUCUN droit — le serveur refuse.
 */

/** Propriétaire d'un projet qui n'est PAS l'analyste testé. */
const OWNER_ID = 'analyst-owner'
const GUEST_ID = 'analyst-guest'

/** Un analyste SANS aucun partage sur le projet. */
const NO_ACCESS: ProjectAccessInput = {
  role: 'ANALYST',
  userId: GUEST_ID,
  ownerId: OWNER_ID,
  share: null,
}

/** Le même analyste, APRÈS que l'ADMIN lui a accordé « Visualiser les données ». */
const GRANTED_READ: ProjectAccessInput = { ...NO_ACCESS, share: { canEdit: false } }

/** L'ADMIN du système voit le projet sans en être propriétaire. */
const ADMIN: ProjectAccessInput = {
  role: 'ADMIN',
  userId: 'admin-1',
  ownerId: OWNER_ID,
  share: null,
}

describe('A. accès ANALYSTE accordé par l’ADMIN — lecture et analyse, rien de plus', () => {
  it('l’analyste autorisé est bien un niveau PARTAGÉ (ni propriétaire, ni admin)', () => {
    expect(resolveProjectAccessLevel(GRANTED_READ)).toBe('shared')
  })

  it('il VOIT le projet, ses expériences, ses fenêtres et ses statistiques', () => {
    const permissions = resolveProjectPermissions(GRANTED_READ)
    expect(permissions.canView).toBe(true)
    expect(permissions.canAnalyze).toBe(true)
    // Les exports permis par les règles existantes (Excel / PDF / JSON) le restent.
    expect(permissions.canExport).toBe(true)
  })

  it('il ne peut NI configurer, NI partager, NI créer de lien observateur', () => {
    const permissions = resolveProjectPermissions(GRANTED_READ)
    expect(permissions.canConfigure).toBe(false)
    expect(permissions.canShare).toBe(false)
    expect(permissions.canCreateObserverTokens).toBe(false)
  })

  it('il n’administre JAMAIS les comptes utilisateurs', () => {
    expect(resolveProjectPermissions(GRANTED_READ).canManageUsers).toBe(false)
    // Contre-épreuve : c'est le seul droit que la fonction réserve à l'ADMIN.
    expect(resolveProjectPermissions(ADMIN).canManageUsers).toBe(true)
  })

  it('« ne pas pouvoir supprimer » se réduit à canConfigure=false pour les données du projet', () => {
    // Toutes les suppressions DANS le périmètre d'un projet (fenêtres, points,
    // observations, captures, types, vidéos) sont gardées par `canConfigure` ou sont
    // ADMIN-only. Un accès en lecture ne les obtient donc jamais.
    const readOnly = resolveProjectPermissions(GRANTED_READ)
    expect(readOnly.canConfigure).toBe(false)

    // Un projet lui-même ne se supprime que côté ADMIN : aucun niveau non-admin
    // n'ouvre cette porte.
    expect(resolveProjectPermissions(GRANTED_READ).level).not.toBe('admin')
    expect(resolveProjectPermissions({
      role: 'ANALYST',
      userId: OWNER_ID,
      ownerId: OWNER_ID,
      share: null,
    }).canManageUsers).toBe(false)
  })

  it('le propriétaire du projet, lui, reste maître de sa configuration', () => {
    const owner = resolveProjectPermissions({
      role: 'ANALYST',
      userId: OWNER_ID,
      ownerId: OWNER_ID,
      share: null,
    })
    expect(owner.level).toBe('owner')
    expect(owner.canConfigure).toBe(true)
    expect(owner.canCreateObserverTokens).toBe(true)
    // …sans devenir administrateur pour autant.
    expect(owner.canManageUsers).toBe(false)
  })
})

describe('B. révocation de l’accès — le serveur refuse', () => {
  it('sans partage, l’analyste n’a plus AUCUN droit sur le projet', () => {
    const permissions = resolveProjectPermissions(NO_ACCESS)
    expect(permissions.level).toBe('none')
    expect(permissions.canView).toBe(false)
    expect(permissions.canAnalyze).toBe(false)
    expect(permissions.canExport).toBe(false)
    expect(permissions.canConfigure).toBe(false)
    expect(permissions.canShare).toBe(false)
    expect(permissions.canCreateObserverTokens).toBe(false)
    expect(permissions.canManageUsers).toBe(false)
  })

  it('la révocation ne touche AUCUNE donnée : seul le droit disparaît', () => {
    // Le même analyste, ses captures et le projet existent toujours — c'est
    // uniquement la relation d'accès qui a été retirée.
    const granted = resolveProjectPermissions(GRANTED_READ)
    const revoked = resolveProjectPermissions({ ...GRANTED_READ, share: null })

    expect(granted.canView).toBe(true)
    expect(revoked.canView).toBe(false)
    // L'identité du projet et du propriétaire n'a pas changé.
    expect(revoked.level).toBe(resolveProjectPermissions(NO_ACCESS).level)
  })

  it('un accès accordé puis révoqué puis ré-accordé redonne exactement les mêmes droits', () => {
    const before = resolveProjectPermissions(GRANTED_READ)
    resolveProjectPermissions({ ...GRANTED_READ, share: null })
    const after = resolveProjectPermissions(GRANTED_READ)
    expect(after).toEqual(before)
  })

  it('un accès en LECTURE ne peut pas s’auto-élargir en accès d’édition', () => {
    // Le droit d'édition vient de la ligne ProjectAccess.canEdit, jamais d'une
    // décision du client : changer un bouton ou une URL n'ajoute aucun droit.
    expect(resolveProjectPermissions({ ...NO_ACCESS, share: { canEdit: false } }).canConfigure).toBe(
      false,
    )
    expect(resolveProjectPermissions({ ...NO_ACCESS, share: null }).canConfigure).toBe(false)
  })
})

describe('limites transverses de l’accès accordé', () => {
  it('un OBSERVATEUR ne tire aucun droit d’un partage, même avec canEdit', () => {
    const permissions = resolveProjectPermissions({
      role: 'OBSERVER',
      userId: GUEST_ID,
      ownerId: OWNER_ID,
      share: { canEdit: true },
    })
    expect(permissions.level).toBe('none')
    expect(permissions.canView).toBe(false)
  })

  it('aucune session → aucun droit, même sur un projet partagé', () => {
    const permissions = resolveProjectPermissions({
      role: null,
      userId: null,
      ownerId: OWNER_ID,
      share: { canEdit: false },
    })
    expect(permissions.level).toBe('none')
    expect(permissions.canAnalyze).toBe(false)
  })
})
