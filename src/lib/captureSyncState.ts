/**
 * État de synchronisation d'une capture locale — pur, sans accès navigateur.
 *
 * Une capture confirmée est enregistrée IMMÉDIATEMENT côté serveur
 * (`saveObservationCapture`) ; cet état pilote son étiquette dans l'interface :
 *
 *   pending  → capture confirmée, en attente dans la file locale ;
 *   syncing  → un appel serveur est en cours (petit loader) ;
 *   synced   → le serveur a confirmé (ligne `isVerified=false`, invisible) ;
 *   failed   → échec de transport/validation — re-tenté au retour en ligne et à la
 *              soumission finale, jamais en boucle automatique.
 *
 * Une capture supprimée localement peut garder une entrée `pendingServerDelete` :
 * une ligne serveur existe peut-être encore (envoi ambigu, suppression impossible
 * hors ligne) et DOIT être supprimée avant la finalisation, sans quoi la session
 * finaliserait une capture que l'observateur a retirée.
 *
 * Toutes les fonctions sont pures (aucun `window`/`document`) pour rester
 * testables unitairement, comme les autres modules de `src/lib`.
 */

export type CaptureSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

/** Métadonnées d'un échec d'enregistrement (affichées à l'observateur). */
export type CaptureSyncFailure = {
  /**
   * Vrai = échec re-tentable (réseau / transitoire) : nouvel essai au retour en
   * ligne. Faux = échec définitif (stockage non configuré, permission, dossier
   * inaccessible) : PAS de re-tentative automatique, la capture reste locale.
   */
  retryable: boolean
  /** Message final localisé à afficher — jamais un détail interne ou un secret. */
  message: string
}

export type CaptureSyncState = {
  status: CaptureSyncStatus
  /** Vrai quand la capture locale a été retirée mais qu'une suppression serveur reste à confirmer. */
  pendingServerDelete?: boolean
  /** URL distante de l'image quand le serveur l'a renvoyée (absente aujourd'hui). */
  imageUrl?: string | null
  /** Détail de l'échec, présent uniquement quand `status === 'failed'`. */
  failure?: CaptureSyncFailure
}

export type CaptureSyncMap = Record<string, CaptureSyncState>

export const SYNC_STATUSES: readonly CaptureSyncStatus[] = [
  'pending',
  'syncing',
  'synced',
  'failed',
]

/** Vrai quand une valeur inconnue est un statut de synchronisation valide. */
export function isSyncStatus(value: unknown): value is CaptureSyncStatus {
  return typeof value === 'string' && (SYNC_STATUSES as readonly string[]).includes(value)
}

/** Ajoute une capture fraîchement confirmée, en attente d'envoi. */
export function addPendingSync(map: CaptureSyncMap, id: string): CaptureSyncMap {
  return { ...map, [id]: { status: 'pending' } }
}

/** Marque une capture comme en cours d'envoi. */
export function markSyncing(map: CaptureSyncMap, id: string): CaptureSyncMap {
  const current = map[id]
  if (!current) return map
  return { ...map, [id]: { ...current, status: 'syncing' } }
}

/** Marque une capture comme confirmée par le serveur. */
export function markSynced(map: CaptureSyncMap, id: string): CaptureSyncMap {
  const current = map[id]
  if (!current) return map
  return { ...map, [id]: { ...current, status: 'synced' } }
}

/** Marque une capture comme en échec (transport, validation ou stockage). */
export function markFailed(
  map: CaptureSyncMap,
  id: string,
  failure?: CaptureSyncFailure,
): CaptureSyncMap {
  const current = map[id]
  if (!current) return map
  if (!failure) return { ...map, [id]: { ...current, status: 'failed' } }
  return { ...map, [id]: { ...current, status: 'failed', failure } }
}

/** Repasse une capture en attente (nouvel essai manuel après correction de l'erreur). */
export function markPending(map: CaptureSyncMap, id: string): CaptureSyncMap {
  const current = map[id]
  if (!current) return map
  return { ...map, [id]: { ...current, status: 'pending' } }
}

/**
 * Retire une capture de l'état de synchronisation. Appelé quand la capture n'a
 * jamais été envoyée (aucune ligne serveur) ou une fois la suppression confirmée.
 */
export function removeSyncEntry(map: CaptureSyncMap, id: string): CaptureSyncMap {
  if (!(id in map)) return map
  const next = { ...map }
  delete next[id]
  return next
}

/**
 * Demande une suppression serveur différée : la capture locale est déjà retirée,
 * mais une ligne serveur existe peut-être. Statut conservé pour les entrées en
 * cours (`syncing`) ; les entrées retirées passent simplement le témoin.
 */
