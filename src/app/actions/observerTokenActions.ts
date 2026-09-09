'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { ObserverTokenStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { hashObserverToken } from '@/lib/observerTokenCrypto'
import { recordAudit, AUDIT_ACTIONS, type AuditLogInput } from '@/lib/audit'

/**
 * Cycle de vie des liens d'accès observateur — réservé à l'administration.
 *
 * Un lien d'accès = un jeton aléatoire à haute entropie (256 bits, base64url) dont
 * SEUL le hash SHA-256 est persisté (`ObserverAccessToken.tokenHash`). Le jeton brut
 * n'existe qu'une fois : il est retourné à sa création (et à son remplacement), puis
 * n'est plus jamais stocké, journalisé ni affiché. L'administrateur le transmet
 * hors-ligne à l'observateur ; celui-ci ouvre `https://<hôte>/share/<JETON>`.
 *
 * Chaque jeton est lié à UN projet et produit UN observateur (lien → session unique).
 */

const TOKEN_MAX_VALID_DAYS = 365
const TOKEN_MIN_VALID_DAYS = 1

/** Trace une action d'audit dont l'acteur est l'admin courant (best effort). */
async function adminAudit(input: Omit<AuditLogInput, 'userId'>): Promise<void> {
  const admin = await getCurrentAdmin()
  await recordAudit({ ...input, userId: admin?.uid ?? null })
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

async function assertAdminAndProject(
  projectId: string,
): Promise<{ ok: true; project: { id: string } } | { ok: false; error: string }> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { ok: false, error: 'Identifiant de projet invalide.' }
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
  const guard = await assertAdminAndProject(projectId)
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
  const guard = await assertAdminAndProject(projectId)
  if (!guard.ok) return guard
  try {
    const validDays = normalizeValidDays(input.validDays)
    const { rawToken, tokenHash } = makeTokenPair()
    const expiresAt = computeExpiry(validDays)

    const token = await prisma.observerAccessToken.create({
      data: { projectId: guard.project.id, tokenHash, expiresAt },
      select: { id: true, projectId: true },
    })

    await adminAudit({
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

type RevokeTokenResult = { ok: true } | { ok: false; error: string }

/**
 * Révoque un lien d'accès : le jeton devient immédiatement inutilisable (la base est
 * la source de vérité, chaque requête la re-vérifie — la révocation est instantanée,
 * même si un observateur détient déjà le cookie de portée).
 */
export async function revokeObserverToken(tokenId: string): Promise<RevokeTokenResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
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
    if (token.status === 'REVOKED') {
      return { ok: true }
    }
    await prisma.observerAccessToken.update({
      where: { id: token.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })
    await adminAudit({
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
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof tokenId !== 'string' || !tokenId.trim()) {
      return { ok: false, error: 'Identifiant de lien invalide.' }
    }
    const existing = await prisma.observerAccessToken.findUnique({
      where: { id: tokenId },
      select: { id: true, projectId: true, status: true },
    })
    if (!existing) {
      return { ok: false, error: 'Lien d’accès introuvable.' }
    }

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

    await adminAudit({
      action: AUDIT_ACTIONS.observerAccessRevoked,
      entityType: 'share',
      entityId: existing.id,
      metadata: { projectId: existing.projectId, reason: 'reissued' },
    })
    await adminAudit({
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
