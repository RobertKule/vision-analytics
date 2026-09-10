import { describe, expect, it } from 'vitest'
import {
  CAPTURE_IMAGE_UNAVAILABLE,
  PRIVATE_IMAGE_CACHE_CONTROL,
  captureImageEndpoint,
  decideCaptureImageAccess,
  safeImageContentType,
  type CaptureImageTarget,
  type CaptureImageViewer,
} from '@/lib/captureImageAccess'

/**
 * PARTIE M — AFFICHAGE SÉCURISÉ DES CAPTURES GOOGLE DRIVE (décision PURE).
 *
 * Les fichiers Drive restent PRIVÉS. L'application les affiche via un endpoint
 * serveur qui vérifie la session ET l'autorisation avant de renvoyer le moindre
 * octet. Un `captureId` falsifié ne donne jamais accès à la capture d'un autre projet.
 */

const CAPTURE: CaptureImageTarget = {
  exists: true,
  projectId: 'project-A',
  observerId: 'observer-1',
  driveFileId: 'drive-file-1',
}

const ADMIN: CaptureImageViewer = { kind: 'admin' }
const ANALYST_ALLOWED: CaptureImageViewer = {
  kind: 'analyst',
  authorizedProjectIds: ['project-A'],
}
const ANALYST_OTHER_PROJECT: CaptureImageViewer = {
  kind: 'analyst',
  authorizedProjectIds: ['project-B'],
}
const OBSERVER_OWNER: CaptureImageViewer = {
  kind: 'observer',
  userId: 'observer-1',
  scopedProjectId: 'project-A',
}
const OBSERVER_OTHER: CaptureImageViewer = {
  kind: 'observer',
  userId: 'observer-2',
  scopedProjectId: 'project-A',
}
const NO_SESSION: CaptureImageViewer = { kind: 'none' }

describe('M1–M2 — session requise', () => {
  it('M1 : une session autorisée obtient le fichier', () => {
    const decision = decideCaptureImageAccess({ viewer: ADMIN, target: CAPTURE })
    expect(decision).toEqual({ ok: true, driveFileId: 'drive-file-1' })
  })

  it('M2 : sans session, l’accès est refusé (401) sans révéler l’existence', () => {
    const decision = decideCaptureImageAccess({ viewer: NO_SESSION, target: CAPTURE })
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.reason).toBe('no-session')
      expect(decision.status).toBe(401)
    }
  })

  it('M2 : même une capture inexistante est refusée en 401 sans session', () => {
    const decision = decideCaptureImageAccess({
      viewer: NO_SESSION,
      target: { exists: false },
    })
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.status).toBe(401)
  })
})

describe('M3 + M11 — cloisonnement par projet', () => {
  it('M3 : un analyste autorisé sur un AUTRE projet est refusé (403)', () => {
    const decision = decideCaptureImageAccess({
      viewer: ANALYST_OTHER_PROJECT,
      target: CAPTURE,
    })
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.reason).toBe('forbidden')
      expect(decision.status).toBe(403)
    }
  })

  it('M11 : un captureId falsifié pointant vers un autre projet est refusé', () => {
    // Le client fournit un identifiant arbitraire ; le projet RÉEL de la capture
    // (lu en base) est comparé au périmètre autorisé — jamais l'inverse.
    const forged: CaptureImageTarget = { ...CAPTURE, projectId: 'project-Z' }
    const decision = decideCaptureImageAccess({ viewer: ANALYST_ALLOWED, target: forged })
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('forbidden')
  })

  it('M11 : un observateur dont la portée vise un autre projet est refusé', () => {
    const decision = decideCaptureImageAccess({
      viewer: { kind: 'observer', userId: 'observer-1', scopedProjectId: 'project-B' },
      target: CAPTURE,
    })
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('forbidden')
  })
})

describe('M4–M6 — état du fichier Drive', () => {
  it('M4 : un driveFileId valide est renvoyé pour la lecture serveur', () => {
    const decision = decideCaptureImageAccess({ viewer: ANALYST_ALLOWED, target: CAPTURE })
    expect(decision.ok).toBe(true)
    if (decision.ok) expect(decision.driveFileId).toBe('drive-file-1')
  })

  it('M5 : un driveFileId absent donne « Image indisponible » (404)', () => {
    const decision = decideCaptureImageAccess({
      viewer: ADMIN,
      target: { ...CAPTURE, driveFileId: null },
    })
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.reason).toBe('no-file')
      expect(decision.status).toBe(404)
    }
  })

  it('M5 : un driveFileId vide ou fait d’espaces est traité comme absent', () => {
    const decision = decideCaptureImageAccess({
      viewer: ADMIN,
      target: { ...CAPTURE, driveFileId: '   ' },
    })
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toBe('no-file')
  })

  it('M6 : une capture inexistante est refusée en 404', () => {
    const decision = decideCaptureImageAccess({ viewer: ADMIN, target: { exists: false } })
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.reason).toBe('not-found')
      expect(decision.status).toBe(404)
    }
  })
})

