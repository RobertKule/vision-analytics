import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { FilterX, ScrollText } from 'lucide-react'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary, type Locale } from '@/lib/i18n'
import {
  listAdminAuditLogs,
  listAdminAuditOptions,
  resolveAuditResources,
  type AuditAdminFilters,
} from '@/lib/auditQuery'
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
    title: locale === 'en' ? 'Activity log' : 'Journal d’activité',
    description:
      locale === 'en'
        ? 'Who did what, on which resource, when.'
        : 'Qui a fait quoi, sur quelle ressource, quand.',
  }
}

/** Récupère la première valeur string d'un paramètre de recherche. */
function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key]
  if (Array.isArray(value)) return value[0]
  return value
}

function roleNameOf(roles: Record<string, string>, role: string): string {
  return Object.prototype.hasOwnProperty.call(roles, role) ? roles[role] : role
}

function interp(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '')
}

const SELECT_CLASS =
  'h-9 rounded-lg border border-line bg-milk px-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-white/10 dark:bg-card dark:text-zinc-100 dark:focus:border-milk dark:focus:ring-milk/15'
const DATE_INPUT_CLASS =
  'h-9 rounded-lg border border-line bg-milk px-2 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-white/10 dark:bg-card dark:text-zinc-100 dark:focus:border-milk dark:focus:ring-milk/15'

export default async function AdminHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const locale = await getLocale()
  const d = getDictionary(locale)
  const ta = d.audit

  // Accès global : ADMIN uniquement (défense en profondeur après le layout).
  if (session.role !== 'ADMIN') redirect('/dashboard')

  const params = await searchParams
  const filters: AuditAdminFilters = {
    userId: firstParam(params, 'userId') || undefined,
    action: firstParam(params, 'action') || undefined,
    entityType: firstParam(params, 'kind') || undefined,
    projectId: firstParam(params, 'project') || undefined,
    from: firstParam(params, 'from') || undefined,
    to: firstParam(params, 'to') || undefined,
  }

  const [result, options] = await Promise.all([listAdminAuditLogs(filters), listAdminAuditOptions()])
  const resources = await resolveAuditResources(result.rows)

  const actionLabel = (action: string): string =>
    ta.actions[action as keyof typeof ta.actions] ?? action
  const kindLabel = (kind: string): string => ta.kinds[kind as keyof typeof ta.kinds] ?? kind

  const entries: AuditRowProps[] = result.rows.map((row) => {
    const resource = resources.get(row.id)
    const actor = row.actor
    const actorRole = actor ? roleNameOf(d.roles, actor.role) : null
    const kindKey = resource?.kindKey ?? 'auth'
    return {
      id: row.id,
      dateLabel: auditDateLabel(row.createdAt, locale as Locale),
      actionLabel: actionLabel(row.action),
      kindKey,
      kindLabel: kindLabel(kindKey),
      resourceLabel: resource?.label ?? null,
      actorName: auditActorName(actor),
      actorRole,
      isSelf: actor ? actor.id === session.uid : false,
      selfLabel: ta.you,
      chips: auditDetailChips(row.metadata),
      destructive: isDestructiveAuditAction(row.action),
    }
  })

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-300">
          <ScrollText aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 dark:text-gold-400">
            {ta.adminEyebrow}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {ta.adminTitle}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{ta.adminSubtitle}</p>
        </div>
      </header>

      {/* ——— Filtres (§26) : Utilisateur · Action · Type · Projet · Date ——— */}
      <form
        method="get"
        className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ta.filterUser}
            </span>
            <select name="userId" className={SELECT_CLASS} defaultValue={filters.userId ?? ''}>
              <option value="">{ta.filterUserAll}</option>
              {options.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {auditActorName(user) ?? user.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ta.filterAction}
            </span>
            <select name="action" className={SELECT_CLASS} defaultValue={filters.action ?? ''}>
              <option value="">{ta.filterActionAll}</option>
              {options.actions.map((action) => (
                <option key={action} value={action}>
                  {actionLabel(action)}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ta.filterKind}
            </span>
            <select name="kind" className={SELECT_CLASS} defaultValue={filters.entityType ?? ''}>
              <option value="">{ta.filterKindAll}</option>
              {options.kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabel(kind)}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ta.filterProject}
            </span>
            <select name="project" className={SELECT_CLASS} defaultValue={filters.projectId ?? ''}>
              <option value="">{ta.filterProjectAll}</option>
              {options.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ta.filterFrom}
            </span>
            <input type="date" name="from" defaultValue={filters.from ?? ''} className={DATE_INPUT_CLASS} />
          </label>

          <label className="col-span-1 flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {ta.filterTo}
            </span>
            <input type="date" name="to" defaultValue={filters.to ?? ''} className={DATE_INPUT_CLASS} />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            <ScrollText aria-hidden="true" className="h-4 w-4" />
            {ta.filterApply}
          </button>
          <Link
            href="/admin/history"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-zinc-600 transition-colors hover:border-gold-500/50 hover:text-gold-700 dark:border-white/10 dark:text-zinc-300 dark:hover:text-gold-300"
          >
            <FilterX aria-hidden="true" className="h-4 w-4" />
            {ta.filterReset}
          </Link>
        </div>
      </form>

      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        {interp(ta.resultsCount, { count: String(entries.length) })}
      </p>

      <AuditLogList rows={entries} emptyLabel={ta.resultsNone} />
    </div>
  )
}
