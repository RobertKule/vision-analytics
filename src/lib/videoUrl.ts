/**
 * Validation CÔTÉ CLIENT de l'URL « vidéo cible » saisie à la création d'un
 * projet (jamais importée par des composants serveur). L'observateur charge de
 * toute façon sa propre copie (locale ou distante) : la validation est une
 * assistance éditoriale, pas un garde-fou. Aucun fichier n'est téléversé.
 */

export type VideoUrlStatus = 'ok' | 'invalid' | 'unreachable' | 'unknown'

const REACHABILITY_TIMEOUT_MS = 6000

function isVideoContentType(contentType: string): boolean {
  return contentType.trim().toLowerCase().startsWith('video/')
}

/**
 * 1. Format : URL http(s) valide.
 * 2. Atteignabilité : `HEAD` (repli `GET` range) — acceptée si 2xx/3xx ou si le
 *    `content-type` commence par `video/`.
 * 3. Réseau/CORS indéterminé (ne peut pas prouver) → `'unknown'` : avertissement
 *    non bloquant, le champ est facultatif.
 */
export async function validateVideoUrl(raw: string): Promise<VideoUrlStatus> {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return 'invalid'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'invalid'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS)
  const signal = controller.signal
  const headers: Record<string, string> = { Range: 'bytes=0-1' }
  const url = parsed.toString()

  const settle = () => clearTimeout(timer)

  try {
    const head = await fetch(url, { method: 'HEAD', headers, signal, cache: 'no-store' })
    settle()
    const contentType = head.headers.get('content-type') ?? ''
    const okRange = head.status >= 200 && head.status < 400
    if (okRange && contentType) {
      return isVideoContentType(contentType) ? 'ok' : 'invalid'
    }
    return okRange ? 'ok' : 'unreachable'
  } catch {
    settle()
  }

  // Repli : GET partiel (certains serveurs refusent HEAD).
  try {
    const controller2 = new AbortController()
    const timer2 = setTimeout(() => controller2.abort(), REACHABILITY_TIMEOUT_MS)
    const get = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller2.signal,
      cache: 'no-store',
    })
    clearTimeout(timer2)
    if (get.status >= 200 && get.status < 400) return 'ok'
    return 'unreachable'
  } catch {
    // Réseau ou politique CORS : on ne peut pas trancher.
    return 'unknown'
  }
}
