/**
 * Vidéo de démonstration (landing) — emplacement YouTube.
 *
 * Aucun système de stockage / lecture vidéo interne : le composant « démo »
 * accepte simplement une URL YouTube et, lorsqu'elle est fournie, affiche la
 * vidéo intégrée. Ce module PUR n'extrait que l'identifiant vidéo des formes
 * d'URL usuelles — il ne télécharge rien, ne touche pas au réseau.
 */

const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/

function isVideoId(value: string): boolean {
  return YOUTUBE_ID_PATTERN.test(value)
}

/**
 * Extrait l'identifiant YouTube (11 caractères) d'une URL de partage :
 *   https://www.youtube.com/watch?v=<id>
 *   https://youtu.be/<id>
 *   https://www.youtube.com/embed/<id> · /shorts/<id> · /live/<id> · /v/<id>
 * Retourne `null` si la valeur n'est pas une URL YouTube reconnaissable.
 */
export function extractYoutubeVideoId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (!url) return null

  let host = ''
  let pathname = ''
  let search = ''
  try {
    const parsed = new URL(url)
    host = parsed.hostname.replace(/^www\./, '')
    pathname = parsed.pathname
    search = parsed.search
  } catch {
    return null
  }

  if (host === 'youtu.be') {
    const id = pathname.replace(/^\//, '').split('/')[0] ?? ''
    return isVideoId(id) ? id : null
  }

  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
    return null
  }

  if (pathname === '/watch') {
    const v = new URLSearchParams(search).get('v') ?? ''
    return isVideoId(v) ? v : null
  }

  const embedded = pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/)
  if (embedded && isVideoId(embedded[1])) return embedded[1]

  return null
}

/** URL d'intégration (lecture seule, sans cookies) d'un identifiant vidéo. */
export function youtubeEmbedUrl(videoId: string, autoplay = false): string {
  const base = `https://www.youtube-nocookie.com/embed/${videoId}`
  const params = new URLSearchParams({ rel: '0', color: 'white' })
  if (autoplay) params.set('autoplay', '1')
  return `${base}?${params.toString()}`
}
