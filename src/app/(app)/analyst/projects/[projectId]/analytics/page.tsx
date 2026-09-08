import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { getProjectAnalytics } from '@/app/actions/analyticsActions'
import AnalystAnalytics from '@/components/analyst/AnalystAnalytics'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ projectId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getLocale()
  const { projectId } = await params
  return {
    title:
      locale === 'en'
        ? `Analytics — ${projectId.slice(0, 8)}`
        : `Analyses — ${projectId.slice(0, 8)}`,
  }
}

export default async function AnalystAnalyticsPage({ params }: Props) {
  const locale = await getLocale()
  const { projectId } = await params

  const analytics = await getProjectAnalytics(projectId)
  if (!analytics) redirect('/analyst/projects')

  const d = getDictionary(locale)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 dark:text-gold-400">
          {d.analytics.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {analytics.project.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {d.analyst.title} · {d.analytics.eyebrow}
        </p>
      </header>

      <AnalystAnalytics locale={locale} t={d.analytics} analytics={analytics} />
    </div>
  )
}
