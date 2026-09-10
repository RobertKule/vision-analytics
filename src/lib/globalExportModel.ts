/**
 * Modèle analytique des exports (Excel global, Excel observateur, PDF) —
 * fonctions PURES de préparation des données (aucun exceljs, aucune I/O) :
 * exécutées côté serveur (routes API, Server Actions) et testables unitairement.
 *
 * ─── RÈGLE PRODUIT « DÉTECTION ANALYTIQUE » (appliquée partout) ─────────────
 * Une détection analytique = UNE par `(observateur, type d'observation, trame)`.
 * Plusieurs captures certifiées du même observateur dans la même fenêtre
 * temporelle (`pointId`) ET sous le même `observationType` comptent pour UNE
 * détection, pas N. La clé canonique de déduplication est donc
 *   `userId | observationType || '' | pointId`
 * (observateur + type + fenêtre). Le relevé BRUT conserve, lui, TOUTES les
 * captures certifiées — aucune perte de données brutes.
 *
 *   - Détection analytique (`countAnalyticDetections`) = triplets distincts
 *     `(observateur, type, trame)` parmi les captures certifiées NON fantômes.
 *   - Fausse alerte (fantôme) = une capture `isGhostPoint = true`. Chaque fausse
 *     alerte est un événement propre (aucune fenêtre à dédupliquer).
 *   - Fenêtres touchées (`countWindowsHit`) = `pointId` distincts détectés par
 *     au moins un observateur (union ; ne déduplique PAS par observateur ni type).
 *   - Accord inter-observateurs = sémantique d'union par fenêtre (sans type).
 *   - Précision = détections analytiques / (détections analytiques + fausses alertes).
 *
 * PROBABILITÉ DE DÉTECTION (synthèse du classeur global & du PDF) :
 *   P(type) = DétectionsAnalytiques(type) / (points/trames configurés(type) × observateurs)
 * (formule `detectionProbability`) ; interprétation en bandes textuelles FR.
 *
 * Le détail des points configurés est porté par `GlobalExportProject.points`
 * (`type` = typeLabel de la passe vidéo, clé générique réservée si passe non
 * typée) et `GlobalExportProject.definedPointsByType` agrège ces effectifs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OBSERVER_TYPE_POINT_SEP = '|' // séparateur de clé (jamais présent dans les ids)

/**
 * Clé réservée des passes vidéo non typées dans `definedPointsByType` et pour
 * les lignes sans `observationType` (type normalisé = chaîne vide).
 */
export const GENERIC_TYPE_KEY = ''

/** Libellé d'affichage du groupe « passe générique / sans type ». */
export const GENERIC_TYPE_LABEL = 'Sans type (passe générique)'

/** Type normalisé d'une ligne : `observationType` nettoyé, sinon clé générique. */
function normalizedType(observationType: string | null): string {
  const trimmed = observationType?.trim()
  return trimmed || GENERIC_TYPE_KEY
}

/** Libellé lisible d'un groupe de type (décalage) depuis sa clé normalisée. */
export function typeGroupLabel(typeKey: string): string {
  return typeKey === GENERIC_TYPE_KEY ? GENERIC_TYPE_LABEL : typeKey
}

/** Champs de projet nécessaires à l'export (tous réellement persistés). */
export type GlobalExportProject = {
  id: string
  title: string
  description: string | null
  videoUrl: string | null
  observationTypes: string[]
  createdAt: string
  /** Nombre de fenêtres de validation (points) définies sur le périmètre exporté. */
  definedPoints: number
  /**
   * Points configurés du périmètre exporté (voir `GlobalExportPoint`). Chaque
   * point est rattaché au type/décalage de SA passe vidéo (`type` = typeLabel,
   * clé générique réservée si la passe n'est pas typée).
   */
  points: GlobalExportPoint[]
  /** Effectifs de points configurés par type/décalage (`type` normalisé). */
  definedPointsByType: Record<string, number>
}

/** Point configuré tel que transporté par le modèle d'export. */
export type GlobalExportPoint = {
  id: string
  /** Libellé humain de la fenêtre (ex. « Point 2 »). */
  label: string
  trameDebut: number
  trameFin: number
  /** Nom lisible de la passe vidéo qui porte la fenêtre (null si introuvable). */
  videoName: string | null
  /** Type/décalage de la passe : typeLabel nettoyé, ou `GENERIC_TYPE_KEY`. */
  type: string
}

