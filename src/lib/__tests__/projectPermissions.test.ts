import { describe, expect, it } from 'vitest'
import {
  resolveProjectAccessLevel,
  resolveProjectPermissions,
  type ProjectAccessInput,
} from '@/lib/projectPermissions'

/**
 * PARTIE K — RBAC STRICT SUR LES PROJETS / EXPÉRIENCES (résolveur PUR).
 *
 * ADMIN       → tous les projets, toutes les expériences, tous les utilisateurs.
 * ANALYSTE    → ses projets ; ses expériences ; les expériences PARTAGÉES ;
 *               jamais les expériences privées d'un autre analyste ;
 *               modification d'un partage UNIQUEMENT si le partage donne l'édition ;
 *               jamais la gestion des utilisateurs.
 * OBSERVATEUR → rien ici (son accès passe par son lien sécurisé).
 */

const ADMIN: ProjectAccessInput = {
  role: 'ADMIN',
  userId: 'admin-1',
  ownerId: 'analyst-1',
  share: null,
}

const OWNER: ProjectAccessInput = {
  role: 'ANALYST',
  userId: 'analyst-1',
  ownerId: 'analyst-1',
  share: null,
}

const GUEST_READONLY: ProjectAccessInput = {
  role: 'ANALYST',
  userId: 'analyst-2',
  ownerId: 'analyst-1',
  share: { canEdit: false },
}

const GUEST_EDITOR: ProjectAccessInput = {
  role: 'ANALYST',
  userId: 'analyst-2',
  ownerId: 'analyst-1',
  share: { canEdit: true },
}

const STRANGER: ProjectAccessInput = {
  role: 'ANALYST',
  userId: 'analyst-3',
  ownerId: 'analyst-1',
  share: null,
}

describe('K1 — ADMIN voit tout et gère tout', () => {
  it('accède à un projet dont il n’est pas propriétaire', () => {
    const permissions = resolveProjectPermissions(ADMIN)
    expect(permissions.level).toBe('admin')
    expect(permissions.canView).toBe(true)
    expect(permissions.canAnalyze).toBe(true)
    expect(permissions.canExport).toBe(true)
    expect(permissions.canConfigure).toBe(true)
    expect(permissions.canShare).toBe(true)
    expect(permissions.canCreateObserverTokens).toBe(true)
  })

  it('K9 (contre-épreuve) : seul l’ADMIN gère les utilisateurs', () => {
    expect(resolveProjectPermissions(ADMIN).canManageUsers).toBe(true)
  })
})

describe('K2 + K4 + K7 — l’analyste et SES projets', () => {
  it('K2/K4 : le propriétaire voit et analyse son expérience', () => {
    const permissions = resolveProjectPermissions(OWNER)
    expect(permissions.level).toBe('owner')
    expect(permissions.canView).toBe(true)
    expect(permissions.canAnalyze).toBe(true)
    expect(permissions.canExport).toBe(true)
  })

  it('K7 : le propriétaire peut modifier, partager et créer des clés observateur', () => {
    const permissions = resolveProjectPermissions(OWNER)
    expect(permissions.canConfigure).toBe(true)
    expect(permissions.canShare).toBe(true)
    expect(permissions.canCreateObserverTokens).toBe(true)
  })
})

describe('K3 + K6 — hors périmètre : refus', () => {
  it('K3/K6 : un analyste sans partage n’a AUCUN droit sur l’expérience d’un autre', () => {
    const permissions = resolveProjectPermissions(STRANGER)
    expect(permissions.level).toBe('none')
    expect(permissions.canView).toBe(false)
    expect(permissions.canAnalyze).toBe(false)
    expect(permissions.canExport).toBe(false)
    expect(permissions.canConfigure).toBe(false)
  })

  it('K11 : une URL modifiée ne crée aucun droit — la décision vient du projet réel', () => {
    // Le client peut prétendre viser n'importe quel projet : seule la relation
    // réelle (propriétaire / partage) décide, et elle est lue côté serveur.
    const forged: ProjectAccessInput = { ...STRANGER, ownerId: 'analyst-9' }
    expect(resolveProjectPermissions(forged).level).toBe('none')
    expect(resolveProjectPermissions(forged).canView).toBe(false)
  })

  it('aucune session → aucun droit', () => {
    const permissions = resolveProjectPermissions({
      role: null,
      userId: null,
      ownerId: 'analyst-1',
      share: null,
    })
    expect(permissions.level).toBe('none')
    expect(permissions.canView).toBe(false)
  })
})

