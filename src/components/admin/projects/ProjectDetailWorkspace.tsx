'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Download,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Images,
  LayoutDashboard,
  Users,
} from 'lucide-react'
import type { AdminProjectDetailDto, ProjectAnalyticsDto } from '@/lib/types'
import {
  buildObservationJson,
  sanitizeBaseName,
  triggerFileDownload,
} from '@/lib/exportHelpers'
import Tabs from '@/components/ui/Tabs'
import ProjectOverviewTab from '@/components/admin/projects/ProjectOverviewTab'
import ObservationsTab from '@/components/admin/projects/ObservationsTab'
import ObserverActivityTab from '@/components/admin/projects/ObserverActivityTab'
import ExecutiveReportModal from '@/components/admin/ExecutiveReportModal'

const toolbarButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'

type ProjectDetailWorkspaceProps = {
  detail: AdminProjectDetailDto
  /** Données analytiques pour le rapport imprimable (null ⇒ bouton rapport désactivé). */
  analytics: ProjectAnalyticsDto | null
  authorName?: string
}

/**
 * Espace projet détaillé `/admin/projects/[id]` — Vue d'ensemble, Observations,
 * Activité des observateurs + Exports scientifiques (CSV complet / JSON hiérarchique /
 * images .zip + manifest) et Rapport PDF/Imprimable.
 */
export default function ProjectDetailWorkspace({
  detail,
  analytics,
  authorName = '',
}: ProjectDetailWorkspaceProps) {
  const { project, rows, points } = detail
  const [activeTab, setActiveTab] = useState<'overview' | 'observations' | 'activity'>('overview')
  const [isReportOpen, setIsReportOpen] = useState(false)

  const isEmpty = rows.length === 0
  const fileBase = sanitizeBaseName(project.title)

  const exportJson = () => {
    triggerFileDownload(`${fileBase}_observations.json`, buildObservationJson(detail), 'application/json;charset=utf-8')
    toast.success('Export JSON téléchargé', {
      description: `${fileBase}_observations.json — hiérarchique (projectMetadata · observersSummary · observations).`,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ——— Barre d'actions (rapport & exports) ——— */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsReportOpen(true)}
          disabled={analytics === null}
          title={
            analytics === null
              ? 'Rapport indisponible (aucune donnée analytique)'
              : 'Générer le rapport scientifique imprimable (PDF)'
          }
          className={`${toolbarButton} bg-ink text-milk hover:bg-ink-soft dark:border-white/20 dark:bg-milk dark:text-ink dark:hover:bg-white/90`}
        >
          <FileText aria-hidden="true" className="h-3.5 w-3.5" />
          Générer le rapport PDF/Imprimable
        </button>
        {isEmpty ? (
          <span
            className={`${toolbarButton} bg-ink text-milk opacity-40 dark:bg-milk dark:text-ink`}
            title="Aucune observation à exporter"
          >
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" />
            Export Global (Excel)
          </span>
        ) : (
          <a
            href={`/api/admin/projects/${project.id}/export-global-excel`}
            onClick={() =>
              toast.info('Préparation de l’Export Global (Excel)…', {
                description: 'Synthèse, matrice observateurs et relevé global (3 feuilles .xlsx).',
              })
            }
            className={`${toolbarButton} bg-ink text-milk hover:bg-ink-soft dark:border-white/20 dark:bg-milk dark:text-ink dark:hover:bg-white/90`}
            title="Export Global (Excel) — Synthèse_Projet · Matrice_Observateurs · Données_Brutes_Globales"
          >
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" />
            Export Global (Excel)
          </a>
        )}
        <button type="button" onClick={exportJson} disabled={isEmpty} className={toolbarButton} title="Export JSON hiérarchique du relevé">
          <FileJson2 aria-hidden="true" className="h-3.5 w-3.5 text-gold-600 dark:text-gold-400" />
          Exporter JSON
        </button>
        {isEmpty ? (
          <span className={`${toolbarButton} opacity-40`} title="Aucune capture à télécharger">
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            Télécharger toutes les images (.zip)
          </span>
        ) : (
          <a
            href={`/api/admin/projects/${project.id}/captures`}
            onClick={() => toast.info('Préparation du fichier ZIP…', { description: 'Le téléchargement démarre à la fin de la génération.' })}
            className={toolbarButton}
            title="Bundle d’images annotées (.zip) avec manifest.json"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            Télécharger toutes les images (.zip)
          </a>
        )}
      </div>

      {/* ——— Onglets ——— */}
      <Tabs
        ariaLabel="Sections du projet"
        items={[
          { id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
          { id: 'observations', label: 'Observations', count: rows.length, icon: Images },
          { id: 'activity', label: 'Activité des observateurs', count: project.observerCount, icon: Users },
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as 'overview' | 'observations' | 'activity')}
      />

      {/* ——— Panneau actif ——— */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="min-w-0">
        {activeTab === 'overview' ? (
          <ProjectOverviewTab project={project} points={points} />
        ) : null}
        {activeTab === 'observations' ? <ObservationsTab rows={rows} points={points} /> : null}
        {activeTab === 'activity' ? (
          <ObserverActivityTab projectId={project.id} projectTitle={project.title} rows={rows} />
        ) : null}
      </div>

      {/* ——— MODAL RAPPORT SCIENTIFIQUE IMPRIMABLE (PDF) ——— */}
      {analytics ? (
        <ExecutiveReportModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          analytics={analytics}
          authorName={authorName}
        />
      ) : null}
    </div>
  )
}
