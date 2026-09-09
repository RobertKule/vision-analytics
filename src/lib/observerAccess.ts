/**
 * Ordonnanceur de l'accès observateur par jeton (« lien de partage »).
 *
 * La BASE est la seule source de vérité du statut d'un jeton : le cookie `va_observer`
 * (signé, voir `observerTokenCrypto.ts`) ne sert qu'à retrouver le jeton sans jamais
 * transporter le jeton brut. Chaque requête re-vérifie donc le statut en base — une
 * révocation, expiration ou clôture prend effet immédiatement, sans attendre que le
 * cookie expire.
 *
 * Sécurité : le jeton brut n'est ni stocké ni journalisé ; les audits n'enregistrent
 * que des identifiants internes (tokenId / projectId). Un cookie de portée est lié à
 * UN projet : tenter de l'utiliser pour écrire sur un autre projet est refusé.
 */
import 'server-only'
import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import {
  OBSERVER_COOKIE_NAME,
  OBSERVER_SCOPE_TTL_SECONDS,
  hashObserverToken,
  parseObserverCookie,
  signObserverCookie,
  type ObserverCookiePayload,
} from '@/lib/observerTokenCrypto'

export { OBSERVER_COOKIE_NAME } from '@/lib/observerTokenCrypto'

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}

function scopeExpiry(): number {
  return nowUnix() + OBSERVER_SCOPE_TTL_SECONDS
}

/** Écrit le cookie de portée observateur (remplace toute portée précédente). */
async function setObserverScopeCookie(payload: ObserverCookiePayload): Promise<void> {
  const store = await cookies()
  store.set(OBSERVER_COOKIE_NAME, signObserverCookie(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: payload.exp - nowUnix(),
  })
}

/** Supprime la portée observateur (déconnexion explicite, révocation locale). */
export async function clearObserverScopeCookie(): Promise<void> {
  const store = await cookies()
  store.set(OBSERVER_COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
}

/** Relit la portée signée sans vérifier la base (rapide ; la base fait foi ensuite). */
export async function readObserverScopeFromCookies(): Promise<ObserverCookiePayload | null> {
  const store = await cookies()
  return parseObserverCookie(store.get(OBSERVER_COOKIE_NAME)?.value)
}

// ——— Portée posée (écritures / finalisation / pages /observe) ———
//
// La valeur signée du cookie donne un point d'entrée ; le statut effectif est toujours
// re-lu depuis la base au moment de la requête.

export type ObserverGateResult =
  | { ok: true; userId: string; tokenId: string; runId: string; completed: boolean }
  | { ok: false }

/**
 * Vérifie, base à l'appui, que le cookie de portée autorise l'accès au jeton lié à
 * `projectId`. Retourne l'identité observateur rattachée au jeton (jamais celle que le
 * client pourrait tenter de revendiquer). ACTIVE → écriture possible (`completed=false`) ;
 * COMPLETED → le jeton est clôturé (`completed=true`, les écritures sont refusées par
 * l'appelant). Tout autre cas (cookie absent, jeton supprimé, autre projet, révoqué,
 * expiré) est un refus `{ ok: false }`.
 */
export async function resolveObserverGate(projectId: string): Promise<ObserverGateResult> {
  const scope = await readObserverScopeFromCookies()
  if (!scope) return { ok: false }
  if (scope.projectId !== projectId) return { ok: false }

  const token = await prisma.observerAccessToken.findUnique({
    where: { id: scope.tokenId },
    select: {
      id: true,
      projectId: true,
      observerId: true,
      sessionRunId: true,
      status: true,
      expiresAt: true,
    },
  })
  if (!token || token.projectId !== projectId) return { ok: false }
  if (!token.observerId || token.observerId !== scope.uid) return { ok: false }

  if (token.status === 'REVOKED') return { ok: false }
  if (token.status === 'EXPIRED') return { ok: false }
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
    await prisma.observerAccessToken.update({
      where: { id: token.id },
      data: { status: 'EXPIRED' },
    })
    return { ok: false }
  }

  const runId = token.sessionRunId ?? scope.runId
  if (token.status === 'COMPLETED') {
    return { ok: true, userId: token.observerId, tokenId: token.id, runId, completed: true }
  }

  // ACTIVE (seul état restant) : accès en écriture ; on renouvelle la session et
  // l'empreinte d'activité.
  if (!token.sessionRunId) {
    await prisma.observerAccessToken.update({
      where: { id: token.id },
      data: { sessionRunId: runId },
    })
  }
  await prisma.observerAccessToken.update({
    where: { id: token.id },
    data: { lastAccessedAt: new Date() },
  })
  return { ok: true, userId: token.observerId, tokenId: token.id, runId, completed: false }
}

// ——— Ouverture d'un lien /share/<raw> ———
//
// Crée / récupère l'observateur lié au jeton, émet le `sessionRunId` stable de la
// session, pose le cookie de portée et journalise l'accès (jamais le jeton brut).

export type OpenObserverAccessResult =
  | {
      kind: 'open' | 'resumed' | 'readonly'
      project: { id: string; title: string }
      uid: string
      runId: string
      tokenId: string
      completed: boolean
    }
  | { kind: 'invalid' }
  | { kind: 'revoked' }
  | { kind: 'expired' }

