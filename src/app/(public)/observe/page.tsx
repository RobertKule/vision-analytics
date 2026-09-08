import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Hourglass } from 'lucide-react'
import { listBlindProjects } from '@/app/actions/observationActions'
import ObserveWorkspace from '@/components/observe/ObserveWorkspace'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title:
      locale === 'en' ? 'Observation sessions' : 'Sessions d’observation',
    description:
      locale === 'en'
        ? 'Select an active independent-observation experiment, load its video and capture your scientific observations.'
        : 'Sélectionnez une expérience en observation indépendante, chargez sa vidéo et capturez vos observations scientifiques.',
  }
}

export default async function ObservePage() {
  // Les sessions connectées observent depuis la coquille applicative `/experience`.
  if (await getCurrentSession()) {
    redirect('/experience')
  }

  const locale = await getLocale()
  const projects = await listBlindProjects()
  const d = getDictionary(locale)
  const t = d.observe

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 dark:text-gold-400">
          {t.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.subtitle}</p>
      </header>

      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-white/10 dark:bg-[#161b22]">
          <Hourglass aria-hidden="true" className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">{t.noActiveTitle}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t.noActiveHint}{' '}
            <Link href="/admin/projects" className="font-medium text-gold-700 underline dark:text-gold-400">
              {t.noActiveAdmin}
            </Link>{' '}
            {t.noActiveSuffix}
          </p>
        </div>
      ) : (
        <ObserveWorkspace
          projects={projects}
          locale={locale}
          t={t}
          annotator={d.annotator}
          stepper={d.stepper}
          completion={d.completion}
        />
      )}
    </div>
  )
}
