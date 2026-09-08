'use client'

import { useState } from 'react'
import { ArrowRight, CheckCircle2, EyeOff, Film, Hourglass, Microscope } from 'lucide-react'
import type { BlindProjectDto } from '@/lib/types'
import type {
  AnnotatorText,
  CompletionText,
  Locale,
  ObserveListText,
  StepperText,
} from '@/lib/i18n'
import VideoAnnotator from '@/components/VideoAnnotator'

type ObserveWorkspaceProps = {
  projects: BlindProjectDto[]
  locale: Locale
  t: ObserveListText
  annotator: AnnotatorText
  stepper: StepperText
  completion: CompletionText
  /** Destination du bouton « Retour » de l'écran de fin (défaut : page publique `/observe`). */
  annotatorBackHref?: string
}

/**
 * Espace d'observation intégré : liste les projets actifs (double aveugle) et
 * alimente un unique VideoAnnotator avec le projet sélectionné, pour une
 * bascule fluide entre les vidéos sans recharger la page.
 */
export default function ObserveWorkspace({
  projects,
  locale,
  t,
  annotator,
  stepper,
  completion,
  annotatorBackHref,
}: ObserveWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string>(projects[0]?.id ?? '')
  const selected = projects.find((project) => project.id === selectedId) ?? projects[0] ?? null
  const activeId = selected?.id ?? ''

  return (
    <div className="flex flex-col gap-10">
      {/* ——— Grille des expériences actives ——— */}
      <section aria-labelledby="observe-projects-title">
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="observe-projects-title"
            className="inline-flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            <Microscope aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
            {t.sectionHeading} ({projects.length})
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.blindTag}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t.sectionHeading}>
          {projects.map((project) => {
            const hasVideo = Boolean(project.videoUrl?.trim())
            const isActive = project.id === activeId
            return (
              <button
                key={project.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setSelectedId(project.id)}
                className={`group flex w-full flex-col overflow-hidden rounded-2xl border bg-milk text-left shadow-sm transition-all dark:bg-[#161b22] ${
                  isActive
                    ? 'border-gold-500 ring-2 ring-gold-500/20 dark:border-gold-500/60'
                    : 'border-line hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-lg hover:shadow-gold-500/5 dark:border-white/10 dark:hover:border-gold-500/30'
                }`}
              >
                <span className="flex flex-1 flex-col p-5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
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
                  </span>

                  <span className="mt-2.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {project.title}
                  </span>

                  {project.description && (
                    <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {project.description}
                    </span>
                  )}

                  <span className="mt-3">
                    {hasVideo ? (
                      <span className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                        <Film
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-gold-700 dark:text-gold-400"
                        />
                        <span className="truncate">{project.videoUrl}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                        <Hourglass aria-hidden="true" className="h-3.5 w-3.5" />
                        {t.awaitingVideoTag}
                      </span>
                    )}
                  </span>
                </span>

                <span className="mt-auto flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3 dark:border-white/10">
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-700 dark:text-gold-400">
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      {t.sessionActive}
                    </span>
                  ) : (
                    <>
                      <span className="text-xs font-semibold text-zinc-600 transition-colors group-hover:text-gold-600 dark:text-zinc-300 dark:group-hover:text-gold-300">
                        {t.selectCta}
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-600"
                      />
                    </>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ——— Session d'observation du projet sélectionné ——— */}
      {selected ? (
        <section
          aria-label={`${selected.title} — ${t.sectionHeading}`}
          className="border-t border-zinc-200 pt-8 dark:border-white/10"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-gold-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
              <EyeOff aria-hidden="true" className="h-3 w-3" />
              {selected.title}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.switchHint}</p>
          </div>

          <VideoAnnotator
            key={selected.id}
            projectId={selected.id}
            projectTitle={selected.title}
            expectedVideoUrl={selected.videoUrl}
            locale={locale}
            t={{ annotator, stepper, completion }}
            backHref={annotatorBackHref}
          />
        </section>
      ) : null}
    </div>
  )
}
