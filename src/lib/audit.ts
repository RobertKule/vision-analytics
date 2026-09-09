/**
 * Journal d'audit (append-only) — côté serveur uniquement.
 *
 * Enregistre « qui a fait quoi, sur quelle ressource, quand » pour les actions
 * importantes (authentification, comptes, projets, vidéos, observations,
 * exports). Les lignes ne sont jamais modifiées ni supprimées par les
 * utilisateurs normaux : aucune fonction d'update/delete n'est exposée ici.
 *
 * Règles :
 *  — `metadata` ne contient JAMAIS de mots de passe, jetons ou secrets ;
 *  — l'écriture est « best effort » : une panne du journal ne doit pas faire
 *    échouer l'action métier qui l'a déclenchée (d'où le try/catch journalisé).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Types de ressources auditées. */
export type AuditEntityType =
  | 'auth'
  | 'user'
  | 'project'
  | 'video'
  | 'point'
  | 'observation'
  | 'share'
  | 'export'

export type AuditMetadata = Record<string, string | number | boolean | null>

export type AuditLogInput = {
  /** Acteur de l'action ; null pour un événement sans utilisateur identifié (ex. échec de connexion). */
  userId: string | null
  action: string
  entityType?: AuditEntityType
  entityId?: string
  metadata?: AuditMetadata
}

/** Libellés d'actions normalisés (section 24 du cahier des exigences). */
export const AUDIT_ACTIONS = {
  // Authentification
  loginSuccess: 'LOGIN_SUCCESS',
  loginFailure: 'LOGIN_FAILURE',
  logout: 'LOGOUT',
  // Comptes
  userCreated: 'USER_CREATED',
  userRoleChanged: 'USER_ROLE_CHANGED',
  userDeactivated: 'USER_DEACTIVATED',
  userReactivated: 'USER_REACTIVATED',
  userDeleted: 'USER_DELETED',
  // Projets
  projectCreated: 'PROJECT_CREATED',
  projectUpdated: 'PROJECT_UPDATED',
  projectArchived: 'PROJECT_ARCHIVED',
  projectRestored: 'PROJECT_RESTORED',
  projectDeleted: 'PROJECT_DELETED',
  // Vidéos
  videoAdded: 'VIDEO_ADDED',
  videoUpdated: 'VIDEO_UPDATED',
  videoRemoved: 'VIDEO_REMOVED',
  // Observations
  observationSubmitted: 'OBSERVATION_SUBMITTED',
  sessionFinalized: 'SESSION_FINALIZED',
  imageUploaded: 'IMAGE_UPLOADED',
  imageDeleted: 'IMAGE_DELETED',
  // Exports
  exportGlobal: 'EXPORT_GLOBAL',
  exportExcel: 'EXPORT_EXCEL',
  exportPackage: 'EXPORT_PACKAGE',
  exportCaptures: 'EXPORT_CAPTURES',
  exportChart: 'EXPORT_CHART',
  exportPdf: 'EXPORT_PDF',
  exportObserver: 'EXPORT_OBSERVER',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

export async function recordAudit(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonObject,
      },
    })
  } catch (error) {
    // L'audit est une trace secondaire : ne jamais casser l'action qui le déclenche.
    console.error('[audit] Écriture du journal impossible :', error)
  }
}
