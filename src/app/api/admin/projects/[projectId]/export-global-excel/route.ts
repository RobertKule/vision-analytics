import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth'
import { brandFileName, sanitizeBaseName } from '@/lib/exportHelpers'
import { resolveExportSource } from '@/lib/exportSource'
import { generateExcelWorkbook } from '@/lib/serverGlobalWorkbook'
import { auditVersionViewed } from '@/lib/analyticsVersionStore'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ExportContext = {
  params: Promise<{ projectId: string }>
}

/**
 * « Export Global (Excel) » — classeur `.xlsx` (Synthèse · Méthodologie ·
 * une feuille par type/décalage · Données_Brutes_Globales).
 *
 * SOURCE ANALYTIQUE : identique au tableau de bord (`resolveExportSource`). Aucune
 * logique analytique propre à cet export.
 *  — sans paramètre : l'analyse ACTUELLE (dernière version disponible) ;
 *  — `?versionId=<id>` ou `?before=YYYY-MM-DD` : la version historique demandée,
 *    avec sa configuration FIGÉE — jamais remplacée par la configuration actuelle.
 *
 * Auto-authentification de la route `/api/*` : session + droit d'export (ADMIN,
 * propriétaire ou analyste invité). ExcelJS ne tourne que côté serveur.
 */
export async function GET(request: Request, ctx: ExportContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const resolution = await resolveExportSource({
    projectId,
    url: new URL(request.url),
  })
  if (!resolution.ok) {
    return NextResponse.json(
      { error: resolution.refusal.error },
      { status: resolution.refusal.status },
    )
  }

  const { source, view, versionLabel, fileToken } = resolution.resolved
  if (source.rows.length === 0) {
    return NextResponse.json({ error: 'Aucune observation à exporter.' }, { status: 404 })
  }

  if (view.version) {
    await auditVersionViewed({
      actorId: session.uid,
      projectId: source.project.id,
      version: view.version,
      surface: 'export-global-excel',
    })
  }

  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.exportExcel,
    entityType: 'export',
    entityId: source.project.id,
    metadata: {
      title: source.project.title,
      observations: source.rows.length,
      format: 'xlsx',
      version: versionLabel,
      versionId: view.version?.id ?? null,
    },
  })

  const buffer = await generateExcelWorkbook(source, { versionLabel })
  const filename = `${brandFileName(
    `${sanitizeBaseName(`${source.project.title}_Export_Global${fileToken}`)}`,
  )}.xlsx`

  const headers = new Headers({
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(buffer.byteLength),
  })

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
}
