import type { Metadata } from 'next'
import Link from 'next/link'
import { listBlindProjects } from '@/app/actions/observationActions'
import VideoAnnotator from '@/components/VideoAnnotator'

export const metadata: Metadata = {
  title: 'Sessions d’observation — Vision Analytics',
  description:
    'Sessions d’observation scientifique en aveugle : sélectionnez un projet d’étude ou utilisez le lecteur libre.',
}

export default async function ObservePage() {
  const projects = await listBlindProjects()

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
            Espace Observateur
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Sessions d’observation scientifique
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Rejoignez une étude active en double aveugle ou utilisez le lecteur libre ci-dessous.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/projects"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Administration
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span aria-hidden="true">←</span> Accueil
          </Link>
        </div>
      </header>

      {/* ——— Liste des projets disponibles pour observation ——— */}
      <section aria-labelledby="projects-list-title" className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="projects-list-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Projets scientifiques actifs ({projects.length})
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Protocole en aveugle strict
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <p>Aucun projet actif pour le moment.</p>
            <p className="mt-1 text-xs">
              Vous pouvez créer un projet depuis l’espace{' '}
              <Link href="/admin/projects" className="font-medium text-red-600 underline dark:text-red-400">
                Administration
              </Link>{' '}
              ou utiliser le lecteur libre ci-après.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-300">
                      En aveugle
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {new Date(project.createdAt).toLocaleDateString('fr-FR')}
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

                  {project.videoUrl && (
                    <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                      <span aria-hidden="true">🎞️</span>
                      <span className="truncate">{project.videoUrl}</span>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <Link
                    href={`/observe/${project.id}`}
                    className="inline-flex w-full h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 text-xs font-semibold text-white transition-colors hover:bg-red-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
                  >
                    <span>Participer à l’observation</span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ——— Lecteur Libre ——— */}
      <section aria-labelledby="free-player-title" className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <div className="mb-4">
          <h2 id="free-player-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Session d’annotation libre
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Testez le lecteur et l’outil d’annotation sur n’importe quel fichier vidéo local, sans rattachement à un projet.
          </p>
        </div>

        <VideoAnnotator />
      </section>
    </div>
  )
}
