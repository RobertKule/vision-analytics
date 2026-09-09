import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveDriveConfig } from '@/lib/driveConfig'
import { requestDriveAccessToken } from '@/lib/driveAuth'
import { deleteDriveFile, DriveHttpError, uploadCaptureImage } from '@/lib/drive'

/**
 * Test d'intégration RÉEL Google Drive (mission : ne pas déclarer terminé sans un
 * upload réel). Désactivé par défaut — exécution volontaire uniquement :
 *
 *   RUN_DRIVE_LIVE=1 npx vitest run src/lib/__tests__/driveLive.test.ts
 *
 * Aucun secret n'est loggé ni comparé : on n'affiche que des booléens/présence et
 * les réponses d'erreur de l'API Google (jamais de clé, de jeton ni de mot de passe).
 * Un fichier de test est créé puis supprimé dans le stockage (aucun orphelin laissé).
 */
const RUN_LIVE = process.env.RUN_DRIVE_LIVE === '1'

/** Recharge les variables Google Drive depuis `.env` si absentes (sans jamais les afficher). */
function loadDriveEnv(): void {
  if (process.env.GOOGLE_DRIVE_CLIENT_EMAIL) return
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*(GOOGLE_DRIVE_[A-Z_]+)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      let value = match[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[match[1]]) process.env[match[1]] = value
    }
  } catch (error) {
    console.warn('[DriveLive] Aucun .env lisible :', error)
  }
}

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const DRIVE_API = 'https://www.googleapis.com'

