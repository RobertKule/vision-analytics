'use server'

/**
 * DÉCLASSEMENT SCIENTIFIQUE D'UN OBSERVATEUR (§12) — ADMIN uniquement.
 *
 * ─── CE QUE FAIT CETTE ACTION ───────────────────────────────────────────────
 * Elle change le STATUT ANALYTIQUE d'un observateur dans UN projet :
 *   INCLUDED → EXCLUDED : l'analyse courante cesse de compter ses observations ;
 *   EXCLUDED → INCLUDED : elle les recompte dès le calcul suivant.
 *
 * ─── CE QU'ELLE NE FAIT JAMAIS ──────────────────────────────────────────────
 * AUCUNE SUPPRESSION. Ni compte, ni session, ni capture RAW, ni observation, ni
 * ligne d'historique. La mutation est un simple `upsert` sur une table ADDITIVE :
 *   — exclure n'efface rien, cela retire du décompte ;
 *   — rétablir n'a rien à restaurer, les données n'ont jamais quitté la base.
 *
 * ─── TRACES ─────────────────────────────────────────────────────────────────
 *  1. `AuditLog` append-only : qui a déclassé qui, quand, pourquoi (§24) ;
 *  2. une VERSION ANALYTIQUE : l'état d'avant est figé (`previous`) puis l'état
 *     d'après (`current`), exactement comme pour un ajout de fenêtre. Une version
 *     plus ancienne n'est jamais réécrite : elle continue de représenter l'état
 *     analytique de son époque, exclusions comprises (§16).
 */

import { revalidatePath, updateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import { ANALYTICS_TRIGGERS } from '@/lib/analyticsVersioning'
import {
  captureAnalyticsSnapshot,
  recordConfigChangeVersions,
} from '@/lib/analyticsVersionStore'
import type { ActionResult } from '@/lib/types'

/** Doit rester synchronisé avec projectActions.ts (lectures observateur). */
const BLIND_PROJECTS_TAG = 'blind-projects'

/** Longueur maximale du motif de déclassement (garde-fou, aucune donnée sensible). */
const MAX_REASON_LENGTH = 500

export type SetObserverInclusionInput = {
  projectId: string
  /** Observateur visé (résolu côté serveur : jamais un rôle ou un droit implicite). */
  userId: string
  status: 'INCLUDED' | 'EXCLUDED'
  /** Motif scientifique du déclassement (utile seulement pour EXCLUDED). */
  reason?: string | null
}

/**
 * Déclasse (`EXCLUDED`) ou rétablit (`INCLUDED`) un observateur dans les analyses
 * d'un projet. Réservé aux ADMIN.
 */
export async function setObserverAnalysisInclusion(
  input: SetObserverInclusionInput,
): Promise<ActionResult> {
  const admin = await getCurrentAdmin()
  if (!admin) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }

  const projectId = typeof input?.projectId === 'string' ? input.projectId.trim() : ''
  const userId = typeof input?.userId === 'string' ? input.userId.trim() : ''
  const status = input?.status === 'EXCLUDED' ? 'EXCLUDED' : 'INCLUDED'
  const reason = (input?.reason ?? '').trim().slice(0, MAX_REASON_LENGTH) || null

  if (!projectId) return { ok: false, error: 'Identifiant de projet invalide.' }
  if (!userId) return { ok: false, error: 'Identifiant d’observateur invalide.' }
  if (status === 'EXCLUDED' && !reason) {
    return { ok: false, error: 'Un motif de déclassement est obligatoire.' }
  }

  try {
    const [project, user] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ])
    if (!project) return { ok: false, error: 'Projet introuvable.' }
    if (!user) return { ok: false, error: 'Observateur introuvable.' }

    // ——— Instantané analytique AVANT la décision ———
    const before = await captureAnalyticsSnapshot(projectId)

    const now = new Date()
    if (status === 'EXCLUDED') {
      // Upsert ADDITIF : la ligne est créée si elle n'existe pas encore.
      await prisma.projectObserverInclusion.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: {
          projectId,
          userId,
          status: 'EXCLUDED',
          excludedAt: now,
          excludedById: admin.uid,
          exclusionReason: reason,
        },
        update: {
          status: 'EXCLUDED',
          excludedAt: now,
          excludedById: admin.uid,
          exclusionReason: reason,
          includedAt: null,
          includedById: null,
        },
      })
    } else {
      await prisma.projectObserverInclusion.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: {
          projectId,
          userId,
          status: 'INCLUDED',
          includedAt: now,
          includedById: admin.uid,
        },
        // Le motif et la date du déclassement précédent sont effacés de la ligne
        // COURANTE : ils restent intégralement conservés dans le journal d'audit et
        // dans l'instantané analytique `previous`, jamais perdus.
        update: {
          status: 'INCLUDED',
          includedAt: now,
          includedById: admin.uid,
          excludedAt: null,
          excludedById: null,
          exclusionReason: null,
        },
      })
    }

    // ——— Versionnage : l'état d'AVANT est figé, puis celui d'APRÈS ———
    // Ne fait rien si l'empreinte du périmètre est inchangée (re-déclasser un
    // observateur déjà exclu) : aucune version parasite.
    await recordConfigChangeVersions({
      projectId,
      before,
      trigger:
        status === 'EXCLUDED'
          ? ANALYTICS_TRIGGERS.observerExcluded
          : ANALYTICS_TRIGGERS.observerIncluded,
      actorId: admin.uid,
    })

    // ——— Audit append-only (§24) — jamais de secret, jamais de donnée sensible ———
    await recordAudit({
      userId: admin.uid,
      action:
        status === 'EXCLUDED'
          ? AUDIT_ACTIONS.observerAnalysisExcluded
          : AUDIT_ACTIONS.observerAnalysisIncluded,
      entityType: 'analytics',
      entityId: projectId,
      metadata: {
        observerId: userId,
        status,
        // Motif tronqué, déjà borné : décision scientifique, jamais un secret.
        reason,
      },
    })

    revalidatePath(`/admin/projects/${projectId}`)
    revalidatePath(`/admin/projects/${projectId}/analytics`)
    revalidatePath(`/analyst/projects/${projectId}/analytics`)
    revalidatePath('/admin/projects')
    updateTag(BLIND_PROJECTS_TAG)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du changement de statut analytique :', error)
    return { ok: false, error: 'Impossible de modifier le statut analytique. Réessayez.' }
  }
}
