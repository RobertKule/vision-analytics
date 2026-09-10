/**
 * Gestion des sessions signées (HMAC-SHA256 via Web Crypto) pour TOUS les rôles
 * (ADMIN, ANALYST, OBSERVER).
 *
 * Aucune dépendance Node (« node:crypto ») : ce module est importable depuis le
 * Proxy (ex-middleware) ET depuis le code serveur classique (Server Actions).
 *
 * Format du jeton : `base64url(payload).base64url(hmac(payload))`
 * Payload JSON : { uid, email, username, role, iat, exp } (horodatages UNIX en secondes).
 */

export const SESSION_COOKIE_NAME = 'va_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 heures

export type SessionRole = 'ADMIN' | 'ANALYST' | 'OBSERVER'

type SessionPayload = {
  uid: string
  email: string
  username: string | null
  role: SessionRole
  iat: number
  exp: number
}

/** Session décodée et vérifiée (exposée aux Server Components / Actions). */
export type Session = Pick<SessionPayload, 'uid' | 'email' | 'username' | 'role'>

/** Alias rétro-compatible pour les helpers « admin » existants. */
export type AdminSession = Session

export function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (secret && secret.trim()) return secret.trim()
  // Clé de développement uniquement — en production AUTH_SECRET est obligatoire.
  if (process.env.NODE_ENV !== 'production') {
    return 'va-dev-secret-do-not-use-in-production'
  }
  throw new Error('[ONA Field] AUTH_SECRET est obligatoire en production.')
}

// ——— Encodage base64url (UTF-8 sûr, sans Buffer) ———

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacSign(
  data: Uint8Array<ArrayBuffer>,
  secret: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// ——— Création / vérification des jetons ———

export async function createSessionToken(session: {
  uid: string
  email: string
  username?: string | null
  role: SessionRole
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    uid: session.uid,
    email: session.email,
    username: session.username ?? null,
    role: session.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }
  const data = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = bytesToBase64Url(await hmacSign(new TextEncoder().encode(data), getSecret()))
  return `${data}.${signature}`
}

/** Vérifie la signature et la validité temporelle d'un jeton. Retourne la session ou null. */
export async function parseSessionToken(token: string | undefined | null): Promise<Session | null> {
  const inspected = await inspectSessionToken(token)
  return inspected.state === 'active' ? inspected.session : null
}

/**
 * Diagnostic d'un jeton de session — distingue explicitement l'ABSENCE de session
 * d'une session EXPIRÉE (messages différents côté produit, cf. « vérification de
 * session »). Un jeton mal signé ou illisible est traité comme absent : on ne
 * révèle jamais pourquoi il est invalide.
 */
export type SessionInspection =
  | { state: 'active'; session: Session; expiresAt: number }
  | { state: 'missing' }
  | { state: 'expired'; expiresAt: number }

export async function inspectSessionToken(
  token: string | undefined | null,
): Promise<SessionInspection> {
  if (!token) return { state: 'missing' }
  const dotIndex = token.indexOf('.')
  if (dotIndex <= 0) return { state: 'missing' }

  const data = token.slice(0, dotIndex)
  const signature = token.slice(dotIndex + 1)

  try {
    const expected = bytesToBase64Url(await hmacSign(new TextEncoder().encode(data), getSecret()))
    if (!constantTimeEqual(base64UrlToBytes(signature), base64UrlToBytes(expected))) {
      return { state: 'missing' }
    }

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(data))) as SessionPayload
    const now = Math.floor(Date.now() / 1000)
    const isKnownRole = payload.role === 'ADMIN' || payload.role === 'ANALYST' || payload.role === 'OBSERVER'
    if (!payload.uid || !payload.exp || !isKnownRole) return { state: 'missing' }
    // Signature valide mais durée dépassée : la session a EXPIRÉ (état distinct).
    if (payload.exp <= now) return { state: 'expired', expiresAt: payload.exp }

    return {
      state: 'active',
      expiresAt: payload.exp,
      session: {
        uid: payload.uid,
        email: payload.email,
        username: typeof payload.username === 'string' ? payload.username : null,
        role: payload.role,
      },
    }
  } catch {
    return { state: 'missing' }
  }
}
