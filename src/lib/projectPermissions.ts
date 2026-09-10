/**
 * RBAC PROJETS / EXPÉRIENCES — résolveur PUR (aucune I/O, testable).
 *
 * Une « expérience » est un projet : son propriétaire est `Project.ownerId`, et un
 * partage (`ProjectAccess`) invite un autre analyste.
 *
 * ─── RÈGLES ────────────────────────────────────────────────────────────────
 * ADMIN
 *   → tous les projets, toutes les expériences, tous les utilisateurs, gestion complète.
 *
 * ANALYSTE
 *   → uniquement les projets auxquels il a accès ;
 *   → ses propres expériences : voir, modifier, configurer, types, vidéos, dupliquer,
 *     analyses, exports, partage, création de clés observateur DANS SON PÉRIMÈTRE ;
 *   → expériences explicitement partagées : par défaut voir / analyser / exporter ;
 *     la MODIFICATION n'est possible que si le partage donne un droit d'édition ;
 *   → jamais les expériences privées d'autres analystes sans invitation ;
 *   → JAMAIS la gestion des utilisateurs (ADMIN uniquement).
 *
 * OBSERVATEUR
 *   → uniquement sa session / son projet via son accès sécurisé : aucune permission
 *     de consultation analytique ni d'export ici.
 *
 * Ce module ne décide QUE des droits : c'est `projectGuard.ts` qui lit la base et
 * applique la décision côté serveur, avant tout envoi de données au frontend.
 */

export type ActorRole = 'ADMIN' | 'ANALYST' | 'OBSERVER'

/** Partage reçu par l'acteur sur ce projet (null s'il n'y en a pas). */
export type ProjectShareGrant = {
  /** Vrai quand le partage accorde explicitement le droit de modification. */
  canEdit: boolean
}

export type ProjectAccessInput = {
  /** Rôle de la session courante ; null = aucune session. */
  role: ActorRole | null
  /** Identifiant de la session courante ; null = aucune session. */
  userId: string | null
  /** Propriétaire du projet (null pour les projets hérités sans propriétaire). */
  ownerId: string | null
  /** Partage explicite vers l'acteur, sinon null. */
  share: ProjectShareGrant | null
}

/** Niveau d'accès résolu (compatible avec l'API historique de `projectGuard`). */
export type ProjectAccessLevel = 'none' | 'shared' | 'owner' | 'admin'

export type ProjectPermissions = {
  level: ProjectAccessLevel
  /** Consulter le projet (détail, captures, historique). */
  canView: boolean
  /** Consulter les analyses (tableau de bord, versions). */
  canAnalyze: boolean
  /** Télécharger les exports (Excel, PDF, ZIP). */
  canExport: boolean
  /**
   * Modifier la configuration : titre, types, vidéos, fenêtres/points, archivage.
   * C'est CE droit qui déclenche une nouvelle version analytique quand il s'exerce.
   */
  canConfigure: boolean
  /** Partager l'expérience / retirer un partage. */
  canShare: boolean
  /** Créer ou révoquer des clés (liens) d'accès observateur sur ce projet. */
  canCreateObserverTokens: boolean
  /** Gérer les comptes utilisateurs — ADMIN uniquement, jamais lié au projet. */
  canManageUsers: boolean
}

const NO_ACCESS: ProjectPermissions = {
  level: 'none',
  canView: false,
  canAnalyze: false,
  canExport: false,
  canConfigure: false,
  canShare: false,
  canCreateObserverTokens: false,
  canManageUsers: false,
}

/** Résout le niveau d'accès brut (sans les droits fins). */
export function resolveProjectAccessLevel(input: ProjectAccessInput): ProjectAccessLevel {
  if (!input.role || !input.userId) return 'none'
  if (input.role === 'ADMIN') return 'admin'
  // Un OBSERVER n'obtient jamais d'accès de gestion, même s'il possédait un projet.
  if (input.role !== 'ANALYST') return 'none'
  if (input.ownerId !== null && input.ownerId === input.userId) return 'owner'
  return input.share ? 'shared' : 'none'
}

/**
 * Résout l'ensemble des droits d'un acteur sur un projet/expérience.
 *
 * Un analyste invité obtient toujours consultation + analyse + export ; il n'obtient
 * la configuration, le partage et les clés observateur que si le partage porte
 * explicitement `canEdit`.
 */
export function resolveProjectPermissions(input: ProjectAccessInput): ProjectPermissions {
  const level = resolveProjectAccessLevel(input)
  if (level === 'none') return NO_ACCESS

  if (level === 'admin') {
    return {
      level,
      canView: true,
      canAnalyze: true,
      canExport: true,
      canConfigure: true,
      canShare: true,
      canCreateObserverTokens: true,
      canManageUsers: true,
    }
  }

  if (level === 'owner') {
    return {
      level,
      canView: true,
      canAnalyze: true,
      canExport: true,
      canConfigure: true,
      canShare: true,
      canCreateObserverTokens: true,
      canManageUsers: false,
    }
  }

  const canEdit = input.share?.canEdit === true
  return {
    level,
    canView: true,
    canAnalyze: true,
    canExport: true,
    canConfigure: canEdit,
    canShare: canEdit,
    canCreateObserverTokens: canEdit,
    canManageUsers: false,
  }
}

/** Vrai si le niveau autorise la consultation/l'analyse (compatibilité historique). */
export function canManage(level: ProjectAccessLevel): boolean {
  return level === 'owner' || level === 'shared' || level === 'admin'
}
