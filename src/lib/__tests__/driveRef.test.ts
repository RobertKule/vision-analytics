import { describe, expect, it } from 'vitest'
import {
  driveDownloadUrl,
  driveFileIdFromReference,
  driveFileIdFromUrl,
  driveMediaApiUrl,
  driveViewUrl,
  isDriveFileId,
  isDrivePublicUrl,
} from '@/lib/driveRef'

const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ab'

describe('isDriveFileId', () => {
  it('accepte un identifiant Google Drive opaque', () => {
    expect(isDriveFileId(FILE_ID)).toBe(true)
  })
  it('rejette les valeurs trop courtes / hors alphabet', () => {
    expect(isDriveFileId('short')).toBe(false)
    expect(isDriveFileId('')).toBe(false)
    expect(isDriveFileId(null)).toBe(false)
    expect(isDriveFileId('https://example.com/x')).toBe(false)
  })
})

describe('isDrivePublicUrl', () => {
  it('reconnaît les hôtes publics Google Drive', () => {
    expect(isDrivePublicUrl('https://drive.google.com/uc?export=view&id=x')).toBe(true)
    expect(isDrivePublicUrl('https://drive.usercontent.google.com/download?id=x')).toBe(true)
  })
  it('rejette URL invalide ou hors Drive', () => {
    expect(isDrivePublicUrl('https://res.cloudinary.com/x/image/upload/a.png')).toBe(false)
    expect(isDrivePublicUrl('https://www.googleapis.com/drive/v3/files/x')).toBe(false)
    expect(isDrivePublicUrl('pas-une-url')).toBe(false)
    expect(isDrivePublicUrl(null)).toBe(false)
  })
})

describe('driveFileIdFromUrl', () => {
  it('extrait le fileId de la forme uc?export=view|download&id=', () => {
    expect(driveFileIdFromUrl(`https://drive.google.com/uc?export=view&id=${FILE_ID}`)).toBe(FILE_ID)
    expect(driveFileIdFromUrl(`https://drive.google.com/uc?export=download&id=${FILE_ID}&confirm=t`)).toBe(
      FILE_ID,
    )
  })
  it('extrait le fileId de la forme /file/d/<id>/view et open?id=', () => {
    expect(driveFileIdFromUrl(`https://drive.google.com/file/d/${FILE_ID}/view`)).toBe(FILE_ID)
    expect(driveFileIdFromUrl(`https://drive.google.com/open?id=${FILE_ID}`)).toBe(FILE_ID)
  })
  it('renvoie null hors Drive ou sans identifiant exploitable', () => {
    expect(driveFileIdFromUrl('https://example.com/uc?export=view&id=' + FILE_ID)).toBeNull()
    expect(driveFileIdFromUrl(`https://drive.google.com/uc?export=view`)).toBeNull()
    expect(driveFileIdFromUrl('https://drive.google.com/drive/folders/1AbCde')).toBeNull()
    expect(driveFileIdFromUrl('')).toBeNull()
    expect(driveFileIdFromUrl(null)).toBeNull()
  })
})

describe('driveFileIdFromReference', () => {
  it('laisse passer un fileId brut', () => {
    expect(driveFileIdFromReference(FILE_ID)).toBe(FILE_ID)
  })
  it('résout une URL publique en fileId', () => {
    expect(driveFileIdFromReference(`https://drive.google.com/thumbnail?id=${FILE_ID}&sz=w640`)).toBe(
      FILE_ID,
    )
  })
  it('renvoie null pour une référence étrangère', () => {
    expect(driveFileIdFromReference('vision-analytics/annotations/abc')).toBeNull()
  })
})

describe('URLs dérivées', () => {
  it('construit des URLs publiques cohérentes et réversibles', () => {
    const view = driveViewUrl(FILE_ID)
    expect(view).toContain('export=view')
    expect(driveFileIdFromUrl(view)).toBe(FILE_ID)

    const download = driveDownloadUrl(FILE_ID)
    expect(download).toContain('export=download')
    expect(driveFileIdFromUrl(download)).toBe(FILE_ID)
  })
  it('construit l’URL média API pour la lecture serveur', () => {
    const media = driveMediaApiUrl(FILE_ID)
    expect(media).toContain('www.googleapis.com/drive/v3/files/')
    expect(media).toContain('alt=media')
    expect(media).toContain(encodeURIComponent(FILE_ID))
  })
})
