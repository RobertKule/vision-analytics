/**
 * Dérivation du nom d'une session d'observation depuis le nom d'un fichier vidéo.
 *
 * Utilisé à la création d'un projet (rattachement de la « vidéo cible ») pour
 * proposer automatiquement le nom par défaut de la session d'observation. Un nom
 * saisi par l'utilisateur n'est jamais écrasé (cf. CreateProjectForm /
 * AnalystWorkspace) : cette fonction ne fait que proposer un libellé propre.
 *
 * Exemples :
 *   « https://…/100m_oblique_2026_08_15.mp4 » → « 100m_oblique_2026_08_15 »
 *   « C:\clips\session nid  v2.webm »        → « session nid v2 »
 */

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mov',
  'mkv',
  'avi',
  'm4v',
  'ogv',
  'mpg',
  'mpeg',
  'wmv',
  'flv',
  '3gp',
])

/**
 * Extrait un nom lisible depuis une URL ou un nom de fichier vidéo (extension
 * retirée, caractères indésirables nettoyés, espaces multiples réduits).
 * Retourne null si aucune partie exploitable n'est trouvée.
 */
export function deriveObservationNameFromVideo(value: string | null | undefined): string | null {
  if (!value) return null
  let raw = value.trim()
  if (!raw) return null

  // Dernier segment (chemin d'URL ou de système de fichiers).
  raw = raw.split(/[\\/]/).pop() ?? raw
  // On retire la query string et l'ancre éventuelles.
  raw = raw.split('?')[0] ?? raw
  raw = raw.split('#')[0] ?? raw

  try {
    raw = decodeURIComponent(raw)
  } catch {
    // libellé brut déjà acceptable
  }

  // Retrait de l'extension vidéo (uniquement si elle est reconnue).
  const dot = raw.lastIndexOf('.')
  if (dot > 0) {
    const extension = raw.slice(dot + 1).toLowerCase()
    if (VIDEO_EXTENSIONS.has(extension)) raw = raw.slice(0, dot)
  }

  // Nettoyage : caractères hostiles retirés d'abord, puis espaces multiples réduits
  // (un symbole retiré — °, tiret cadratin, émoji — laissait sinon deux espaces).
  raw = raw.replace(/[^\p{L}\p{N}_.\- ]/gu, '')
  raw = raw.replace(/\s+/g, ' ').trim()
  raw = raw.replace(/\.\.+/g, '.').replace(/_+/g, '_').replace(/\s*_\s*/g, '_')
  raw = raw.replace(/^[.\-_ ]+|[.\-_ ]+$/g, '')

  if (raw.length === 0) return null
  return raw.length > 80 ? raw.slice(0, 80).trimEnd() : raw
}
