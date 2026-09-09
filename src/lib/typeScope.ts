/**
 * Consultation par type d'observation (Partie S) — filtres PURS, pilotés par les
 * données. Le sélecteur de l'espace projet est construit à partir des types
 * CONFIGURÉS du projet (`project.observationTypes`) — jamais de liste codée en
 * dur. Ces fonctions décident, pour une portée donnée, quelles observations,
 * quelles passes vidéo et quelles fenêtres de validation afficher, de façon
 * COHÉRENTE entre la fiche (config/vidéos/points), les statistiques, l'onglet
 * Observations et l'activité des observateurs (« rien de mélangé »).
 *
 * Règle d'identité : la comparaison porte sur la valeur NORMALISÉE (espaces
 * extérieurs retirés) d'un côté comme de l'autre — jamais un préfixe.
 */

/** Valeur « Tous les types » (aucune restriction). Chaîne vide réservée. */
export const ALL_TYPES = ''

/**
 * Options du sélecteur, pilotées par les données : « Tous les types » puis les
 * types configurés non vides, sans doublon, dans l'ordre de configuration.
 */
export function consultationTypeOptions(observationTypes: readonly string[]): string[] {
  const seen = new Set<string>()
  const options: string[] = [ALL_TYPES]
  for (const raw of observationTypes ?? []) {
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    options.push(trimmed)
  }
  return options
}

/** Normalise la valeur du sélecteur : valeur vide/espaces → « tous les types ». */
export function normalizeScope(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? ''
  return trimmed || ALL_TYPES
}

/** Vrai quand la portée ne restreint rien. */
export function isAllScope(scope: string): boolean {
  return normalizeScope(scope) === ALL_TYPES
}

function labelEquals(scope: string, label: string | null | undefined): boolean {
  return (label?.trim() ?? '') === scope
}

/** Restreint un relevé d'observations au type choisi (sinon conservé tel quel). */
export function scopeObservationsByType<T extends { observationType?: string | null }>(
  rows: readonly T[],
  scope: string,
): T[] {
  const target = normalizeScope(scope)
  if (target === ALL_TYPES) return rows.slice()
  return rows.filter((row) => labelEquals(target, row.observationType))
}

/**
 * Restreint les passes vidéo au type choisi. Les passes typées portent ce type ;
 * une passe GÉNÉRIQUE (`typeLabel` absent) n'appartient à aucun type précis :
 * visible uniquement en portée « tous les types ».
 */
export function scopeVideosByType<T extends { typeLabel?: string | null }>(
  videos: readonly T[],
  scope: string,
): T[] {
  const target = normalizeScope(scope)
  if (target === ALL_TYPES) return videos.slice()
  return videos.filter((video) => labelEquals(target, video.typeLabel))
}

/**
 * Restreint les fenêtres de validation aux passes vidéo du type choisi. Une
 * fenêtre est rattachée à une passe (`videoId`) donc à son type ; la fenêtre
 * « générique héritée » (sans passe) n'apparaît qu'en portée « tous les types ».
 */
export function scopePointsOfType<T extends { videoId?: string | null }>(
  points: readonly T[],
  videos: ReadonlyArray<{ id: string; typeLabel?: string | null }>,
  scope: string,
): T[] {
  const target = normalizeScope(scope)
  if (target === ALL_TYPES) return points.slice()
  const videoIds = new Set(scopeVideosByType(videos, target).map((video) => video.id))
  return points.filter((point) => point.videoId != null && videoIds.has(point.videoId))
}

/** Nombre d'observateurs distincts d'un relevé (clé `observerId`). */
export function countDistinctObservers<T extends { observerId?: string | null }>(
  rows: readonly T[],
): number {
  const seen = new Set<string>()
  for (const row of rows) {
    const id = row.observerId
    if (id) seen.add(id)
  }
  return seen.size
}
