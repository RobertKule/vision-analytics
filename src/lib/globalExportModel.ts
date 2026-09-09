/**
 * Modèle de l'« Export Global (Excel) » — fonctions PURES de préparation des
 * données (aucun exceljs, aucune I/O) : exécutées côté serveur (route API) et
 * testables unitairement.
 *
 * 3 feuilles du classeur :
 *   - Synthèse_Projet        : métadonnées + indicateurs + accord inter-observateurs
 *   - Matrice_Observateurs   : par observateur × types dynamiques
 *   - Données_Brutes_Globales: relevé complet (colonnes réellement persistées)
 *
 * Convention de champ « point trouvé » : cohérente avec le classeur individuel
 * (`isGhostPoint ? 'Non' : 'Oui'`). Géométrie de capture jamais persistée.
 *
 * ─── SÉMANTIQUE « POINT UNIQUE » (règle produit, appliquée partout) ─────────
 * Pour UN observateur, plusieurs observations certifiées dans la MÊME fenêtre
 * temporelle (`pointId`) du MÊME type comptent pour UN point détecté, pas N.
 * Unités retenues (identiques dans le tableau de bord, l'Excel, le CSV, le PDF) :
 *   - Point unique validé   = couple distinct `(observateur, pointId)` parmi les
 *     captures certifiées NON fantômes. Un observateur ne « détecte » une fenêtre
 *     qu'une fois, quel que soit son nombre de captures dans cette fenêtre.
 *     Deux observateurs détectant la même fenêtre produisent DEUX points uniques.
 *   - Fausse alerte (fantôme) = une capture `isGhostPoint = true`. Chaque fausse
 *     alerte est un événement propre (aucune fenêtre à dédupliquer).
 *   - Total « déclarations » = points uniques validés + fausses alertes.
 *   - Précision = points uniques validés / (points uniques validés + fausses alertes).
 *   - Fenêtres touchées     = `pointId` distincts détectés par au moins un
 *     observateur (union ; ne déduplique PAS par observateur).
 * Le relevé brut (`buildGlobalObservations`) conserve TOUTES les captures
 * certifiées, sans déduplication : c'est la donnée brute.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OBSERVER_POINT_SEP = '|' // séparateur de clé (jamais présent dans les ids)

/** Clés `(observateur, pointId)` des captures certifiées non fantômes. */
function uniqueValidPointKeys(rows: readonly GlobalExportRow[]): Set<string> {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.isGhostPoint) continue
    if (!row.pointId) continue
    keys.add(`${row.userId}${OBSERVER_POINT_SEP}${row.pointId}`)
  }
  return keys
}

/** Champs de projet nécessaires à l'export (tous réellement persistés). */
export type GlobalExportProject = {
  id: string
  title: string
  description: string | null
  videoUrl: string | null
  observationTypes: string[]
  createdAt: string
  /** Nombre de fenêtres de validation (points) définies sur le projet. */
  definedPoints: number
}

