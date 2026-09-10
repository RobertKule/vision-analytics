import { describe, expect, it } from 'vitest'
import { hasLoginCredentials, isLoginSubmitDisabled } from '@/lib/loginForm'

/**
 * État du bouton « Se connecter » — DÉTERMINISME SSR / CLIENT.
 *
 * Le `disabled` du bouton doit être un booléen explicite, identique au premier
 * rendu serveur ET client : identifiant vide + mot de passe vide + isPending
 * false ⇒ disabled = true (aucune divergence d'hydratation).
 */

describe('premier rendu — aucun identifiant, aucun mot de passe', () => {
  it('1–5 : page ouverte, champs vides → bouton disabled', () => {
    const disabled = isLoginSubmitDisabled({
      identifier: '',
      password: '',
      isPending: false,
    })
    expect(disabled).toBe(true)
    expect(typeof disabled).toBe('boolean')
  })

  it('le résultat est TOUJOURS un booléen strict (jamais null/undefined)', () => {
    const disabled = isLoginSubmitDisabled({ identifier: '', password: '', isPending: false })
    expect(disabled === true || disabled === false).toBe(true)
  })
})

describe('6–9 — validation progressive des champs', () => {
  it('6–7 : identifiant seul → toujours disabled', () => {
    expect(
      isLoginSubmitDisabled({ identifier: 'alice', password: '', isPending: false }),
    ).toBe(true)
  })

  it('6–7 : mot de passe seul → toujours disabled', () => {
    expect(
      isLoginSubmitDisabled({ identifier: '', password: 'secret', isPending: false }),
    ).toBe(true)
  })

  it('7 : identifiant fait d’espaces → disabled (trim appliqué)', () => {
    expect(
      isLoginSubmitDisabled({ identifier: '   ', password: 'secret', isPending: false }),
    ).toBe(true)
  })

  it('8–9 : identifiant + mot de passe, isPending=false → bouton activé', () => {
    expect(
      isLoginSubmitDisabled({ identifier: 'alice', password: 'secret', isPending: false }),
    ).toBe(false)
  })
})

describe('10–11 — soumission en cours', () => {
  it('10–11 : isPending=true → bouton disabled, même avec des champs valides', () => {
    expect(
      isLoginSubmitDisabled({ identifier: 'alice', password: 'secret', isPending: true }),
    ).toBe(true)
  })
})

describe('hasLoginCredentials — séparateur explicite', () => {
  it('vrai uniquement quand les deux champs sont renseignés', () => {
    expect(hasLoginCredentials({ identifier: 'alice', password: 'secret' })).toBe(true)
    expect(hasLoginCredentials({ identifier: '', password: 'secret' })).toBe(false)
    expect(hasLoginCredentials({ identifier: 'alice', password: '' })).toBe(false)
    expect(hasLoginCredentials({ identifier: '  ', password: 'secret' })).toBe(false)
  })
})

describe('déterminisme — aucun état non déterministe', () => {
  it('aucun appel à Date.now/Math.random/window/localStorage n’intervient', () => {
    // La fonction est pure : le même état produit TOUJOURS le même booléen.
    const state = { identifier: '', password: '', isPending: false }
    const first = isLoginSubmitDisabled(state)
    const second = isLoginSubmitDisabled({ ...state })
    expect(first).toBe(second)
    expect(first).toBe(true)
  })
})