describe.skipIf(!RUN_LIVE)('Google Drive — intégration réelle (RUN_DRIVE_LIVE=1)', () => {
  let clientEmail: string
  let folderId: string | null
  let accessToken: string

  beforeAll(async () => {
    loadDriveEnv()
    const config = resolveDriveConfig()
    if (!config) throw new Error('Configuration Google Drive absente (GOOGLE_DRIVE_CLIENT_EMAIL/PRIVATE_KEY).')
    clientEmail = config.clientEmail
    folderId = config.folderId
    const token = await requestDriveAccessToken({
      clientEmail,
      privateKeyPem: config.privateKeyPem,
    })
    accessToken = token.access_token
    expect(accessToken.length).toBeGreaterThan(20)
    console.log('[DriveLive] access_token obtenu (length>0), clientEmail renseigné.')
  })

  async function driveGet(pathAndQuery: string): Promise<{ status: number; json: Record<string, unknown> }> {
    const response = await fetch(`${DRIVE_API}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return { status: response.status, json }
  }

  async function drivePost(
    pathAndQuery: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const response = await fetch(`${DRIVE_API}${pathAndQuery}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return { status: response.status, json }
  }

  it('détermine le compte réellement authentifié et le compare au GOOGLE_DRIVE_CLIENT_EMAIL', async () => {
    const about = await driveGet('/drive/v3/about?fields=user(emailAddress)')
    console.log(`[DriveLive] /about → HTTP ${about.status}`)
    expect(about.status).toBe(200)
    const email = (about.json as { user?: { emailAddress?: string } }).user?.emailAddress ?? ''
    console.log(`[DriveLive] compte authentifié = clientEmail attendu → ${email === clientEmail}`)
  })

  it('confirme l’accès au dossier GOOGLE_DRIVE_FOLDER_ID et détecte un éventuel Shared Drive', async () => {
    if (!folderId) {
      console.log('[DriveLive] Aucun GOOGLE_DRIVE_FOLDER_ID : dossier non configuré, étape ignorée.')
      return
    }
    const meta = await driveGet(
      `/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,driveId&supportsAllDrives=true`,
    )
    console.log(`[DriveLive] folder metadata → HTTP ${meta.status}`)
    expect(meta.status).toBe(200)
    const file = meta.json as { name?: string; mimeType?: string; driveId?: string | null }
    console.log(
      `[DriveLive] dossier visible=${file.name !== undefined} name="${file.name ?? ''}" mime=${file.mimeType ?? ''}`,
    )
    console.log(`[DriveLive] dans un Shared Drive → ${Boolean(file.driveId)}`)
  })

  it('crée un fichier de test dans la racine du compte de service puis le supprime', async () => {
    const created = await drivePost('/drive/v3/files?fields=id&supportsAllDrives=true', {
      name: `ona-field-diag-${Date.now()}.txt`,
      mimeType: 'text/plain',
    })
    console.log(`[DriveLive] create (racine SA, sans folder) → HTTP ${created.status}`)
    expect(created.status).toBe(200)
    const id = (created.json as { id?: string }).id
    expect(id).toBeTruthy()
    const delResponse = await fetch(
      `${DRIVE_API}/drive/v3/files/${encodeURIComponent(id as string)}?supportsAllDrives=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    console.log(`[DriveLive] delete racine → HTTP ${delResponse.status}`)
    expect(delResponse.status === 200 || delResponse.status === 204).toBe(true)
  })

  it('upload complet via uploadCaptureImage (dossier configuré) puis suppression', async () => {
    const stamp = Date.now()
    let uploadedId: string | null = null
    try {
      const uploaded = await uploadCaptureImage(TINY_PNG, { fileName: `ona-field-diag-${stamp}` })
      uploadedId = uploaded.driveFileId
      console.log('[DriveLive] uploadCaptureImage OK → driveFileId retourné, imageUrl publique.')
      const meta = await driveGet(
        `/drive/v3/files/${encodeURIComponent(uploaded.driveFileId)}?fields=id,name&supportsAllDrives=true`,
      )
      console.log(`[DriveLive] metadata du fichier créé → HTTP ${meta.status} name="${(meta.json as { name?: string }).name ?? ''}"`)
      expect(meta.status).toBe(200)
      expect(uploaded.imageUrl).toContain('drive.google.com')
    } finally {
      if (uploadedId) {
        const result = await deleteDriveFile(uploadedId)
        console.log(`[DriveLive] delete fichier de test → ok=${result.ok}`)
        expect(result.ok).toBe(true)
      }
    }
  })

  it('documente la limite du compte de service : écriture de contenu à la racine SA (sans Shared Drive)', async () => {
    // Résultat RÉEL constaté : un compte de service SANS Google Shared Drive ne peut pas
    // écrire d'octets dans son propre « My Drive » → HTTP 403 « Service Accounts do not
    // have storage quota ». C'est une limite Google connue : le dossier cible DOIT être
    // dans un Shared Drive dont le compte de service est membre. Ce sous-test passe dès
    // lors que la réponse est CETTE limite documentée (403 quota) — ou qu'un upload a
    // réussi (config corrigée) — et échoue sinon.
    const previousFolder = process.env.GOOGLE_DRIVE_FOLDER_ID
    process.env.GOOGLE_DRIVE_FOLDER_ID = ''
    const stamp = Date.now()
    let uploadedId: string | null = null
    try {
      const uploaded = await uploadCaptureImage(TINY_PNG, { fileName: `ona-field-root-${stamp}` })
      uploadedId = uploaded.driveFileId
      console.log('[DriveLive] uploadCaptureImage (racine SA) a RÉUSSI (Shared Drive activé ?) → nettoyage.')
      expect(uploaded.imageUrl).toContain('drive.google.com')
    } catch (error) {
      if (error instanceof DriveHttpError && error.status === 403) {
        console.log(
          '[DriveLive] upload racine SA → HTTP 403 (Service Account sans quota de stockage) — ' +
            'limite documentée : un dossier dans un Shared Drive est requis.',
        )
        return
      }
      throw error
    } finally {
      process.env.GOOGLE_DRIVE_FOLDER_ID = previousFolder
      if (uploadedId) {
        const result = await deleteDriveFile(uploadedId)
        console.log(`[DriveLive] delete fichier racine → ok=${result.ok}`)
        expect(result.ok).toBe(true)
      }
    }
  })

  afterAll(() => {
    console.log('[DriveLive] Terminé. Aucun secret affiché.')
  })
})
