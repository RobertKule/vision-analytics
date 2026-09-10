import { NextResponse } from 'next/server'
import { getCurrentSession } from '@/lib/auth'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { brandFileName, sanitizeBaseName } from '@/lib/exportHelpers'
import { resolveExportSource } from '@/lib/exportSource'
import { generateObserverWorkbook } from '@/lib/serverGlobalWorkbook'
import { observerDisplayLabel, observerKeyName } from '@/lib/serverExport'
import { auditVersionViewed } from '@/lib/analyticsVersionStore'
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
 * SOURCE ANALYTIQUE identique au tableau de bord et à l'Excel global
 * (`resolveExportSource`) : mêmes fenêtres configurées, même version, mêmes
 * compteurs. `?versionId=` / `?before=` sélectionnent une version historique.
 *
 * Autorisation (auto-authentification de la route `/api/*`) :
 *  — ADMIN / ANALYST (propriétaire ou invité) : n'importe quel observateur du projet ;
 *  — OBSERVER : uniquement ses PROPRES données (`userId === session.uid`).
 */
export async function GET(request: Request, ctx: ExportContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params
  const url = new URL(request.url)
  const targetUserId = (url.searchParams.get('userId') ?? '').trim()
  if (!targetUserId) {
    return NextResponse.json(
      { error: 'Identifiant de l’observateur manquant (paramètre `userId`).' },
      { status: 400 },
    )
  }

  // ——— Autorisation : export du projet (tous observateurs) OU observateur sur soi ———
  const permissions = await getCurrentProjectPermissions(projectId)
  const isManager = permissions.canExport
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
    return NextResponse.json({ error: 'Observateur introuvable.' }, { status: 404 })
  }
  const observerLabel = observerDisplayLabel(observerUser)

  // Le PÉRIMÈTRE reste celui du projet (l'observateur a pu détecter n'importe quelle
  // fenêtre) ; seules les LIGNES sont restreintes à l'observateur ciblé.
  const resolution = await resolveExportSource({
    projectId,
    url,
    filter: { observerId: targetUserId },
  })
  if (!resolution.ok) {
    // Un observateur exportant ses propres données n'a pas le droit d'export projet :
    // le refus de périmètre ne doit pas masquer ce cas légitime.
    if (!isSelfObserver) {
      return NextResponse.json(
        { error: resolution.refusal.error },
        { status: resolution.refusal.status },
      )
    }
    return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })
  }

  const { source, view, versionLabel, fileToken } = resolution.resolved
  if (source.rows.length === 0) {
    return NextResponse.json(
      { error: 'Aucune observation certifiée pour cet observateur.' },
      { status: 404 },
    )
  }

  if (view.version) {
    await auditVersionViewed({
      actorId: session.uid,
      projectId: source.project.id,
      version: view.version,
      surface: 'export-observer-excel',
    })
  }

  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.exportObserver,
    entityType: 'export',
    entityId: source.project.id,
    metadata: {
      title: source.project.title,
      observerUserId: targetUserId,
      observations: source.rows.length,
      scope: isSelfObserver ? 'self' : 'managed',
      format: 'xlsx',
      version: versionLabel,
      versionId: view.version?.id ?? null,
    },
  })

  const buffer = await generateObserverWorkbook(source, observerLabel, { versionLabel })
  const dateToken = new Date().toISOString().slice(0, 10)
  const nameToken = observerKeyName({
    username: observerUser.username ?? null,
    email: observerUser.email ?? null,
    anonymousId: observerUser.anonymousId,
  })
  const filename = `${brandFileName(
    `${sanitizeBaseName(`Observateur_${nameToken}_${dateToken}${fileToken}`)}`,
  )}.xlsx`

  const headers = new Headers({
    'Content-Type':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(buffer.byteLength),
  })

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
}
