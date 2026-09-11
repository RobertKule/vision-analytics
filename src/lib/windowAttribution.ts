/**
 * MOTEUR D'ATTRIBUTION ANALYTIQUE DES TRAMES — noyau PUR (aucune I/O, testable).
 *
 * ─── LE PROBLÈME QUE CE MODULE RÉSOUT ────────────────────────────────────────
 * Le modèle historique considérait implicitement « 1 capture → 1 fenêtre », et
 * choisissait la PREMIÈRE fenêtre couvrante rencontrée. Scientifiquement, ce
 * n'est pas suffisant :
 *
 *   — un POINT logique peut apparaître sur PLUSIEURS trames temporelles ;
 *   — plusieurs trames peuvent se CHEVAUCHER sans être imbriquées ;
 *   — une trame peut être ENTIÈREMENT INCLUSE dans une autre (parent/enfant) ;
 *   — une même capture peut donc être candidate à PLUSIEURS fenêtres ;
 *   — il faut malgré tout un résultat DÉTERMINISTE, sans double comptage.
 *
 * ─── RÈGLE FONDAMENTALE ──────────────────────────────────────────────────────
 * UNE capture = UNE occurrence attribuée = AU PLUS UNE fenêtre. Jamais deux.
 * La hiérarchie sert uniquement à décider À QUELLE cible analytique l'occurrence
 * appartient — elle ne multiplie JAMAIS le nombre d'occurrences.
 *
 * ─── ORDRE DE PRIORITÉ (déterministe, total) ─────────────────────────────────
 * Pour une capture, parmi les fenêtres candidates NON ENCORE SATISFAITES :
 *   1. la plus SPÉCIFIQUE d'abord — profondeur d'imbrication décroissante
 *      (un enfant passe avant son parent, un petit-enfant avant l'enfant) ;
 *   2. à profondeur égale, celle qui SE TERME LE PLUS TÔT (« la plus susceptible
 *      de se fermer en premier ») ;
 *   3. à égalité de fin, celle qui COMMENCE LE PLUS TÔT ;
 *   4. à égalité exacte, un identifiant STABLE (`id`) pour rendre l'ordre total.
 * Si toutes les fenêtres candidates sont déjà satisfaites, la capture est
 * attribuée à la meilleure candidate quand même : elle tombe réellement dans une
 * trame de validation, la classer « fausse alerte » serait faux. Le décompte des
 * détections restant dédupliqué par `(observateur, type, fenêtre)`, cette
 * attribution ne crée jamais de détection supplémentaire.
 *
 * ─── CE QUE SIGNIFIE « DÉJÀ SATISFAITE » ─────────────────────────────────────
 * Une fenêtre est satisfaite, POUR UN OBSERVATEUR ET UN TYPE D'OBSERVATION
 * DONNÉS, dès qu'une occurrence lui a été attribuée. C'est exactement l'unité de
 * la règle produit « une détection = (observateur, type, fenêtre) ».
 *
 * Cet état est RECONSTRUIT À CHAQUE CALCUL depuis les captures RAW et la
 * configuration COURANTE. Il n'est jamais lu depuis `isGhostPoint`, `pointId` ou
 * une quelconque classification persistée : l'analyse courante est toujours
 * redérivée. Les versions historiques, elles, ne passent pas par ici.
 *
 * ─── EXEMPLE (règle d'attribution progressive) ───────────────────────────────
 *   Parent [00:10 → 00:20] └── Enfant [00:12 → 00:15]
 *   Captures de l'observateur A : 00:13 puis 00:14
 *     → 00:13 : Enfant (la plus spécifique)        → Enfant satisfaite
 *     → 00:14 : Enfant satisfaite ⇒ remontée Parent → Parent satisfaite
 *   Résultat : Enfant = 1, Parent = 1 (et non Enfant = 2).
 */

/** Fenêtre de validation telle qu'utilisée par le moteur (vue minimale). */
export type AttributionWindow = {
  id: string
  /** Passe vidéo de la fenêtre ; `null` = passe générique héritée. */
  videoId: string | null
  trameDebut: number
  trameFin: number
}

/** Capture RAW telle qu'utilisée par le moteur (vue minimale). */
export type AttributionRow = {
  /** Identifiant d'observateur (clé de l'état « fenêtre satisfaite »). */
  userId: string
  /** Passe vidéo d'origine ; `null` = passe générique héritée. */
  videoId?: string | null
  timestampTotal: number
  observationType?: string | null
  /** Horodatage de soumission — sert uniquement de départage stable. */
  createdAt?: string
  /** Identifiant de la ligne — départage stable des timestamps égaux. */
  id?: string
}

