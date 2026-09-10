'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { ObserverTokenStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { hashObserverToken } from '@/lib/observerTokenCrypto'
import { recordAudit, AUDIT_ACTIONS, type AuditLogInput } from '@/lib/audit'
import { processInvitationEmails } from '@/lib/invitationBatch'
import { appBaseUrl, sendEmail } from '@/lib/email'

/**
 * Cycle de vie des liens d'accès observateur.
 *
 * Un lien d'accès = un jeton aléatoire à haute entropie (256 bits, base64url) dont
 * SEUL le hash SHA-256 est persisté (`ObserverAccessToken.tokenHash`). Le jeton brut
 * n'existe qu'une fois : il est retourné à sa création (et à son remplacement), puis
 * n'est plus jamais stocké, journalisé ni affiché. L'administrateur (ou l'analyste
 * responsable) le transmet hors-ligne à l'observateur, qui ouvre
 * `https://<hôte>/share/<JETON>`.
 *
 * RBAC (Partie C) : un ADMIN gère les liens de tous les projets ; un ANALYSTE ne
 * peut en créer/révoquer que DANS SON PÉRIMÈTRE — ses propres expériences, ou une
 * expérience partagée avec droit d'édition. Le périmètre est TOUJOURS re-vérifié
 * côté serveur à partir du projet réel du jeton : modifier un identifiant dans la
 * requête ne donne aucun accès.
 *
 * Chaque jeton est lié à UN projet et produit UN observateur (lien → session unique).
 */

const TOKEN_MAX_VALID_DAYS = 365
const TOKEN_MIN_VALID_DAYS = 1

/** Trace une action d'audit dont l'acteur est la session courante (best effort). */
async function actorAudit(input: Omit<AuditLogInput, 'userId'>): Promise<void> {
  const session = await getCurrentSession()
  await recordAudit({ ...input, userId: session?.uid ?? null })
}

export type ObserverTokenRowDto = {
  id: string
  status: ObserverTokenStatus
  createdAt: string
  expiresAt: string | null
  lastAccessedAt: string | null
  completedAt: string | null
  revokedAt: string | null
}

type TokenListResult =
  | { ok: true; tokens: ObserverTokenRowDto[] }
  | { ok: false; error: string }

/** Valide la durée de validité optionnelle (jours) envoyée par le formulaire. */
function normalizeValidDays(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number)) return null
  return Math.min(TOKEN_MAX_VALID_DAYS, Math.max(TOKEN_MIN_VALID_DAYS, number))
}

function computeExpiry(validDays: number | null): Date | null {
  if (validDays === null) return null
  return new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
}

/** Message unique de refus (aucun détail sur l'existence du projet visé). */
const ACCESS_DENIED = 'Accès refusé : vous ne gérez pas les liens d’accès de ce projet.'

/**
 * Vérifie CÔTÉ SERVEUR que la session peut gérer les liens d'accès de `projectId`
 * (ADMIN, propriétaire, ou invité avec droit d'édition) et que le projet est actif.
 */
async function assertTokenScope(
  projectId: string,
): Promise<{ ok: true; project: { id: string } } | { ok: false; error: string }> {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { ok: false, error: 'Identifiant de projet invalide.' }
  }
  const permissions = await getCurrentProjectPermissions(projectId)
  if (!permissions.canCreateObserverTokens) {
    return { ok: false, error: ACCESS_DENIED }
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, isArchived: true },
  })
  if (!project) {
    return { ok: false, error: 'Projet introuvable.' }
  }
  if (project.isArchived) {
    return { ok: false, error: 'Le projet est archivé : créez de nouveaux liens avant de l’archiver.' }
  }
  return { ok: true, project: { id: project.id } }
}

/** Périmètre d'un jeton existant : le projet RÉEL du jeton fait autorité. */
async function assertTokenAccess(
  tokenId: string,
): Promise<
  | { ok: true; token: { id: string; projectId: string; status: ObserverTokenStatus } }
  | { ok: false; error: string }
> {
  if (typeof tokenId !== 'string' || !tokenId.trim()) {
    return { ok: false, error: 'Identifiant de lien invalide.' }
  }
  const token = await prisma.observerAccessToken.findUnique({
    where: { id: tokenId },
    select: { id: true, projectId: true, status: true },
  })
  if (!token) {
    return { ok: false, error: 'Lien d’accès introuvable.' }
  }
  const permissions = await getCurrentProjectPermissions(token.projectId)
  if (!permissions.canCreateObserverTokens) {
    return { ok: false, error: ACCESS_DENIED }
  }
  return { ok: true, token }
}

/** Génère un jeton brut (256 bits) et son empreinte SHA-256 persistée. */
function makeTokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url')
  return { rawToken, tokenHash: hashObserverToken(rawToken) }
}