/** Ligne d'observation brute (champs réellement persistés uniquement). */
export type GlobalExportRow = {
  /**
   * Identifiant de la ligne d'observation. Optionnel (les tests et certains appelants
   * historiques n'en ont pas besoin) ; renseigné par la source analytique serveur, il
   * permet l'affichage sécurisé de l'image via `/api/captures/<id>/image`.
   */
  id?: string
  userId: string
  username: string | null
  email: string | null
  anonymousId: string
  timestampTotal: number
  observationType: string | null
  isGhostPoint: boolean
  pointId: string | null
  pointLabel: string | null
  imageUrl: string
  /** Identifiant Google Drive de la capture (server-internal, non secret). */
  driveFileId?: string | null
  /** Nom lisible de la passe vidéo d'origine (null si générique/introuvable). */
  videoName?: string | null
  /**
   * Identifiant de la passe vidéo d'origine (null = passe générique héritée).
   * Requis pour le RECALCUL ANALYTIQUE DYNAMIQUE : une capture est réévaluée contre
   * les fenêtres de SA passe vidéo, jamais contre celles d'une autre passe.
   */
  videoId?: string | null
  createdAt: string
}

export type GlobalExportSource = {
  project: GlobalExportProject
  rows: GlobalExportRow[]
}

export type InterObserverAgreement = {
  /** Taux d'accord moyen 0..1 ; null si non calculable (p. ex. < 2 observateurs). */
  rate: number | null
  /** Nombre de paires d'observateurs comparées. */
  pairs: number
  /** Vrai quand le calcul a du sens (fenêtres définies + ≥ 2 observateurs actifs). */
  comparable: boolean
  /** Description de la méthode employée. */
  method: string
}

/** Synthèse du projet (bloc supérieur de la feuille « Synthèse »). */
export type ProjectSummary = {
  project: GlobalExportProject
  /**
   * Total des « déclarations » = détections analytiques (`validatedCount`) +
   * fausses alertes (`ghostCount`). Nombre mixte (détections + événements
   * fantômes), volontaire : c'est le dénominateur commun de la précision.
   * Ne correspond PAS au nombre de captures brutes (voir `buildGlobalObservations`).
   */
  totalObservations: number
  /** Détections analytiques : triplets distincts (observateur, type, trame) non fantômes. */
  validatedCount: number
  /** Fausses alertes : chaque capture hors trame (`isGhostPoint`) compte pour 1 événement. */
  ghostCount: number
  /** Captures brutes sans type d'observation (attribut transversal, non dédupliqué). */
  untypedCount: number
  /** Observateurs distincts ayant soumis au moins une capture. */
  observerCount: number
  /** Fenêtres (points) distinctes touchées par au moins un observateur (union). */
  windowsHit: number
  firstSubmittedAt: string | null
  lastSubmittedAt: string | null
  /** Répartition par type d'observation configuré (volume de captures brutes). */
  perType: Array<{ type: string; count: number }>
  agreement: InterObserverAgreement
}

/** Entrée de la matrice observateurs × types (conservée pour compatibilité). */
export type ObserverMatrixEntry = {
  observerId: string
  displayName: string
  username: string | null
  email: string | null
  anonymousId: string
  /** Nombre de captures brutes par type d'observation (clé = libellé exact). */
  perType: Record<string, number>
  /** « Déclarations » de l'observateur = détections analytiques + fausses alertes. */
  total: number
  /** « Point trouvé ? » = détections analytiques (triplets distincts non fantômes). */
  pointFound: number
  /** Fausses alertes : captures hors trame (événements, non dédupliquées). */
  ghosts: number
  /** Fenêtres (points) distinctes touchées par cet observateur. */
  windowsHit: number
  /**
   * Précision individuelle 0..1 = détections analytiques / déclarations ;
   * null si aucune déclaration.
   */
  precision: number | null
}

export type ObserverMatrix = {
  /** Colonnes « type » (configurés puis types observés inconnus), ordre stable. */
  types: string[]
  observers: ObserverMatrixEntry[]
}

/**
 * Statistiques agrégées par type d'observation. Chaque type porte ses compteurs
 * TOTAUX (tous observateurs), calculés sur le sous-ensemble filtré transmis.
 * Les compteurs « détections » suivent la règle de la détection analytique
 * (dédupliqués par (observateur, type, fenêtre)).
 */
