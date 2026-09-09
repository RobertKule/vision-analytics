/**
 * Crypto des jetons d'accès observateur (« lien de partage ») — côté serveur uniquement.
 *
 * SÉCURITÉ (voir `prisma/schema.prisma` → ObserverAccessToken) :
 *  — Le jeton BRUT (raw) est une chaîne aléatoire de 256 bits (32 octets), jamais
 *    stockée, jamais journalisée ; seule son empreinte SHA-256 (`tokenHash`) est
 *    persistée en base. Un lien partagé ne peut donc jamais être reconstruit depuis
 *    la base ni depuis les journaux.
 *  — Le cookie de session observateur (`va_observer`) est signé HMAC-SHA256 avec une
 *    clé dérivée (AUTH_SECRET + domaine dédié) et ne porte QUE des identifiants
 *    internes (tokenId, projectId, uid, runId, exp) — jamais le jeton brut.
 *  — Ce module dépend de `node:crypto` : il ne doit JAMAIS être importé par le Proxy
 *    (ex-middleware), contrairement à `session.ts` qui reste sans dépendance Node.
 */
import 'server-only'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getSecret } from '@/lib/session'

export const OBSERVER_COOKIE_NAME = 'va_observer'

/** Durée de vie d'une session observateur ouverte par lien (30 jours, renouvelée). */
export const OBSERVER_SCOPE_TTL_SECONDS = 60 * 60 * 24 * 30

/** Génère un jeton brut haute entropie (256 bits), format base64url. */
export function generateObserverToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Empreinte persistée du jeton brut — seul ce hash est conservé en base. */
export function hashObserverToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

/** Clé HMAC dédiée au cookie de portée observateur (jamais la clé de session brute). */
function scopeHmacKey(): Buffer {
  return createHmac('sha256', getSecret())
    .update('ona-field:observer-scope:v1')
    .digest()
}

/**
 * Contenu signé du cookie de portée observateur.
 * Ne contient aucun secret : uniquement des identifiants internes servant à
 * retrouver le jeton en base (la base reste la seule source de vérité du statut).
 */
export type ObserverCookiePayload = {
  /** id du jeton `ObserverAccessToken` (jamais son hash ni le brut). */
  tokenId: string
  /** Projet auquel le cookie de portée est restreint. */
  projectId: string
  /** Utilisateur OBSERVER rattaché au jeton (créé au premier passage du lien). */
  uid: string
  /** `sessionRunId` émis au premier passage du lien (stable pour toute la session). */
  runId: string
  /** 1 = session déjà clôturée (le cookie n'ouvre plus que la consultation). */
  completed: 0 | 1
  /** Expiration UNIX (secondes). */
  exp: number
}

const b64url = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const unb64url = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

function sign(data: string): string {
  return createHmac('sha256', scopeHmacKey()).update(data, 'utf8').digest('hex')
}

/** Sérialise et signe la portée → valeur du cookie `va_observer`. */
export function signObserverCookie(payload: ObserverCookiePayload): string {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

/** Vérifie la signature et l'expiration d'un cookie `va_observer`. Retourne la portée ou null. */
export function parseObserverCookie(
  value: string | undefined | null,
): ObserverCookiePayload | null {
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null

  const body = value.slice(0, dot)
  const signature = value.slice(dot + 1)
  const expected = sign(body)
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(unb64url(body)) as Partial<ObserverCookiePayload>
    if (!payload || typeof payload.tokenId !== 'string' || !payload.tokenId) return null
    if (typeof payload.projectId !== 'string' || !payload.projectId) return null
    if (typeof payload.uid !== 'string' || !payload.uid) return null
    if (typeof payload.runId !== 'string' || !payload.runId) return null
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return {
      tokenId: payload.tokenId,
      projectId: payload.projectId,
      uid: payload.uid,
      runId: payload.runId,
      completed: payload.completed === 1 ? 1 : 0,
      exp: payload.exp,
    }
  } catch {
    return null
  }
}
