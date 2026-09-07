import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Film } from 'lucide-react'
import { getBlindProject } from '@/app/actions/observationActions'
import VideoAnnotator from '@/components/VideoAnnotator'

type PageProps = {
  params: Promise<{ projectId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params
  const project = await getBlindProject(projectId)

  if (!project) {
    return {
      title: 'Projet introuvable — Vision Analytics',
    }
  }

  return {
    title: `Observation : ${project.title} — Vision Analytics`,
    description: `Session d’observation scientifique en aveugle pour le projet « ${project.title} ».`,
  }
}

export default async function ObserveProjectPage({ params }: PageProps) {
  const { projectId } = await params
  const project = await getBlindProject(projectId)

  if (!project) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-red-700 dark:bg-red-950 dark:text-red-300">
              Protocole en Double Aveugle
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">•</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Session d’observation active
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

          {project.videoUrl && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <Film aria-hidden="true" className="h-3.5 w-3.5 text-zinc-500" />
              <span>Vidéo cible requise :</span>
              <code className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                {project.videoUrl}
              </code>
            </div>
          )}
        </div>

        <Link
          href="/observe"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Changer de projet
        </Link>
      </header>

      {/* Bannière de rigueur scientifique */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-gradient-to-r from-zinc-50 to-white p-4 text-xs leading-relaxed text-zinc-600 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950 dark:text-zinc-400">
        <p>
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            Directives de l’observateur :{' '}
          </strong>
          Chargez le fichier vidéo correspondant sur votre poste local. Visionnez la séquence à
          votre rythme, mettez en pause pour marquer chaque anomalie ou zone d’intérêt à l’aide d’un
          cercle rouge, puis capturez. Les fenêtres de référence temporelle restent confidentielles
          et seront évaluées automatiquement sur le serveur lors de la soumission de la session.
        </p>
      </div>

      {/* Lecteur vidéo configuré pour ce projet en aveugle */}
      <VideoAnnotator
        projectId={project.id}
        projectTitle={project.title}
        expectedVideoUrl={project.videoUrl}
      />
    </div>
  )
}
