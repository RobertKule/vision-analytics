/**
 * Calcul de la « couverture par type d’observation » d’une session.
 *
 * Un projet peut configurer des types d’observation attendus (ex. « Faune
 * détectée », « 100m oblique »). Pour que les résultats soient exploitables, on
 * compare les types réellement capturés aux types requis du projet : c’est ce
 * qui alimente la progression « X types sur Y complétés », l’avertissement des
 * types en attente et la confirmation explicite avant une soumission incomplète.
 *
 * Règles :
 *  - un type requis est « complété » dès qu’au moins une capture lui est
 *    attribuée (comparaison insensible à la casse, espaces marginalisés) ;
 *  - les types requis vides ou en double sont ignorés ;
 *  - sans type requis configuré, la couverture est trivialement complète.
 *
 * Fonction pure (aucun accès navigateur) — testable unitairement.
 */

export type CaptureTypeLike = {
  observationType?: string | null
}

export type TypeCompletion = {
  /** Types requis ayant au moins une capture (ordre du projet). */
  completedTypes: string[]
  /** Types requis sans aucune capture (ordre du projet). */
  pendingTypes: string[]
  /** Nombre de captures attribuées à chaque type requis. */
  typeCounts: Record<string, number>
  /** Nombre de captures sans type renseigné (type requis non fourni). */
  untypedCount: number
  completedCount: number
  pendingCount: number
  /** Nombre de types requis configurables (hors vide/doublon). */
  totalRequired: number
  allRequiredCovered: boolean
  /** Vrai quand aucun type requis n’est configuré. */
  notApplicable: boolean
}

/** Normalise un libellé de type pour la comparaison (minuscules, espaces plats). */
function keyOf(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/** Nettoie la liste des types requis : non vides, sans doublon, ordre conservé. */
export function cleanRequiredTypes(requiredTypes: readonly string[]): string[] {
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const raw of requiredTypes ?? []) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = keyOf(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(trimmed)
  }
  return cleaned
}

/**
 * Compare les types réellement capturés aux types requis du projet.
 */
export function computeTypeCompletion(
  requiredTypes: readonly string[],
  captures: readonly CaptureTypeLike[],
): TypeCompletion {
  const clean = cleanRequiredTypes(requiredTypes)
  if (clean.length === 0) {
    return {
      completedTypes: [],
      pendingTypes: [],
      typeCounts: {},
      untypedCount: 0,
      completedCount: 0,
      pendingCount: 0,
      totalRequired: 0,
      allRequiredCovered: true,
      notApplicable: true,
    }
  }

  const indexByKey = new Map<string, number>()
  clean.forEach((type, index) => indexByKey.set(keyOf(type), index))

  const typeCounts: Record<string, number> = {}
  clean.forEach((type) => {
    typeCounts[type] = 0
  })

  let untypedCount = 0
  for (const capture of captures ?? []) {
    const raw = capture?.observationType
    if (typeof raw !== 'string' || !raw.trim()) {
      untypedCount += 1
      continue
    }
    const key = keyOf(raw)
    const index = indexByKey.get(key)
    if (index === undefined) continue // type hors liste : non compté dans la couverture
    typeCounts[clean[index]] += 1
  }

  const completedTypes = clean.filter((type) => typeCounts[type] > 0)
  const pendingTypes = clean.filter((type) => typeCounts[type] === 0)

  return {
    completedTypes,
    pendingTypes,
    typeCounts,
    untypedCount,
    completedCount: completedTypes.length,
    pendingCount: pendingTypes.length,
    totalRequired: clean.length,
    allRequiredCovered: pendingTypes.length === 0,
    notApplicable: false,
  }
}
