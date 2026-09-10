import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { readObserverScopeFromCookies, resolveObserverGate } from '@/lib/observerAccess'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { fetchDriveFileBytes } from '@/lib/drive'
import { driveFileIdFromReference } from '@/lib/driveRef'
import {
  CAPTURE_IMAGE_UNAVAILABLE,
  PRIVATE_IMAGE_CACHE_CONTROL,
  decideCaptureImageAccess,
  safeImageContentType,
  type CaptureImageTarget,
  type CaptureImageViewer,
} from '@/lib/captureImageAccess'

/**
 * AFFICHAGE SÉCURISÉ D'UNE CAPTURE GOOGLE DRIVE.
 *
 *   capture → driveFileId → endpoint serveur sécurisé → vérification session /
 *   autorisation → récupération Google Drive (compte de service, `supportsAllDrives`)
 *   → contenu image → navigateur.
 *
 * Les fichiers Drive restent PRIVÉS : aucune permission publique n'est posée, et
 * aucun identifiant Drive ne sort vers le navigateur. Le pipeline de capture,
 * la compression, `GOOGLE_DRIVE_FOLDER_ID`, le Shared Drive, PostgreSQL, l'offline
 * et les reprises ne sont pas touchés — seule la LECTURE d'affichage passe ici.
 *
 * Un `captureId` falsifié ne donne jamais accès à la capture d'un autre projet :
 * la décision d'accès compare le projet réel de la capture au périmètre autorisé
 * de la session (voir `captureImageAccess.ts`, module pur testé).
 *
 * Toute erreur (capture inexistante, `driveFileId` absent, fichier supprimé, accès
 * refusé, panne Drive) renvoie un statut nu et le message « Image indisponible » —
 * jamais un détail technique.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ captureId: string }>
}

/** Réponse d'échec uniforme : message fixe, aucun détail interne. */
function unavailable(status: number): NextResponse {
  return NextResponse.json(
    { error: CAPTURE_IMAGE_UNAVAILABLE },
    {
      status,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    },
  )
}

/**
 * Résout le profil du demandeur côté serveur — jamais ce que le client prétend être.
 * L'ordre suit la sécurité : ADMIN, puis compte autorisé sur le projet de la capture,
 * puis observateur (compte connecté ou lien d'accès), sinon aucun accès.
 */
async function resolveViewer(projectId: string): Promise<CaptureImageViewer> {
  const session = await getCurrentSession()
  if (session?.role === 'ADMIN') return { kind: 'admin' }

  if (session && session.role === 'ANALYST') {
    const permissions = await getCurrentProjectPermissions(projectId)
    return {
      kind: 'analyst',
      authorizedProjectIds: permissions.canView ? [projectId] : [],
    }
  }

  // Observateur par lien d'accès : la portée est recoupée en base (jeton rattaché à
  // CE projet, non révoqué, non expiré). Une session terminée garde la consultation.
  const gate = await resolveObserverGate(projectId)
  if (gate.ok) {
    return { kind: 'observer', userId: gate.userId, scopedProjectId: projectId }
  }
  // Une portée existante mais pointant vers un AUTRE projet ne donne aucun accès ici.
  const scope = await readObserverScopeFromCookies()
  if (scope) {
    return { kind: 'observer', userId: scope.uid, scopedProjectId: scope.projectId }
  }

  // Compte connecté sans rôle d'analyse (OBSERVER authentifié via /experience).
  if (session) return { kind: 'observer', userId: session.uid, scopedProjectId: null }

  return { kind: 'none' }
}

export async function GET(_request: Request, ctx: RouteContext): Promise<NextResponse> {
  const { captureId } = await ctx.params
  const id = (captureId ?? '').trim()
  if (!id) return unavailable(404)

  const capture = await prisma.observation.findUnique({
    where: { id },
    select: { id: true, projectId: true, userId: true, driveFileId: true, imageUrl: true },
  })

  const target: CaptureImageTarget = capture
    ? {
        exists: true,
        projectId: capture.projectId,
        observerId: capture.userId,
        // `driveFileId` est la référence fiable ; on retombe sur l'URL stockée
        // (même `fileId`) pour les lignes antérieures à la colonne dédiée.
        driveFileId:
          driveFileIdFromReference(capture.driveFileId) ??
          driveFileIdFromReference(capture.imageUrl),
      }
    : { exists: false }

  const viewer = capture ? await resolveViewer(capture.projectId) : await resolveViewer('')
  const decision = decideCaptureImageAccess({ viewer, target })
  if (!decision.ok) return unavailable(decision.status)

  let bytes: { buffer: Buffer; mimeType: string } | null
  try {
    bytes = await fetchDriveFileBytes(decision.driveFileId)
  } catch (error) {
    // Erreur de configuration ou panne transitoire Google Drive : la capture reste
    // en base (aucune donnée supprimée), l'affichage signale seulement l'indisponibilité.
    console.error('[captureImage] Lecture Google Drive impossible :', error)
    return unavailable(502)
  }
  if (!bytes) return unavailable(404)

  return new NextResponse(new Uint8Array(bytes.buffer), {
    status: 200,
    headers: {
      'Content-Type': safeImageContentType(bytes.mimeType),
      'Content-Length': String(bytes.buffer.byteLength),
      // Cache PRIVÉ uniquement : une image privée n'est jamais mise en cache partagé.
      'Cache-Control': PRIVATE_IMAGE_CACHE_CONTROL,
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
