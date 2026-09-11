/**
 * DÉCLASSEMENT SCIENTIFIQUE D'UN OBSERVATEUR — noyau PUR (aucune I/O, testable).
 *
 * ─── PRINCIPE ────────────────────────────────────────────────────────────────
 * Un ADMIN peut DÉCLASSER un observateur (« EXCLUDED ») dans les analyses d'un
 * projet : données biaisées, protocole non respecté, vidéo incorrecte, comportement
 * non conforme, erreur scientifique identifiée.
 *
 * DÉCLASSER N'EST PAS SUPPRIMER. Rien n'est effacé : le compte, les sessions, les
 * captures RAW et l'historique restent intégralement en base et consultables pour
 * l'audit. Seul le MOTEUR ANALYTIQUE courant cesse de compter ses observations.
 *
 * ─── EFFET SUR LES DÉNOMINATEURS (§13) ───────────────────────────────────────
 * L'exclusion retire l'observateur du NUMÉRATEUR (ses détections) ET du
 * DÉNOMINATEUR (le nombre analytique d'observateurs). Si 5 observateurs existent et
 * qu'un est exclu, les concordances et probabilités sont calculées sur 4 — jamais
 * sur 5 avec un numérateur amputé, ce qui sous-estimerait la performance de tous
 * les autres. C'est pourquoi le relevé est filtré EN AMONT du calcul des métriques
 * plutôt qu'ajusté après coup.
 *
 * ─── RÉVERSIBILITÉ ───────────────────────────────────────────────────────────
 * `EXCLUDED → INCLUDED` ne recrée ni ne restaure aucune donnée : les captures ont
 * toujours été là. L'observateur recompte simplement dans l'analyse courante dès
 * le calcul suivant.
 */

/** Statut analytique d'un observateur dans un projet. */
export type ObserverAnalysisStatus = 'INCLUDED' | 'EXCLUDED'

/** Ligne de déclassement telle que lue depuis la base. */
export type ObserverInclusionRecord = {
  userId: string
  status: ObserverAnalysisStatus
}

/** Participant du projet : un observateur ayant au moins une capture certifiée. */
export type ObserverParticipation = {
  userId: string
  displayName: string
}

/** Observateur écarté de l'analyse courante, avec la trace de la décision. */
export type ExcludedObserverInfo = {
  userId: string
  displayName: string
  /** Motif saisi par l'ADMIN (null si aucun motif n'a été fourni). */
  reason: string | null
  /** Date ISO du déclassement (null si la ligne existe sans horodatage). */
  excludedAt: string | null
}

/**
 * Situation analytique des observateurs d'un projet : combien participent, combien
 * sont comptés, combien sont écartés, et pourquoi. Les interfaces s'appuient dessus
 * pour afficher explicitement le dénominateur retenu (§13) au lieu de masquer
 * silencieusement un observateur.
 */
export type ObserverInclusionSummary = {
  /** Observateurs ayant au moins une capture certifiée dans le projet. */
  participating: number
  /** Observateurs effectivement comptés dans l'analyse courante. */
  included: number
  /** Observateurs écartés (parmi les participants). */
  excluded: number
  /** Détail des observateurs écartés (traçabilité affichée). */
  excludedObservers: ExcludedObserverInfo[]
}

/** Identifiants des observateurs EXCLUDED (l'absence de ligne vaut INCLUDED). */
export function excludedObserverIds(
  records: readonly ObserverInclusionRecord[],
): Set<string> {
  const excluded = new Set<string>()
  for (const record of records) {
    if (record.status === 'EXCLUDED') excluded.add(record.userId)
  }
  return excluded
}

/** Vrai si cet observateur est écarté de l'analyse courante. */
export function isObserverExcluded(
  records: readonly ObserverInclusionRecord[],
  userId: string,
): boolean {
  return records.some((record) => record.userId === userId && record.status === 'EXCLUDED')
}

/** Filtre un relevé : retire les observations des observateurs écartés. */
export function applyObserverExclusions<T extends { userId: string }>(
  rows: readonly T[],
  excludedIds: ReadonlySet<string>,
): T[] {
  if (excludedIds.size === 0) return rows.slice()
  return rows.filter((row) => !excludedIds.has(row.userId))
}

/**
 * Construit la situation analytique des observateurs.
 *
 * Seuls les observateurs PARTICIPANTS (au moins une capture certifiée) entrent dans
 * le décompte : un compte créé mais n'ayant jamais rien capturé ne doit pas
 * gonfler le dénominateur. `detail` fournit le motif et la date du déclassement.
 */
export function buildInclusionSummary(input: {
  participants: readonly ObserverParticipation[]
  records: readonly ObserverInclusionRecord[]
  detail?: readonly {
    userId: string
    reason?: string | null
    excludedAt?: string | null
  }[]
}): ObserverInclusionSummary {
  const excludedIds = excludedObserverIds(input.records)
  const detailByUser = new Map((input.detail ?? []).map((entry) => [entry.userId, entry]))
  const excludedObservers: ExcludedObserverInfo[] = []

  for (const participant of input.participants) {
    if (!excludedIds.has(participant.userId)) continue
    const detail = detailByUser.get(participant.userId)
    excludedObservers.push({
      userId: participant.userId,
      displayName: participant.displayName,
      reason: detail?.reason ?? null,
      excludedAt: detail?.excludedAt ?? null,
    })
  }

  excludedObservers.sort((a, b) => a.displayName.localeCompare(b.displayName))

  return {
    participating: input.participants.length,
    included: input.participants.length - excludedObservers.length,
    excluded: excludedObservers.length,
    excludedObservers,
  }
}
