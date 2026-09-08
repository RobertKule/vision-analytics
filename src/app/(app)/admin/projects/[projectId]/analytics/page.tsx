import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProjectAnalytics } from '@/app/actions/analyticsActions'
import ProjectAnalyticsDashboard from '@/components/admin/ProjectAnalyticsDashboard'

type PageProps = {
  params: Promise<{ projectId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params
  const analytics = await getProjectAnalytics(projectId)

  if (!analytics) {
    return {
      title: 'Projet introuvable — Vision Analytics',
    }
  }

  return {
    title: `Statistiques & Concordance : ${analytics.project.title} — Vision Analytics`,
    description: `Analyse scientifique inter-observateurs et taux de concordance pour le projet « ${analytics.project.title} ».`,
  }
}

export default async function ProjectAnalyticsPage({ params }: PageProps) {
  const { projectId } = await params
  const analytics = await getProjectAnalytics(projectId)

  if (!analytics) {
    notFound()
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <ProjectAnalyticsDashboard analytics={analytics} />
    </div>
  )
}
