import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { listAnalystProjects } from '@/app/actions/analystActions'
import AnalystWorkspace from '@/components/analyst/AnalystWorkspace'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'My projects' : 'Mes projets',
  }
}

export default async function AnalystProjectsPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const locale = await getLocale()
  const projects = await listAnalystProjects()
  const d = getDictionary(locale)
  const t = d.analyst

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-mist-600 dark:text-mist-400">
          {t.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.subtitle}</p>
      </header>

      <AnalystWorkspace
        locale={locale}
        t={t}
        projects={projects}
        isAdmin={session.role === 'ADMIN'}
      />
    </div>
  )
}
