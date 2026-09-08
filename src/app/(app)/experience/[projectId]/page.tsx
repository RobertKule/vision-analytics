import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, EyeOff, Film, ShieldCheck } from 'lucide-react'
import { getBlindProject } from '@/app/actions/observationActions'
import VideoAnnotator from '@/components/VideoAnnotator'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ projectId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params
  const locale = await getLocale()
  const project = await getBlindProject(projectId)

  if (!project) {
    return {
      title: locale === 'en' ? 'Experiment not found' : 'Expérience introuvable',
    }
  }

  return {
    title:
      locale === 'en' ? `Observe: ${project.title}` : `Observation : ${project.title}`,
    description:
      locale === 'en'
        ? `Blind scientific observation session for the experiment “${project.title}”.`
        : `Session d’observation scientifique en aveugle pour l’expérience « ${project.title} ».`,
  }
}

export default async function ExperienceProjectPage({ params }: PageProps) {
  const { projectId } = await params
  const locale = await getLocale()
  const project = await getBlindProject(projectId)

  if (!project) {
    notFound()
  }

  const d = getDictionary(locale)
  const t = d.session

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
              <EyeOff aria-hidden="true" className="h-3 w-3" />
              {t.blindBadge}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">•</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
              </span>
              {t.activeLabel}
            </span>
          </div>

          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            {project.title}
          </h1>

          {project.description && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {project.description}
            </p>
          )}
        </div>

        <Link
          href="/experience"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          {t.changeProject}
        </Link>
      </header>

      {/* Bannière de rigueur scientifique */}
      <div className="mb-6 rounded-xl border border-gold-500/20 bg-gradient-to-r from-gold-500/[0.07] to-transparent p-4 text-xs leading-relaxed text-zinc-600 dark:border-gold-500/15 dark:from-gold-500/10 dark:to-transparent dark:text-zinc-400">
        <p className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
          {t.guidelinesTitle}
        </p>
        <p className="mt-1.5">{t.guidelines}</p>
      </div>

      {project.videoUrl && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-white/10 dark:bg-[#161b22] dark:text-zinc-300">
          <Film aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
          <span>{t.targetVideoLabel}</span>
          <code className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{project.videoUrl}</code>
        </div>
      )}

      {/* Le VideoAnnotator gère aussi le cas « pas encore de vidéo » :
          repli interactif — coller une URL ou charger un fichier local (.mp4/.webm). */}
      <VideoAnnotator
        projectId={project.id}
        projectTitle={project.title}
        expectedVideoUrl={project.videoUrl}
        locale={locale}
        backHref="/experience"
        t={{
          annotator: d.annotator,
          stepper: d.stepper,
          completion: d.completion,
        }}
      />
    </div>
  )
}