/** Clé de portée vidéo : `null` et `''` désignent la même passe générique. */
export function videoScopeKey(videoId: string | null | undefined): string {
  return videoId ?? ''
}

/** Vrai si `outer` contient STRICTEMENT `inner` (au moins une borne stricte). */
export function strictlyContains(
  outer: AttributionWindow,
  inner: AttributionWindow,
): boolean {
  const contains =
    outer.trameDebut <= inner.trameDebut && inner.trameFin <= outer.trameFin
  // L'égalité exacte n'est PAS une inclusion : deux fenêtres identiques sont au
  // même niveau et sont départagées par l'identifiant stable.
  const strict = outer.trameDebut < inner.trameDebut || inner.trameFin < outer.trameFin
  return contains && strict
}

/**
 * HIÉRARCHIE DES FENÊTRES — parent/enfant calculés à partir des seuls
 * intervalles temporels, au sein d'une MÊME passe vidéo (deux fenêtres de passes
 * différentes ne sont jamais comparables).
 *
 * `depth` : nombre d'ancêtres (0 = fenêtre racine). Plus la profondeur est
 * grande, plus la fenêtre est spécifique.
 */
export type WindowHierarchy = {
  /** Profondeur d'imbrication par identifiant de fenêtre (0 = racine). */
  depth: Map<string, number>
  /** Parent immédiat (fenêtre englobante la plus proche) ; `null` si racine. */
  parentId: Map<string, string | null>
  /** Enfants immédiats par identifiant de fenêtre. */
  childIds: Map<string, string[]>
}

