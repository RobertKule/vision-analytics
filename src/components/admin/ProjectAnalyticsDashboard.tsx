'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileArchive,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Loader2,
  RotateCcw,
  ScanLine,
  Timer,
  User,
  X,
} from 'lucide-react'
import type { ObservationCaptureDto, ProjectAnalyticsDto } from '@/lib/types'
import Tabs from '@/components/ui/Tabs'
import ExecutiveReportModal from '@/components/admin/ExecutiveReportModal'
import ClientChart from '@/components/charts/ClientChart'
import {
  buildDetectionSeries,
  buildSplitSlices,
  buildWindowBars,
  tickIntervalFor,
} from '@/components/charts/chartData'
import { getProjectAnalytics } from '@/app/actions/analyticsActions'
import { friendlyActionError } from '@/lib/actionError'
import {
  downloadChartPackage,
  downloadChartPng,
  renderChartPngDataUrl,
  type PackageChartInput,
} from '@/lib/chartPngExport'
import { sanitizeBaseName, videoDisplayName } from '@/lib/exportHelpers'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/** Couleurs de la charte éditoriale : or = validé, ardoise = fantôme. */
const COLOR_GOLD = '#BD8F2E'
const COLOR_GOLD_STRONG = '#9C711B'
const COLOR_SLATE = '#4A4E57'

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #E5E0D8',
  boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
  fontSize: 12,
}

const AXIS_TICK = { fontSize: 10, fill: '#8C8275' }

type ProjectAnalyticsDashboardProps = {
  analytics: ProjectAnalyticsDto
  /** Nom (ou email) affiché comme auteur du rapport imprimable. */
  authorName?: string
}

type AnalyticsTab = 'overview' | 'inspection' | 'alertes'

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getConcordanceBadge(rate: number) {
  if (rate >= 75) {
    return {
      bg: 'bg-gold-500/15 text-gold-800 border-gold-500/40 dark:bg-gold-400/10 dark:text-gold-200 dark:border-gold-500/30',
      label: 'Élevée',
      dot: 'bg-gold-500',
    }
  }
  if (rate >= 50) {
    return {
      bg: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700',
      label: 'Moyenne',
      dot: 'bg-zinc-500',
    }
  }
  return {
    bg: 'bg-clay-50 text-clay-700 border-clay-200 dark:bg-clay-900/40 dark:text-clay-300 dark:border-clay-800',
    label: 'Faible',
    dot: 'bg-clay-500',
  }
}