export function requestServerDelete(map: CaptureSyncMap, id: string): CaptureSyncMap {
  const current = map[id]
  if (!current) return map
  return { ...map, [id]: { ...current, pendingServerDelete: true } }
}

/** Comptage des captures présentes localement par statut. */
export type CaptureSyncCounts = {
  total: number
  pending: number
  syncing: number
  synced: number
  failed: number
}

/** Compte les captures (dans `observations`) selon leur état de synchronisation. */
export function countSyncStates(
  map: CaptureSyncMap,
  observations: readonly { id: string }[],
): CaptureSyncCounts {
  const counts: CaptureSyncCounts = { total: observations.length, pending: 0, syncing: 0, synced: 0, failed: 0 }
  for (const observation of observations) {
    const state = map[observation.id]
    if (!state) continue
    if (state.status === 'pending') counts.pending += 1
    else if (state.status === 'syncing') counts.syncing += 1
    else if (state.status === 'synced') counts.synced += 1
    else if (state.status === 'failed') counts.failed += 1
  }
  return counts
}

/**
 * Prochaine capture à envoyer. `observations` est ordonné de la plus récente à la
 * plus ancienne ; on traite donc de la plus ancienne à la plus récente (fin → début)
 * pour conserver l'ordre de capture.
 *
 * — sans `retryFailed`, seules les `pending` partent (file automatique) ;
 * — avec `retryFailed`, les `failed` RE-TENTABLES partent aussi (retour en ligne,
 *   soumission finale) — jamais les échecs définitifs (stockage config/permission)
 *   sauf si `includePermanent` est explicite (nouvel essai manuel).
 */
export function selectNextToSync(
  map: CaptureSyncMap,
  observations: readonly { id: string }[],
  retryFailed: boolean,
  includePermanent = false,
): string | null {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const id = observations[index].id
    const state = map[id]
    if (!state) continue
    if (state.status === 'pending') return id
    if (retryFailed && state.status === 'failed' && !state.pendingServerDelete) {
      const isPermanent = state.failure ? state.failure.retryable === false : false
      if (includePermanent || !isPermanent) return id
    }
  }
  return null
}

/**
 * Vrai si au moins une capture est en échec RE-TENTABLE (réseau / transitoire).
 * Les échecs définitifs (stockage) n'y figurent pas : ils ne déclenchent pas de
 * re-tentative automatique au retour en ligne.
 */
export function hasRetryableFailure(
  map: CaptureSyncMap,
  observations: readonly { id: string }[],
): boolean {
  return observations.some((observation) => {
    const state = map[observation.id]
    if (!state || state.status !== 'failed') return false
    return state.failure ? state.failure.retryable : true
  })
}

/**
 * Identifiants des suppressions serveur encore en attente : entrées portant
 * `pendingServerDelete` dont la capture n'est plus dans les observations locales.
 */
export function pendingServerDeleteIds(
  map: CaptureSyncMap,
  observations: readonly { id: string }[],
): string[] {
  const present = new Set(observations.map((observation) => observation.id))
  return Object.keys(map).filter((id) => map[id]?.pendingServerDelete === true && !present.has(id))
}

/** Vrai quand une suppression serveur est en attente pour cet identifiant. */
export function hasPendingServerDelete(map: CaptureSyncMap, id: string): boolean {
  return map[id]?.pendingServerDelete === true
}

/**
 * Normalise un brouillon relu depuis le stockage : une capture « syncing » au
 * chargement est un envoi interrompu par la fermeture de l'onglet — le serveur a
 * pu aboutir ou non, on repasse donc en `pending` (l'envoi est idempotent). Les
 * entrées orphelines (sans capture locale) sont conservées uniquement si une
 * suppression serveur est en attente.
 */
export function normalizeResumedSync(
  raw: Record<string, CaptureSyncState> | undefined,
  observations: readonly { id: string }[],
): CaptureSyncMap {
  const result: CaptureSyncMap = {}
  const present = new Set(observations.map((observation) => observation.id))
  for (const observation of observations) {
    const previous = raw?.[observation.id]
    const status = previous?.status === 'syncing' ? 'pending' : previous?.status
    result[observation.id] = {
      status: status ?? 'pending',
      pendingServerDelete: previous?.pendingServerDelete === true,
      imageUrl: previous?.imageUrl,
      // Un échec définitif reste définitif après rechargement (aucune re-tentative auto).
      failure: previous?.failure,
    }
  }
  for (const [id, state] of Object.entries(raw ?? {})) {
    if (state?.pendingServerDelete === true && !present.has(id)) {
      result[id] = {
        status: 'pending',
        pendingServerDelete: true,
        imageUrl: state.imageUrl,
        failure: state.failure,
      }
    }
  }
  return result
}