/** Compare par fin croissante puis début croissant puis identifiant stable. */
function byFinThenDebutThenId(a: AttributionWindow, b: AttributionWindow): number {
  return (
    a.trameFin - b.trameFin || a.trameDebut - b.trameDebut || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/**
 * Construit la hiérarchie des fenêtres (profondeur + parent immédiat + enfants).
 *
 * Complexité O(W²) par passe vidéo — W étant le nombre de fenêtres d'une passe,
 * cette construction est faite UNE fois par configuration, jamais par capture.
 */
export function buildWindowHierarchy(
  windows: readonly AttributionWindow[],
): WindowHierarchy {
  const byScope = new Map<string, AttributionWindow[]>()
  for (const window of windows) {
    const key = videoScopeKey(window.videoId)
    const list = byScope.get(key)
    if (list) list.push(window)
    else byScope.set(key, [window])
  }

  const depth = new Map<string, number>()
  const parentId = new Map<string, string | null>()
  const childIds = new Map<string, string[]>()

  for (const scopeWindows of byScope.values()) {
    for (const window of scopeWindows) {
      // Le parent immédiat = la plus PETITE fenêtre englobante (à défaut de
      // taille, celle qui se termine le plus tôt puis l'identifiant stable).
      let parent: AttributionWindow | null = null
      for (const candidate of scopeWindows) {
        if (candidate.id === window.id) continue
        if (!strictlyContains(candidate, window)) continue
        if (parent === null) {
          parent = candidate
          continue
        }
        const span = candidate.trameFin - candidate.trameDebut
        const parentSpan = parent.trameFin - parent.trameDebut
        if (span < parentSpan || (span === parentSpan && byFinThenDebutThenId(candidate, parent) < 0)) {
          parent = candidate
        }
      }
      parentId.set(window.id, parent?.id ?? null)
    }
  }

  // Profondeur : la relation d'inclusion STRICTE est un ordre partiel strict (donc
  // acyclique) ; un parcours en largeur depuis les racines suffit.
  const childrenOf = new Map<string, string[]>()
  for (const [id, parent] of parentId) {
    if (parent === null) continue
    const list = childrenOf.get(parent)
    if (list) list.push(id)
    else childrenOf.set(parent, [id])
  }

  const queue: string[] = []
  for (const [id, parent] of parentId) {
    if (parent === null) {
      depth.set(id, 0)
      queue.push(id)
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]
    const currentDepth = depth.get(current) ?? 0
    const children = childrenOf.get(current) ?? []
    // Ordre stable des enfants (fin, début, identifiant) pour un résultat reproductible.
    const ordered = children
      .map((id) => windows.find((window) => window.id === id))
      .filter((window): window is AttributionWindow => window !== undefined)
      .sort(byFinThenDebutThenId)
    const ids: string[] = []
    for (const child of ordered) {
      ids.push(child.id)
      depth.set(child.id, currentDepth + 1)
      queue.push(child.id)
    }
    childIds.set(current, ids)
  }
  for (const window of windows) {
    if (!depth.has(window.id)) {
      depth.set(window.id, 0)
      childIds.set(window.id, childIds.get(window.id) ?? [])
    }
  }

  return { depth, parentId, childIds }
}

/** Vrai si la fenêtre couvre l'horodatage de la capture (bornes incluses). */
export function windowCoversTimestamp(
  window: AttributionWindow,
  timestampTotal: number,
): boolean {
  return timestampTotal >= window.trameDebut && timestampTotal <= window.trameFin
}

/** Fenêtres candidates d'une capture : même passe vidéo ET horodatage couvert. */
export function candidateWindowsFor(
  row: AttributionRow,
  windows: readonly AttributionWindow[],
): AttributionWindow[] {
  const scope = videoScopeKey(row.videoId)
  const candidates: AttributionWindow[] = []
  for (const window of windows) {
    if (videoScopeKey(window.videoId) !== scope) continue
    if (!windowCoversTimestamp(window, row.timestampTotal)) continue
    candidates.push(window)
  }
  return candidates
}

/**
 * Clé de l'état « fenêtre satisfaite » : `(observateur, type d'observation,
 * fenêtre)`. C'est l'unité de la détection analytique ; la fenêtre porte déjà sa
 * passe vidéo, donc la composante « vidéo » de la portée est couverte.
 */
export function satisfiedKey(
  userId: string,
  observationType: string | null | undefined,
  windowId: string,
): string {
  return `${userId}|${(observationType ?? '').trim()}|${windowId}`
}

/**
 * CLÉ DE POINT LOGIQUE — un point scientifique peut apparaître sur plusieurs
 * trames : c'est le même point logique dès lors qu'il partage le même NOM (à la
 * casse et aux espaces près) AU SEIN DE LA MÊME PASSE VIDÉO. Deux fenêtres
 * homonymes de passes différentes restent deux points distincts.
 *
 * Cette identité est DÉRIVÉE des données existantes : aucune colonne, aucune table
 * supplémentaire n'est nécessaire pour représenter « 1 point = 1..N fenêtres ».
 */
export function logicalPointKey(
  window: AttributionWindow,
  pointName: string | null | undefined,
): string {
  const normalized = (pointName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return `${videoScopeKey(window.videoId)}::${normalized}`
}

/** Ordonne les candidates selon la règle de priorité (la plus prioritaire en tête). */
export function sortCandidates(
  candidates: readonly AttributionWindow[],
  hierarchy: WindowHierarchy,
): AttributionWindow[] {
  return candidates.slice().sort((a, b) => {
    // 1. La plus spécifique d'abord (profondeur d'imbrication décroissante).
    const depthDiff = (hierarchy.depth.get(b.id) ?? 0) - (hierarchy.depth.get(a.id) ?? 0)
    if (depthDiff !== 0) return depthDiff
    // 2–4. Fin la plus précoce, puis début le plus précoce, puis identifiant stable.
    return byFinThenDebutThenId(a, b)
  })
}

/** Résultat d'attribution d'une capture. */
export type AttributionOutcome = {
  /** Fenêtre retenue — `null` si la capture ne tombe dans AUCUNE fenêtre. */
  windowId: string | null
  /** Vrai si la capture est hors de toute fenêtre (fausse alerte). */
  isGhost: boolean
  /** Fenêtres candidates (avant priorité), ordre stable. */
  candidateIds: string[]
  /** Vrai si toutes les candidates prioritaires étaient déjà satisfaites (remontée). */
  rolledUp: boolean
}

/** Structure pré-calculée d'un jeu de fenêtres — à réutiliser pour N captures. */
export type AttributionPlan = {
  windows: readonly AttributionWindow[]
  byId: Map<string, AttributionWindow>
  windowsByScope: Map<string, AttributionWindow[]>
  hierarchy: WindowHierarchy
}

/**
 * Prépare un plan d'attribution : hiérarchie + index par passe vidéo. Coût
 * payé UNE fois par configuration, jamais par capture (contrainte de performance
 * du moteur : aucun balayage capture × fenêtre répété inutilement).
 */
export function buildAttributionPlan(
  windows: readonly AttributionWindow[],
): AttributionPlan {
  const byId = new Map<string, AttributionWindow>()
  const windowsByScope = new Map<string, AttributionWindow[]>()
  for (const window of windows) {
    byId.set(window.id, window)
    const key = videoScopeKey(window.videoId)
    const list = windowsByScope.get(key)
    if (list) list.push(window)
    else windowsByScope.set(key, [window])
  }
  // Ordre stable dans chaque passe : fin, début, identifiant.
  for (const list of windowsByScope.values()) list.sort(byFinThenDebutThenId)
  return { windows, byId, windowsByScope, hierarchy: buildWindowHierarchy(windows) }
}

/**
 * ATTRIBUE CHAQUE CAPTURE À AU PLUS UNE FENÊTRE.
 *
 * Les captures sont traitées PAR OBSERVATEUR et dans l'ordre CHRONOLOGIQUE : la
 * remontée progressive (« niveau le plus spécifique disponible, puis parent »)
 * dépend de l'ordre de rencontre, qui doit être déterministe.
 *
 * @returns un tableau de résultats, indexé comme `rows`.
 */
export function attributeOccurrences(
  rows: readonly AttributionRow[],
  plan: AttributionPlan,
): AttributionOutcome[] {
  const outcomes: AttributionOutcome[] = new Array(rows.length)
  const satisfied = new Set<string>()

  // Regroupement par observateur, en conservant l'index d'origine (l'ordre en
  // sortie doit être exactement celui des lignes d'entrée).
  const byObserver = new Map<string, number[]>()
  for (let index = 0; index < rows.length; index += 1) {
    const list = byObserver.get(rows[index].userId)
    if (list) list.push(index)
    else byObserver.set(rows[index].userId, [index])
  }

  for (const indexes of byObserver.values()) {
    const ordered = indexes.slice().sort((a, b) => {
      const rowA = rows[a]
      const rowB = rows[b]
      if (rowA.timestampTotal !== rowB.timestampTotal) {
        return rowA.timestampTotal - rowB.timestampTotal
      }
      const createdA = rowA.createdAt ?? ''
      const createdB = rowB.createdAt ?? ''
      if (createdA !== createdB) return createdA < createdB ? -1 : 1
      const idA = rowA.id ?? ''
      const idB = rowB.id ?? ''
      return idA < idB ? -1 : idA > idB ? 1 : 0
    })

    for (const index of ordered) {
      const row = rows[index]
      const scopeWindows = plan.windowsByScope.get(videoScopeKey(row.videoId)) ?? []
      const candidates = candidateWindowsFor(row, scopeWindows)
      const candidateIds = candidates.map((window) => window.id)

      if (candidates.length === 0) {
        outcomes[index] = { windowId: null, isGhost: true, candidateIds, rolledUp: false }
        continue
      }

      const ranked = sortCandidates(candidates, plan.hierarchy)
      const type = row.observationType ?? null
      const free = ranked.filter(
        (window) => !satisfied.has(satisfiedKey(row.userId, type, window.id)),
      )
      // Toutes les candidates déjà satisfaites ⇒ on conserve la meilleure : la
      // capture tombe bien dans une trame, ce n'est pas une fausse alerte.
      const chosen = free.length > 0 ? free[0] : ranked[0]
      satisfied.add(satisfiedKey(row.userId, type, chosen.id))

      outcomes[index] = {
        windowId: chosen.id,
        isGhost: false,
        candidateIds,
        rolledUp: free.length === 0,
      }
    }
  }

  return outcomes
}

/** Raccourci : attribue un relevé complet en construisant le plan à la volée. */
export function assignWindows(
  rows: readonly AttributionRow[],
  windows: readonly AttributionWindow[],
): AttributionOutcome[] {
  return attributeOccurrences(rows, buildAttributionPlan(windows))
}

// ——— Lecture de la hiérarchie (interface / inspection) ———

/** Identifiants des fenêtres englobantes (ancêtres), de la plus proche à la racine. */
export function ancestorIds(hierarchy: WindowHierarchy, windowId: string): string[] {
  const ancestors: string[] = []
  let current = hierarchy.parentId.get(windowId) ?? null
  const seen = new Set<string>([windowId])
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    ancestors.push(current)
    current = hierarchy.parentId.get(current) ?? null
  }
  return ancestors
}

/** Identifiants de toutes les fenêtres descendantes (enfants, petits-enfants…). */
export function descendantIds(hierarchy: WindowHierarchy, windowId: string): string[] {
  const found: string[] = []
  const stack = [...(hierarchy.childIds.get(windowId) ?? [])]
  const seen = new Set<string>([windowId])
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (seen.has(current)) continue
    seen.add(current)
    found.push(current)
    for (const child of hierarchy.childIds.get(current) ?? []) stack.push(child)
  }
  return found
}