describe('M7–M9 — Content-Type correct', () => {
  it('M7–M8 : WebP est servi tel quel', () => {
    expect(safeImageContentType('image/webp')).toBe('image/webp')
    expect(safeImageContentType('image/webp; charset=binary')).toBe('image/webp')
  })

  it('M9 : PNG et JPEG sont servis tels quels', () => {
    expect(safeImageContentType('image/png')).toBe('image/png')
    expect(safeImageContentType('image/jpeg')).toBe('image/jpeg')
    expect(safeImageContentType('image/jpg')).toBe('image/jpeg')
    expect(safeImageContentType('image/gif')).toBe('image/gif')
  })

  it('un type absent retombe sur le format des captures (WebP)', () => {
    expect(safeImageContentType(null)).toBe('image/webp')
    expect(safeImageContentType('')).toBe('image/webp')
  })

  it('un type non-image n’est jamais interprété par le navigateur', () => {
    expect(safeImageContentType('text/html')).toBe('application/octet-stream')
    expect(safeImageContentType('application/javascript')).toBe('application/octet-stream')
  })
})

describe('M10 — aucun fichier rendu public', () => {
  it('l’application n’expose que l’endpoint serveur, jamais un lien Drive', () => {
    const endpoint = captureImageEndpoint('obs-42')
    expect(endpoint).toBe('/api/captures/obs-42/image')
    expect(endpoint).not.toContain('drive.google.com')
  })

  it('l’identifiant est encodé (aucune injection de chemin)', () => {
    expect(captureImageEndpoint('a/b?c')).toBe('/api/captures/a%2Fb%3Fc/image')
  })

  it('le cache reste PRIVÉ (jamais un cache partagé pour une image privée)', () => {
    expect(PRIVATE_IMAGE_CACHE_CONTROL).toContain('private')
    expect(PRIVATE_IMAGE_CACHE_CONTROL).not.toContain('public')
  })
})

describe('M12–M14 — les trois profils', () => {
  it('M12 : ADMIN voit n’importe quelle capture', () => {
    expect(decideCaptureImageAccess({ viewer: ADMIN, target: CAPTURE }).ok).toBe(true)
    expect(
      decideCaptureImageAccess({ viewer: ADMIN, target: { ...CAPTURE, projectId: 'autre' } }).ok,
    ).toBe(true)
  })

  it('M13 : ANALYSTE voit les captures de ses projets autorisés', () => {
    expect(decideCaptureImageAccess({ viewer: ANALYST_ALLOWED, target: CAPTURE }).ok).toBe(true)
    expect(decideCaptureImageAccess({ viewer: ANALYST_OTHER_PROJECT, target: CAPTURE }).ok).toBe(
      false,
    )
  })

  it('M14 : OBSERVATEUR ne voit QUE ses propres captures', () => {
    expect(decideCaptureImageAccess({ viewer: OBSERVER_OWNER, target: CAPTURE }).ok).toBe(true)
    const foreign = decideCaptureImageAccess({ viewer: OBSERVER_OTHER, target: CAPTURE })
    expect(foreign.ok).toBe(false)
    if (!foreign.ok) expect(foreign.reason).toBe('forbidden')
  })

  it('un observateur connecté sans portée projet reste limité à ses captures', () => {
    const viewer: CaptureImageViewer = {
      kind: 'observer',
      userId: 'observer-1',
      scopedProjectId: null,
    }
    expect(decideCaptureImageAccess({ viewer, target: CAPTURE }).ok).toBe(true)
    expect(
      decideCaptureImageAccess({ viewer, target: { ...CAPTURE, observerId: 'autre' } }).ok,
    ).toBe(false)
  })
})

describe('M6 — message d’erreur unique', () => {
  it('affiche « Image indisponible » sans détail technique', () => {
    expect(CAPTURE_IMAGE_UNAVAILABLE).toBe('Image indisponible')
    expect(CAPTURE_IMAGE_UNAVAILABLE).not.toMatch(/drive|404|token|erreur/i)
  })
})
