import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { sanitizeBaseName } from '@/lib/exportHelpers'
import type { GlobalExportRow, GlobalExportSource } from '@/lib/globalExportModel'
import { generateExcelWorkbook } from '@/lib/serverGlobalWorkbook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ExportContext = {
  params: Promise<{ projectId: string }>
}

/**
 * « Export Global (Excel) » — classeur `.xlsx` unique à 3 feuilles
 * (Synthèse_Projet · Matrice_Observateurs · Données_Brutes_Globales).
 *
 * Auto-authentification de la route `/api/*` : session + accès de gestion
 * (ADMIN propriétaire OU ANALYST propriétaire/invité via `canManage`).
 * ExcelJS ne tourne que côté serveur — aucun import dans un bundle client.
 */
export async function GET(_request: Request, ctx: ExportContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      observationTypes: true,
      createdAt: true,
      points: { select: { id: true } },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })
  }

  const level = await getCurrentProjectAccess(projectId)
  if (!canManage(level)) {
    return NextResponse.json(
      { error: 'Accès de gestion requis sur ce projet.' },
      { status: 403 },
    )
  }

  const observations = await prisma.observation.findMany({
    where: { projectId },
    include: {
      user: { select: { username: true, email: true, anonymousId: true } },
      point: { select: { id: true, pointName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (observations.length === 0) {
    return NextResponse.json(
      { error: 'Aucune observation à exporter.' },
      { status: 404 },
    )
  }

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
      definedPoints: project.points.length,
    },
    rows,
  }

  const buffer = await generateExcelWorkbook(source)
  const filename = `${sanitizeBaseName(project.title)}_Export_Global.xlsx`

  const headers = new Headers({
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(buffer.byteLength),
  })

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
}
