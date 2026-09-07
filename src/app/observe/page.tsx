import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, EyeOff, Film, Hourglass, Microscope, Wand2 } from 'lucide-react'
import { listBlindProjects } from '@/app/actions/observationActions'
import VideoAnnotator from '@/components/VideoAnnotator'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title:
      locale === 'en' ? 'Observation sessions' : 'Sessions d’observation',
    description:
      locale === 'en'
        ? 'Join an active double-blind observation study, or try the free annotation player.'
        : 'Rejoignez une étude d’observation en double aveugle ou testez le lecteur d’annotation libre.',
  }
}

export default async function ObservePage() {
  const locale = await getLocale()
  const projects = await listBlindProjects()
  const d = getDictionary(locale)
  const t = d.observe

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-forest-600 dark:text-forest-400">
          {t.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.subtitle}</p>
      </header>

      {/* ——— Liste des expériences disponibles ——— */}
      <section aria-labelledby="projects-list-title" className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="projects-list-title"
            className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            <Microscope aria-hidden="true" className="h-4 w-4 text-forest-600 dark:text-forest-400" />
            {t.sectionHeading} ({projects.length})
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{d.observe.blindTag}</span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-white/10 dark:bg-[#161b22]">
            <Hourglass aria-hidden="true" className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">{t.noActiveTitle}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {t.noActiveHint}{' '}
              <Link href="/admin/projects" className="font-medium text-forest-600 underline dark:text-forest-400">
                {t.noActiveAdmin}
              </Link>{' '}
              {t.noActiveSuffix}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const hasVideo = Boolean(project.videoUrl?.trim())
              return (
                <article
                  key={project.id}
                  className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-forest-500/40 hover:shadow-lg hover:shadow-forest-500/5 dark:border-white/10 dark:bg-[#161b22] dark:hover:border-forest-500/30"
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-forest-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-forest-700 dark:text-forest-400">
                        <EyeOff aria-hidden="true" className="h-3 w-3" />
                        {t.blindTag}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {t.createdLabel}{' '}
                        {new Date(project.createdAt).toLocaleDateString(
                          locale === 'fr' ? 'fr-FR' : 'en-US',
                          { day: 'numeric', month: 'short', year: 'numeric' },
                        )}
                      </span>
                    </div>

                    <h3 className="mt-2.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
                      {project.title}
                    </h3>

                    {project.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {project.description}
                      </p>
                    )}

                    <div className="mt-3">
                      {hasVideo ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                          <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-forest-600 dark:text-forest-400" />
                          <span className="truncate">{project.videoUrl}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          <Hourglass aria-hidden="true" className="h-3.5 w-3.5" />
                          {t.awaitingVideoTag}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 border-t border-zinc-100 p-4 dark:border-white/10">
                    <Link
                      href={`/observe/${project.id}`}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-forest-600 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-forest-500"
                    >
                      <span>{t.participate}</span>
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ——— Lecteur Libre ——— */}
      <section
        aria-labelledby="free-player-title"
        className="border-t border-zinc-200 pt-8 dark:border-white/10"
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-mist-500/10 text-mist-600 dark:text-mist-400">
            <Wand2 aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mist-600 dark:text-mist-400">
              {t.freeEyebrow}
            </p>
            <h2 id="free-player-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {t.freeTitle}
            </h2>
          </div>
        </div>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">{t.freeSubtitle}</p>

        <VideoAnnotator
          locale={locale}
          t={{
            annotator: d.annotator,
            stepper: d.stepper,
            completion: d.completion,
          }}
        />
      </section>
    </div>
  )
}
