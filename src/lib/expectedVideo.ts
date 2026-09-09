/**
 * Validation « vidéo attendue » (Partie Q) — moteur PUR, partagé serveur + client.
 *
 * Le serveur (et lui seul) contrôle que la vidéo réellement observée pour une
 * capture correspond EXACTEMENT à la vidéo configurée pour son type. Ce module est
 * sans effet de bord (aucune importation serveur) : il peut être importé par les
 * actions serveur (`observationActions`) comme par l'annotateur (contrôle client
 * cohérent, Partie U).
 *
 * La comparaison porte sur l'identité complète (jamais un préfixe) : pour une URL
 * http(s), le dernier segment du chemin (décodé) ; sinon le nom de fichier exact.
 * « VID_100M_A.mp4 » attendu → « VID_100M_B.mp4 » refusé, quel que soit le préfixe.
 */

/** Garde-fou sur la taille d'une source / identité vidéo déclarée. */
const VIDEO_SOURCE_MAX_LENGTH = 2000

/** Normalise une source vidéo en identité de comparaison exacte. */
export function normalizeVideoIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().slice(0, VIDEO_SOURCE_MAX_LENGTH)
  if (!trimmed) return null

  // Dernier segment « utile » d'une source qui ressemble à un chemin/URL : on compare
  // le NOM du fichier (jamais un préfixe), jamais des répertoires ou une query. Un nom
  // de fichier simple est conservé tel quel.
  const tailOf = (path: string): string => {
    const withoutSuffix = path.split(/[?#]/)[0] ?? ''
    const segments = withoutSuffix.split(/[/\\]/).filter((segment) => segment.length > 0)
    return segments.length > 0 ? segments[segments.length - 1] : path
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const decoded = decodeURIComponent(tailOf(url.pathname)).trim()
      return decoded || null
    } catch {
      return tailOf(trimmed) || null
    }
  }
  if (/[/\\]/.test(trimmed)) {
    return tailOf(trimmed).trim() || null
  }
  return trimmed
}

/** Ligne de configuration vidéo du projet (une `Video`) utilisée par la vérification. */
export type VideoConfigRow = { id: string; typeLabel: string | null; source: string }

/** Résultat de la vérification de la vidéo attendue d'une capture. */
export type ExpectedVideoCheck =
  | { ok: true }
  | {
      ok: false
      /**
       * Motif machine — un SEUL message utilisateur sûr est affiché, quel que soit
       * le motif (vocabulaire fixe, jamais de détail interne).
       */
      reason: 'unknown-pass' | 'type-requires-its-video' | 'source-required' | 'source-mismatch'
    }

function compareExpectedSource(
  expectedSource: string | null | undefined,
  declaredSource: string | null,
): ExpectedVideoCheck {
  const expectedIdentity = normalizeVideoIdentity(expectedSource)
  // Aucune vidéo attendue configurée (projet sans vidéo fournie) : rien à refuser.
  if (expectedIdentity === null) return { ok: true }
  const declaredIdentity = normalizeVideoIdentity(declaredSource)
  if (declaredIdentity === null) return { ok: false, reason: 'source-required' }
  if (declaredIdentity !== expectedIdentity) return { ok: false, reason: 'source-mismatch' }
  return { ok: true }
}

/**
 * Vérifie, pour une capture, que sa vidéo d'origine correspond à la configuration
 * attendue de son type (Q1–Q4) :
 *  — une capture émise depuis une passe vidéo réelle cite CETTE passe (`videoId`) :
 *    toute autre valeur est un contournement (passe inconnue / hors projet) ;
 *  — un type lié à une vidéo attendue ne peut être produit que par SA passe typée,
 *    jamais par une passe générique ni une passe d'un autre type ;
 *  — la vidéo réellement observée doit égaler la vidéo attendue, sans préfixe.
 */
