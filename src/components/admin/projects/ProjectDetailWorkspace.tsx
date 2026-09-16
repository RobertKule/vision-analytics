'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Download,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Images,
  LayoutDashboard,
  ListFilter,
  ShieldCheck,
  Share2,
  Users,
} from 'lucide-react'
import type { AdminProjectDetailDto, ProjectAnalyticsDto } from '@/lib/types'
import {
  brandFileName,
  buildObservationJson,
  sanitizeBaseName,
  triggerFileDownload,
} from '@/lib/exportHelpers'
import {
  ALL_TYPES,
  consultationTypeOptions,
  countDistinctObservers,
  scopeObservationsByType,
  scopePointsOfType,
  scopeVideosByType,
} from '@/lib/typeScope'
import Tabs from '@/components/ui/Tabs'
import ProjectOverviewTab from '@/components/admin/projects/ProjectOverviewTab'
import ObservationsTab from '@/components/admin/projects/ObservationsTab'
import ObserverActivityTab from '@/components/admin/projects/ObserverActivityTab'
import ObserverTokensTab from '@/components/admin/projects/ObserverTokensTab'
import AnalystAccessPanel from '@/components/admin/projects/AnalystAccessPanel'
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
  const { project, rows, points, videos, analystAccess, canManageAnalystAccess } = detail
  const [activeTab, setActiveTab] = useState<
    'overview' | 'observations' | 'activity' | 'share' | 'analysts'
  >('overview')
  const [isReportOpen, setIsReportOpen] = useState(false)

  // ——— Consultation par type d'observation (Partie S) ———
  // Le sélecteur est piloté par les types CONFIGURÉS du projet (jamais codé en dur) ;
  // la portée choisie filtre de façon cohérente observations, vidéos et fenêtres.
  const typeOptions = useMemo(
    () => consultationTypeOptions(project.observationTypes),
    [project.observationTypes],
  )
  const [consultationType, setConsultationType] = useState<string>(ALL_TYPES)

  const scoped = useMemo(() => {
    const scopedRows = scopeObservationsByType(rows, consultationType)
    const scopedVideos = scopeVideosByType(videos, consultationType)
    const scopedPoints = scopePointsOfType(points, scopedVideos, consultationType)
    return {
      rows: scopedRows,
      videos: scopedVideos,
      points: scopedPoints,
      observers: countDistinctObservers(scopedRows),
    }
  }, [rows, videos, points, consultationType])

  // Compteurs de la fiche restreints à la consultation (source : données filtrées).
  const scopedProject = {
    ...project,
    observationCount: scoped.rows.length,
    observerCount: scoped.observers,
    pointsCount: scoped.points.length,
  }

  const isEmpty = rows.length === 0
  const fileBase = sanitizeBaseName(project.title)

  const exportJson = () => {
    const jsonFile = brandFileName(`${fileBase}_observations.json`)
    triggerFileDownload(jsonFile, buildObservationJson(detail), 'application/json;charset=utf-8')
    toast.success('Export JSON téléchargé', {
      description: `${jsonFile} — hiérarchique (projectMetadata · observersSummary · observations).`,
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
              : 'Aperçu du rapport scientifique puis téléchargement du PDF (ONA_Field_Rapport_…)'
          }
          className={`${toolbarButton} bg-ink text-milk hover:bg-ink-soft dark:border-white/20 dark:bg-milk dark:text-ink dark:hover:bg-white/90`}
        >
          <FileText aria-hidden="true" className="h-3.5 w-3.5" />
          Télécharger le rapport PDF
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

      {/* ——— Consultation par type d'observation (Partie S) ——— */}
      {typeOptions.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
            <label
              htmlFor="consultation-type"
              className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              Consulter par type
            </label>
            <select
              id="consultation-type"
              value={consultationType}
              onChange={(event) => setConsultationType(event.target.value)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-800 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-milk dark:focus:ring-milk/15"
            >
              {typeOptions.map((type) => (
                <option key={type === ALL_TYPES ? '__all__' : type} value={type}>
                  {type === ALL_TYPES ? 'Tous les types' : type}
                </option>
              ))}
            </select>
          </div>
          {consultationType !== ALL_TYPES ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Consultation restreinte à{' '}
              <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                « {consultationType} »
              </span>{' '}
              : {scoped.rows.length} observation{scoped.rows.length > 1 ? 's' : ''},{' '}
              {scoped.videos.length} vidéo{scoped.videos.length > 1 ? 's' : ''},{' '}
              {scoped.points.length} fenêtre{scoped.points.length > 1 ? 's' : ''}.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ——— Onglets ——— */}
      <Tabs
        ariaLabel="Sections du projet"
        items={[
          { id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
          { id: 'observations', label: 'Observations', count: scoped.rows.length, icon: Images },
          { id: 'activity', label: 'Activité des observateurs', count: scoped.observers, icon: Users },
          { id: 'share', label: 'Partager', icon: Share2 },
          ...(canManageAnalystAccess
            ? [{ id: 'analysts', label: 'Analystes', icon: ShieldCheck }]
            : []),
        ]}
        active={activeTab}
        onChange={(id) =>
          setActiveTab((current) => {
            const next = id as typeof current
            // Un onglet disparu (droits révoqués entre deux rendus) ne doit pas
            // laisser le panneau sur un contenu vide.
            return next === 'analysts' && !canManageAnalystAccess ? current : next
          })
        }
      />

      {/* ——— Panneau actif ——— */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="min-w-0">
        {activeTab === 'overview' ? (
          <ProjectOverviewTab
            project={scopedProject}
            points={scoped.points}
            videos={scoped.videos}
            onShare={() => setActiveTab('share')}
          />
        ) : null}
        {activeTab === 'observations' ? (
          <ObservationsTab rows={scoped.rows} points={scoped.points} />
        ) : null}
        {activeTab === 'activity' ? (
          <ObserverActivityTab projectId={project.id} projectTitle={project.title} rows={scoped.rows} />
        ) : null}
        {activeTab === 'share' ? (
          <ObserverTokensTab projectId={project.id} projectTitle={project.title} />
        ) : null}
        {activeTab === 'analysts' && canManageAnalystAccess ? (
          <AnalystAccessPanel
            projectId={project.id}
            projectTitle={project.title}
            initialAccess={analystAccess}
          />
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
