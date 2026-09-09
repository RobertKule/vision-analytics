import { describe, expect, it } from 'vitest'
import { isCaptureTrulyRecorded } from '@/lib/captureNotify'

/**
 * Tests purs de la décision de notification « Capture enregistrée ».
 * Règle : la notification globale ne part que lorsque la capture passe RÉELLEMENT à
 * l'état enregistré (acquittement serveur) — jamais après le clic si l'envoi a
 * échoué, est encore en cours, ou a été annulé par un retrait pendant l'envoi ;
 * jamais en double pour une capture déjà `synced`.
 */

describe('isCaptureTrulyRecorded', () => {
  it('capture réellement enregistrée (serveur OK, non retirée) → notification', () => {
    expect(
      isCaptureTrulyRecorded({ serverOk: true, deleteRequested: false, alreadySynced: false }),
    ).toBe(true)
  })

  it('échec serveur → AUCUNE notification « enregistrée »', () => {
    expect(
      isCaptureTrulyRecorded({ serverOk: false, deleteRequested: false, alreadySynced: false }),
    ).toBe(false)
  })

  it('envoi encore en cours / sans acquittement → aucune notification (pas au clic)', () => {
    // Aucun acquittement serveur n'est encore revenu : `serverOk` est faux tant que
    // l'appel n'a pas abouti — le clic seul ne notifie jamais.
    expect(
      isCaptureTrulyRecorded({ serverOk: false, deleteRequested: false, alreadySynced: false }),
    ).toBe(false)
  })

  it('capture retirée pendant l’envoi → aucune notification', () => {
    expect(
      isCaptureTrulyRecorded({ serverOk: true, deleteRequested: true, alreadySynced: false }),
    ).toBe(false)
  })

  it('capture déjà synced avant l’envoi → aucune seconde notification', () => {
    expect(
      isCaptureTrulyRecorded({ serverOk: true, deleteRequested: false, alreadySynced: true }),
    ).toBe(false)
  })
})