export type TypeStatistic = {
  type: string
  /** Déclarations de ce type = détections analytiques + fausses alertes. */
  total: number
  /** Détections analytiques de ce type : triplets distincts (observateur, type, fenêtre). */
  validated: number
  /** Fausses alertes de ce type (événements, non dédupliquées). */
  ghosts: number
  /** Observateurs distincts ayant produit au moins une capture de ce type. */
  observers: number
  /** Fenêtres (points) distinctes touchées par ce type (union). */
  windowsHit: number
  /** Précision 0..1 = détections analytiques / déclarations ; null si aucune. */
  precision: number | null
}

/** Clé analytique `(observateur, type, trame)` — null si hors périmètre. */
function analyticKeyOf(row: GlobalExportRow): string | null {
  if (row.isGhostPoint) return null
  if (!row.pointId) return null
  const type = normalizedType(row.observationType)
  return `${row.userId}${OBSERVER_TYPE_POINT_SEP}${type}${OBSERVER_TYPE_POINT_SEP}${row.pointId}`
}

/** Clés analytiques des captures certifiées non fantômes d'un sous-ensemble. */
function analyticKeys(rows: readonly GlobalExportRow[]): Set<string> {
  const keys = new Set<string>()
  for (const row of rows) {
    const key = analyticKeyOf(row)
    if (key !== null) keys.add(key)
  }
  return keys
}

/** Clés (union de fenêtres) — sémantique fenêtre, sans type ni observateur. */
function windowsHitKeys(rows: readonly GlobalExportRow[]): Set<string> {
  const windows = new Set<string>()
  for (const row of rows) {
    if (row.isGhostPoint) continue
    if (row.pointId) windows.add(row.pointId)
  }
  return windows
}

/**
 * Agrège les statistiques PAR TYPE sur le sous-ensemble de lignes transmis.
 * Colonnes et ordre stables : types configurés d'abord (même sans capture),
 * puis types observés non configurés (tri alphabétique).
 */
export function buildTypeStatistics(source: GlobalExportSource): TypeStatistic[] {
  const { project, rows } = source
  const configured = cleanConfiguredTypes(project.observationTypes)

  type Acc = {
    ghosts: number
    observers: Set<string>
    windows: Set<string>
    validKeys: Set<string>
  }
  const stats = new Map<string, Acc>()
  const ensure = (type: string): Acc => {
    let acc = stats.get(type)
    if (!acc) {
      acc = { ghosts: 0, observers: new Set(), windows: new Set(), validKeys: new Set() }
      stats.set(type, acc)
    }
    return acc
  }
  for (const type of configured) ensure(type)

  const observedUnknown = new Set<string>()
  for (const row of rows) {
    const type = normalizedType(row.observationType)
    if (!type) continue
    if (!configured.includes(type)) observedUnknown.add(type)
    const acc = ensure(type)
    acc.observers.add(row.userId)
    if (row.isGhostPoint) {
      acc.ghosts += 1
      continue
    }
    if (row.pointId) {
      acc.validKeys.add(analyticKeyOf(row) as string)
      acc.windows.add(row.pointId)
    }
  }

  const types = [
    ...configured,
    ...Array.from(observedUnknown).sort((a, b) => a.localeCompare(b)),
  ]

  return types.map((type) => {
    const acc = stats.get(type)
    if (!acc) {
      return { type, total: 0, validated: 0, ghosts: 0, observers: 0, windowsHit: 0, precision: null }
    }
    const validated = acc.validKeys.size
    const ghosts = acc.ghosts
    const total = validated + ghosts
    return {
      type,
      total,
      validated,
      ghosts,
      observers: acc.observers.size,
      windowsHit: acc.windows.size,
      precision: total > 0 ? validated / total : null,
    }
  })
}

/**
 * Lien d'ouverture directe d'une capture (Parties R & V) — SOURCE UNIQUE.
 *
 * PostgreSQL reste la source de vérité ; l'image annotée est stockée dans Google
 * Drive, dont `driveFileId` est l'ancre fiable. Une seule règle, appliquée par
 * TOUS les exports qui réutilisent ce module : `driveFileId` présent → lien
 * « view » Google Drive ; absent → chaîne vide (on n'invente JAMAIS de lien).
 */
export function driveImageLink(driveFileId: unknown): string {
  const id = typeof driveFileId === 'string' ? driveFileId.trim() : ''
  if (!id) return ''
  return `https://drive.google.com/file/d/${id}/view`
}

