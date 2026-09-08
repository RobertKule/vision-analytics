import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Activity, ArrowRight, Ghost } from 'lucide-react'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { getObserverHistory } from '@/app/actions/historyActions'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'My history' : 'Mon historique',
  }
}

export default async function HistoryPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const locale = await getLocale()
  const d = getDictionary(locale)
  const t = d.dashboard

  const history = await getObserverHistory()

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-forest-600 dark:text-forest-400">
          {d.shell.history}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t.statsTitle}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.statsEmptyHint}</p>
      </header>

      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 px-6 py-14 text-center dark:border-zinc-700 dark:bg-white/5">
          <Ghost aria-hidden="true" className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{t.statsEmpty}</p>
          <Link
            href="/observe"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-forest-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-forest-500"
          >
            <Activity aria-hidden="true" className="h-4 w-4" />
            {t.observerCta}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
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
                  {new Date(entry.lastAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-forest-500/10 px-2.5 py-1 text-xs font-bold text-forest-700 dark:text-forest-400">
                  {t.statValid} · {entry.valid}
                </span>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                  {t.statGhost} · {entry.ghost}
                </span>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  {entry.count} {t.statObservations}
                </span>
                <Link
                  href={`/observe/${entry.projectId}`}
                  aria-label={`${entry.projectTitle}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:border-forest-400 hover:text-forest-600 dark:border-white/10 dark:text-zinc-300 dark:hover:text-forest-400"
                >
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