/**
 * Liste les liens d'accès d'un projet (sans jamais exposer les jetons bruts, qui ne
 * sont pas conservés, ni leurs empreintes, qui n'ont pas à être montrées).
 */
export async function listObserverTokens(projectId: string): Promise<TokenListResult> {
  const guard = await assertTokenScope(projectId)
  if (!guard.ok) return guard
  try {
    const tokens = await prisma.observerAccessToken.findMany({
      where: { projectId: guard.project.id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        lastAccessedAt: true,
        completedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return {
      ok: true,
      tokens: tokens.map((token) => ({
        id: token.id,
        status: token.status,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
        lastAccessedAt: token.lastAccessedAt ? token.lastAccessedAt.toISOString() : null,
        completedAt: token.completedAt ? token.completedAt.toISOString() : null,
        revokedAt: token.revokedAt ? token.revokedAt.toISOString() : null,
      })),
    }
  } catch (error) {
    console.error('Erreur lors de la liste des liens d’accès :', error)
    return { ok: false, error: 'Impossible de charger les liens d’accès. Réessayez.' }
  }
}

type CreateTokenInput = { projectId: string; validDays?: number | null }

type CreateTokenResult =
  | { ok: true; tokenId: string; rawToken: string; expiresAt: string | null }
  | { ok: false; error: string }

/**
 * Crée un nouveau lien d'accès ACTIVE pour un projet. Le jeton brut n'est retourné
 * qu'ici — l'administrateur doit le transmettre immédiatement à l'observateur.
 */
export async function createObserverToken(input: CreateTokenInput): Promise<CreateTokenResult> {
  const { projectId } = input
  const guard = await assertTokenScope(projectId)
  if (!guard.ok) return guard
  try {
    const validDays = normalizeValidDays(input.validDays)
    const { rawToken, tokenHash } = makeTokenPair()
    const expiresAt = computeExpiry(validDays)

    const token = await prisma.observerAccessToken.create({
      data: { projectId: guard.project.id, tokenHash, expiresAt },
      select: { id: true, projectId: true },
    })

    await actorAudit({
      action: AUDIT_ACTIONS.observerAccessTokenCreated,
      entityType: 'share',
      entityId: token.id,
      metadata: { projectId: token.projectId, expiresAt: expiresAt ? expiresAt.toISOString() : null },
    })
    revalidatePath('/admin/projects')
    return {
      ok: true,
      tokenId: token.id,
      rawToken,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    }
  } catch (error) {
    console.error('Erreur lors de la création du lien d’accès :', error)
    return { ok: false, error: 'Impossible de créer le lien d’accès. Réessayez.' }
  }
}

export type ObserverInvitationOutcome =
  | { kind: 'created'; email: string }
  | { kind: 'duplicate'; email: string }
  | { kind: 'invalid'; raw: string }
  | { kind: 'email-failed'; email: string }

export type CreateObserverTokensInput = {
  projectId: string
  validDays?: number | null
  /** Un ou plusieurs emails ; UN email = UN token = UNE session. */
  emails: string[]
}

export type CreateObserverTokensResult =
  | { ok: true; outcomes: ObserverInvitationOutcome[]; createdCount: number }
  | { ok: false; error: string }

/**
 * INVITATIONS OBSERVATEURS MULTIPLES (Partie J/K/N/O).
 *
 * Chaque adresse valide reçoit SON propre token, SON propre hash, SA propre session
 * et SON propre email — jamais de jeton partagé entre deux emails. Une adresse
 * invalide est signalée sans annuler les autres ; un accès actif existant est un
 * doublon (jamais de second token). Le jeton brut n'apparaît que dans le lien de
 * l'email d'invitation, jamais en base ni dans les journaux.
 */
export async function createObserverTokens(
  input: CreateObserverTokensInput,
): Promise<CreateObserverTokensResult> {
  const { projectId } = input
  const guard = await assertTokenScope(projectId)
  if (!guard.ok) return guard
  try {
    const emails = Array.isArray(input?.emails) ? input.emails.map((e) => String(e ?? '')) : []
    const validDays = normalizeValidDays(input.validDays)
    const expiresAt = computeExpiry(validDays)

    const project = await prisma.project.findUnique({
      where: { id: guard.project.id },
      select: { title: true },
    })
    const projectTitle = project?.title ?? ''

    // Déduplication : les accès ACTIFS existants portant déjà cet email.
    const existing = await prisma.observerAccessToken.findMany({
      where: { projectId: guard.project.id, status: 'ACTIVE', observerEmail: { not: null } },
      select: { observerEmail: true },
    })
    const batch = processInvitationEmails({
      emails,
      existingActiveEmails: existing
        .map((token) => token.observerEmail)
        .filter((email): email is string => Boolean(email)),
    })

    const outcomes: ObserverInvitationOutcome[] = []
    for (const raw of batch.invalid) outcomes.push({ kind: 'invalid', raw })
    for (const email of batch.duplicates) outcomes.push({ kind: 'duplicate', email })

    let createdCount = 0
    for (const email of batch.toCreate) {
      const { rawToken, tokenHash } = makeTokenPair()
      await prisma.observerAccessToken.create({
        data: { projectId: guard.project.id, tokenHash, expiresAt, observerEmail: email },
        select: { id: true },
      })
      await actorAudit({
        action: AUDIT_ACTIONS.observerInvitationCreated,
        entityType: 'share',
        entityId: guard.project.id,
        metadata: { projectId: guard.project.id, to: email, expiresAt: expiresAt ? expiresAt.toISOString() : null },
      })
      createdCount += 1

      const sent = await sendEmail({
        kind: 'OBSERVER_INVITATION',
        to: email,
        context: { projectTitle, baseUrl: appBaseUrl(), rawToken },
      })
      if (sent.ok) {
        await actorAudit({
          action: AUDIT_ACTIONS.observerInvitationEmailSent,
          entityType: 'share',
          entityId: guard.project.id,
          metadata: { projectId: guard.project.id, to: email },
        })
        outcomes.push({ kind: 'created', email })
      } else {
        await actorAudit({
          action: AUDIT_ACTIONS.observerInvitationEmailFailed,
          entityType: 'share',
          entityId: guard.project.id,
          metadata: { projectId: guard.project.id, to: email, reason: sent.reason },
        })
        outcomes.push({ kind: 'email-failed', email })
      }
    }

    revalidatePath('/admin/projects')
    return { ok: true, outcomes, createdCount }
  } catch (error) {
    console.error('Erreur lors de la création des accès :', error)
    return { ok: false, error: 'Impossible de créer les accès observateurs. Réessayez.' }
  }
}

type RevokeTokenResult = { ok: true } | { ok: false; error: string }

/**
 * Révoque un lien d'accès : le jeton devient immédiatement inutilisable (la base est
 * la source de vérité, chaque requête la re-vérifie — la révocation est instantanée,
 * même si un observateur détient déjà le cookie de portée).
 */
export async function revokeObserverToken(tokenId: string): Promise<RevokeTokenResult> {
  try {
    const guard = await assertTokenAccess(tokenId)
    if (!guard.ok) return guard
    const token = guard.token
    if (token.status === 'REVOKED') {
      return { ok: true }
    }
    await prisma.observerAccessToken.update({
      where: { id: token.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })
    await actorAudit({
      action: AUDIT_ACTIONS.observerAccessRevoked,
      entityType: 'share',
      entityId: token.id,
      metadata: { projectId: token.projectId },
    })
    revalidatePath('/admin/projects')
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la révocation du lien d’accès :', error)
    return { ok: false, error: 'Impossible de révoquer le lien d’accès. Réessayez.' }
  }
}

type ReissueTokenInput = { tokenId: string; validDays?: number | null }

type ReissueTokenResult =
  | { ok: true; tokenId: string; rawToken: string; expiresAt: string | null }
  | { ok: false; error: string }

/**
 * Remplace un lien d'accès : le lien existant est révoqué puis un NOUVEAU lien ACTIVE
 * est créé pour le même projet. Le nouveau jeton brut n'est retourné qu'une fois.
 */
export async function reissueObserverToken(input: ReissueTokenInput): Promise<ReissueTokenResult> {
  const { tokenId } = input
  try {
    const guard = await assertTokenAccess(tokenId)
    if (!guard.ok) return guard
    const existing = guard.token

    const validDays = normalizeValidDays(input.validDays)
    const { rawToken, tokenHash } = makeTokenPair()
    const expiresAt = computeExpiry(validDays)

    const [, created] = await prisma.$transaction([
      prisma.observerAccessToken.update({
        where: { id: existing.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
      prisma.observerAccessToken.create({
        data: { projectId: existing.projectId, tokenHash, expiresAt },
        select: { id: true, projectId: true },
      }),
    ])

    await actorAudit({
      action: AUDIT_ACTIONS.observerAccessRevoked,
      entityType: 'share',
      entityId: existing.id,
      metadata: { projectId: existing.projectId, reason: 'reissued' },
    })
    await actorAudit({
      action: AUDIT_ACTIONS.observerAccessTokenCreated,
      entityType: 'share',
      entityId: created.id,
      metadata: {
        projectId: created.projectId,
        replaces: existing.id,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
    })
    revalidatePath('/admin/projects')
    return {
      ok: true,
      tokenId: created.id,
      rawToken,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    }
  } catch (error) {
    console.error('Erreur lors du remplacement du lien d’accès :', error)
    return { ok: false, error: 'Impossible de remplacer le lien d’accès. Réessayez.' }
  }
}
