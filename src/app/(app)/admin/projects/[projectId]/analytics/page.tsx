import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentSession } from '@/lib/auth'
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
      title: 'Projet introuvable — ONA Field',
    }
  }

  return {
    title: `Statistiques & Concordance : ${analytics.project.title} — ONA Field`,
    description: `Analyse scientifique inter-observateurs et taux de concordance pour le projet « ${analytics.project.title} ».`,
  }
}

export default async function ProjectAnalyticsPage({ params }: PageProps) {
  const { projectId } = await params
  const analytics = await getProjectAnalytics(projectId)

  if (!analytics) {
    notFound()
  }

  const session = await getCurrentSession()
  const authorName = session?.username?.trim() || session?.email || ''

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <ProjectAnalyticsDashboard analytics={analytics} authorName={authorName} />
    </div>
  )
}