describe('K5 + K8 — expérience PARTAGÉE : consultation par défaut, édition sur droit explicite', () => {
  it('K5 : un invité voit, analyse et exporte l’expérience partagée', () => {
    const permissions = resolveProjectPermissions(GUEST_READONLY)
    expect(permissions.level).toBe('shared')
    expect(permissions.canView).toBe(true)
    expect(permissions.canAnalyze).toBe(true)
    expect(permissions.canExport).toBe(true)
  })

  it('K8 : sans droit d’édition, l’invité NE PEUT PAS modifier, partager ni créer de clé', () => {
    const permissions = resolveProjectPermissions(GUEST_READONLY)
    expect(permissions.canConfigure).toBe(false)
    expect(permissions.canShare).toBe(false)
    expect(permissions.canCreateObserverTokens).toBe(false)
  })

  it('K8 : avec droit d’édition explicite, l’invité peut modifier la configuration', () => {
    const permissions = resolveProjectPermissions(GUEST_EDITOR)
    expect(permissions.canConfigure).toBe(true)
    expect(permissions.canShare).toBe(true)
    expect(permissions.canCreateObserverTokens).toBe(true)
  })
})

describe('K9 + K10 — limites de l’analyste', () => {
  it('K9 : un analyste ne gère JAMAIS les utilisateurs, même sur son propre projet', () => {
    expect(resolveProjectPermissions(OWNER).canManageUsers).toBe(false)
    expect(resolveProjectPermissions(GUEST_EDITOR).canManageUsers).toBe(false)
    expect(resolveProjectPermissions(GUEST_READONLY).canManageUsers).toBe(false)
  })

  it('K10 : un analyste ne crée pas de clé observateur hors de son périmètre', () => {
    expect(resolveProjectPermissions(STRANGER).canCreateObserverTokens).toBe(false)
    expect(resolveProjectPermissions(GUEST_READONLY).canCreateObserverTokens).toBe(false)
    expect(resolveProjectPermissions(OWNER).canCreateObserverTokens).toBe(true)
  })
})

describe('rôle OBSERVER — aucun droit d’analyse projet', () => {
  it('un observateur connecté n’obtient aucun niveau de gestion', () => {
    const permissions = resolveProjectPermissions({
      role: 'OBSERVER',
      userId: 'obs-1',
      ownerId: 'obs-1',
      share: { canEdit: true },
    })
    expect(permissions.level).toBe('none')
    expect(permissions.canAnalyze).toBe(false)
    expect(permissions.canExport).toBe(false)
  })
})

describe('niveaux d’accès bruts (compatibilité)', () => {
  it('résout admin / owner / shared / none', () => {
    expect(resolveProjectAccessLevel(ADMIN)).toBe('admin')
    expect(resolveProjectAccessLevel(OWNER)).toBe('owner')
    expect(resolveProjectAccessLevel(GUEST_READONLY)).toBe('shared')
    expect(resolveProjectAccessLevel(STRANGER)).toBe('none')
  })

  it('un projet hérité sans propriétaire ne rend personne propriétaire', () => {
    expect(
      resolveProjectAccessLevel({
        role: 'ANALYST',
        userId: 'analyst-1',
        ownerId: null,
        share: null,
      }),
    ).toBe('none')
  })
})
