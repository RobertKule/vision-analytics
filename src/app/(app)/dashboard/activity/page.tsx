import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary, type Locale } from '@/lib/i18n'
import { listMyAuditLogs, resolveAuditResources } from '@/lib/auditQuery'
import {
  auditActorName,
  auditDateLabel,
  auditDetailChips,
  isDestructiveAuditAction,
} from '@/lib/auditPresent'
import AuditLogList, { type AuditRowProps } from '@/components/audit/AuditLogList'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'My activity' : 'Mon activité',
  }
}

/** Libellé d'un rôle depuis le dictionnaire (retombe sur le code si inconnu). */
function roleNameOf(roles: Record<string, string>, role: string): string {
  return Object.prototype.hasOwnProperty.call(roles, role) ? roles[role] : role
}

export default async function ActivityPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const locale = await getLocale()
  const d = getDictionary(locale)
  const ta = d.audit

  const rows = await listMyAuditLogs(200)
  const resources = await resolveAuditResources(rows)

  // Journal PROPRE : le serveur n'autorise jamais un autre userId que la session.
  const entries: AuditRowProps[] = rows.map((row) => {
    const resource = resources.get(row.id)
    const actor = row.actor
    const roleLabel = actor ? roleNameOf(d.roles, actor.role) : null
    const actionLabel = ta.actions[row.action as keyof typeof ta.actions] ?? row.action
    const kindKey = resource?.kindKey ?? 'auth'
    const kindLabel = ta.kinds[kindKey as keyof typeof ta.kinds] ?? ta.unknownResource
    return {
      id: row.id,
      dateLabel: auditDateLabel(row.createdAt, locale as Locale),
      actionLabel,
      kindKey,
      kindLabel,
      resourceLabel: resource?.label ?? null,
      actorName: auditActorName(actor),
      actorRole: roleLabel,
      isSelf: true,
      selfLabel: ta.you,
      chips: auditDetailChips(row.metadata),
      destructive: isDestructiveAuditAction(row.action),
    }
  })

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-300">
          <ScrollText aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 dark:text-gold-400">
            {d.shell.activity}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {ta.activityTitle}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{ta.activityHint}</p>
        </div>
      </header>

      <AuditLogList rows={entries} emptyLabel={ta.activityEmpty} />
    </div>
  )
}
