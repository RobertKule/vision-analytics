'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Download, FileJson2, FileSpreadsheet, Images, LayoutDashboard, Users } from 'lucide-react'
import type { AdminProjectDetailDto } from '@/lib/types'
import {
  buildObservationCsv,
  buildObservationJson,
  sanitizeBaseName,
  triggerFileDownload,
} from '@/lib/exportHelpers'
import Tabs from '@/components/ui/Tabs'
import ProjectOverviewTab from '@/components/admin/projects/ProjectOverviewTab'
import ObservationsTab from '@/components/admin/projects/ObservationsTab'
import ObserverActivityTab from '@/components/admin/projects/ObserverActivityTab'

const toolbarButton =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'

/**
 * Espace projet détaillé `/admin/projects/[id]` — Vue d'ensemble, Observations,
 * Activité des observateurs + exports de données (CSV/JSON) et de médias (.zip).
 */
export default function ProjectDetailWorkspace({ detail }: { detail: AdminProjectDetailDto }) {
  const { project, rows, points } = detail
  const [activeTab, setActiveTab] = useState<'overview' | 'observations' | 'activity'>('overview')

  const isEmpty = rows.length === 0
  const fileBase = sanitizeBaseName(project.title)

  const exportCsv = () => {
    triggerFileDownload(`${fileBase}_observations.csv`, buildObservationCsv(detail), 'text/csv;charset=utf-8;')
    toast.success('Export CSV téléchargé', {
      description: `${rows.length} observation${rows.length > 1 ? 's' : ''} — ${fileBase}_observations.csv`,
    })
  }

  const exportJson = () => {
    triggerFileDownload(`${fileBase}_observations.json`, buildObservationJson(detail), 'application/json;charset=utf-8')
    toast.success('Export JSON téléchargé', {
      description: `${fileBase}_observations.json — regroupé par observateur.`,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ——— Barre d'actions (exports) ——— */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={exportCsv} disabled={isEmpty} className={toolbarButton} title="Export CSV du relevé">
          <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Exporter CSV
        </button>
        <button type="button" onClick={exportJson} disabled={isEmpty} className={toolbarButton} title="Export JSON du relevé">
          <FileJson2 aria-hidden="true" className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
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
            className={`${toolbarButton} border-red-200 bg-red-600 text-white hover:bg-red-500 dark:border-red-500/40`}
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
    </div>
  )
}
