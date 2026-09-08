import type { CaptureRecord } from '@/lib/types'

/**
 * Brouillons de session d'observation — persistance locale non soumise.
 *
 * Une session inachevée (captures annotées non envoyées) est sauvegardée
 * automatiquement dans IndexedDB, puis proposée à la reprise à la prochaine visite.
 *
 * GARANTIES (procédure d'observation indépendante) :
 *  — Jamais de mot de passe, jeton de session, clé API ni fenêtre de validation
 *    (`ProjectPoint`) dans le brouillon : uniquement des captures locales.
 *  — Clé de cache = (identité observateur, projet) : chaque utilisateur/observateur
 *    ne retrouve que SA session, jamais celle d'un autre.
 *  — Purge après soumission confirmée ou suppression explicite (« ignorer »).
 *
 * Les fonctions pures (`parseStoredDraft`, `filterObservationsToPasses`,
 * `draftCacheKey`) sont testables sans navigateur ; l'accès IndexedDB est cloisonné
 * derrière `saveStoredDraft` / `loadStoredDraft` / `clearStoredDraft`.
 */

export const ANONYMOUS_ID_KEY = 'va_observer_anonymous_id'

const DRAFT_DB_NAME = 'va-drafts'
const DRAFT_DB_VERSION = 1
const DRAFT_STORE_NAME = 'sessions'

export type StoredObservationDraft = {
  version: 1
  projectId: string
  /** Identité du brouillon (email connecté, sinon ID anonyme du navigateur). */
  owner: string
  /** Date ISO de la dernière sauvegarde automatique. */
  savedAt: string
  /** Onglet vidéo actif au moment de la sauvegarde ('' = passe générique). */
  activeTab: string
  observations: CaptureRecord[]
}

/**
 * Clé de cache d'un brouillon : une seule session en cours par (utilisateur, projet).
 * L'identité est normalisée en minuscules — un même compte reste retrouvé quoi qu'il arrive.
 */
export function draftCacheKey(owner: string, projectId: string): string {
  const normalizedOwner = (owner ?? '').trim().toLowerCase() || 'anonymous'
  const normalizedProject = (projectId ?? '').trim()
  return `${normalizedOwner}::${normalizedProject}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Vrai quand l'objet ressemble à une capture persistable (validation de forme, pas de `any`). */
function isCaptureShape(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id.trim() === '') return false
  if (typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) return false
  if (typeof value.imageDataUrl !== 'string' || !value.imageDataUrl.startsWith('data:image/')) {
    return false
  }
  if (typeof value.circleCount !== 'number' || !Number.isFinite(value.circleCount)) return false
  if (value.observationType !== undefined && value.observationType !== null && typeof value.observationType !== 'string') {
    return false
  }
  if (value.videoId !== undefined && value.videoId !== null && typeof value.videoId !== 'string') {
    return false
  }
  if (value.centroid !== undefined && value.centroid !== null) {
    if (!isRecord(value.centroid)) return false
    if (typeof value.centroid.x !== 'number' || typeof value.centroid.y !== 'number') return false
  }
  return true
}

/**
 * Valide et normalise un brouillon brut (par ex. relu depuis IndexedDB). Renvoie
 * `null` si la structure est invalide ; les captures malformées sont écartées.
 */
export function parseStoredDraft(raw: unknown): StoredObservationDraft | null {
  if (!isRecord(raw)) return null
  if (raw.version !== 1) return null
  if (typeof raw.projectId !== 'string' || raw.projectId.trim() === '') return null
  if (typeof raw.owner !== 'string') return null
  if (typeof raw.activeTab !== 'string') return null
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : ''
  if (!Array.isArray(raw.observations)) return null

  const observations: CaptureRecord[] = []
  for (const item of raw.observations) {
    if (!isCaptureShape(item)) continue
    const capture = item as CaptureRecord
    observations.push({
      id: capture.id,
      timestamp: capture.timestamp,
      imageDataUrl: capture.imageDataUrl,
      circleCount: capture.circleCount,
      observationType: capture.observationType ?? null,
      videoId: capture.videoId ?? null,
      centroid: capture.centroid,
    })
  }

  return {
    version: 1,
    projectId: raw.projectId,
    owner: raw.owner,
    savedAt,
    activeTab: raw.activeTab,
    observations,
  }
}

/**
 * Restreint un ensemble de captures aux passes vidéo encore disponibles (`passKeys`,
 * avec `''` pour la passe générique). Un projet peut avoir évolué entre deux visites :
 * on ne restaure jamais une capture d'une vidéo supprimée (la soumission échouerait).
 */
export function filterObservationsToPasses(
  observations: CaptureRecord[],
  passKeys: string[],
): CaptureRecord[] {
  const available = new Set(passKeys)
  return observations.filter((capture) => available.has(capture.videoId ?? ''))
}

function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Jeton aléatoire stable émis par le client (ID anonyme, jeton de session…). */
export function newSessionToken(): string {
  return randomToken()
}

/** Identifiant anonyme de l'observateur pour ce navigateur (créé si absent). */
export function getAnonymousObserverId(): string {
  if (typeof window === 'undefined') return ''
  const existing = window.localStorage.getItem(ANONYMOUS_ID_KEY)
  if (existing && existing.trim()) return existing.trim()
  const fresh = randomToken()
  window.localStorage.setItem(ANONYMOUS_ID_KEY, fresh)
  return fresh
}

/** Régénère l'identifiant anonyme du navigateur et le renvoie. */
export function rotateAnonymousObserverId(): string {
  const fresh = randomToken()
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ANONYMOUS_ID_KEY, fresh)
  }
  return fresh
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        db.createObjectStore(DRAFT_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
  })
}

function writeInStore(operation: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const dbPromise = openDraftDatabase()
    void dbPromise
      .then((db) => {
        const tx = db.transaction(DRAFT_STORE_NAME, 'readwrite')
        operation(tx.objectStore(DRAFT_STORE_NAME))
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('IndexedDB write failed'))
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error ?? new Error('IndexedDB write aborted'))
        }
      })
      .catch(reject)
  })
}

/** Sauvegarde (ou remplace) le brouillon de la session (utilisateur, projet). */
export async function saveStoredDraft(draft: StoredObservationDraft): Promise<void> {
  if (!canUseIndexedDb()) return
  await writeInStore((store) => {
    store.put(draft, draftCacheKey(draft.owner, draft.projectId))
  })
}

/** Charge le brouillon de la session (utilisateur, projet) — `null` si absent. */
export async function loadStoredDraft(
  owner: string,
  projectId: string,
): Promise<StoredObservationDraft | null> {
  if (!canUseIndexedDb()) return null
  const db = await openDraftDatabase()
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(DRAFT_STORE_NAME, 'readonly').objectStore(DRAFT_STORE_NAME).get(draftCacheKey(owner, projectId))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
    })
    return parseStoredDraft(raw)
  } finally {
    db.close()
  }
}

/** Supprime définitivement le brouillon (après soumission confirmée ou abandon explicite). */
export async function clearStoredDraft(owner: string, projectId: string): Promise<void> {
  if (!canUseIndexedDb()) return
  await writeInStore((store) => {
    store.delete(draftCacheKey(owner, projectId))
  })
}
