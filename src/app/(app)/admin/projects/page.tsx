import type { Metadata } from 'next'
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
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          Administration
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Projets &amp; fenêtres temporelles
        </h1>
      </header>

      <ProjectsManager projects={projects} />
    </div>
  )
}
