'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ObservationCaptureDto, ProjectAnalyticsDto } from '@/lib/types'
import { generateScientificCsv, triggerCsvDownload } from '@/lib/exportHelpers'
import ExecutiveReportModal from '@/components/admin/ExecutiveReportModal'

type ProjectAnalyticsDashboardProps = {
  analytics: ProjectAnalyticsDto
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getConcordanceBadge(rate: number) {
  if (rate >= 75) {
    return {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      label: 'Élevée',
      dot: 'bg-emerald-500',
    }
  }
  if (rate >= 50) {
    return {
      bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
      label: 'Moyenne',
      dot: 'bg-amber-500',
    }
  }
  return {
    bg: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
    label: 'Faible',
    dot: 'bg-red-500',
  }
}

export default function ProjectAnalyticsDashboard({ analytics }: ProjectAnalyticsDashboardProps) {
  const { project, summary, pointsAnalytics, ghostPointsAnalytics, observersMetrics } = analytics

  const [activeTab, setActiveTab] = useState<'points' | 'ghosts' | 'observers' | 'timeline'>('points')
  const [selectedPointId, setSelectedPointId] = useState<string | null>(
    pointsAnalytics[0]?.pointId ?? null,
  )
  const [selectedCapture, setSelectedCapture] = useState<ObservationCaptureDto | null>(null)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)

  const selectedPoint = pointsAnalytics.find((p) => p.pointId === selectedPointId)

  // Calcul du max temporel pour la timeline visuelle
  const maxTimestamp = Math.max(
    60,
    ...pointsAnalytics.map((p) => p.trameFin),
    ...ghostPointsAnalytics.captures.map((c) => c.timestampTotal),
  )

  // Exportation CSV scientifique complète
  const handleExportCsv = () => {
    const csvContent = generateScientificCsv(analytics)
    triggerCsvDownload(
      `vision-analytics-${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-rapport.csv`,
      csvContent,
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {/* ——— En-tête Navigation & Actions ——— */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-red-700 dark:bg-red-950 dark:text-red-300">
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
            onClick={() => setIsReportModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <span aria-hidden="true">📄</span> Rapport PDF
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={summary.totalObservations === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <span aria-hidden="true">📥</span> Exporter CSV
          </button>
          <Link
            href={`/observe/${project.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
          >
            <span aria-hidden="true">👁️</span> Tester la session
          </Link>
          <Link
            href="/admin/projects"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← Projets
          </Link>
        </div>
      </header>

      {/* ——— Cartes KPIs Statistiques ——— */}
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
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
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
            <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
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
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-red-100 dark:bg-red-950">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
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

      {/* ——— Frise Temporelle Vidéo & Cartographie des Captures ——— */}
      <section aria-labelledby="timeline-title" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="timeline-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Cartographie Temporelle des Détections
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Comparaison visuelle entre les fenêtres cibles prédéfinies (vert) et les captures réelles des observateurs.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span className="h-3 w-3 rounded bg-emerald-500/30 border border-emerald-500" />
              Fenêtre Cible Admin
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300" />
              Capture Validée
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-300" />
              Point Fantôme (Fausse alerte)
            </span>
          </div>
        </div>

        {/* Timeline Bar */}
        <div className="relative mt-6 pt-2 pb-6">
          {/* Ligne d'axe principal */}
          <div className="relative h-12 w-full rounded-xl bg-zinc-100 border border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800">
            {/* Fenêtres cibles prédéfinies */}
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
                  className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden rounded-lg bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500/30 transition-colors"
                >
                  <span className="truncate px-1 font-mono text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                    {point.pointName}
                  </span>
                </div>
              )
            })}

            {/* Points d'impact des observations validées */}
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
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-md ring-2 ring-emerald-400 hover:scale-125 transition-transform dark:border-zinc-900"
                  />
                )
              }),
            )}

            {/* Points d'impact des observations fantômes */}
            {ghostPointsAnalytics.captures.map((cap) => {
              const leftPercent = (cap.timestampTotal / maxTimestamp) * 100
              return (
                <button
                  type="button"
                  key={cap.id}
                  onClick={() => setSelectedCapture(cap)}
                  style={{ left: `${leftPercent}%` }}
                  title={`Point Fantôme ${formatSeconds(cap.timestampTotal)} par ${cap.observerAnonymousId}`}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-white shadow-md ring-2 ring-red-400 hover:scale-125 transition-transform dark:border-zinc-900"
                />
              )
            })}
          </div>

          {/* Graduations temporelles */}
          <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-400">
            <span>00:00</span>
            <span>{formatSeconds(Math.round(maxTimestamp * 0.25))}</span>
            <span>{formatSeconds(Math.round(maxTimestamp * 0.5))}</span>
            <span>{formatSeconds(Math.round(maxTimestamp * 0.75))}</span>
            <span>{formatSeconds(maxTimestamp)}</span>
          </div>
        </div>
      </section>

      {/* ——— Navigation par Onglets ——— */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab('points')}
          className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'points'
              ? 'border-red-600 text-red-600 dark:border-red-500 dark:text-red-400'
              : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          Points Cibles & Concordance ({pointsAnalytics.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ghosts')}
          className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'ghosts'
              ? 'border-red-600 text-red-600 dark:border-red-500 dark:text-red-400'
              : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          Fausses Alertes & Points Fantômes ({ghostPointsAnalytics.totalGhostPoints})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('observers')}
          className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'observers'
              ? 'border-red-600 text-red-600 dark:border-red-500 dark:text-red-400'
              : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          Observateurs ({observersMetrics.length})
        </button>
      </div>

      {/* ——— CONTENU ONGLET 1 : Points Cibles & Concordance ——— */}
      {activeTab === 'points' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Liste des cibles */}
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
                        ? 'border-red-600 bg-red-50/50 shadow-sm dark:border-red-500 dark:bg-red-950/20'
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
                      <span className="font-mono">
                        ⏱ {formatSeconds(point.trameDebut)} - {formatSeconds(point.trameFin)}
                      </span>
                      <span>
                        {point.observerCount} / {summary.totalObservers} observateur{point.observerCount > 1 ? 's' : ''}
                      </span>
                    </div>

                    {point.avgDelaySeconds !== null && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
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
                          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white">
                            ⏱ T+ {formatSeconds(capture.timestampTotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-3 text-xs">
                          <span className="truncate font-mono font-medium text-zinc-700 dark:text-zinc-300">
                            👤 {capture.observerAnonymousId.slice(0, 16)}…
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
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
      )}

      {/* ——— CONTENU ONGLET 2 : Fausses Alertes (Points Fantômes) ——— */}
      {activeTab === 'ghosts' && (
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Distribution Temporelle des Fausses Alertes
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Visualisez les moments clés de la vidéo ayant induit les observateurs en erreur (artefacts visuels, mouvements parasites, leurres).
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {ghostPointsAnalytics.timelineDistribution.map((bucket) => (
                <div
                  key={bucket.startSecond}
                  className={`flex flex-col items-center rounded-xl border p-3 text-center ${
                    bucket.count > 0
                      ? 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                      : 'border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
                  }`}
                >
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {bucket.intervalLabel}
                  </span>
                  <span
                    className={`mt-1 text-lg font-bold ${
                      bucket.count > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-300 dark:text-zinc-700'
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
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Galerie des Points Fantômes ({ghostPointsAnalytics.captures.length})
                </h3>
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
                    className="group cursor-pointer overflow-hidden rounded-xl border border-red-200 bg-zinc-50 transition-all hover:border-red-400 hover:shadow-md dark:border-red-900 dark:bg-zinc-950"
                  >
                    <div className="relative aspect-video w-full bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capture.imageUrl}
                        alt={`Point fantôme à ${formatSeconds(capture.timestampTotal)}`}
                        className="h-full w-full object-contain"
                      />
                      <span className="absolute top-2 left-2 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                        Fausse Alerte
                      </span>
                      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-white">
                        ⏱ T+ {formatSeconds(capture.timestampTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 text-xs">
                      <span className="truncate font-mono font-medium text-zinc-700 dark:text-zinc-300">
                        👤 {capture.observerAnonymousId.slice(0, 16)}…
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

      {/* ——— CONTENU ONGLET 3 : Matrice des Observateurs ——— */}
      {activeTab === 'observers' && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Performance des Observateurs Scientifiques
            </h3>
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
                      <td className="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                        {obs.validObservationsCount} ({obs.pointsDetectedCount}/{project.totalDefinedPoints} cibles)
                      </td>
                      <td className="px-6 py-4 font-semibold text-red-600 dark:text-red-400">
                        {obs.ghostPointsCount}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {obs.precisionRate}%
                          </span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-emerald-500"
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
                    selectedCapture.isGhostPoint ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {selectedCapture.isGhostPoint ? 'Point Fantôme (Fausse Alerte)' : 'Capture Validée'}
                </span>
                <span className="font-mono text-sm">
                  ⏱ Horodatage : {formatSeconds(selectedCapture.timestampTotal)}
                  {selectedCapture.delaySeconds !== null ? ` (+${selectedCapture.delaySeconds}s)` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCapture(null)}
                className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                ✕
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
                className="font-medium text-red-400 hover:underline"
              >
                Ouvrir l’image originale Cloudinary ↗
              </a>
            </footer>
          </div>
        </div>
      )}

      {/* ——— MODAL RAPPORT EXÉCUTIF IMPRIMABLE (PDF) ——— */}
      <ExecutiveReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        analytics={analytics}
      />
    </div>
  )
}
