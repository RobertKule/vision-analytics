'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { readObserverScopeFromCookies } from '@/lib/observerAccess'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import { notify } from '@/lib/notify'
import {
  canCreateNewRequest,
  isReactivatableTokenStatus,
  reactivationApprovalTokenData,
  type ReactivationStatus,
} from '@/lib/observerReactivation'
import type { Locale } from '@/lib/i18n'
import { defaultLocale } from '@/lib/i18n'

/**
 * DEMANDE DE RÉACTIVATION — cycle de vie (observateur demande, ADMIN décide).
 *
 * RÈGLE : l'observateur peut DEMANDER une réactivation, jamais la déclencher
 * lui-même. Seul un ADMIN confirme (APPROVED → jeton ACTIVE) ou refuse (REJECTED).
 * Une réactivation ne supprime ni ne recrée AUCUNE donnée (observations, captures,
 * parties envoyées, historique analytique).
 *
 * Le jeton brut n'est jamais journalisé ni renvoyé : seuls des identifiants internes
 * (tokenId, requestId, projectId) sont tracés.
 */

type RequestResult =
  | { ok: true; status: 'created' | 'already-pending' }
  | { ok: false; error: string }

/**
 * L'observateur demande la réactivation de SON accès (session terminée / désactivée).
 *
 *  - identifie le jeton depuis le cookie de portée (`va_observer`) — jamais depuis un
 *    identifiant envoyé par le client (anti-tampering) ;
 *  - ne crée PAS de nouvelle demande s'il en existe déjà une PENDING ;
 *  - ne réactive RIEN (la décision revient à l'ADMIN).
 */
export async function requestObserverReactivation(input: {
  projectId: string
  locale?: Locale
}): Promise<RequestResult> {
  const locale: Locale = input?.locale === 'en' ? 'en' : defaultLocale
  const msg = (en: string, fr: string) => (locale === 'en' ? en : fr)

  const projectId = (input?.projectId ?? '').trim()
  if (!projectId) {
    return { ok: false, error: msg('Missing project identifier.', 'Identifiant de projet manquant.') }
  }

  // Le périmètre vient du cookie de portée signé, recoupé avec le projet demandé.
  const scope = await readObserverScopeFromCookies()
  if (!scope || scope.projectId !== projectId) {
    return {
      ok: false,
      error: msg(
        'No valid access link found for this project.',
        'Aucun lien d’accès valide trouvé pour ce projet.',
      ),
    }
  }

  const token = await prisma.observerAccessToken.findUnique({
    where: { id: scope.tokenId },
    select: { id: true, projectId: true, status: true },
  })
  if (!token || token.projectId !== projectId) {
    return { ok: false, error: msg('Unknown access link.', 'Lien d’accès inconnu.') }
  }

  // Une demande n'a de sens que pour un accès terminé / désactivé.
  if (!isReactivatableTokenStatus(token.status)) {
    return {
      ok: false,
      error: msg(
        'This access is still active and does not need reactivation.',
        'Cet accès est encore actif et n’a pas besoin de réactivation.',
      ),
    }
  }

  const existing = await prisma.observerReactivationRequest.findMany({
    where: { tokenId: token.id },
    select: { status: true },
  })
  if (!canCreateNewRequest(existing)) {
    return { ok: true, status: 'already-pending' }
  }

  await prisma.observerReactivationRequest.create({
    data: { tokenId: token.id },
  })

  await recordAudit({
    userId: scope.uid ?? null,
    action: AUDIT_ACTIONS.observerReactivationRequested,
    entityType: 'share',
    entityId: token.id,
    metadata: { projectId, tokenStatus: token.status },
  })

  // ——— Notification in-app + email aux ADMIN (Partie Q/S) ———
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, email: true },
  })
  for (const admin of admins) {
    await notify({
      inApp: {
        userId: admin.id,
        type: 'REACTIVATION_REQUESTED',
        title: 'Demande de réactivation',
        message: 'Un observateur a demandé la réactivation de son accès.',
      },
      email: { to: admin.email, kind: 'ADMIN_REACTIVATION_REQUEST', context: { projectTitle: projectId } },
    })
  }

  return { ok: true, status: 'created' }
}

/** État de la demande de réactivation pour l'observateur (lecture seule). */
export type ReactivationStateResult =
  | {
      ok: true
      /** Statut de la demande PENDING, sinon null. */
      pending: boolean
      status: ReactivationStatus | null
    }
  | { ok: false }

export async function getObserverReactivationState(projectId: string): Promise<ReactivationStateResult> {
  const scope = await readObserverScopeFromCookies()
  if (!scope || scope.projectId !== projectId) return { ok: false }
  const request = await prisma.observerReactivationRequest.findFirst({
    where: { tokenId: scope.tokenId },
    orderBy: { createdAt: 'desc' },
    select: { status: true },
  })
  return {
    ok: true,
    pending: request?.status === 'PENDING',
    status: request?.status ?? null,
  }
}

// ——— ADMIN : consultation + décision ———

/** Ligne de demande de réactivation, sans le jeton brut. */
export type ReactivationRequestRow = {
  id: string
  tokenId: string
  projectId: string
  projectTitle: string
  observerLabel: string
  status: ReactivationStatus
  requestedAt: string
  decidedAt: string | null
}

