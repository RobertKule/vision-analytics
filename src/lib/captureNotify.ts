/**
 * Décision d'émission de la notification GLOBALE « Capture enregistrée » — pure.
 *
 * La notification ne doit JAMAIS partir au moment du clic : uniquement quand la
 * capture est RÉELLEMENT considérée comme enregistrée par le statut courant du
 * système, c'est-à-dire quand le serveur a acquitté son enregistrement (`serverOk`)
 * et que l'observateur ne l'a pas retirée pendant l'envoi (`deleteRequested`).
 * Une capture déjà à l'état `synced` avant l'envoi (re-confirmation sans réelle
 * transition) ne doit pas déclencher une seconde notification.
 */
export type CaptureSavedAnnounce = {
  /** Vrai quand l'appel serveur d'enregistrement a répondu par un succès. */
  serverOk: boolean
  /** Vrai quand l'observateur a retiré la capture pendant que l'envoi était en vol. */
  deleteRequested: boolean
  /** Vrai quand la capture était déjà `synced` avant le début de l'envoi courant. */
  alreadySynced: boolean
}

/** Vrai si la capture vient réellement de passer à l'état « enregistrée » (à notifier). */
export function isCaptureTrulyRecorded(announce: CaptureSavedAnnounce): boolean {
  return announce.serverOk && !announce.deleteRequested && !announce.alreadySynced
}