/**
 * Valide un jeton brut reçu sur `/share/<token>` et ouvre (ou reprend) la session.
 * Le jeton brut n'est utilisé que pour calculer son empreinte — jamais stocké ni loggé.
 */
export async function openObserverAccess(rawToken: string): Promise<OpenObserverAccessResult> {
  const tokenHash = hashObserverToken(rawToken)

  const token = await prisma.observerAccessToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      projectId: true,
      status: true,
      expiresAt: true,
      observerId: true,
      sessionRunId: true,
      project: { select: { id: true, title: true, isArchived: true } },
    },
  })

  if (!token || !token.project || token.project.isArchived) {
    await recordAudit({
      userId: null,
      action: AUDIT_ACTIONS.observerAccessFailure,
      entityType: 'share',
      entityId: token?.id ?? undefined,
      metadata: { reason: 'invalid' },
    })
    return { kind: 'invalid' }
  }

  const isExpiredByDate = !!token.expiresAt && token.expiresAt.getTime() <= Date.now()

  if (token.status === 'REVOKED' || (isExpiredByDate && token.status === 'ACTIVE')) {
    if (isExpiredByDate && token.status === 'ACTIVE') {
      await prisma.observerAccessToken.update({
        where: { id: token.id },
        data: { status: 'EXPIRED' },
      })
    }
    await recordAudit({
      userId: null,
      action: AUDIT_ACTIONS.observerAccessFailure,
      entityType: 'share',
      entityId: token.id,
      metadata: { projectId: token.projectId, reason: token.status === 'REVOKED' ? 'revoked' : 'expired' },
    })
    return token.status === 'REVOKED' ? { kind: 'revoked' } : { kind: 'expired' }
  }

  if (token.status === 'EXPIRED') {
    await recordAudit({
      userId: null,
      action: AUDIT_ACTIONS.observerAccessFailure,
      entityType: 'share',
      entityId: token.id,
      metadata: { projectId: token.projectId, reason: 'expired' },
    })
    return { kind: 'expired' }
  }

  // ——— Session ouverte (ACTIVE) ou déjà clôturée (COMPLETED → lecture seule) ———
  const completed = token.status === 'COMPLETED'

  // Observateur lié au jeton : créé une seule fois (premier passage du lien).
  let observerId = token.observerId
  if (!observerId) {
    const syntheticKey = token.id.replace(/[^a-zA-Z0-9_-]/g, '')
    const observer = await prisma.user.create({
      data: {
        email: `share-${syntheticKey}@observateur.vision-analytics`,
        anonymousId: `share-${syntheticKey}`,
        username: null,
        password: 'INDEPENDENT_OBSERVER_AUTO_GENERATED',
        role: Role.OBSERVER,
      },
      select: { id: true },
    })
    observerId = observer.id
  }

  // `sessionRunId` stable : la reprise (autre navigateur, rechargement) conserve la
  // même session d'observation.
  const runId = token.sessionRunId ?? randomUUID()
  const updateData: { observerId: string; sessionRunId?: string; lastAccessedAt: Date } = {
    observerId,
    lastAccessedAt: new Date(),
  }
  if (!token.sessionRunId) updateData.sessionRunId = runId
  await prisma.observerAccessToken.update({ where: { id: token.id }, data: updateData })

  await setObserverScopeCookie({
    tokenId: token.id,
    projectId: token.projectId,
    uid: observerId,
    runId,
    completed: completed ? 1 : 0,
    exp: scopeExpiry(),
  })

  await recordAudit({
    userId: observerId,
    action: AUDIT_ACTIONS.observerAccessSuccess,
    entityType: 'share',
    entityId: token.id,
    metadata: {
      projectId: token.projectId,
      kind: completed ? 'readonly' : token.sessionRunId ? 'resumed' : 'open',
    },
  })

  return {
    kind: completed ? 'readonly' : token.sessionRunId ? 'resumed' : 'open',
    project: { id: token.project.id, title: token.project.title },
    uid: observerId,
    runId,
    tokenId: token.id,
    completed,
  }
}

/**
 * Marque un jeton CLÔTURÉ (`status = COMPLETED`) une seule fois, à la finalisation
 * réussie d'une session par lien, puis bascule le cookie de portée courant en lecture
 * seule (si le cookie correspond au même jeton/observateur).
 *
 * @returns true si le jeton vient d'être clôturé par CET appel, false s'il l'était déjà.
 */
export async function completeObserverToken(tokenId: string): Promise<boolean> {
  const token = await prisma.observerAccessToken.findUnique({
    where: { id: tokenId },
    select: { id: true, projectId: true, observerId: true, sessionRunId: true, status: true },
  })
  if (!token || token.observerId == null) return false

  if (token.status !== 'COMPLETED') {
    await prisma.observerAccessToken.update({
      where: { id: token.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
  }

  const scope = await readObserverScopeFromCookies()
  if (scope && scope.tokenId === token.id && scope.uid === token.observerId) {
    await setObserverScopeCookie({
      tokenId: token.id,
      projectId: token.projectId,
      uid: token.observerId,
      runId: token.sessionRunId ?? scope.runId,
      completed: 1,
      exp: scopeExpiry(),
    })
  }

  return token.status !== 'COMPLETED'
}
