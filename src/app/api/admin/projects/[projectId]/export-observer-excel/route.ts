import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { brandFileName, sanitizeBaseName, videoDisplayName } from '@/lib/exportHelpers'
import type {
  GlobalExportPoint,
  GlobalExportRow,
  GlobalExportSource,
} from '@/lib/globalExportModel'
import { computeDefinedPointsByType } from '@/lib/globalExportModel'
import { generateObserverWorkbook } from '@/lib/serverGlobalWorkbook'
import { observerDisplayLabel, observerKeyName } from '@/lib/serverExport'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ExportContext = {
  params: Promise<{ projectId: string }>
}

/**
 * « Export Observateur (Excel) » — classeur `.xlsx` INDIVIDUEL d'un seul
 * observateur (`?userId=<id>`), généré CÔTÉ SERVEUR.
 *
 * Fichier : `ONA_Field_Observateur_<Nom>_<Date>.xlsx`
 * Feuilles : Synthèse · <une par type utilisé> · Données_Brutes.
 *
 * Autorisation (auto-authentification de la route `/api/*`) :
 *  — ADMIN / ANALYST (propriétaire ou invité via `canManage`) : peut exporter
 *    N'IMPORTE QUEL observateur ayant soumis des captures certifiées au projet ;
 *  — OBSERVER : uniquement ses PROPRES données (`userId === session.uid`).
 *
 * Le projet complet (fenêtres configurées + types) est transporté dans le modèle
 * pour calculer les « points possibles » et la probabilité de détection ; les LIGNES
 * du classeur sont strictement celles de l'observateur ciblé, certifiées (`isVerified`).
 */
export async function GET(_request: Request, ctx: ExportContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const url = new URL(_request.url)
  const targetUserId = (url.searchParams.get('userId') ?? '').trim()
  if (!targetUserId) {
    return NextResponse.json(
      { error: 'Identifiant de l’observateur manquant (paramètre `userId`).' },
      { status: 400 },
    )
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      observationTypes: true,
      createdAt: true,
      points: {
        orderBy: { trameDebut: 'asc' },
        select: {
          id: true,
          pointName: true,
          trameDebut: true,
          trameFin: true,
          video: { select: { id: true, name: true, typeLabel: true, orderIndex: true } },
        },
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })
  }

  // ——— Autorisation : gestion (tous observateurs) OU observateur sur ses seules données ———
  const level = await getCurrentProjectAccess(projectId)
  const isManager = canManage(level)
  const isSelfObserver = session.role === 'OBSERVER' && targetUserId === session.uid
  if (!isManager && !isSelfObserver) {
    return NextResponse.json(
      {
        error:
          'Accès refusé : seuls les gestionnaires du projet peuvent exporter un observateur, ' +
          'et un observateur ne peut exporter que ses propres données.',
      },
      { status: 403 },
    )
  }

  const observerUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { username: true, email: true, anonymousId: true },
  })
  if (!observerUser) {
    return NextResponse.json(
      { error: 'Observateur introuvable.' },
      { status: 404 },
    )
  }
  const observerLabel = observerDisplayLabel(observerUser)

  // ——— Données CERTIFIÉES de l'observateur ciblé uniquement ———
  const observations = await prisma.observation.findMany({
    where: { projectId, isVerified: true, userId: targetUserId },
    include: {
      user: { select: { username: true, email: true, anonymousId: true } },
      point: { select: { id: true, pointName: true } },
      video: { select: { id: true, name: true, typeLabel: true, orderIndex: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (observations.length === 0) {
    return NextResponse.json(
      { error: 'Aucune observation certifiée pour cet observateur.' },
      { status: 404 },
    )
  }

  // Périmètre du projet COMPLET : l'observateur a pu détecter n'importe quelle fenêtre.
  const points: GlobalExportPoint[] = project.points.map((point) => ({
    id: point.id,
    label: point.pointName,
    trameDebut: point.trameDebut,
    trameFin: point.trameFin,
    videoName: point.video ? videoDisplayName(point.video) : null,
    type: point.video?.typeLabel?.trim() ?? '',
  }))

  const rows: GlobalExportRow[] = observations.map((row) => ({
    userId: row.userId,
    username: row.user?.username ?? null,
    email: row.user?.email ?? null,
    anonymousId: row.user?.anonymousId ?? '—',
    timestampTotal: row.timestampTotal,
    observationType: row.observationType,
    isGhostPoint: row.isGhostPoint,
    pointId: row.pointId,
    pointLabel: row.point?.pointName ?? null,
    imageUrl: row.imageUrl,
    driveFileId: row.driveFileId,
    videoName: row.video ? videoDisplayName(row.video) : null,
    createdAt: row.createdAt.toISOString(),
  }))

  const source: GlobalExportSource = {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      observationTypes: project.observationTypes,
      createdAt: project.createdAt.toISOString(),
      definedPoints: points.length,
      points,
      definedPointsByType: computeDefinedPointsByType(points),
    },
    rows,
  }

  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.exportObserver,
    entityType: 'export',
    entityId: project.id,
    metadata: {
      title: project.title,
      observerUserId: targetUserId,
      observations: rows.length,
      scope: isSelfObserver ? 'self' : 'managed',
      format: 'xlsx',
    },
  })

  const buffer = await generateObserverWorkbook(source, observerLabel)
  const dateToken = new Date().toISOString().slice(0, 10)
  const nameToken = observerKeyName({
    username: observerUser.username ?? null,
    email: observerUser.email ?? null,
    anonymousId: observerUser.anonymousId,
  })
  const filename = `${brandFileName(`${sanitizeBaseName(`Observateur_${nameToken}_${dateToken}`)}`)}.xlsx`

  const headers = new Headers({
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(buffer.byteLength),
  })

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
}
