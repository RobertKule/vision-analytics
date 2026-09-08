import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  Eye,
  FolderKanban,
  Ghost,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { getObserverHistory } from '@/app/actions/historyActions'
import { listAnalystProjects } from '@/app/actions/analystActions'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'Overview' : 'Vue d’ensemble',
  }
}

export default async function DashboardPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const locale = await getLocale()
  const d = getDictionary(locale)
  const t = d.dashboard
  const s = d.shell

  const history = session.role === 'OBSERVER' ? await getObserverHistory() : []
  const analystProjects = session.role === 'ANALYST' ? await listAnalystProjects() : []
  const ownedCount =
    session.role === 'ANALYST'
      ? analystProjects.filter((project) => project.isOwner).length
      : 0
  const sharedCount =
    session.role === 'ANALYST' ? analystProjects.filter((project) => project.isShared).length : 0

  const displayName = session.username || session.email

  const statCard = (label: string, value: number, Icon: typeof Activity, accent: string) => (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${accent}`}>
          <Icon aria-hidden="true" className="h-4 w-4 text-milk dark:text-ink" />
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* ——— En-tête ——— */}
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 dark:text-gold-400">
          {t.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {t.welcome}, {displayName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.overviewHint}</p>
      </header>

      <div className="flex flex-col gap-8">
        {/* ——— Accès rapide par rôle ——— */}
        <section aria-labelledby="quick-title">
          <h2 id="quick-title" className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {t.quickTitle}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Observateur : rejoindre une étude */}
            {session.role === 'OBSERVER' ? (
              <Link
                href="/experience"
                className="group flex items-start justify-between gap-3 rounded-2xl border border-line bg-milk p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-lg dark:border-white/10 dark:bg-[#161b22]"
              >
                <div>
                  <p className="inline-flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                      <Eye aria-hidden="true" className="h-4 w-4" />
                    </span>
                    {t.observerCardTitle}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {t.observerCardDesc}
                  </p>
                </div>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-milk transition-transform group-hover:translate-x-0.5 dark:bg-milk dark:text-ink">
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </span>
              </Link>
            ) : null}

            {/* Analyste : projets */}
            {session.role === 'ANALYST' ? (
              <Link
                href="/analyst/projects"
                className="group flex items-start justify-between gap-3 rounded-2xl border border-line bg-milk p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-lg dark:border-white/10 dark:bg-[#161b22]"
              >
                <div>
                  <p className="inline-flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                      <FolderKanban aria-hidden="true" className="h-4 w-4" />
                    </span>
                    {t.analystCardTitle}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {t.analystCardDesc}
                  </p>
                </div>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-milk transition-transform group-hover:translate-x-0.5 dark:bg-milk dark:text-ink">
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </span>
              </Link>
            ) : null}

            {/* Administrateur : console */}
            {session.role === 'ADMIN' ? (
              <>
                <Link
                  href="/admin/projects"
                  className="group flex items-start justify-between gap-3 rounded-2xl border border-line bg-milk p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-lg dark:border-white/10 dark:bg-[#161b22]"
                >
                  <div>
                    <p className="inline-flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                        <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                      </span>
                      {t.adminCardTitle}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {t.adminCardDesc}
                    </p>
                  </div>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-milk transition-transform group-hover:translate-x-0.5 dark:bg-milk dark:text-ink">
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </Link>
                <Link
                  href="/admin/users"
                  className="group flex items-start justify-between gap-3 rounded-2xl border border-line bg-milk p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-lg dark:border-white/10 dark:bg-[#161b22]"
                >
                  <div>
                    <p className="inline-flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                        <Users aria-hidden="true" className="h-4 w-4" />
                      </span>
                      {s.users}
                    </p>
                  </div>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-milk transition-transform group-hover:translate-x-0.5 dark:bg-milk dark:text-ink">
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </span>
                </Link>
              </>
            ) : null}
          </div>
        </section>

        {/* ——— Compteurs par rôle ——— */}
        {session.role === 'ANALYST' ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statCard(t.statProjects, ownedCount, FolderKanban, 'bg-ink dark:bg-milk')}
            {statCard(t.statShared, sharedCount, Users, 'bg-ink dark:bg-milk')}
          </section>
        ) : null}

        {/* ——— Historique récent (observateur) ——— */}
        {session.role === 'OBSERVER' ? (
          <section aria-labelledby="history-title">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="history-title" className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                <Activity aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
                {t.statsTitle}
              </h2>
              <Link
                href="/dashboard/history"
                className="inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:text-gold-600 dark:text-gold-400"
              >
                {s.history}
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>

            {history.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 px-6 py-10 text-center dark:border-zinc-700 dark:bg-white/5">
                <Ghost aria-hidden="true" className="mx-auto h-7 w-7 text-zinc-300 dark:text-zinc-600" />
                <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">{t.statsEmpty}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.statsEmptyHint}</p>
              </div>
            ) : (
              <ul className="grid gap-3">
                {history.map((entry) => (
                  <li
                    key={entry.projectId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {entry.projectTitle}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {t.submitted}{' '}
                        {new Date(entry.lastAt).toLocaleDateString(
                          locale === 'fr' ? 'fr-FR' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' },
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gold-500/15 px-2.5 py-1 text-xs font-bold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                        {t.statValid} · {entry.valid}
                      </span>
                      <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        {t.statGhost} · {entry.ghost}
                      </span>
                      <span className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        {t.statObservations} · {entry.count}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {/* ——— Bandeau de rôle (autre que pur observateur) ——— */}
        {session.role !== 'OBSERVER' ? (
          <section className="flex items-center gap-3 rounded-2xl border border-line bg-gradient-to-br from-gold-500/10 to-gold-500/5 p-5 dark:border-white/10">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-milk dark:bg-milk dark:text-ink">
              {session.role === 'ADMIN' ? (
                <ShieldCheck aria-hidden="true" className="h-5 w-5" />
              ) : (
                <Sparkles aria-hidden="true" className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                {d.roles[session.role]}
              </p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{displayName}</p>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
