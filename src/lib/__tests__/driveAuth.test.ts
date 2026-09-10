import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  base64UrlDecodeToString,
  base64UrlEncode,
  buildSignedJwt,
  decodeJwt,
  normalizePrivateKeyPem,
  DRIVE_SCOPE,
} from '@/lib/driveAuth'

function testKeyPair(): { privatePem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return { privatePem: privateKey, publicPem: publicKey }
}

describe('base64UrlEncode', () => {
  it('encode sans padding ni caractères non-URL', () => {
    const encoded = base64UrlEncode(Buffer.from([0xfb, 0xff, 0xfe]))
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
  })
  it('est réversible', () => {
    const original = 'ONA Field — captures anonymisées'
    expect(base64UrlDecodeToString(base64UrlEncode(original))).toBe(original)
  })
})

describe('normalizePrivateKeyPem', () => {
  it('convertit les retours à la ligne échappés', () => {
    const raw = '-----BEGIN PRIVATE KEY-----\\nZm9v\\n-----END PRIVATE KEY-----\\n'
    const normalized = normalizePrivateKeyPem(raw)
    expect(normalized).not.toContain('\\n')
    expect(normalized).toContain('\n')
  })
  it('enveloppe une clé nue dans les marqueurs PEM', () => {
    const wrapped = normalizePrivateKeyPem('YWJjZGVm')
    expect(wrapped).toContain('-----BEGIN PRIVATE KEY-----')
    expect(wrapped).toContain('-----END PRIVATE KEY-----')
  })
  it('lève une erreur sur une valeur vide', () => {
    expect(() => normalizePrivateKeyPem('   ')).toThrow()
  })
})

describe('decodeJwt', () => {
  it('rejette une chaîne non-JWT', () => {
    expect(() => decodeJwt('un-seul-segment')).toThrow()
  })
})

describe('portée Google Drive', () => {
  it('utilise la portée COMPLÈTE (accès aux Shared Drives), pas drive.file', () => {
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive')
    expect(DRIVE_SCOPE).not.toContain('drive.file')
  })
})

describe('buildSignedJwt', () => {
  it('produit un JWT RS256 structuré avec les revendications attendues', () => {
    const { privatePem } = testKeyPair()
    const now = 1_700_000_000
    const jwt = buildSignedJwt({
      clientEmail: 'captures@ona-field.iam.gserviceaccount.com',
      privateKeyPem: privatePem,
      scope: DRIVE_SCOPE,
      nowSeconds: now,
    })

    const parts = decodeJwt(jwt)
    const header = JSON.parse(base64UrlDecodeToString(parts.header)) as { alg: string; typ: string }
    const payload = JSON.parse(base64UrlDecodeToString(parts.payload)) as {
      iss: string
      scope: string
      aud: string
      iat: number
      exp: number
    }

    expect(header.alg).toBe('RS256')
    expect(payload.iss).toBe('captures@ona-field.iam.gserviceaccount.com')
    expect(payload.scope).toBe(DRIVE_SCOPE)
    expect(payload.aud).toBe('https://oauth2.googleapis.com/token')
    expect(payload.exp - payload.iat).toBe(3600)
    // Signature non vide (base64url sans padding de 256 octets → 342 caractères).
    expect(parts.signature.length).toBe(342)
  })
})
