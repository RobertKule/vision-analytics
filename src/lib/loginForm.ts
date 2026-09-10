/**
 * État du bouton « Se connecter » — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * Le `disabled` du bouton de soumission doit être un BOOLÉEN EXPLICITE, calculé à
 * partir d'un état DÉTERMINISTE identique au premier rendu serveur et client.
 * C'est la seule façon d'éviter tout « hydration mismatch » (le serveur ne rend
 * jamais un `disabled` différent du client).
 *
 * Premier rendu attendu :
 *   identifier = '' , password = '' , isPending = false  →  disabled = true.
 */

export type LoginSubmitState = {
  identifier: string
  password: string
  /** Vrai pendant une soumission en cours (transition React). */
  isPending: boolean
}

/** Vrai si le bouton de soumission doit être désactivé. */
export function isLoginSubmitDisabled(state: LoginSubmitState): boolean {
  return Boolean(
    state.isPending || state.identifier.trim() === '' || state.password === '',
  )
}

/** Vrai si les champs obligatoires sont renseignés (hors soumission en cours). */
export function hasLoginCredentials(state: Omit<LoginSubmitState, 'isPending'>): boolean {
  return Boolean(state.identifier.trim() !== '' && state.password !== '')
}
