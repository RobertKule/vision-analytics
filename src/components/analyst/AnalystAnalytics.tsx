'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  ChartColumn,
  ChartPie,
  Download,
  FileJson2,
  FileSpreadsheet,
  FolderArchive,
  Ghost,
  Loader2,
  Printer,
  RotateCcw,
  Target,
  Timer,
  Users,
} from 'lucide-react'
import type { ProjectAnalyticsDto } from '@/lib/types'
import type { Locale, AnalyticsText } from '@/lib/i18n'
import ClientChart from '@/components/charts/ClientChart'
import ExecutiveReportModal from '@/components/admin/ExecutiveReportModal'
import { buildSplitSlices, buildWindowBars } from '@/components/charts/chartData'
import { getProjectAnalytics } from '@/app/actions/analyticsActions'
import { friendlyActionError } from '@/lib/actionError'
import { downloadChartPng } from '@/lib/chartPngExport'
import {
  buildAnalyticsObservationJson,
  sanitizeBaseName,
  triggerFileDownload,
  videoDisplayName,
} from '@/lib/exportHelpers'
import {
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
const COLOR_SLATE = '#4A4E57'

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #E5E0D8',
  boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
  fontSize: 12,
}

const AXIS_TICK = { fontSize: 10, fill: '#8C8275' }