/** Ligne de relevé global (feuille « Données_Brutes_Globales »). */
export type LedgerObservation = {
  timecode: string
  observationType: string | null
  pointFound: 'Oui' | 'Non'
  pointLabel: string | null
  /** Passe vidéo d'origine (libellé lisible), vide si non renseignée. */
  videoName: string
  observerName: string
  email: string | null
  anonymousId: string
  status: string
  imageUrl: string
  /** Identifiant Google Drive de la capture (server-internal, non secret). */
  driveFileId: string
  /**
   * Lien « Lien image » de la capture, dérivé du `driveFileId` (`driveImageLink`) ;
   * vide si aucune image / aucun `driveFileId` (jamais de lien inventé).
   */
  imageLink: string
  capturedAt: string
}

export const LEDGER_HEADERS = [
  'Minuterie (MM:SS)',
  "Type d'observation",
  'Point trouvé ?',
  'Fenêtre cible',
  'Trame vidéo',
  'Observateur',
  'Email',
  'Identifiant anonyme',
  'Coordonnées (X, Y)',
  'Statut',
  'Image (URL)',
  'Drive File ID',
  'Lien image',
  'Date de Capture',
] as const

/** Nettoie un libellé d'observateur (username → email → identifiant anonyme). */
export function observerDisplayLabel(user: {
  username: string | null
  email: string | null
  anonymousId: string
}): string {
  return user.username?.trim() || user.email?.trim() || user.anonymousId || '—'
}

/** Libellé mm:ss (minutes non bornées — > 59 min conservées). */
export function clockLabel(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Liste propre des types d'observation configurés (non vides, sans doublon). */
export function cleanConfiguredTypes(observationTypes: readonly string[]): string[] {
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const raw of observationTypes ?? []) {
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    cleaned.push(trimmed)
  }
  return cleaned
}

// ——— Règle produit « détection analytique » : primitives pures ———
// Une détection = (observateur, type, fenêtre). Pour UN observateur, plusieurs
// captures dans la même fenêtre et sous le même type comptent pour UNE détection.
// Ces fonctions sont le SEUL endroit qui déduplique : le tableau de bord, l'Excel
// global, l'Excel observateur et le PDF utilisent exactement les mêmes compteurs.

/** Nombre d'événements fantômes (fausses alertes) : chaque capture hors trame compte. */
export function countGhostEvents(rows: readonly GlobalExportRow[]): number {
  let count = 0
  for (const row of rows) if (row.isGhostPoint) count += 1
  return count
}

/**
 * Nombre de DÉTECTIONS ANALYTIQUES dans le sous-ensemble transmis : triplets
 * distincts `(observateur, observationType, pointId)` parmi les captures non
 * fantômes. Si les lignes concernent un observateur unique, c'est le nombre de
 * fenêtres distinctes (par type) qu'il a détectées (règle produit).
 */
export function countAnalyticDetections(rows: readonly GlobalExportRow[]): number {
  return analyticKeys(rows).size
}

/**
 * Nombre de points uniques validés = alias « détections analytiques » : couples
 * distincts `(observateur, pointId)` du MÊME type. Un observateur qui détecte la
 * même fenêtre sous deux types produit DEUX détections (règle affinée).
 */
export function countUniquePoints(rows: readonly GlobalExportRow[]): number {
  return countAnalyticDetections(rows)
}

/**
 * Fenêtres (pointId) distinctes touchées par au moins un observateur (union).
 * Contrairement à `countUniquePoints`, deux observateurs sur la même fenêtre —
 * ou deux types sur la même fenêtre — ne comptent qu'une fois.
 */
export function countWindowsHit(rows: readonly GlobalExportRow[]): number {
  return windowsHitKeys(rows).size
}

/**
 * Total « déclarations » = détections analytiques + fausses alertes. Nombre mixte
 * utilisé comme dénominateur commun de la précision.
 */
export function countTotalClaims(rows: readonly GlobalExportRow[]): number {
  return countUniquePoints(rows) + countGhostEvents(rows)
}

/**
 * Précision 0..1 = détections analytiques / (détections analytiques + fausses
 * alertes) ; null s'il n'y a aucune déclaration.
 */
export function precisionFromUniquePoints(rows: readonly GlobalExportRow[]): number | null {
  const unique = countUniquePoints(rows)
  const ghosts = countGhostEvents(rows)
  const total = unique + ghosts
  return total > 0 ? unique / total : null
}

