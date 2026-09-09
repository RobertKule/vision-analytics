/**
 * Références Cloudinary — fonctions PURES (aucune dépendance au SDK, testables sans
 * configuration réseau). Utilisées par `cloudinary.ts` et par les tests unitaires.
 */

/** Marqueur présent dans toute URL sécurisée Cloudinary. */
export const CLOUDINARY_UPLOAD_MARKER = '/upload/'

/**
 * Extrait le `public_id` Cloudinary d'une URL sécurisée (`secure_url`), en repli
 * lorsque la référence n'a pas été persistée (lignes historiques). Renvoie `null`
 * si la forme ne correspond pas à un asset Cloudinary exploitable.
 *
 * Exemples acceptés :
 *   https://res.cloudinary.com/<cloud>/image/upload/v1234/vision-analytics/annotations/abc.png
 *     → vision-analytics/annotations/abc
 */
export function cloudinaryPublicIdFromUrl(secureUrl: string): string | null {
  if (!secureUrl) return null
  const markerIndex = secureUrl.indexOf(CLOUDINARY_UPLOAD_MARKER)
  if (markerIndex === -1) return null
  let path = secureUrl.slice(markerIndex + CLOUDINARY_UPLOAD_MARKER.length)
  // Retire le segment de version « v<entier>/ » s'il est présent (URL sans transformation).
  const versionMatch = /^v\d+\//.exec(path)
  if (versionMatch) path = path.slice(versionMatch[0].length)
  // Retire une éventuelle extension de fichier.
  const withoutExtension = path.replace(/\.[a-zA-Z0-9]{1,10}$/, '')
  return withoutExtension.trim() || null
}
