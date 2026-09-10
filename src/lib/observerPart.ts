/**
 * ENVOI PAR PARTIE — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * ─── RÈGLE MÉTIER FONDAMENTALE ─────────────────────────────────────────────
 * ENVOYER UNE PARTIE ≠ TERMINER LA SESSION.
 *
 *   « Envoyer cette partie » → finalise UNIQUEMENT la partie (passe vidéo) visée,
 *                              conserve la session globale ACTIVE.
 *   « Envoyer tout »          → finalise les parties restantes, termine la session,
 *                              la passe à COMPLETED et verrouille toute modification.
 *
 * Une « partie » = une passe vidéo (`videoId`) ou la passe générique héritée
 * (`videoId` null → clé réservée `''`). Chaque partie a SON propre état :
 *   NOT_STARTED  → aucune capture, jamais envoyée ;
 *   IN_PROGRESS  → au moins une capture, pas encore envoyée ;
 *   SUBMITTED    → envoyée / finalisée (verrouillée indépendamment des autres).
 *
 * Le verrouillage d'une partie envoyée ne verrouille PAS les autres parties encore
 * ouvertes : la base est la source de vérité, et le jeton reste ACTIVE tant que
 * « Envoyer tout » n'a pas clôturé la session.
 */

/** Statut d'une partie au sein d'une session d'observation. */
export type ObserverPartStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED'

/** Statuts disponibles (miroir de l'enum Prisma `ObserverPartStatus`). */
export const PART_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
} as const

/** Vrai si la partie est envoyée (définitive, verrouillée). */
export function isPartSubmitted(status: ObserverPartStatus | null | undefined): boolean {
  return status === PART_STATUS.SUBMITTED
}

/**
 * Clé canonique d'une partie : l'identifiant de la passe vidéo, ou `''` pour la
 * passe générique héritée (`videoId` null). C'est la clé d'unicité de l'état par
 * partie (cohérente avec la clé d'onglet du VideoAnnotator).
 */
export function partKeyOf(videoId: string | null | undefined): string {
  return (videoId ?? '').trim()
}

/**
 * Statut dérivé d'une partie à partir de deux faits observables :
 *  — `submitted`   : un enregistrement SUBMITTED existe (source de vérité base) ;
 *  — `hasCaptures` : au moins une capture (certifiée ou en attente) existe.
 */
export function derivePartStatus(input: {
  submitted: boolean
  hasCaptures: boolean
}): ObserverPartStatus {
  if (input.submitted) return PART_STATUS.SUBMITTED
  return input.hasCaptures ? PART_STATUS.IN_PROGRESS : PART_STATUS.NOT_STARTED
}

/** Passe vidéo telle que vue par le calcul d'état (libellé + clé). */
export type PartDescriptor = {
  /** Clé de la partie : `video.id` ou `''` pour la passe générique héritée. */
  key: string
  /** Libellé lisible (type imposé → nom → « Passe N » → repli). */
  label: string
}

/** Résumé d'une partie, prêt pour l'interface de progression. */
export type PartSummary = PartDescriptor & {
  status: ObserverPartStatus
  submitted: boolean
  captureCount: number
}

export type ComputePartSummariesInput = {
  passes: readonly PartDescriptor[]
  /** Clés des parties déjà envoyées (statut SUBMITTED en base). */
  submittedKeys: ReadonlySet<string> | readonly string[]
  /** Nombre de captures (certifiées ou en attente) par clé de partie. */
  capturesByKey: Readonly<Record<string, number>>
}

/**
 * Calcule l'état de chaque partie d'une session. Ordre stable (celui des passes).
 * Une partie absente de `submittedKeys` et sans capture est NOT_STARTED ; avec des
 * captures elle est IN_PROGRESS ; présente dans `submittedKeys` elle est SUBMITTED.
 */
export function computePartSummaries(input: ComputePartSummariesInput): PartSummary[] {
  const submitted = new Set(input.submittedKeys)
  return input.passes.map((pass) => {
    const captureCount = input.capturesByKey[pass.key] ?? 0
    const status = derivePartStatus({
      submitted: submitted.has(pass.key),
      hasCaptures: captureCount > 0,
    })
    return { ...pass, status, submitted: submitted.has(pass.key), captureCount }
  })
}

/** Nombre de parties encore non envoyées (IN_PROGRESS ou NOT_STARTED). */
export function countOpenParts(parts: readonly PartSummary[]): number {
  let count = 0
  for (const part of parts) if (!part.submitted) count += 1
  return count
}

/** Vrai si TOUTES les parties sont envoyées (pré-requis de « Envoyer tout »). */
export function allPartsSubmitted(parts: readonly PartSummary[]): boolean {
  return parts.length > 0 && countOpenParts(parts) === 0
}

/**
 * Libellés des parties encore ouvertes — pour le message « Il reste N parties à
 * terminer avant de pouvoir envoyer l'ensemble. »
 */
export function openPartLabels(parts: readonly PartSummary[]): string[] {
  return parts.filter((part) => !part.submitted).map((part) => part.label)
}

/** Clé réservée de la passe générique héritée (vidéo unique sans `Video`). */
export const GENERIC_PART_KEY = ''

/**
 * Types d'observation « couvrables » du projet — miroir serveur de la règle
 * utilisée par l'annotateur (`requiredCoverableTypes`). Un type requis n'est
 * exigé que si une passe peut réellement le produire :
 *  — une passe générique permet de produire TOUS les types requis ;
 *  — sans passe générique, seuls les types liés à une passe typée sont exigibles.
 * Sans type configuré, aucun type n'est requis.
 */
export function computeRequiredTypes(input: {
  passes: readonly { typeLabel: string | null }[]
  observationTypes: readonly string[]
}): string[] {
  const required: string[] = []
  const seen = new Set<string>()
  const normalize = (value: string): string =>
    value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  for (const raw of input.observationTypes ?? []) {
    const trimmed = raw.trim()
    if (!trimmed || seen.has(normalize(trimmed))) continue
    seen.add(normalize(trimmed))
    required.push(trimmed)
  }
  if (required.length === 0) return []

  let hasGenericPass = false
  const locked = new Set<string>()
  for (const pass of input.passes ?? []) {
    const typeLabel = pass.typeLabel?.trim() ?? ''
    if (typeLabel) locked.add(normalize(typeLabel))
    else hasGenericPass = true
  }
  if (hasGenericPass) return required
  return required.filter((type) => locked.has(normalize(type)))
}
