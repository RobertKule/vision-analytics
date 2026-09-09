import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getCurrentSession } from '@/lib/auth'
import { getAdminProjectDetail } from '@/app/actions/projectActions'
import { getProjectAnalytics } from '@/app/actions/analyticsActions'
import ProjectDetailWorkspace from '@/components/admin/projects/ProjectDetailWorkspace'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ projectId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params
  const detail = await getAdminProjectDetail(projectId)

  if (!detail) {
    return {
      title: 'Projet introuvable — ONA Field',
    }
  }

  return {
    title: `${detail.project.title} — ONA Field`,
    description: `Administration du projet « ${detail.project.title} » : fenêtres de validation, relevé des observations et exports.`,
  }
}

export default async function AdminProjectDetailPage({ params }: PageProps) {
  const { projectId } = await params
  const detail = await getAdminProjectDetail(projectId)

  if (!detail) {
    notFound()
  }

  // Données analytiques + auteur nécessaires au rapport scientifique imprimable.
  const [analytics, session] = await Promise.all([
    getProjectAnalytics(projectId),
    getCurrentSession(),
  ])
  const authorName = session?.username?.trim() || session?.email || ''

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <nav className="mb-5" aria-label="Fil d’Ariane">
        <Link
          href="/admin/projects"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition-colors hover:text-gold-600 dark:text-zinc-400 dark:hover:text-gold-300"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Projets
        </Link>
      </nav>

      <ProjectDetailWorkspace
        detail={detail}
        analytics={analytics}
        authorName={authorName}
      />
    </div>
  )
}