export function checkExpectedVideo(options: {
  videoId: string | null
  observationType: string
  declaredSource: string | null
  videoUrl: string | null
  videos: VideoConfigRow[]
}): ExpectedVideoCheck {
  const { videoId, observationType } = options
  const labelKey = (value: string | null | undefined): string =>
    (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  const wantedKey = labelKey(observationType)
  const videosTypedForType = options.videos.filter(
    (video) => video.typeLabel && labelKey(video.typeLabel) === wantedKey,
  )

  if (videoId !== null) {
    const video = options.videos.find((item) => item.id === videoId)
    if (!video) return { ok: false, reason: 'unknown-pass' }
    if (videosTypedForType.length > 0) {
      // Le type réclame SA vidéo : seules les passes typées de ce type conviennent.
      if (!videosTypedForType.some((item) => item.id === video.id)) {
        return { ok: false, reason: 'type-requires-its-video' }
      }
    }
    // Vidéo attendue = la source configurée de la passe réellement observée.
    return compareExpectedSource(video.source, options.declaredSource)
  }

  // Aucun `videoId` = passe « générique héritée » (projet à vidéo unique, sans `Video`).
  if (options.videos.length > 0) {
    // Projet moderne : chaque passe réelle porte son id — un `videoId` absent est un
    // contournement (surtout pour un type lié à une vidéo attendue).
    if (videosTypedForType.length > 0) return { ok: false, reason: 'type-requires-its-video' }
    return { ok: false, reason: 'unknown-pass' }
  }
  // Projet hérité : la vidéo attendue est l'unique vidéo du projet (`Project.videoUrl`).
  return compareExpectedSource(options.videoUrl, options.declaredSource)
}

/** Message utilisateur unique et sûr des refus de vidéo (vocabulaire fixe, Partie Q). */
export const EXPECTED_VIDEO_REFUSAL = {
  en: 'Video not authorized — this video does not match the video configured for this observation type. Please use the video provided by the administrator.',
  fr: 'Vidéo non autorisée — cette vidéo ne correspond pas à la vidéo configurée pour ce type d’observation. Veuillez utiliser la vidéo fournie par l’administrateur.',
} as const

/**
 * Identité de la vidéo réellement observée (Parties Q/U) : le nom du fichier local
 * quand un fichier est chargé, sinon l'URL distante diffusée par référence, sinon
 * `null` (rien de chargé). Source unique partagée entre l'annotateur et la
 * vérification serveur — le client envoie exactement cette identité dans chaque
 * capture (`videoSource`), le serveur la compare ensuite à la vidéo attendue.
 */
export function declaredVideoIdentity(
  fileName: string | null | undefined,
  videoUrl: string | null | undefined,
): string | null {
  if (typeof fileName === 'string' && fileName.trim()) return fileName.trim()
  if (typeof videoUrl === 'string' && /^https?:\/\//i.test(videoUrl)) return videoUrl
  return null
}

/** État de la relation « vidéo chargée vs vidéo attendue » affiché et appliqué côté client (Partie U). */
export type ExpectedVideoClientState = {
  /** Identité attendue de la passe active (`null` = aucune contrainte configurée). */
  expectedIdentity: string | null
  /** Identité effectivement chargée (`null` = rien de chargé). */
  loadedIdentity: string | null
  /** Vrai quand une vidéo attendue existe, une vidéo est chargée, et elles diffèrent (comparaison exacte). */
  mismatch: boolean
}

/**
 * Contrôle client cohérent avec la validation serveur (Partie U) : compare la vidéo
 * réellement chargée à la vidéo configurée de la passe active, avec la même
 * normalisation exacte que le serveur (jamais une acceptation par préfixe). L'annotateur
 * désactive l'annotation tant que `mismatch` est vrai et affiche `EXPECTED_VIDEO_REFUSAL`.
 */
export function expectedVideoClientState(input: {
  /** Source configurée de la passe active (la vidéo attendue du type). */
  expectedSource: string | null | undefined
  fileName: string | null | undefined
  videoUrl: string | null | undefined
}): ExpectedVideoClientState {
  const expectedIdentity = normalizeVideoIdentity(input.expectedSource)
  const loadedIdentity = normalizeVideoIdentity(
    declaredVideoIdentity(input.fileName, input.videoUrl),
  )
  return {
    expectedIdentity,
    loadedIdentity,
    mismatch:
      expectedIdentity !== null && loadedIdentity !== null && loadedIdentity !== expectedIdentity,
  }
}
