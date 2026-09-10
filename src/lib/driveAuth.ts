/**
 * Google Drive — authentification serveur (compte de service, OAuth2 JWT → bearer).
 *
 * Implémentation sans SDK : signature RS256 du jeton JWT via `node:crypto`, puis échange
 * du jeton contre un `access_token` auprès de `https://oauth2.googleapis.com/token`.
 * Aucune variable d'environnement n'est lue ici — les identifiants sont injectés par
 * `drive.ts` (résolution paresseuse). Toutes les fonctions sont pures / injectables afin
 * d'être testées sans réseau réel.
 *
 * RÈGLE DE SÉCURITÉ : ce module est SERVEUR UNIQUEMENT. Il ne doit jamais être importé
 * depuis un composant client (`'use client'`) ni exposé au navigateur.
 */

import { createSign } from 'node:crypto'

/** Encode un Buffer/string en base64url (sans padding). */
export function base64UrlEncode(data: Buffer | string): string {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Décode un segment base64url en chaîne UTF-8 (pour vérification dans les tests). */
export function base64UrlDecodeToString(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf8')
}

/**
 * Normalise une clé privée RSA issue d'un environnement (littéral `\n` échappés possibles)
 * et garantit la présence des marqueurs PEM BEGIN/END.
 */
export function normalizePrivateKeyPem(raw: string): string {
  let value = (raw ?? '').trim()
  // Un `\n` littéralement échappé (ex. .env entre guillemets) doit devenir un vrai saut de ligne.
  value = value.replace(/\\n/g, '\n')
  if (!value) throw new Error('Clé privée du compte de service Google Drive absente.')
  if (!value.includes('BEGIN PRIVATE KEY')) {
    const body = value.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '').trim()
    value = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`
  }
  return value
}

export type DriveServiceAccountCredentials = {
  clientEmail: string
  privateKeyPem: string
}

/**
 * Portée Google Drive du compte de service.
 *
 * IMPORTANT : on n'utilise PAS `auth/drive.file` (portée « par fichier ») : celle-ci
 * ne donne accès qu'aux fichiers CRÉÉS par le compte de service lui-même. Elle rend
 * invisible (HTTP 404) un dossier de Google Shared Drive créé par un humain puis
 * partagé avec le compte de service. Pour lire/écrire dans un Shared Drive dont le
 * compte de service est membre, il faut la portée COMPLÈTE `auth/drive`.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
/** Audience OAuth2 du serveur de jeton Google. */
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const OAUTH_TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token'
const TOKEN_LIFETIME_SECONDS = 3600

/**
 * Construit l'assertion JWT signée (RS256) présentée au serveur OAuth2 de Google.
 * Renvoie le jeton en trois segments base64url séparés par des points.
 */
export function buildSignedJwt(credentials: {
  clientEmail: string
  privateKeyPem: string
  scope: string
  nowSeconds?: number
}): string {
  const { clientEmail, privateKeyPem, scope } = credentials
  const now = credentials.nowSeconds ?? Math.floor(Date.now() / 1000)

  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: OAUTH_TOKEN_AUDIENCE,
      iat: now,
      exp: now + TOKEN_LIFETIME_SECONDS,
    }),
  )
  const signingInput = `${header}.${payload}`

  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = base64UrlEncode(signer.sign(privateKeyPem))

  return `${signingInput}.${signature}`
}

/** Découpe un JWT en { header, payload, signature } (validation structurelle). */
export function decodeJwt(jwt: string): {
  header: string
  payload: string
  signature: string
} {
  const segments = jwt.split('.')
  if (segments.length !== 3) {
    throw new Error('Jeton JWT invalide : trois segments attendus.')
  }
  return { header: segments[0], payload: segments[1], signature: segments[2] }
}

export type OAuthTokenResponse = { access_token: string; expires_in: number }

/**
 * Échange l'assertion JWT contre un `access_token` Google.
 * `fetchImpl` est injectable pour les tests (aucun réseau réel en test unitaire).
 */
export async function exchangeJwtForAccessToken(
  assertion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const response = await fetchImpl(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Échec de l'obtention du jeton Google Drive (HTTP ${response.status}).${detail ? ` ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new Error('Réponse OAuth2 Google sans access_token.')
  }
  return { access_token: data.access_token, expires_in: data.expires_in ?? TOKEN_LIFETIME_SECONDS }
}

/**
 * Obtient un `access_token` prêt à l'emploi à partir des identifiants du compte de service.
 */
export async function requestDriveAccessToken(
  credentials: DriveServiceAccountCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const assertion = buildSignedJwt({
    clientEmail: credentials.clientEmail,
    privateKeyPem: credentials.privateKeyPem,
    scope: DRIVE_SCOPE,
  })
  return exchangeJwtForAccessToken(assertion, fetchImpl)
}
