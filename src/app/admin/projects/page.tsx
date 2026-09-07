import type { Metadata } from 'next'
import Link from 'next/link'
import { listProjects } from '@/app/actions/projectActions'
import ProjectsManager from '@/components/admin/ProjectsManager'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Administration des projets',
  description:
    'Créez des projets, renseignez la vidéo cible et définissez les fenêtres temporelles de validation scientifique.',
}

export default async function AdminProjectsPage() {
  const projects = await listProjects()

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            Administration
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Projets &amp; fenêtres temporelles
          </h1>
        </div>
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span aria-hidden="true">←</span> Accueil
        </Link>
      </header>

      <ProjectsManager projects={projects} />
    </div>
  )
}