type AnalystAnalyticsProps = {
  locale: Locale
  t: AnalyticsText
  analytics: ProjectAnalyticsDto
  /** Nom (ou email) affiché comme auteur du rapport imprimable. */
  authorName?: string
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function shortId(id: string): string {
  return id.slice(0, 6)
}

export default function AnalystAnalytics({
  locale,
  t,
  analytics: initialAnalytics,
  authorName = '',
}: AnalystAnalyticsProps) {
  // L'analyse vit en état local : le filtre Type / Vidéo déclenche un RECALCUL
  // CÔTÉ SERVEUR — les KPIs, graphiques et concordances suivent toujours le
  // sous-ensemble réellement sélectionné (jamais une simple coupe frontend).
  const [analytics, setAnalytics] = useState<ProjectAnalyticsDto>(initialAnalytics)

  // Filtre réellement appliqué (renvoyé par le serveur) : vérité affichée.
  const appliedFilter = analytics.summary.appliedFilter
  const appliedType = appliedFilter?.observationType ?? ''
  const appliedVideoId = appliedFilter?.videoId ?? ''
  // Brouillon du formulaire (appliqué au clic sur « Recalculer »).
  const [draftType, setDraftType] = useState<string>(appliedType)
  const [draftVideo, setDraftVideo] = useState<string>(appliedVideoId)
  const [filtering, setFiltering] = useState(false)

  // ——— Version analytique (actuelle ou historique figée) ———
  const versionContext = analytics.version
  const versionHistory = versionContext?.history ?? []
  const selectedVersionId = versionContext?.versionId ?? ''
  const [draftVersionId, setDraftVersionId] = useState<string>(selectedVersionId)
  const [draftAsOfDate, setDraftAsOfDate] = useState<string>(versionContext?.asOfDate ?? '')
  const isHistoricalVersion = versionContext?.mode === 'version'
  // Suffixe de version pour les liens d'export : le fichier téléchargé porte
  // exactement la version affichée (dashboard = Excel = PDF).
  const versionQuery = selectedVersionId
    ? `?versionId=${encodeURIComponent(selectedVersionId)}`
    : ''


  const appliedVideoLabel = videoDisplayName(
    (analytics.project.videos ?? []).find((video) => video.id === appliedVideoId),
  )
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
  const draftDirty =
    draftType.trim() !== appliedType ||
    draftVideo.trim() !== appliedVideoId ||
    draftVersionId !== selectedVersionId ||
    draftAsOfDate !== (versionContext?.asOfDate ?? '')

  const runServerFilter = (
    nextType: string,
    nextVideo: string,
    nextVersionId: string,
    nextAsOfDate: string,
  ) => {
    setFiltering(true)
    const projectId = analytics.project.id
    void getProjectAnalytics(
      projectId,
      {
        observationType: nextType ? nextType : undefined,
        videoId: nextVideo ? nextVideo : undefined,
      },
      {
        versionId: nextVersionId ? nextVersionId : null,
        asOfDate: nextVersionId ? null : nextAsOfDate || null,
      },
    )
      .then((result) => {
        if (!result) return // projet inaccessible : on conserve l'état précédent
        setAnalytics(result)
        // Le filtre observateur (couche client) ne s'applique plus au nouveau contexte.
        setSelectedObserverId('')
        setDraftVersionId(result.version?.versionId ?? '')
        setDraftAsOfDate(result.version?.asOfDate ?? '')
      })
      .catch((error: unknown) => {
        toast.error(t.filterApply, {
          description: friendlyActionError(error, locale === 'fr' ? 'fr' : 'en'),
        })
      })
      .finally(() => setFiltering(false))
  }

  const handleApplyFilter = () => {
    if (!draftDirty || filtering) return
    runServerFilter(draftType.trim(), draftVideo.trim(), draftVersionId, draftAsOfDate)
  }

  const handleResetFilterDraft = () => {
    setDraftType(appliedType)
    setDraftVideo(appliedVideoId)
    setDraftVersionId(selectedVersionId)
    setDraftAsOfDate(versionContext?.asOfDate ?? '')
  }

  const handleBackToCurrent = () => {
    if (filtering) return
    setDraftVersionId('')
    setDraftAsOfDate('')
    runServerFilter(draftType.trim(), draftVideo.trim(), '', '')
  }

  const summary = analytics.summary
  const hasWindows = analytics.pointsAnalytics.length > 0
  const hasData = summary.totalObservations > 0
  const totalGhostBuckets = analytics.ghostPointsAnalytics.timelineDistribution
  const maxBucket = Math.max(1, ...totalGhostBuckets.map((bucket) => bucket.count))

  // Filtre d'observateur pour les visualisations (« '' » = tous) — couche client.
  const [selectedObserverId, setSelectedObserverId] = useState('')
  const [isReportOpen, setIsReportOpen] = useState(false)
  const selectedObserver = analytics.observersMetrics.find(
    (observer) => observer.userId === selectedObserverId,
  )
  const observerAnonymousId = selectedObserver?.anonymousId
  const observerFiltered = Boolean(selectedObserver)
  // Ventilation Valides vs Fantômes (synthèse si « Tous », sinon l'observateur choisi).
  const splitSlices = buildSplitSlices(
    observerFiltered && selectedObserver
      ? selectedObserver.validObservationsCount
      : summary.validObservationsCount,
    observerFiltered && selectedObserver
      ? selectedObserver.ghostPointsCount
      : summary.ghostPointsCount,
    { valid: t.chartValid, ghost: t.chartGhost },
  )
  const windowBars = buildWindowBars(analytics.pointsAnalytics, observerAnonymousId)

  const exportBase = sanitizeBaseName(analytics.project.title)

  // ——— Téléchargement PNG du graphique réellement visible (SVG sérialisé → canvas) ———
  const exportChartPng = (chartId: string, fileName: string, chartTitle: string) => {
    void downloadChartPng({
      chartId,
      fileName: `${exportBase}_${fileName}`,
      projectTitle: analytics.project.title,
      chartTitle,
      context: pngContextBanner || undefined,
      legend: [
        { color: COLOR_GOLD, label: t.chartValid },
        { color: COLOR_SLATE, label: t.chartGhost },
      ],
    }).catch((error: unknown) => {
      toast.error(t.chartExportErrorTitle, {
        description: error instanceof Error ? error.message : String(error),
      })
    })
  }

  const handleExportJson = () => {
    triggerFileDownload(
      `${exportBase}_observations.json`,
      buildAnalyticsObservationJson(analytics),
      'application/json;charset=utf-8',
    )
  }

  const stat = (label: string, value: string, Icon: typeof Users, accent: string) => (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent}`}>
          <Icon aria-hidden="true" className="h-4 w-4 text-white" />
        </span>
      </div>
      <p className="mt-1.5 truncate text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  )

  const card = 'rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b22]'

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Synthèse ——— */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stat(t.summaryObservations, String(summary.totalObservations), Users, 'bg-ink')}
        {stat(t.summaryObservers, String(summary.totalObservers), Users, 'bg-gold-700')}
        {stat(t.summaryConcordance, `${summary.overallConcordanceRate}%`, Target, 'bg-gold-600')}
        {stat(t.summaryPrecision, `${summary.overallPrecisionRate}%`, Target, 'bg-gold-500')}
        {stat(t.summaryGhost, String(summary.ghostPointsCount), Ghost, 'bg-slate')}
        {stat(
          t.summaryDelay,
          summary.averageDetectionDelay === null ? '—' : `${summary.averageDetectionDelay}s`,
          Timer,
          'bg-zinc-700',
        )}
      </section>

      {/* ——— Filtres Version / Type / Vidéo — recalcul côté serveur ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
        <div className="mb-4 flex flex-wrap items-end gap-4 border-b border-zinc-100 pb-4 dark:border-white/5">
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Version analytique
            <select
              value={draftVersionId}
              disabled={filtering}
              onChange={(event) => {
                setDraftVersionId(event.target.value)
                if (event.target.value) setDraftAsOfDate('')
              }}
              className="h-9 min-w-[16rem] rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15"
            >
              <option value="">Analyse actuelle</option>
              {versionHistory
                .slice()
                .reverse()
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {`V${entry.versionNumber} — ${new Date(entry.effectiveAt).toLocaleDateString(
                      'fr-FR',
                    )} · ${entry.detections}/${entry.possibleObservations} · ${entry.configuredPoints} fenêtre${
                      entry.configuredPoints > 1 ? 's' : ''
                    }`}
                  </option>
                ))}
            </select>
          </label>

          {isHistoricalVersion ? (
            <button
              type="button"
              onClick={handleBackToCurrent}
              disabled={filtering}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              Analyse actuelle
            </button>
          ) : null}

          <p className="basis-full text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {isHistoricalVersion
              ? 'Instantané figé : ces chiffres ne changeront plus, même si la configuration évolue. Les exports portent cette version.'
              : 'Analyse actuelle : configuration en vigueur et toutes les observations valides. Ajouter une fenêtre augmente les possibles sans effacer les détections passées.'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            {t.filterType}
            <select
              value={draftType}
              disabled={filtering}
              onChange={(event) => setDraftType(event.target.value)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15"
            >
              <option value="">{t.filterTypeAll}</option>
              {(analytics.project.observationTypes ?? []).map((observationType) => (
                <option key={observationType} value={observationType}>
                  {observationType}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            {t.filterVideo}
            <select
              value={draftVideo}
              disabled={filtering}
              onChange={(event) => setDraftVideo(event.target.value)}
              className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15"
            >
              <option value="">{t.filterVideoAll}</option>
              {(analytics.project.videos ?? []).map((video) => (
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
            {filtering ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {filtering ? t.filterUpdate : t.filterApply}
          </button>

          {draftDirty ? (
            <button
              type="button"
              onClick={handleResetFilterDraft}
              disabled={filtering}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              {t.filterReset}
            </button>
          ) : null}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {hasAppliedFilter ? (
            <>
              {t.filterApplied}{' '}
              <span className="font-semibold text-gold-700 dark:text-gold-400">
                {contextParts.join(' · ')}
              </span>
            </>
          ) : (
            t.filterAll
          )}
        </p>
      </section>

      {/* ——— Exports scientifiques & rapport imprimable ——— */}
      <section className="flex flex-wrap items-center gap-3">
        {hasData ? (
          <a
            href={`/api/admin/projects/${analytics.project.id}/export-global-excel${versionQuery}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            title={t.exportExcelHint}
          >
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" />
            {t.exportExcel}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg bg-ink px-4 text-xs font-semibold text-milk opacity-40 dark:bg-milk dark:text-ink"
            title="Aucune observation à exporter"
          >
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5" />
            {t.exportExcel}
          </span>
        )}
        <button
          type="button"
          onClick={handleExportJson}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          title="Export JSON hiérarchique"
        >
          <FileJson2 aria-hidden="true" className="h-3.5 w-3.5 text-gold-600 dark:text-gold-400" />
          {t.exportJson}
        </button>
        <a
          href={`/api/admin/projects/${analytics.project.id}/captures`}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          title="Bundle d’images annotées (.zip) avec manifest.json"
        >
          <FolderArchive aria-hidden="true" className="h-3.5 w-3.5 text-gold-600 dark:text-gold-400" />
          {t.exportZip}
        </a>
        <button
          type="button"
          onClick={() => setIsReportOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
        >
          <Printer aria-hidden="true" className="h-3.5 w-3.5" />
          {t.exportReport}
        </button>
      </section>

      {/* ——— Concordance par fenêtre cible ——— */}
      <section className={card}>
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
          <Target aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
          {t.windowTitle}
          {hasWindows ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
              {analytics.pointsAnalytics.length}
            </span>
          ) : null}
        </h2>

        {!hasWindows ? (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center dark:border-white/10">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{t.noWindowTitle}</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.noWindowHint}</p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {analytics.pointsAnalytics.map((point) => (
              <li
                key={point.pointId}
                className="rounded-xl border border-zinc-200 p-4 dark:border-white/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2.5 py-1 font-mono text-xs font-bold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                      {point.pointName}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatSeconds(point.trameDebut)} → {formatSeconds(point.trameFin)}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {point.observerCount} {t.summaryObservers.toLowerCase()} ·{' '}
                    {point.avgDelaySeconds === null
                      ? '—'
                      : `${point.avgDelaySeconds}s ${t.windowDelay.toLowerCase()}`}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-600"
                      style={{ width: `${Math.min(100, point.concordanceRate)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                    {point.concordanceRate}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* ——— Distribution des points fantômes ——— */}
        <section className={card}>
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
            <Ghost aria-hidden="true" className="h-4 w-4 text-slate" />
            {t.ghostsTitle}
          </h2>
          {!hasData || totalGhostBuckets.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">{t.noObservationsHint}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-1.5">
              {totalGhostBuckets.map((bucket) => (
                <li key={bucket.intervalLabel} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {bucket.intervalLabel}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-slate"
                      style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                    {bucket.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ——— Performance des observateurs ——— */}
        <section className={card}>
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
            <Users aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
            {t.observerTitle}
          </h2>
          {analytics.observersMetrics.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">{t.observersNone}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {analytics.observersMetrics.map((observer) => (
                <li
                  key={observer.userId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-white/10"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                      {shortId(observer.anonymousId).toUpperCase()}
                    </span>
                    <span className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
                      {observer.anonymousId.slice(0, 12)}…
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-zinc-400">
                      {observer.validObservationsCount}/{observer.totalObservations}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-bold tabular-nums ${
                        observer.precisionRate >= 70
                          ? 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
                          : 'bg-clay-500/10 text-clay-700 dark:bg-clay-400/10 dark:text-clay-300'
                      }`}
                    >
                      {observer.precisionRate}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ——— Visualisations (Recharts), filtrables par observateur ——— */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
              <ChartPie aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
              {t.vizTitle}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t.vizHint}</p>
          </div>
          {analytics.observersMetrics.length > 0 ? (
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              {t.observerSelector}
              <select
                value={selectedObserverId}
                onChange={(event) => setSelectedObserverId(event.target.value)}
                className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15"
              >
                <option value="">{t.observerAll}</option>
                {analytics.observersMetrics.map((observer) => (
                  <option key={observer.userId} value={observer.userId}>
                    {shortId(observer.anonymousId).toUpperCase()} · {observer.precisionRate}%
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {!hasData ? (
          <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400">{t.vizEmpty}</p>
        ) : (
          <div className="mt-5 grid items-stretch gap-6 lg:grid-cols-2">
            {/* Valides vs Fantômes */}
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  <ChartPie aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
                  {observerFiltered ? t.chartSplitTitle : t.chartSplitAllTitle}
                  {chartTitleSuffix}
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    exportChartPng(
                      'ventilation',
                      'validites_fantomes',
                      `${observerFiltered ? t.chartSplitTitle : t.chartSplitAllTitle}${chartTitleSuffix}`,
                    )
                  }
                  title={t.pngDownload}
                  aria-label={`${t.pngDownload} — ${observerFiltered ? t.chartSplitTitle : t.chartSplitAllTitle}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
            </div>

            {/* Captures par fenêtre cible */}
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  <ChartColumn
                    aria-hidden="true"
                    className="h-4 w-4 text-gold-700 dark:text-gold-400"
                  />
                  {t.chartWindowTitle}
                  {chartTitleSuffix}
                </h3>
                <button
                  type="button"
                  disabled={!hasWindows}
                  onClick={() =>
                    exportChartPng(
                      'fenetres',
                      'captures_par_fenetre',
                      `${t.chartWindowTitle}${chartTitleSuffix}`,
                    )
                  }
                  title={t.pngDownload}
                  aria-label={`${t.pngDownload} — ${t.chartWindowTitle}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Download aria-hidden="true" className="h-3.5 w-3.5" /> PNG
                </button>
              </div>
              {!hasWindows ? (
                <p className="mt-6 px-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  {t.chartWindowsEmpty}
                </p>
              ) : (
                <ClientChart>
                  <div className="h-56 w-full" data-chart-export="fenetres">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={windowBars}
                        margin={{ top: 8, right: 4, left: -22, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#E5E0D8"
                          strokeOpacity={0.6}
                        />
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
              )}
            </div>
          </div>
        )}
      </section>

      <ExecutiveReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        analytics={analytics}
        authorName={authorName}
      />
    </div>
  )
}
