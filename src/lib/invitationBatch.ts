/**
 * INVITATIONS OBSERVATEURS MULTIPLES — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * RÈGLE : UN EMAIL = UN TOKEN = UNE SESSION. Chaque destinataire reçoit SON propre
 * accès, SON propre jeton et SA propre session — jamais de jeton partagé entre deux
 * emails. Ce module normalise la LISTE d'emails, déduplique et produit un résultat
 * par adresse (créé / doublon / invalide) sans jamais générer ni stocker de jeton.
 */

/** Email normalisé (minuscule, espaces retirés). */
export function normalizeEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase()
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Vrai si l'email est syntaxiquement valide. */
export function isValidEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(raw))
}

export type InvitationEmailInput = {
  /** Valeur brute saisie par l'administrateur. */
  raw: string
}

export type InvitationEmailOutcome =
  /** Accès à créer (aucun accès actif existant pour cette adresse). */
  | { kind: 'create'; email: string }
  /** Un accès actif existe déjà pour cette adresse → à réutiliser/régénérer. */
  | { kind: 'duplicate'; email: string }
  /** Adresse syntaxiquement invalide → signalée, les autres sont traitées. */
  | { kind: 'invalid'; raw: string }

export type InvitationBatchInput = {
  emails: readonly string[]
  /**
   * Emails (normalisés) ayant DÉJÀ un accès actif sur le projet — fournis par le
   * serveur pour la déduplication (Partie O). Absent = pas de déduplication.
   */
  existingActiveEmails?: readonly string[]
}

export type InvitationBatchResult = {
  /** Emails à créer (dédupliqués, normalisés). */
  toCreate: string[]
  /** Emails en doublon (accès actif existant). */
  duplicates: string[]
  /** Valeurs brutes invalides (signalées, pas de création). */
  invalid: string[]
  /** Résultat détaillé par entrée saisie, dans l'ordre d'entrée. */
  outcomes: InvitationEmailOutcome[]
}

/**
 * Traite une liste d'emails : déduplique (même email saisi plusieurs fois = un
 * seul accès), signale les doublons d'accès actif et les adresses invalides, sans
 * jamais annuler silencieusement les autres. Chaque adresse valide distincte donne
 * lieu à UN accès indépendant.
 */
export function processInvitationEmails(input: InvitationBatchInput): InvitationBatchResult {
  const existing = new Set((input.existingActiveEmails ?? []).map(normalizeEmail))

  const toCreate: string[] = []
  const duplicates: string[] = []
  const invalid: string[] = []
  const outcomes: InvitationEmailOutcome[] = []
  const seen = new Set<string>()

  for (const raw of input.emails ?? []) {
    const email = normalizeEmail(raw)
    if (!isValidEmail(email)) {
      invalid.push(raw.trim())
      outcomes.push({ kind: 'invalid', raw: raw.trim() })
      continue
    }
    if (existing.has(email)) {
      duplicates.push(email)
      outcomes.push({ kind: 'duplicate', email })
      continue
    }
    if (seen.has(email)) {
      // Même email saisi deux fois dans le lot : un seul accès.
      continue
    }
    seen.add(email)
    toCreate.push(email)
    outcomes.push({ kind: 'create', email })
  }

  return { toCreate, duplicates, invalid, outcomes }
}

/** Vrai si une adresse valide existe dans la liste (au moins un accès à créer). */
export function hasCreatableEmail(result: InvitationBatchResult): boolean {
  return result.toCreate.length > 0
}