/**
 * Nombre de détections analytiques PAR TYPE d'observation. Pour chaque type
 * (normalisé), triplets distincts `(observateur, type, fenêtre)` parmi les
 * captures non fantômes portant ce type.
 */
export function countUniquePointsByType(rows: readonly GlobalExportRow[]): Map<string, number> {
  const byType = new Map<string, Set<string>>()
  for (const row of rows) {
    const key = analyticKeyOf(row)
    if (key === null) continue
    const type = normalizedType(row.observationType)
    if (!type) continue
    let keys = byType.get(type)
    if (!keys) {
      keys = new Set<string>()
      byType.set(type, keys)
    }
    keys.add(key)
  }
  const out = new Map<string, number>()
  for (const [type, keys] of byType) out.set(type, keys.size)
  return out
}

/**
 * Probabilité empirique de détection d'un type/décalage :
 *   P = DétectionsAnalytiques / (points/trames configurés × observateurs)
 * Renvoie null si `pointsConfigured ≤ 0` ou `observerCount ≤ 0` (non calculable).
 */
export function detectionProbability(
  detections: number,
  pointsConfigured: number,
  observerCount: number,
): number | null {
  if (!(pointsConfigured > 0) || !(observerCount > 0)) return null
  return detections / (pointsConfigured * observerCount)
}

/**
 * Bande d'interprétation textuelle d'une probabilité empirique (FR), '—' si null.
 */
export function interpretationBand(probability: number | null): string {
  if (probability === null) return '—'
  if (probability >= 0.8) return 'Très élevée'
  if (probability >= 0.6) return 'Élevée'
  if (probability >= 0.4) return 'Modérée'
  if (probability >= 0.2) return 'Faible'
  return 'Très faible'
}

/**
 * ACCORD INTER-OBSERVATEURS (métrique réelle, distincte de la couverture) :
 * similarité de Jaccard moyenne par paire d'observateurs sur leurs DÉTECTIONS
 * mappées à une fenêtre cible (pointId != null), regroupées par fenêtre + tranche
 * de 3 s. Sémantique d'UNION par fenêtre — le type n'y intervient pas.
 */
export function interObserverAgreementRate(
  rows: readonly GlobalExportRow[],
): InterObserverAgreement {
  const method =
    'Accord inter-observateurs = moyenne des similarités de Jaccard par paire ' +
    'd’observateurs, calculée sur les détections mappées à une fenêtre cible ' +
    '(pointId ≠ null), groupées par (fenêtre, tranche de 3 s).'

  const setsByObserver = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.pointId) continue
    const bucket = Math.floor(row.timestampTotal / 3)
    let set = setsByObserver.get(row.userId)
    if (!set) {
      set = new Set<string>()
      setsByObserver.set(row.userId, set)
    }
    set.add(`${row.pointId}:${bucket}`)
  }

  const observers = Array.from(setsByObserver.values()).filter((set) => set.size > 0)
  if (observers.length < 2) {
    return { rate: null, pairs: 0, comparable: observers.length >= 2, method }
  }

  let sum = 0
  let pairs = 0
  for (let i = 0; i < observers.length; i += 1) {
    for (let j = i + 1; j < observers.length; j += 1) {
      const a = observers[i]
      const b = observers[j]
      let intersection = 0
      for (const key of a) {
        if (b.has(key)) intersection += 1
      }
      const union = a.size + b.size - intersection
      if (union === 0) continue
      sum += intersection / union
      pairs += 1
    }
  }

  if (pairs === 0) return { rate: null, pairs, comparable: true, method }
  return { rate: sum / pairs, pairs, comparable: true, method }
}

