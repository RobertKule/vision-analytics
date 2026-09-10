import { describe, expect, it } from 'vitest'
import {
  REACTIVATION_STATUS,
  canCreateNewRequest,
  findPendingRequest,
  isApproved,
  isPending,
  isReactivatableTokenStatus,
  isRejected,
  reactivationApprovalTokenData,
} from '@/lib/observerReactivation'

/**
 * PARTIE A12 — DEMANDE DE RÉACTIVATION (noyau PUR).
 *
 * Règle : DEMANDE ≠ RÉACTIVATION. L'observateur demande ; seul l'ADMIN décide.
 * Une seule demande PENDING par jeton ; aucune donnée supprimée par une réactivation.
 */

describe('statut de la demande', () => {
  it('reconnaît PENDING / APPROVED / REJECTED', () => {
    expect(isPending(REACTIVATION_STATUS.PENDING)).toBe(true)
    expect(isPending(REACTIVATION_STATUS.APPROVED)).toBe(false)
    expect(isApproved(REACTIVATION_STATUS.APPROVED)).toBe(true)
    expect(isRejected(REACTIVATION_STATUS.REJECTED)).toBe(true)
    expect(isPending(null)).toBe(false)
  })
})

describe('A7 — une seule demande PENDING à la fois', () => {
  it('aucune demande en cours → nouvelle demande autorisée', () => {
    expect(canCreateNewRequest([])).toBe(true)
    expect(
      canCreateNewRequest([
        { status: REACTIVATION_STATUS.APPROVED },
        { status: REACTIVATION_STATUS.REJECTED },
      ]),
    ).toBe(true)
  })

  it('13 : une demande PENDING bloque toute nouvelle demande', () => {
    expect(
      canCreateNewRequest([
        { status: REACTIVATION_STATUS.PENDING },
        { status: REACTIVATION_STATUS.APPROVED },
      ]),
    ).toBe(false)
    expect(findPendingRequest([{ status: REACTIVATION_STATUS.PENDING }])?.status).toBe('PENDING')
  })

  it('une demande APPROVED/REJECTED permet de re-demander plus tard', () => {
    expect(
      findPendingRequest([{ status: REACTIVATION_STATUS.REJECTED }]),
    ).toBeNull()
    expect(canCreateNewRequest([{ status: REACTIVATION_STATUS.REJECTED }])).toBe(true)
  })
})

describe('A5 — approbation : réactivation du jeton sans supprimer les données', () => {
  it('l’approbation repasse le jeton ACTIVE et efface les marqueurs de fin', () => {
    const data = reactivationApprovalTokenData()
    expect(data.status).toBe('ACTIVE')
    expect(data.completedAt).toBeNull()
    expect(data.revokedAt).toBeNull()
    expect(data.expiresAt).toBeNull()
  })

  it('aucun champ de données d’observation n’est touché par la décision', () => {
    // La décision d'approbation ne porte QUE sur le jeton (aucune observation,
    // capture, partie ou historique). Le contrat ci-dessus est purement « jeton ».
    const keys = Object.keys(reactivationApprovalTokenData())
    expect(keys).toEqual(['status', 'completedAt', 'revokedAt', 'expiresAt'])
  })
})

describe('A10 — cas session terminée / désactivée', () => {
  it('seuls COMPLETED / REVOKED / EXPIRED sont réactivables', () => {
    expect(isReactivatableTokenStatus('COMPLETED')).toBe(true)
    expect(isReactivatableTokenStatus('REVOKED')).toBe(true)
    expect(isReactivatableTokenStatus('EXPIRED')).toBe(true)
    expect(isReactivatableTokenStatus('ACTIVE')).toBe(false)
    expect(isReactivatableTokenStatus(null)).toBe(false)
  })
})