type ListResult = { ok: true; requests: ReactivationRequestRow[] } | { ok: false; error: string }

/**
 * Liste les demandes de réactivation d'un projet (ADMIN). Ne renvoie jamais le
 * jeton brut ; uniquement des identifiants internes et le libellé de l'observateur.
 */
export async function listObserverReactivationRequests(
  projectId: string,
): Promise<ListResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const requests = await prisma.observerReactivationRequest.findMany({
      where: { token: { projectId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        requestedAt: true,
        decidedAt: true,
        token: {
          select: {
            id: true,
            projectId: true,
            observer: { select: { id: true, username: true, email: true, anonymousId: true } },
            project: { select: { title: true } },
          },
        },
      },
    })
    return {
      ok: true,
      requests: requests.map((request) => ({
        id: request.id,
        tokenId: request.token.id,
        projectId: request.token.projectId,
        projectTitle: request.token.project.title,
        observerLabel:
          request.token.observer?.username?.trim() ||
          request.token.observer?.email?.trim() ||
          request.token.observer?.anonymousId ||
          'Observateur',
        status: request.status,
        requestedAt: request.requestedAt.toISOString(),
        decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
      })),
    }
  } catch (error) {
    console.error('Erreur lors de la liste des demandes de réactivation :', error)
    return { ok: false, error: 'Impossible de charger les demandes de réactivation.' }
  }
}

type DecideResult = { ok: true } | { ok: false; error: string }

/**
 * APPROUVE une demande : la demande passe APPROVED, le jeton redevient ACTIVE et
 * l'observateur peut reprendre SA session (données et parties conservées).
 */
export async function approveObserverReactivation(requestId: string): Promise<DecideResult> {
  const admin = await getCurrentAdmin()
  if (!admin) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const request = await prisma.observerReactivationRequest.findUnique({
      where: { id: requestId },
      select: { id: true, tokenId: true, status: true, token: { select: { projectId: true, status: true, observerEmail: true, observerId: true } } },
    })
    if (!request) return { ok: false, error: 'Demande introuvable.' }
    if (request.status !== 'PENDING') return { ok: false, error: 'Cette demande a déjà été traitée.' }

    const tokenUpdate = reactivationApprovalTokenData()

    await prisma.$transaction([
      prisma.observerReactivationRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedById: admin.uid },
      }),
      prisma.observerAccessToken.update({
        where: { id: request.tokenId },
        data: tokenUpdate,
      }),
    ])

    await recordAudit({
      userId: admin.uid,
      action: AUDIT_ACTIONS.observerReactivationApproved,
      entityType: 'share',
      entityId: request.tokenId,
      metadata: { requestId: request.id, projectId: request.token.projectId },
    })
    await recordAudit({
      userId: admin.uid,
      action: AUDIT_ACTIONS.observerTokenReactivated,
      entityType: 'share',
      entityId: request.tokenId,
      metadata: { requestId: request.id, projectId: request.token.projectId },
    })

    // ——— Email (et notification in-app si compte interne) à l'observateur (Partie Q) ———
    if (request.token.observerId) {
      await notify({
        inApp: {
          userId: request.token.observerId,
          type: 'REACTIVATION_APPROVED',
          title: 'Accès réactivé',
          message: 'Votre accès a été réactivé. Vous pouvez reprendre votre session.',
        },
      })
    }
    if (request.token.observerEmail) {
      await notify({
        email: {
          to: request.token.observerEmail,
          kind: 'OBSERVER_REACTIVATION_APPROVED',
        },
      })
    }

    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’approbation de la réactivation :', error)
    return { ok: false, error: 'Impossible de confirmer la réactivation. Réessayez.' }
  }
}

/**
 * REFUSE une demande : la demande passe REJECTED, l'accès reste tel quel, aucune
 * donnée n'est supprimée.
 */
export async function rejectObserverReactivation(requestId: string): Promise<DecideResult> {
  const admin = await getCurrentAdmin()
  if (!admin) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const request = await prisma.observerReactivationRequest.findUnique({
      where: { id: requestId },
      select: { id: true, tokenId: true, status: true, token: { select: { projectId: true, observerEmail: true, observerId: true } } },
    })
    if (!request) return { ok: false, error: 'Demande introuvable.' }
    if (request.status !== 'PENDING') return { ok: false, error: 'Cette demande a déjà été traitée.' }

    await prisma.observerReactivationRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedById: admin.uid },
    })

    await recordAudit({
      userId: admin.uid,
      action: AUDIT_ACTIONS.observerReactivationRejected,
      entityType: 'share',
      entityId: request.tokenId,
      metadata: { requestId: request.id, projectId: request.token.projectId },
    })

    // ——— Email (et notification in-app si compte interne) à l'observateur (Partie Q) ———
    if (request.token.observerId) {
      await notify({
        inApp: {
          userId: request.token.observerId,
          type: 'REACTIVATION_REJECTED',
          title: 'Demande refusée',
          message: 'Votre demande de réactivation n’a pas été approuvée.',
        },
      })
    }
    if (request.token.observerEmail) {
      await notify({
        email: { to: request.token.observerEmail, kind: 'OBSERVER_REACTIVATION_REJECTED' },
      })
    }

    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors du refus de la réactivation :', error)
    return { ok: false, error: 'Impossible de refuser la réactivation. Réessayez.' }
  }
}