/** Prépare la synthèse du projet (bloc supérieur de la feuille « Synthèse »). */
export function buildProjectSummary(source: GlobalExportSource): ProjectSummary {
  const { project, rows } = source
  const configured = cleanConfiguredTypes(project.observationTypes)

  const byObserver = new Set<string>()
  const validWindows = new Set<string>()
  const validKeys = new Set<string>()
  let ghostCount = 0
  let untypedCount = 0
  let first: string | null = null
  let last: string | null = null

  const perTypeMap = new Map<string, number>()
  for (const type of configured) perTypeMap.set(type, 0)

  for (const row of rows) {
    byObserver.add(row.userId)

    const createdAt = row.createdAt
    if (first === null || createdAt < first) first = createdAt
    if (last === null || createdAt > last) last = createdAt

    if (row.isGhostPoint) {
      ghostCount += 1
    } else if (row.pointId) {
      const key = analyticKeyOf(row)
      if (key !== null) validKeys.add(key)
      validWindows.add(row.pointId)
    }

    const type = row.observationType?.trim()
    if (!type) {
      untypedCount += 1
      continue
    }
    if (perTypeMap.has(type)) {
      perTypeMap.set(type, (perTypeMap.get(type) ?? 0) + 1)
    } else if (configured.length === 0) {
      // Types observés libres (projet sans type imposé) : comptés dynamiquement.
      perTypeMap.set(type, 1)
    }
  }

  // Détections analytiques : triplets distincts (observateur, type, fenêtre).
  const validatedCount = validKeys.size
  // Fausses alertes : chaque capture hors trame est un événement.
  // Total « déclarations » = détections analytiques + fausses alertes.
  const totalObservations = validatedCount + ghostCount

  return {
    project,
    totalObservations,
    validatedCount,
    ghostCount,
    untypedCount,
    observerCount: byObserver.size,
    windowsHit: validWindows.size,
    firstSubmittedAt: first,
    lastSubmittedAt: last,
    perType: Array.from(perTypeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    agreement: interObserverAgreementRate(rows),
  }
}

/** Prépare la matrice observateurs × types (conservée pour compatibilité). */
export function buildObserverMatrix(source: GlobalExportSource): ObserverMatrix {
  const { project, rows } = source
  const configured = cleanConfiguredTypes(project.observationTypes)

  const byObserver = new Map<string, GlobalExportRow[]>()
  for (const row of rows) {
    const list = byObserver.get(row.userId)
    if (list) list.push(row)
    else byObserver.set(row.userId, [row])
  }

  // Colonnes types : types configurés d'abord, puis types observés inconnus (dynamiques).
  const observedTypes = new Set<string>()
  for (const row of rows) {
    const type = normalizedType(row.observationType)
    if (type && !configured.includes(type)) observedTypes.add(type)
  }
  const types = [...configured, ...Array.from(observedTypes).sort((a, b) => a.localeCompare(b))]

  const observers = Array.from(byObserver.entries())
    .map(([observerId, observerRows]) => {
      const perType: Record<string, number> = {}
      const validWindows = new Set<string>()
      const validKeys = new Set<string>()
      let ghosts = 0
      for (const row of observerRows) {
        const type = row.observationType?.trim()
        if (type) perType[type] = (perType[type] ?? 0) + 1
        if (row.isGhostPoint) {
          ghosts += 1
          continue
        }
        if (row.pointId) {
          const key = analyticKeyOf(row)
          if (key !== null) validKeys.add(key)
          validWindows.add(row.pointId)
        }
      }
      // « Point trouvé ? » = détections analytiques (triplets distincts).
      const pointFound = validKeys.size
      // Déclarations = détections analytiques + fausses alertes (dénominateur précision).
      const total = pointFound + ghosts
      const sample = observerRows[0]
      return {
        observerId,
        displayName: observerDisplayLabel(sample),
        username: sample.username,
        email: sample.email,
        anonymousId: sample.anonymousId,
        perType,
        total,
        pointFound,
        ghosts,
        windowsHit: validWindows.size,
        precision: total > 0 ? pointFound / total : null,
      }
    })
    .sort((a, b) => b.total - a.total || a.displayName.localeCompare(b.displayName))

  return { types, observers }
}

/** Prépare le relevé global complet (feuille « Données_Brutes_Globales »). */
export function buildGlobalObservations(source: GlobalExportSource): LedgerObservation[] {
  return source.rows
    .slice()
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.timestampTotal - b.timestampTotal,
    )
    .map((row) => ({
      timecode: clockLabel(row.timestampTotal),
      observationType: row.observationType?.trim() || null,
      pointFound: row.isGhostPoint ? 'Non' : 'Oui',
      pointLabel: row.pointLabel,
      videoName: row.videoName?.trim() || '',
      observerName: observerDisplayLabel(row),
      email: row.email,
      anonymousId: row.anonymousId,
      status: row.isGhostPoint ? 'Hors trame (fausse alerte)' : 'Validée',
      imageUrl: row.imageUrl,
      driveFileId: row.driveFileId ?? '',
      imageLink: driveImageLink(row.driveFileId),
      capturedAt: row.createdAt,
    }))
}