export default function ProjectAnalyticsDashboard({
  analytics: initialAnalytics,
  authorName = '',
}: ProjectAnalyticsDashboardProps) {
  // L'analyse vit en état local : les filtres (type/vidéo) déclenchent un
  // RECALCUL CÔTÉ SERVEUR, puis remplacent ces données — jamais une coupe frontend.
  const [analytics, setAnalytics] = useState<ProjectAnalyticsDto>(initialAnalytics)
  const { project, summary, pointsAnalytics, ghostPointsAnalytics, observersMetrics } = analytics

  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview')
  const [selectedPointId, setSelectedPointId] = useState<string | null>(
    pointsAnalytics[0]?.pointId ?? null,
  )
  const [selectedCapture, setSelectedCapture] = useState<ObservationCaptureDto | null>(null)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)

  // ——— Filtres Type / Vidéo ———
  // `appliedFilter` est renvoyé par le serveur : il décrit exactement le
  // sous-ensemble sur lequel les métriques et graphiques visibles ont été calculés.
  const appliedFilter = analytics.summary.appliedFilter
  const appliedType = appliedFilter?.observationType ?? ''
  const appliedVideoId = appliedFilter?.videoId ?? ''

  // Brouillon du formulaire (appliqué uniquement au clic sur « Recalculer »).
  const [draftType, setDraftType] = useState<string>(appliedType)
  const [draftVideo, setDraftVideo] = useState<string>(appliedVideoId)
  const [filtering, setFiltering] = useState(false)

  const appliedVideoLabel = videoDisplayName(
    (project.videos ?? []).find((video) => video.id === appliedVideoId),
  )
  // Contexte des graphiques : reflète TOUJOURS le filtre réellement appliqué.
  const contextParts: string[] = []
  if (appliedType) contextParts.push(appliedType)
  if (appliedVideoId && appliedVideoLabel && appliedVideoLabel !== '—') {
    contextParts.push(appliedVideoLabel)
  }
  const hasAppliedFilter = contextParts.length > 0
  const chartTitleSuffix = hasAppliedFilter ? ` — ${contextParts.join(' · ')}` : ''
  const pngContextBanner = [
    appliedType ? `Type : ${appliedType}` : '',
    appliedVideoId && appliedVideoLabel && appliedVideoLabel !== '—'
      ? `Vidéo : ${appliedVideoLabel}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const draftDirty = draftType.trim() !== appliedType || draftVideo.trim() !== appliedVideoId

  const fileBase = sanitizeBaseName(project.title)

  const runServerFilter = (nextType: string, nextVideo: string) => {
    setFiltering(true)
    const projectId = project.id
    void getProjectAnalytics(projectId, {
      observationType: nextType ? nextType : undefined,
      videoId: nextVideo ? nextVideo : undefined,
    })
      .then((result) => {
        if (!result) {
          toast.error('Analyse indisponible', {
            description: 'Le sous-ensemble demandé est introuvable ou l’accès est refusé.',
          })
          return
        }
        setAnalytics(result)
        // Synchronise la liste des fenêtres après changement de contexte.
        setSelectedPointId(null)
      })
      .catch((error: unknown) => {
        toast.error('Filtre impossible', { description: friendlyActionError(error, 'fr') })
      })
      .finally(() => setFiltering(false))
  }

  const handleApplyFilter = () => {
    if (!draftDirty || filtering) return
    runServerFilter(draftType.trim(), draftVideo.trim())
  }

  const handleResetFilterDraft = () => {
    setDraftType(appliedType)
    setDraftVideo(appliedVideoId)
  }

  const selectedPoint = pointsAnalytics.find((p) => p.pointId === selectedPointId)

  // Calcul du max temporel pour la timeline visuelle
  const maxTimestamp = Math.max(
    60,
    ...pointsAnalytics.map((p) => p.trameFin),
    ...ghostPointsAnalytics.captures.map((c) => c.timestampTotal),
  )

  // Séries Recharts pour le bloc « Visualisations » de l'onglet Vue d'ensemble
  const hasObservations = summary.totalObservations > 0
  const detectionSeries = buildDetectionSeries(pointsAnalytics, ghostPointsAnalytics)
  const splitSlices = buildSplitSlices(summary.validObservationsCount, summary.ghostPointsCount, {
    valid: 'Valides',
    ghost: 'Fantômes',
  })
  const windowBars = buildWindowBars(pointsAnalytics)
  const hasWindows = pointsAnalytics.length > 0

  // ——— Exports PNG « graphique réel visible » (Recharts → SVG sérialisé → canvas) ———
  const pngErrorToast = (error: unknown) =>
    toast.error('Export PNG impossible', {
      description: error instanceof Error ? error.message : 'Erreur inconnue.',
    })

  const downloadDetectionPng = () => {
    void downloadChartPng({
      chartId: 'detections',
      fileName: `${fileBase}_detections`,
      projectTitle: project.title,
      chartTitle: `Détections dans le temps${chartTitleSuffix}`,
      context: pngContextBanner || undefined,
      legend: [
        { color: COLOR_GOLD, label: 'Valides' },
        { color: COLOR_SLATE, label: 'Fantômes' },
      ],
    }).catch(pngErrorToast)
  }

  const downloadSplitPng = () => {
    void downloadChartPng({
      chartId: 'ventilation',
      fileName: `${fileBase}_valides_fantomes`,
      projectTitle: project.title,
      chartTitle: `Valides vs Fantômes${chartTitleSuffix}`,
      context: pngContextBanner || undefined,
      legend: [
        { color: COLOR_GOLD, label: 'Valides' },
        { color: COLOR_SLATE, label: 'Fantômes' },
      ],
    }).catch(pngErrorToast)
  }

  const downloadWindowsPng = () => {
    void downloadChartPng({
      chartId: 'fenetres',
      fileName: `${fileBase}_captures_par_fenetre`,
      projectTitle: project.title,
      chartTitle: `Captures par fenêtre cible${chartTitleSuffix}`,
      context: pngContextBanner || undefined,
    }).catch(pngErrorToast)
  }

  const [packaging, setPackaging] = useState(false)

  // ——— Export ZIP « Excel + graphiques » (capture des PNG visibles → route serveur) ———
  const handlePackageExport = async () => {
    const legend = [
      { color: COLOR_GOLD, label: 'Valides' },
      { color: COLOR_SLATE, label: 'Fantômes' },
    ]
    try {
      setPackaging(true)
      const charts: PackageChartInput[] = []
      charts.push({
        id: 'detections',
        dataUrl: await renderChartPngDataUrl({
          chartId: 'detections',
          fileName: 'detections',
          projectTitle: project.title,
          chartTitle: `Détections dans le temps${chartTitleSuffix}`,
          context: pngContextBanner || undefined,
          legend,
        }),
      })
      charts.push({
        id: 'ventilation',
        dataUrl: await renderChartPngDataUrl({
          chartId: 'ventilation',
          fileName: 'ventilation',
          projectTitle: project.title,
          chartTitle: `Valides vs Fantômes${chartTitleSuffix}`,
          context: pngContextBanner || undefined,
          legend,
        }),
      })
      if (hasWindows) {
        charts.push({
          id: 'fenetres',
          dataUrl: await renderChartPngDataUrl({
            chartId: 'fenetres',
            fileName: 'fenetres',
            projectTitle: project.title,
            chartTitle: `Captures par fenêtre cible${chartTitleSuffix}`,
            context: pngContextBanner || undefined,
          }),
        })
      }
      await downloadChartPackage(
        `/api/admin/projects/${project.id}/export-global-package`,
        {
          observationType: appliedType || undefined,
          videoId: appliedVideoId || undefined,
          charts,
        },
        `${fileBase}_Export_Global_Graphiques.zip`,
      )
      toast.success('Export ZIP téléchargé', {
        description: 'Classeur Excel (3 feuilles) + graphiques PNG + manifest.json.',
      })
    } catch (error) {
      toast.error('Export du ZIP impossible', {
        description: error instanceof Error ? error.message : 'Erreur inconnue.',
      })
    } finally {
      setPackaging(false)
    }
  }

  const handleOpenReport = () => {
    setIsReportModalOpen(true)
    toast.info('Rapport exécutif ouvert', {
      description:
        'Consultez l’aperçu puis cliquez sur « Télécharger le rapport PDF » pour obtenir le fichier réel.',
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ——— En-tête Navigation & Actions ——— */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-gold-500/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
              Moteur Scientifique & Concordance
            </span>
            <span className="text-xs text-zinc-400">•</span>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Analyse Inter-Observateurs
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            {project.title}
          </h1>
          {project.description && (
            <p className="mt-1 max-w-2xl text-xs text-zinc-500 dark:text-zinc-400">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenReport}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <FileText aria-hidden="true" className="h-3.5 w-3.5" /> Rapport PDF
          </button>
          {summary.totalObservations === 0 ? (
            <span
              aria-disabled="true"
              className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-milk opacity-40 dark:bg-milk dark:text-ink"
              title="Aucune observation à exporter"
            >
              <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" /> Export Global (Excel)
            </span>
          ) : (
            <a
              href={`/api/admin/projects/${project.id}/export-global-excel`}
              onClick={() =>
                toast.info('Préparation de l’Export Global (Excel)…', {
                  description: 'Synthèse, matrice observateurs et relevé global (3 feuilles .xlsx).',
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
              title="Export Global (Excel) — Synthèse_Projet · Matrice_Observateurs · Données_Brutes_Globales"
            >
              <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" /> Export Global (Excel)
            </a>
          )}
          <Link
            href={`/experience/${project.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft"
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" /> Tester la session
          </Link>
          <Link
            href="/admin/projects"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" /> Projets
          </Link>
        </div>
      </header>

      {/* ——— Filtres d'analyse (Type / Vidéo) — recalcul côté serveur ——— */}
      <section
        aria-label="Filtres de l’analyse"
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Type d’observation
            <select
              value={draftType}
              disabled={filtering}
              onChange={(event) => setDraftType(event.target.value)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15"
            >
              <option value="">Tous les types</option>
              {(project.observationTypes ?? []).map((observationType) => (
                <option key={observationType} value={observationType}>
                  {observationType}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Vidéo / Passe
            <select
              value={draftVideo}
              disabled={filtering}
              onChange={(event) => setDraftVideo(event.target.value)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15"
            >
              <option value="">Toutes les vidéos</option>
              {(project.videos ?? []).map((video) => (
                <option key={video.id} value={video.id}>
                  {videoDisplayName(video)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleApplyFilter}
            disabled={!draftDirty || filtering}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            <ScanLine aria-hidden="true" className="h-3.5 w-3.5" />
            Recalculer l’analyse
          </button>

          {draftDirty ? (
            <button
              type="button"
              onClick={handleResetFilterDraft}
              disabled={filtering}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Annuler le filtre
            </button>
          ) : null}

          {filtering ? (
            <span className="inline-flex h-9 items-center gap-2 text-xs font-medium text-gold-700 dark:text-gold-400">
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              Actualisation des métriques…
            </span>
          ) : null}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {hasAppliedFilter ? (
            <>
              Filtre appliqué :{' '}
              <span className="font-semibold text-gold-700 dark:text-gold-400">
                {contextParts.join(' · ')}
              </span>{' '}
              — toutes les métriques, graphiques et exports sont recalculés côté serveur sur ce
              sous-ensemble.
            </>
          ) : (
            'Analyse complète — tous les types d’observation et toutes les vidéos.'
          )}
        </p>
      </section>

      {/* ——— Navigation par onglets thématiques ——— */}
      <Tabs
        ariaLabel="Analyse scientifique du projet"
        size="lg"
        active={activeTab}
        onChange={(id) => setActiveTab(id as AnalyticsTab)}
        items={[
          {
            id: 'overview',
            label: 'Vue d’ensemble & KPIs',
            icon: LayoutDashboard,
            hint: 'Indicateurs clés, précision globale et performance des observateurs',
          },
          {
            id: 'inspection',
            label: 'Inspection temporelle & spatiale',
            icon: ScanLine,
            hint: 'Cartographie temporelle et galerie spatiale des captures validées',
          },
          {
            id: 'alertes',
            label: 'Audit des fausses alertes',
            count: ghostPointsAnalytics.totalGhostPoints,
            icon: EyeOff,
            hint: 'Points fantômes et leur distribution temporelle',
          },
        ]}
      />

      {/* ————————————————————————————————————————————————————————————————
          ONGLET 1 : VUE D'ENSEMBLE & KPIs
      ———————————————————————————————————————————————————————————————— */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6" role="tabpanel" id="panel-overview">
          <section aria-label="Indicateurs clés de performance" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI 1 : Taux de concordance globale */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Concordance Globale
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${
                    getConcordanceBadge(summary.overallConcordanceRate).bg
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      getConcordanceBadge(summary.overallConcordanceRate).dot
                    }`}
                  />
                  {getConcordanceBadge(summary.overallConcordanceRate).label}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {summary.overallConcordanceRate}%
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  moyenne sur {project.totalDefinedPoints} point{project.totalDefinedPoints > 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gold-500 transition-all duration-500"
                  style={{ width: `${summary.overallConcordanceRate}%` }}
                />
              </div>
            </div>

            {/* KPI 2 : Observateurs distincts */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Observateurs Participants
              </span>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {summary.totalObservers}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  observateur{summary.totalObservers > 1 ? 's' : ''} actif{summary.totalObservers > 1 ? 's' : ''}
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {summary.totalObservations} observation{summary.totalObservations > 1 ? 's' : ''} soumise{summary.totalObservations > 1 ? 's' : ''}
              </p>
            </div>

            {/* KPI 3 : Précision / Fausses Alertes */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Précision Détection
                </span>
                <span className="font-mono text-xs font-bold text-slate dark:text-zinc-300">
                  {summary.ghostPointsCount} fausse{summary.ghostPointsCount > 1 ? 's' : ''} alerte{summary.ghostPointsCount > 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {summary.overallPrecisionRate}%
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  ({summary.validObservationsCount} validées)
                </span>
              </div>
              <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gold-500 transition-all duration-500"
                  style={{ width: `${summary.overallPrecisionRate}%` }}
                />
              </div>
            </div>

            {/* KPI 4 : Délai moyen de détection */}
            <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Temps de Réaction Moyen
              </span>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {summary.averageDetectionDelay !== null ? `+${summary.averageDetectionDelay}s` : '—'}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  après apparition de la cible
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Écart moyen par rapport à `trameDebut`
              </p>
            </div>
          </section>

          {/* ——— Visualisations analytiques (Recharts) ——— */}
          <section aria-labelledby="viz-title" className="flex flex-col gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="viz-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Visualisations
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Répartition des détections dans le temps et ventilation des captures. Chaque
                  graphique porte un contexte filtré et un bouton « PNG » pour l’export d’image.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handlePackageExport()}
                disabled={!hasObservations || packaging || filtering}
                title="Classeur Excel (3 feuilles) + graphiques PNG de la vue filtrée + manifest.json"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
              >
                {packaging ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileArchive aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {packaging ? 'Préparation du ZIP…' : 'Exporter ZIP (Excel + graphiques)'}
              </button>
            </header>

            {!hasObservations ? (
              <div className="grid place-items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <p>Aucune capture à afficher pour le moment.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Détections dans le temps */}
                  <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          Détections dans le temps{chartTitleSuffix}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Captures validées et points fantômes par intervalle de 10 secondes.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={downloadDetectionPng}
                        title="Télécharger le graphique (PNG)"
                        aria-label="Télécharger le graphique Détections dans le temps en PNG"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <Download aria-hidden="true" className="h-3.5 w-3.5" /> PNG
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-[11px] text-zinc-600 dark:text-zinc-300">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-gold-500" />
                        Valides
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm bg-slate" />
                        Fantômes
                      </span>
                    </div>
                    <ClientChart>
                      <div className="h-56 w-full" data-chart-export="detections">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={detectionSeries}
                            margin={{ top: 8, right: 4, left: -22, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="vizGradValid" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={COLOR_GOLD} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={COLOR_GOLD} stopOpacity={0.02} />
                              </linearGradient>
                              <linearGradient id="vizGradGhost" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={COLOR_SLATE} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={COLOR_SLATE} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E0D8" strokeOpacity={0.6} />
                            <XAxis
                              dataKey="label"
                              tick={AXIS_TICK}
                              tickLine={false}
                              axisLine={false}
                              interval={tickIntervalFor(detectionSeries.length)}
                              minTickGap={16}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={AXIS_TICK}
                              tickLine={false}
                              axisLine={false}
                              width={34}
                            />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area
                              name="Valides"
                              type="monotone"
                              dataKey="valid"
                              stroke={COLOR_GOLD_STRONG}
                              strokeWidth={2}
                              fill="url(#vizGradValid)"
                              isAnimationActive={false}
                            />
                            <Area
                              name="Fantômes"
                              type="monotone"
                              dataKey="ghost"
                              stroke={COLOR_SLATE}
                              strokeWidth={2}
                              fill="url(#vizGradGhost)"
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </ClientChart>
                  </section>

                  {/* Valides vs Fantômes */}
                  <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          Valides vs Fantômes{chartTitleSuffix}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Taux de précision globale de la session d’observation.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={downloadSplitPng}
                        title="Télécharger le graphique (PNG)"
                        aria-label="Télécharger le graphique Valides vs Fantômes en PNG"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <Download aria-hidden="true" className="h-3.5 w-3.5" /> PNG
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-6">
                      <div className="h-48 w-full max-w-[15rem]" data-chart-export="ventilation">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Pie
                              data={splitSlices}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="58%"
                              outerRadius="85%"
                              paddingAngle={3}
                              strokeWidth={1}
                              isAnimationActive={false}
                            >
                              {splitSlices.map((slice) => (
                                <Cell
                                  key={slice.id}
                                  fill={slice.id === 'valid' ? COLOR_GOLD : COLOR_SLATE}
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="flex flex-col gap-2 text-xs">
                        {splitSlices.map((slice) => (
                          <li key={slice.id} className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: slice.id === 'valid' ? COLOR_GOLD : COLOR_SLATE,
                              }}
                            />
                            <span className="text-zinc-600 dark:text-zinc-300">{slice.name}</span>
                            <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                              {slice.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                </div>

                {/* Captures par fenêtre cible (pleine largeur) */}
                {hasWindows ? (
                  <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          Captures par fenêtre cible{chartTitleSuffix}
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Volume de captures validées pour chaque fenêtre définie par l’admin.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={downloadWindowsPng}
                        title="Télécharger le graphique (PNG)"
                        aria-label="Télécharger le graphique Captures par fenêtre cible en PNG"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <Download aria-hidden="true" className="h-3.5 w-3.5" /> PNG
                      </button>
                    </div>
                    <ClientChart>
                      <div className="h-56 w-full" data-chart-export="fenetres">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={windowBars}
                            margin={{ top: 8, right: 4, left: -22, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E0D8" strokeOpacity={0.6} />
                            <XAxis
                              dataKey="name"
                              tick={AXIS_TICK}
                              tickLine={false}
                              axisLine={false}
                              interval={0}
                              tickFormatter={(value: string) =>
                                value.length > 18 ? `${value.slice(0, 17)}…` : value
                              }
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={AXIS_TICK}
                              tickLine={false}
                              axisLine={false}
                              width={34}
                            />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar
                              dataKey="captures"
                              name="Captures"
                              fill={COLOR_GOLD}
                              radius={[6, 6, 0, 0]}
                              maxBarSize={52}
                              isAnimationActive={false}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </ClientChart>
                  </section>
                ) : null}
              </>
            )}
          </section>

          {/* Matrice de performance des observateurs */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Performance des Observateurs Scientifiques
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Analyse de rigueur méthodologique par identifiant anonyme.
              </p>
            </div>

            {observersMetrics.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">Aucun observateur enregistré.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-100 bg-zinc-50/50 font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-6 py-3">Identifiant Anonyme</th>
                      <th scope="col" className="px-6 py-3">Observations</th>
                      <th scope="col" className="px-6 py-3">Cibles Validées</th>
                      <th scope="col" className="px-6 py-3">Points Fantômes</th>
                      <th scope="col" className="px-6 py-3">Taux de Précision</th>
                      <th scope="col" className="px-6 py-3">Dernière Session</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {observersMetrics.map((obs) => (
                      <tr key={obs.userId} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                        <td className="px-6 py-4 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          {obs.anonymousId}
                        </td>
                        <td className="px-6 py-4 text-zinc-700 dark:text-zinc-300">
                          {obs.totalObservations}
                        </td>
                        <td className="px-6 py-4 font-semibold text-gold-700 dark:text-gold-400">
                          {obs.validObservationsCount} ({obs.pointsDetectedCount}/{project.totalDefinedPoints} cibles)
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate dark:text-zinc-300">
                          {obs.ghostPointsCount}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">
                              {obs.precisionRate}%
                            </span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-gold-500"
                                style={{ width: `${obs.precisionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {obs.lastSessionAt ? new Date(obs.lastSessionAt).toLocaleDateString('fr-FR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ————————————————————————————————————————————————————————————————
          ONGLET 2 : INSPECTION TEMPORELLE & SPATIALE
      ———————————————————————————————————————————————————————————————— */}
      {activeTab === 'inspection' && (
        <div className="flex flex-col gap-6" role="tabpanel" id="panel-inspection">
          {/* Frise Temporelle Vidéo & Cartographie des Captures */}
          <section aria-labelledby="timeline-title" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="timeline-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Cartographie Temporelle des Détections
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Comparaison visuelle entre les fenêtres cibles prédéfinies (or) et les captures réelles des observateurs.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <span className="h-3 w-3 rounded bg-gold-500/30 border border-gold-500" />
                  Fenêtre Cible Admin
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-gold-500 ring-2 ring-gold-300" />
                  Capture Validée
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate ring-2 ring-zinc-300 dark:ring-zinc-500" />
                  Point Fantôme (Fausse alerte)
                </span>
              </div>
            </div>

            <div className="relative mt-6 pt-2 pb-6">
              <div className="relative h-12 w-full rounded-xl bg-zinc-100 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800">
                {pointsAnalytics.map((point) => {
                  const leftPercent = (point.trameDebut / maxTimestamp) * 100
                  const widthPercent = Math.max(
                    1,
                    ((point.trameFin - point.trameDebut) / maxTimestamp) * 100,
                  )
                  return (
                    <div
                      key={point.pointId}
                      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                      title={`${point.pointName} (${formatSeconds(point.trameDebut)} - ${formatSeconds(point.trameFin)}) : ${point.concordanceRate}% concordance`}
                      className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden rounded-lg bg-gold-500/20 border border-gold-500/50 hover:bg-gold-500/30 transition-colors"
                    >
                      <span className="truncate px-1 font-mono text-[10px] font-bold text-gold-800 dark:text-gold-300">
                        {point.pointName}
                      </span>
                    </div>
                  )
                })}

                {pointsAnalytics.flatMap((point) =>
                  point.captures.map((cap) => {
                    const leftPercent = (cap.timestampTotal / maxTimestamp) * 100
                    return (
                      <button
                        type="button"
                        key={cap.id}
                        onClick={() => setSelectedCapture(cap)}
                        style={{ left: `${leftPercent}%` }}
                        title={`Capture ${formatSeconds(cap.timestampTotal)} par ${cap.observerAnonymousId} (Délai : +${cap.delaySeconds}s)`}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-gold-500 border-2 border-white shadow-md ring-2 ring-gold-400 hover:scale-125 transition-transform dark:border-zinc-900"
                      />
                    )
                  }),
                )}

                {ghostPointsAnalytics.captures.map((cap) => {
                  const leftPercent = (cap.timestampTotal / maxTimestamp) * 100
                  return (
                    <button
                      type="button"
                      key={cap.id}
                      onClick={() => setSelectedCapture(cap)}
                      style={{ left: `${leftPercent}%` }}
                      title={`Point Fantôme ${formatSeconds(cap.timestampTotal)} par ${cap.observerAnonymousId}`}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-slate border-2 border-white shadow-md ring-2 ring-zinc-400 hover:scale-125 transition-transform dark:ring-zinc-500 dark:border-zinc-900"
                    />
                  )
                })}
              </div>

              <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-400">
                <span>00:00</span>
                <span>{formatSeconds(Math.round(maxTimestamp * 0.25))}</span>
                <span>{formatSeconds(Math.round(maxTimestamp * 0.5))}</span>
                <span>{formatSeconds(Math.round(maxTimestamp * 0.75))}</span>
                <span>{formatSeconds(maxTimestamp)}</span>
              </div>
            </div>
          </section>

          {/* Inspection spatiale par point cible */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-3 lg:col-span-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Sélectionnez une cible
              </h3>

              {pointsAnalytics.length === 0 ? (
                <p className="text-xs text-zinc-500">Aucun point défini pour ce projet.</p>
              ) : (
                pointsAnalytics.map((point) => {
                  const isSelected = point.pointId === selectedPointId
                  const badge = getConcordanceBadge(point.concordanceRate)
                  return (
                    <button
                      type="button"
                      key={point.pointId}
                      onClick={() => setSelectedPointId(point.pointId)}
                      className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-gold-600 bg-gold-500/10 shadow-sm dark:border-gold-500 dark:bg-gold-500/15'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-bold text-sm text-zinc-900 dark:text-zinc-50">
                          {point.pointName}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${badge.bg}`}
                        >
                          {point.concordanceRate}%
                        </span>
                      </div>

                      <div className="flex w-full items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Timer aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                          {formatSeconds(point.trameDebut)} - {formatSeconds(point.trameFin)}
                        </span>
                        <span>
                          {point.observerCount} / {summary.totalObservers} observateur{point.observerCount > 1 ? 's' : ''}
                        </span>
                      </div>

                      {point.avgDelaySeconds !== null && (
                        <span className="text-[11px] font-medium text-gold-700 dark:text-gold-400">
                          Délai moyen : +{point.avgDelaySeconds}s
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Galerie d'inspection spatiale du point sélectionné */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
              {selectedPoint ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-4 dark:border-zinc-800">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                        {selectedPoint.pointName} — Galerie des Captures
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Fenêtre : {formatSeconds(selectedPoint.trameDebut)} à{' '}
                        {formatSeconds(selectedPoint.trameFin)} ({selectedPoint.targetDuration}s) · Taux de concordance :{' '}
                        <strong className="text-zinc-800 dark:text-zinc-200">
                          {selectedPoint.concordanceRate}%
                        </strong>
                      </p>
                    </div>
                    <span className="rounded-lg bg-zinc-100 px-3 py-1 font-mono text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {selectedPoint.captures.length} capture{selectedPoint.captures.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  {selectedPoint.captures.length === 0 ? (
                    <div className="grid place-items-center rounded-xl border border-dashed border-zinc-300 py-12 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <p>Aucun observateur n’a capturé cette cible pendant la session.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {selectedPoint.captures.map((capture) => (
                        <article
                          key={capture.id}
                          onClick={() => setSelectedCapture(capture)}
                          className="group cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
                        >
                          <div className="relative aspect-video w-full bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={capture.imageUrl}
                              alt={`Capture de ${capture.observerAnonymousId} à ${formatSeconds(capture.timestampTotal)}`}
                              className="h-full w-full object-contain"
                            />
                            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white">
                              <Timer aria-hidden="true" className="h-3 w-3" /> T+{' '}
                              {formatSeconds(capture.timestampTotal)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 text-xs">
                            <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono font-medium text-zinc-700 dark:text-zinc-300">
                              <User aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                              {capture.observerAnonymousId.slice(0, 16)}…
                            </span>
                            <span className="font-semibold text-gold-700 dark:text-gold-400">
                              +{capture.delaySeconds}s
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Sélectionnez un point pour afficher ses captures.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ————————————————————————————————————————————————————————————————
          ONGLET 3 : AUDIT DES FAUSSES ALERTES
      ———————————————————————————————————————————————————————————————— */}
      {activeTab === 'alertes' && (
        <div className="flex flex-col gap-6" role="tabpanel" id="panel-alertes">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Distribution Temporelle des Fausses Alertes
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Visualisez les moments clés de la vidéo ayant induit les observateurs en erreur (artefacts visuels, mouvements parasites, leurres).
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {ghostPointsAnalytics.timelineDistribution.map((bucket) => (
                <div
                  key={bucket.startSecond}
                  className={`flex flex-col items-center rounded-xl border p-3 text-center ${
                    bucket.count > 0
                      ? 'border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60'
                      : 'border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
                  }`}
                >
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {bucket.intervalLabel}
                  </span>
                  <span
                    className={`mt-1 text-lg font-bold ${
                      bucket.count > 0 ? 'text-slate dark:text-zinc-300' : 'text-zinc-300 dark:text-zinc-700'
                    }`}
                  >
                    {bucket.count}
                  </span>
                  <span className="text-[10px] text-zinc-400">alerte{bucket.count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Galerie des Points Fantômes ({ghostPointsAnalytics.captures.length})
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Cliquez sur une capture pour inspecter la zone encerclée hors-trame.
                </p>
              </div>
            </div>

            {ghostPointsAnalytics.captures.length === 0 ? (
              <div className="grid place-items-center rounded-xl border border-dashed border-zinc-300 py-12 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <p>Excellente précision : aucun point fantôme n’a été enregistré pour ce projet !</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ghostPointsAnalytics.captures.map((capture) => (
                  <article
                    key={capture.id}
                    onClick={() => setSelectedCapture(capture)}
                    className="group cursor-pointer overflow-hidden rounded-xl border border-zinc-300 bg-zinc-50 transition-all hover:border-zinc-400 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <div className="relative aspect-video w-full bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capture.imageUrl}
                        alt={`Point fantôme à ${formatSeconds(capture.timestampTotal)}`}
                        className="h-full w-full object-contain"
                      />
                      <span className="absolute top-2 left-2 rounded bg-slate px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                        Fausse Alerte
                      </span>
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white">
                        <Timer aria-hidden="true" className="h-3 w-3" /> T+{' '}
                        {formatSeconds(capture.timestampTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 text-xs">
                      <span className="inline-flex min-w-0 items-center gap-1 truncate font-mono font-medium text-zinc-700 dark:text-zinc-300">
                        <User aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        {capture.observerAnonymousId.slice(0, 16)}…
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {new Date(capture.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ——— MODAL LIGHTBOX POUR INSPECTION SPATIALE ——— */}
      {selectedCapture && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => setSelectedCapture(null)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-zinc-900 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
                    selectedCapture.isGhostPoint ? 'bg-slate text-white' : 'bg-gold-700 text-white'
                  }`}
                >
                  {selectedCapture.isGhostPoint ? 'Point Fantôme (Fausse Alerte)' : 'Capture Validée'}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-sm">
                  <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                  Horodatage : {formatSeconds(selectedCapture.timestampTotal)}
                  {selectedCapture.delaySeconds !== null ? ` (+${selectedCapture.delaySeconds}s)` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCapture(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>

            <div className="relative flex flex-1 items-center justify-center bg-black p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedCapture.imageUrl}
                alt="Capture plein écran"
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950 px-6 py-3 text-xs text-zinc-400">
              <span className="font-mono">
                Observateur : <strong className="text-zinc-200">{selectedCapture.observerAnonymousId}</strong>
              </span>
              <a
                href={selectedCapture.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-gold-400 hover:underline"
              >
                Ouvrir l’image originale Cloudinary
                <ExternalLink aria-hidden="true" className="ml-1 inline h-3.5 w-3.5" />
              </a>
            </footer>
          </div>
        </div>
      )}

      {/* ——— MODAL RAPPORT SCIENTIFIQUE IMPRIMABLE (PDF) ——— */}
      <ExecutiveReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        analytics={analytics}
        authorName={authorName}
      />
    </div>
  )
}
