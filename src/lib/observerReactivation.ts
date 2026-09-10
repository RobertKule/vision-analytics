/**
 * DEMANDE DE RÉACTIVATION — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * ─── RÈGLE FONDAMENTALE ─────────────────────────────────────────────────────
 * DEMANDE DE RÉACTIVATION ≠ RÉACTIVATION EFFECTIVE.
 *
 * L'observateur peut DEMANDER une réactivation ; il ne peut JAMAIS réactiver
 * lui-même son accès. Seul un ADMIN confirme (APPROVED → le jeton redevient
 * ACTIVE) ou refuse (REJECTED → l'accès reste tel quel).
 *
 * Une réactivation ne supprime ni ne recrée aucune donnée : observations, captures,
 * parties déjà envoyées et historique sont conservés.
 *
 * Le statut de la DEMANDE (`ReactivationStatus`) est INDÉPENDANT du statut du
 * JETON (`ObserverTokenStatus`) : la demande n'est que l'intention, la décision
 * revient à l'ADMIN.
 */

/** Statut d'une demande de réactivation. */
export type ReactivationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export const REACTIVATION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const

export function isPending(status: ReactivationStatus | null | undefined): boolean {
  return status === REACTIVATION_STATUS.PENDING
}

export function isApproved(status: ReactivationStatus | null | undefined): boolean {
  return status === REACTIVATION_STATUS.APPROVED
}

export function isRejected(status: ReactivationStatus | null | undefined): boolean {
  return status === REACTIVATION_STATUS.REJECTED
}

/** Demande de réactivation (vue réduite, sans le jeton brut). */
export type ReactivationRequestLike = {
  status: ReactivationStatus
}

/** La demande PENDING en cours d'un jeton, sinon null. */
export function findPendingRequest<T extends ReactivationRequestLike>(
  requests: readonly T[],
): T | null {
  for (const request of requests) {
    if (isPending(request.status)) return request
  }
  return null
}

/**
 * Vrai si une NOUVELLE demande peut être créée : uniquement si AUCUNE demande
 * PENDING n'existe déjà (une seule demande active à la fois, section A7).
 * Une demande APPROVED/REJECTED n'empêche pas de re-demander plus tard.
 */
export function canCreateNewRequest(requests: readonly ReactivationRequestLike[]): boolean {
  return findPendingRequest(requests) === null
}

/**
 * Mise à jour du jeton lors d'une APPROBATION : le jeton redevient ACTIVE, ses
 * marqueurs de clôture/révocation sont effacés et son échéance de date est levée
 * (l'ADMIN a explicitement rouvert l'accès). Aucune donnée d'observation n'est
 * touchée.
 */
export function reactivationApprovalTokenData(): {
  status: 'ACTIVE'
  completedAt: null
  revokedAt: null
  expiresAt: null
} {
  return { status: 'ACTIVE', completedAt: null, revokedAt: null, expiresAt: null }
}

/** Vrai si un jeton est réactivable (uniquement les états terminés / désactivés). */
export function isReactivatableTokenStatus(
  status: string | null | undefined,
): status is 'COMPLETED' | 'REVOKED' | 'EXPIRED' {
  return status === 'COMPLETED' || status === 'REVOKED' || status === 'EXPIRED'
}