// ——— Agrégations dédiées au classeur « Synthèse » / « par type » ———

/** Agrége les effectifs de points configurés par type/décalage. */
export function computeDefinedPointsByType(points: readonly GlobalExportPoint[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const point of points) {
    const type = normalizedType(point.type)
    counts[type] = (counts[type] ?? 0) + 1
  }
  return counts
}

/** Observateur du jeu de données exporté (identité d'affichage stable). */
export type DatasetObserver = {
  observerId: string
  displayName: string
  email: string | null
  anonymousId: string
}

/** Observateurs distincts (tri par nom d'affichage), ordre stable. */
export function listDatasetObservers(source: GlobalExportSource): DatasetObserver[] {
  const byId = new Map<string, GlobalExportRow>()
  for (const row of source.rows) {
    if (!byId.has(row.userId)) byId.set(row.userId, row)
  }
  return Array.from(byId.values())
    .map((row) => ({
      observerId: row.userId,
      displayName: observerDisplayLabel(row),
      email: row.email,
      anonymousId: row.anonymousId,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/**
 * Ligne du tableau principal « probabilités de détection » (feuille Synthèse) :
 * une ligne par type/décalage, y compris les types configurés sans aucune capture.
 */
export type DetectionProbabilityRow = {
  /** Libellé affiché (type d'observation, ou libellé générique réservé). */
  label: string
  /** Clé normalisée utilisée pour filtrer les lignes. */
  type: string
  /** Points/trames configurés rattachés à ce type/décalage. */
  pointCount: number
  /** Observations possibles = pointCount × observateurs distincts du jeu exporté. */
  possibleObservations: number
  /** Détections analytiques des lignes portant ce type. */
  detections: number
  /** Probabilité empirique (null si non calculable). */
  probability: number | null
  /** Bande d'interprétation textuelle. */
  interpretation: string
}

/**
 * Construit le tableau « ANALYSE DES PROBABILITÉS DE DÉTECTION ».
 * Ordre : types configurés (même sans capture), puis types observés non
 * configurés (alphabétique), puis éventuellement le groupe générique réservé.
 */
export function buildDetectionProbabilityTable(source: GlobalExportSource): DetectionProbabilityRow[] {
  const { project, rows } = source
  const configured = cleanConfiguredTypes(project.observationTypes)
  const observers = listDatasetObservers(source)
  const observerCount = observers.length

  const observedUnknown = new Set<string>()
  let hasGeneric = false
  for (const row of rows) {
    const type = normalizedType(row.observationType)
    if (type) {
      if (!configured.includes(type)) observedUnknown.add(type)
    } else if (!row.isGhostPoint && row.pointId) {
      // Seules les captures VALIDÉES non fantômes forment des détections
      // analytiques : une fausse alerte sans type ne doit pas faire apparaître
      // un groupe « passe générique » vide dans le tableau des probabilités.
      hasGeneric = true
    }
  }

  const genericPointCount = project.definedPointsByType[GENERIC_TYPE_KEY] ?? 0
  if (hasGeneric || genericPointCount > 0) observedUnknown.add(GENERIC_TYPE_KEY)
  // Le groupe générique est présenté en dernier, après les types observés.
  const hasGenericGroup = observedUnknown.delete(GENERIC_TYPE_KEY)

  const groupKeys = [
    ...configured,
    ...Array.from(observedUnknown).sort((a, b) => a.localeCompare(b)),
    ...(hasGenericGroup ? [GENERIC_TYPE_KEY] : []),
  ]

  return groupKeys.map((groupKey) => {
    const label = typeGroupLabel(groupKey)
    const pointCount = project.definedPointsByType[groupKey] ?? 0
    const groupRows = rows.filter(
      (row) => normalizedType(row.observationType) === groupKey,
    )
    const detections = countAnalyticDetections(groupRows)
    const possibleObservations = pointCount * observerCount
    const probability = detectionProbability(detections, pointCount, observerCount)
    return {
      label,
      type: groupKey,
      pointCount,
      possibleObservations,
      detections,
      probability,
      interpretation: interpretationBand(probability),
    }
  })
}

/** Ligne du bloc « DÉTAIL PAR POINT » (feuille Synthèse). */
export type PointDetailRow = {
  pointId: string
  label: string
  trameDebut: number
  trameFin: number
  videoName: string | null
  /** Type/décalage de la passe vidéo du point (clé normalisée). */
  type: string
  /** Observateurs distincts ayant ≥ 1 détection analytique sur ce point. */
  observersDetected: number
  /** Détections analytiques sur ce point (distinctes par (observateur, type, point)). */
  detections: number
}

/** Construit le bloc « DÉTAIL PAR POINT » : chaque point configuré, même sans détection. */
export function buildPointDetailRows(source: GlobalExportSource): PointDetailRow[] {
  const { project, rows } = source
  return project.points.map((point) => {
    const matched = rows.filter((row) => row.pointId === point.id && !row.isGhostPoint)
    const observersDetected = new Set(matched.map((row) => row.userId)).size
    return {
      pointId: point.id,
      label: point.label,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      videoName: point.videoName,
      type: point.type,
      observersDetected,
      detections: countAnalyticDetections(matched),
    }
  })
}

/** Ligne du bloc « SYNTHÈSE PAR OBSERVATEUR » (feuille Synthèse). */
export type ObserverSynthesisRow = {
  observerId: string
  displayName: string
  email: string | null
  anonymousId: string
  /** Points/trames uniques détectés au sens analytique (observateur, type, trame). */
  uniqueDetections: number
  /** Points/trames possibles = points configurés du périmètre exporté. */
  pointsPossible: number
  /** Taux de couverture 0..1 (uniqueDetections / pointsPossible) ; null si aucun point. */
  rate: number | null
}

/** Construit le bloc « SYNTHÈSE PAR OBSERVATEUR ». */
export function buildObserverSynthesisRows(source: GlobalExportSource): ObserverSynthesisRow[] {
  const { project, rows } = source
  const byId = new Map<string, GlobalExportRow[]>()
  for (const row of rows) {
    const list = byId.get(row.userId)
    if (list) list.push(row)
    else byId.set(row.userId, [row])
  }
  const pointsPossible = project.definedPoints
  return Array.from(byId.entries())
    .map(([observerId, observerRows]) => {
      const sample = observerRows[0]
      const uniqueDetections = countAnalyticDetections(observerRows)
      return {
        observerId,
        displayName: observerDisplayLabel(sample),
        email: sample.email,
        anonymousId: sample.anonymousId,
        uniqueDetections,
        pointsPossible,
        rate:
          pointsPossible > 0
            ? Math.min(1, uniqueDetections / pointsPossible)
            : null,
      }
    })
    .sort((a, b) => (b.uniqueDetections - a.uniqueDetections) || a.displayName.localeCompare(b.displayName))
}

/** Ligne d'une feuille « par type/décalage » (matrice points × observateurs). */
export type TypeSheetRow = {
  pointId: string
  label: string
  trameDebut: number
  trameFin: number
  videoName: string | null
  /** 1 si l'observateur a ≥ 1 détection analytique sur ce point, sinon 0. */
  detectionsByObserver: Record<string, 0 | 1>
  /** Nombre d'observateurs ayant détecté ce point (≥ 1). */
  detectorCount: number
  /** Probabilité empirique = détecteurs / observateurs du jeu exporté (null si 0). */
  probability: number | null
}

/**
 * Construit la matrice d'une feuille « par type/décalage » : les points
 * configurés de ce type en lignes, un colonne par observateur (0/1), puis un
 * total « Détections » et une « Probabilité » par point.
 */
export function buildTypeSheetRows(
  source: GlobalExportSource,
  typeKey: string,
  observers: readonly DatasetObserver[],
): TypeSheetRow[] {
  const { project, rows } = source
  const observerCount = observers.length
  const points = project.points.filter((point) => normalizedType(point.type) === typeKey)

  return points.map((point) => {
    const matched = rows.filter((row) => row.pointId === point.id && !row.isGhostPoint)
    const observerIds = new Set(matched.map((row) => row.userId))
    const detectionsByObserver: Record<string, 0 | 1> = {}
    let detectorCount = 0
    for (const observer of observers) {
      const detected = observerIds.has(observer.observerId) ? 1 : 0
      detectionsByObserver[observer.observerId] = detected
      detectorCount += detected
    }
    return {
      pointId: point.id,
      label: point.label,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      videoName: point.videoName,
      detectionsByObserver,
      detectorCount,
      probability:
        observerCount > 0 ? detectorCount / observerCount : null,
    }
  })
}