/** Ligne d'observation brute (champs réellement persistés uniquement). */
export type GlobalExportRow = {
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

/** Synthèse du projet (feuille 1). */
export type ProjectSummary = {
  project: GlobalExportProject
  /**
   * Total des « déclarations » = points uniques validés (`validatedCount`) +
   * fausses alertes (`ghostCount`). Nombre mixte (points uniques + événements
   * fantômes), volontaire : c'est le dénominateur commun de la précision.
   * Ne correspond PAS au nombre de captures brutes (voir `buildGlobalObservations`).
   */
  totalObservations: number
  /** Points uniques validés : couples distincts (observateur, pointId) non fantômes. */
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

/** Entrée de la matrice observateurs × types (feuille 2). */
export type ObserverMatrixEntry = {
  observerId: string
  displayName: string
  username: string | null
  email: string | null
  anonymousId: string
  /** Nombre de captures brutes par type d'observation (clé = libellé exact). */
  perType: Record<string, number>
  /** « Déclarations » de l'observateur = points uniques validés + fausses alertes. */
  total: number
  /** « Point trouvé ? » = points uniques validés (fenêtres distinctes non fantômes). */
  pointFound: number
  /** Fausses alertes : captures hors trame (événements, non dédupliquées). */
  ghosts: number
  /** Fenêtres (points) distinctes touchées par cet observateur (= `pointFound`). */
  windowsHit: number
  /**
   * Précision individuelle 0..1 = points uniques validés / déclarations ;
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
 * Statistiques agrégées par type d'observation (feuille dédiée du classeur
 * global). Chaque type porte ses compteurs TOTAUX (tous observateurs), calculés
 * sur le sous-ensemble filtré transmis au classeur. Les compteurs « points »
 * suivent la règle du point unique (dédupliqués par (observateur, pointId)).
 */
export type TypeStatistic = {
  type: string
  /** Déclarations de ce type = points uniques validés + fausses alertes. */
  total: number
  /** Points uniques validés de ce type : couples distincts (observateur, pointId). */
  validated: number
  /** Fausses alertes de ce type (événements, non dédupliquées). */
  ghosts: number
  /** Observateurs distincts ayant produit au moins une capture de ce type. */
  observers: number
  /** Fenêtres (points) distinctes touchées par ce type (union). */
  windowsHit: number
  /** Précision 0..1 = points uniques validés / déclarations ; null si aucune. */
  precision: number | null
}

/**
 * Agrège les statistiques PAR TYPE sur le sous-ensemble de lignes transmis.
 * Colonnes et ordre stables : types configurés d'abord (même sans capture),
 * puis types observés non configurés (tri alphabétique) — comme la matrice.
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
    const type = row.observationType?.trim()
    if (!type) continue
    if (!configured.includes(type)) observedUnknown.add(type)
    const acc = ensure(type)
    acc.observers.add(row.userId)
    if (row.isGhostPoint) {
      acc.ghosts += 1
      continue
    }
    if (row.pointId) {
      acc.validKeys.add(`${row.userId}${OBSERVER_POINT_SEP}${row.pointId}`)
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

/** Ligne de relevé global (feuille 3). */
export type LedgerObservation = {
  timecode: string
  observationType: string | null
  pointFound: 'Oui' | 'Non'
  pointLabel: string | null
  observerName: string
  email: string | null
  anonymousId: string
  status: string
  imageUrl: string
  capturedAt: string
}

export const LEDGER_HEADERS = [
  'Minuterie (MM:SS)',
  "Type d'observation",
  'Point trouvé ?',
  'Fenêtre cible',
  'Observateur',
  'Email',
  'Identifiant anonyme',
  'Coordonnées (X, Y)',
  'Statut',
  'Image (URL)',
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

// ——— Règle produit « point unique » : primitives pures de déduplication ———
// Un point = une fenêtre temporelle (`pointId`). Pour UN observateur, plusieurs
// captures dans la même fenêtre comptent pour UN point. Ces fonctions sont le
// SEUL endroit qui déduplique : le tableau de bord, l'Excel, le CSV et le PDF
// utilisent exactement les mêmes compteurs.

/** Nombre d'événements fantômes (fausses alertes) : chaque capture hors trame compte. */
export function countGhostEvents(rows: readonly GlobalExportRow[]): number {
  let count = 0
  for (const row of rows) if (row.isGhostPoint) count += 1
  return count
}

/**
 * Nombre de points uniques validés dans le sous-ensemble transmis : couples
 * distincts `(observateur, pointId)` parmi les captures non fantômes. Si les
 * lignes concernent un observateur unique, c'est le nombre de fenêtres distinctes
 * qu'il a détectées (règle produit) ; si elles en couvrent plusieurs, c'est la
 * somme, pour chaque observateur, de ses fenêtres distinctes.
 */
export function countUniquePoints(rows: readonly GlobalExportRow[]): number {
  return uniqueValidPointKeys(rows).size
}

/**
 * Fenêtres (pointId) distinctes touchées par au moins un observateur (union).
 * Contrairement à `countUniquePoints`, deux observateurs sur la même fenêtre ne
 * comptent qu'une fois.
 */
export function countWindowsHit(rows: readonly GlobalExportRow[]): number {
  const windows = new Set<string>()
  for (const row of rows) {
    if (row.isGhostPoint) continue
    if (row.pointId) windows.add(row.pointId)
  }
  return windows.size
}

/**
 * Total « déclarations » = points uniques validés + fausses alertes. Nombre mixte
 * utilisé comme dénominateur commun de la précision.
 */
export function countTotalClaims(rows: readonly GlobalExportRow[]): number {
  return countUniquePoints(rows) + countGhostEvents(rows)
}

/**
 * Précision 0..1 = points uniques validés / (points uniques validés + fausses
 * alertes) ; null s'il n'y a aucune déclaration.
 */
export function precisionFromUniquePoints(rows: readonly GlobalExportRow[]): number | null {
  const unique = countUniquePoints(rows)
  const ghosts = countGhostEvents(rows)
  const total = unique + ghosts
  return total > 0 ? unique / total : null
}

/**
 * Nombre de points uniques validés PAR TYPE d'observation. Pour chaque type
 * (normalisé : trim), couples distincts `(observateur, pointId)` parmi les
 * captures non fantômes portant ce type. Une même fenêtre annotée sous deux types
 * compte donc une fois dans chaque type.
 */
export function countUniquePointsByType(rows: readonly GlobalExportRow[]): Map<string, number> {
  const byType = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.isGhostPoint) continue
    if (!row.pointId) continue
    const type = row.observationType?.trim()
    if (!type) continue
    let keys = byType.get(type)
    if (!keys) {
      keys = new Set<string>()
      byType.set(type, keys)
    }
    keys.add(`${row.userId}${OBSERVER_POINT_SEP}${row.pointId}`)
  }
  const out = new Map<string, number>()
  for (const [type, keys] of byType) out.set(type, keys.size)
  return out
}

/**
 * ACCORD INTER-OBSERVATEURS (métrique réelle, distincte de la couverture) :
 * similarité de Jaccard moyenne par paire d'observateurs sur leurs DÉTECTIONS
 * mappées à une fenêtre cible (pointId != null), regroupées par fenêtre + tranche
 * de 3 s. Un événement observé par plusieurs observateurs indépendants produit le
 * même couple (fenêtre, tranche) → accord ; deux observateurs sur des événements
 * différents → désaccord.
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

/** Prépare la synthèse du projet (feuille « Synthèse_Projet »). */
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
      validKeys.add(`${row.userId}${OBSERVER_POINT_SEP}${row.pointId}`)
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

  // Points uniques validés : couples distincts (observateur, pointId).
  const validatedCount = validKeys.size
  // Fausses alertes : chaque capture hors trame est un événement.
  // Total « déclarations » = points uniques validés + fausses alertes.
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

/** Prépare la matrice observateurs × types (feuille « Matrice_Observateurs »). */
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
    const type = row.observationType?.trim()
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
          validKeys.add(`${row.userId}${OBSERVER_POINT_SEP}${row.pointId}`)
          validWindows.add(row.pointId)
        }
      }
      // « Point trouvé ? » = points uniques validés (fenêtres distinctes).
      const pointFound = validKeys.size
      // Déclarations = points uniques validés + fausses alertes (dénominateur précision).
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
      observerName: observerDisplayLabel(row),
      email: row.email,
      anonymousId: row.anonymousId,
      status: row.isGhostPoint ? 'Hors trame (fausse alerte)' : 'Validée',
      imageUrl: row.imageUrl,
      capturedAt: row.createdAt,
    }))
}
