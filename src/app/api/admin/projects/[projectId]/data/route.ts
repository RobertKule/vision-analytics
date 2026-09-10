import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { buildObserverWorkbookBuffer, observerKeyName } from '@/lib/serverExport'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type DataContext = {
  params: Promise<{ projectId: string }>
}

/**
 * Classeur Excel individuel d'un observateur (bouton « Télécharger les données »).
 *
 * Route `/api/*` non couverte par la garde du proxy → auto-authentification :
 * session requise + accès de gestion (owner / partagé / admin). Généré côté serveur
 * via ExcelJS, jamais dans le bundle client.
 */
export async function GET(_request: Request, ctx: DataContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })
  }

  // RBAC : ADMIN, propriétaire, ou analyste invité (l'export suit la consultation).
  const permissions = await getCurrentProjectPermissions(projectId)
  if (!permissions.canExport) {
    return NextResponse.json(
      { error: 'Accès de gestion requis sur ce projet.' },
      { status: 403 },
    )
  }

  const url = new URL(_request.url)
  const observerId = url.searchParams.get('observerId')
  if (!observerId) {
    return NextResponse.json(
      { error: 'Identifiant d’observateur requis.' },
      { status: 400 },
    )
  }

  const rows = await prisma.observation.findMany({
    // Données CERTIFIÉES uniquement (une session « en cours » n'est jamais exportée).
    where: { projectId, userId: observerId, isVerified: true },
    include: {
      user: { select: { username: true, email: true, anonymousId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Aucune donnée à exporter pour cet observateur.' },
      { status: 404 },
    )
  }

  const firstUser = rows[0].user

  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.exportExcel,
    entityType: 'export',
    entityId: project.id,
    metadata: { title: project.title, observerId, observations: rows.length, format: 'xlsx' },
  })

  const buffer = await buildObserverWorkbookBuffer(
    rows.map((row) => ({
      timestampTotal: row.timestampTotal,
      observationType: row.observationType,
      isGhostPoint: row.isGhostPoint,
      createdAt: row.createdAt,
    })),
  )

  const filename = `Donnees_${observerKeyName({
    username: firstUser?.username ?? null,
    email: firstUser?.email ?? null,
    anonymousId: firstUser?.anonymousId ?? null,
  })}.xlsx`

  const headers = new Headers({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(buffer.byteLength),
  })

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
}
