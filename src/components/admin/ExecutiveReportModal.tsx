'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Download, FileText, Loader2, X } from 'lucide-react'
import type { ProjectAnalyticsDto } from '@/lib/types'
import { buildDetectionSeries } from '@/components/charts/chartData'
import { ReportDetectionChart, ReportSplitRing } from '@/components/admin/ReportCharts'
import { downloadBlob, exportSvgNodeToPng } from '@/lib/chartPngExport'
import { sanitizeBaseName } from '@/lib/exportHelpers'

/**
 * Rapport Scientifique — Aperçu modal + téléchargement d'un VRAI fichier PDF.
 *
 * Le contenu est rendu dans un PORTAL en fin de <body> : la règle `@media print` de
 * globals.css peut ainsi masquer toute l'application (`body > *:not(#va-report-portal)`)
 * et imprimer UNIQUEMENT le rapport, sans rognage ni pages blanches — quel que soit le
 * thème actif (le rapport force la palette claire pour un rendu papier net).
 */
type ExecutiveReportModalProps = {
  isOpen: boolean
  onClose: () => void
  analytics: ProjectAnalyticsDto
  /** Nom (ou email) de l'utilisateur qui génère le rapport. */
  authorName?: string
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const KPICARD =
  'rounded-xl border border-line bg-white px-4 py-3.5 shadow-sm print:border-zinc-300'
const KPILABEL = 'block text-[11px] font-medium text-zinc-500'
const KPIVALUE =
  'mt-1 block text-2xl font-black tracking-tight text-zinc-900'
const TABLEHEAD =
  'border-b border-line bg-zinc-50 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500'

type ReportChartId = 'detections' | 'ventilation'

/** Fichier PNG d'un graphique du rapport, prêt pour l'assemblage côté serveur. */
type ReportPdfChartInput = {
  id: ReportChartId
  dataUrl: string
}

export default function ExecutiveReportModal({
  isOpen,
  onClose,
  analytics,
  authorName,
}: ExecutiveReportModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  if (!isOpen || typeof document === 'undefined') return null

  const { project, summary, pointsAnalytics, ghostPointsAnalytics, observersMetrics } = analytics

  const generatedAt = new Date()
  const author = authorName?.trim() || 'Non renseigné'
  const hasObservations = summary.totalObservations > 0
  const detectionSeries = buildDetectionSeries(pointsAnalytics, ghostPointsAnalytics)

  const pdfFallbackName = () => {
    const dateToken = new Date().toISOString().slice(0, 10)
    return `ONA_Field_Rapport_${sanitizeBaseName(project.title)}_${dateToken}.pdf`
  }

  /**
   * Télécharge le VRAI rapport PDF (généré côté serveur, jamais la boîte de dialogue
   * d'impression du navigateur). Les deux SVG STATIQUES du rapport (ReportCharts.tsx)
   * sont rasterisés en PNG haute résolution puis transmis à la route API qui reconstitue
   * les chiffres depuis la base (isVerified=true) — le client ne fournit que des images.
   */
  const handleDownloadPdf = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const charts: ReportPdfChartInput[] = []

      // Rasterisation des graphiques réellement rendus dans l'aperçu. Un échec sur
      // un graphique ne bloque jamais le rapport : le serveur assemble sans l'image.
      if (hasObservations) {
        const chartIds: ReportChartId[] = ['detections', 'ventilation']
        for (const id of chartIds) {
          const node = document.querySelector<SVGSVGElement>(
            `svg[data-report-chart="${id}"]`,
          )
          if (!node) continue
          try {
            charts.push({ id, dataUrl: await exportSvgNodeToPng(node, 2) })
          } catch (error) {
            console.warn(
              `[rapport PDF] Graphique « ${id} » non intégré (PDF généré sans lui) :`,
              error,
            )
          }
        }
      }

      const response = await fetch(
        `/api/admin/projects/${encodeURIComponent(project.id)}/export-report-pdf`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ charts }),
        },
      )
      if (!response.ok) {
        let message = 'Le serveur a refusé le rapport PDF.'
        try {
          const parsed = (await response.json()) as { error?: string }
          if (parsed?.error) message = parsed.error
        } catch {
          // corps non JSON : on conserve le message générique
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      // Le nom renvoyé par le serveur fait autorité (ONA_Field_Rapport_<Projet>_<Date>.pdf).
      const disposition = response.headers.get('content-disposition') ?? ''
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition)
      const fileName = filenameMatch?.[1]
        ? filenameMatch[1].replace(/["\\]/g, '')
        : pdfFallbackName()
      downloadBlob(blob, fileName)
      toast.success('Rapport PDF téléchargé', {
        description: `${fileName} — rapport exécutif de concordance ONA Field.`,
      })
    } catch (error) {
      toast.error('Export PDF impossible', {
        description: error instanceof Error ? error.message : 'Erreur inconnue.',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const modal = (
    <div
      id="va-report-portal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-6"
    >
      <div className="va-report-sheet relative flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        {/* Barre d'action supérieure (masquée à l'impression) */}
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-6 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-700">
              <FileText aria-hidden="true" className="h-4 w-4" />
            </span>
            <h2 id="report-modal-title" className="truncate text-sm font-bold text-zinc-900">
              Rapport Scientifique — Aperçu & Téléchargement PDF
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={isDownloading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-70"
            >
              {isDownloading ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {isDownloading ? 'Préparation du PDF…' : 'Télécharger le rapport PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              aria-label="Fermer le rapport"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ——— CONTENU DU RAPPORT FORMEL (palette claire fixe → imprimable) ——— */}
        <div className="va-report-scroll flex-1 overflow-y-auto bg-white px-8 py-8 font-sans text-zinc-900 sm:px-10">
          {/* En-tête institutionnelle — emblème officiel Virunga */}
          <div className="border-b-2 border-gold-600 pb-6">
            <div className="flex items-start gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white shadow-sm">
                <Image
                  src="/Parc National des Virunga.png"
                  alt="Emblème officiel du Parc National des Virunga"
                  width={80}
                  height={80}
                  priority
                  className="h-14 w-14 object-contain"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gold-700">
                  ONA Field · Procédure d’Observation Indépendante
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
                  Rapport Exécutif de Concordance
                </h1>
                <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-zinc-500">
                  Réf. Étude : VA-{project.id.slice(0, 8).toUpperCase()} · Rédigé par{' '}
                  <span className="font-semibold text-zinc-700">{author}</span> · Généré le{' '}
                  {generatedAt.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}{' '}
                  à{' '}
                  {generatedAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-zinc-100 px-3 py-1 font-mono text-xs font-bold text-zinc-700">
                CONFIDENTIEL
              </span>
            </div>

            {/* Métadonnées de l'étude */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-zinc-50 px-4 py-3.5 text-xs sm:grid-cols-4">
              <div>
                <span className="text-zinc-500">Projet analysé :</span>
                <p className="font-bold text-zinc-900">{project.title}</p>
              </div>
              <div>
                <span className="text-zinc-500">Vidéo source :</span>
                <p className="break-all font-mono font-medium text-zinc-700">
                  {project.videoUrl || 'Non spécifiée'}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Cibles scientifiques :</span>
                <p className="font-bold">{project.totalDefinedPoints} point(s)</p>
              </div>
              <div>
                <span className="text-zinc-500">Étude créée le :</span>
                <p className="font-bold">{formatDate(project.createdAt) || '—'}</p>
              </div>
            </div>
          </div>

          {/* ——— 1. Indicateurs Clés de Synthèse ——— */}
          <section className="avoid-break mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
              1. Synthèse des Résultats d’Observation
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={KPICARD}>
                <span className={KPILABEL}>Concordance inter-observateurs</span>
                <p className={`${KPIVALUE} text-gold-700`}>{summary.overallConcordanceRate}%</p>
                <span className="text-[10px] text-zinc-400">Cohérence entre observateurs</span>
              </div>
              <div className={KPICARD}>
                <span className={KPILABEL}>Précision de détection</span>
                <p className={KPIVALUE}>{summary.overallPrecisionRate}%</p>
                <span className="text-[10px] text-zinc-400">
                  {summary.validObservationsCount} / {summary.totalObservations} captures valides
                </span>
              </div>
              <div className={KPICARD}>
                <span className={KPILABEL}>Captures totales</span>
                <p className={KPIVALUE}>{summary.totalObservations}</p>
                <span className="text-[10px] text-zinc-400">Observations enregistrées</span>
              </div>
              <div className={KPICARD}>
                <span className={KPILABEL}>Observateurs actifs</span>
                <p className={KPIVALUE}>{summary.totalObservers}</p>
                <span className="text-[10px] text-zinc-400">Participant(s) au protocole</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={KPICARD}>
                <span className={KPILABEL}>Fausses alertes (fantômes)</span>
                <p className={`${KPIVALUE} text-slate`}>{summary.ghostPointsCount}</p>
                <span className="text-[10px] text-zinc-400">
                  Taux d’erreur {ghostPointsAnalytics.ghostRate}%
                </span>
              </div>
              <div className={KPICARD}>
                <span className={KPILABEL}>Délai moyen de réaction</span>
                <p className={KPIVALUE}>
                  {summary.averageDetectionDelay !== null ? `+${summary.averageDetectionDelay}s` : '—'}
                </p>
                <span className="text-[10px] text-zinc-400">Latence moyenne de saisie</span>
              </div>
              <div className={KPICARD}>
                <span className={KPILABEL}>Durée de la vidéo</span>
                <p className={KPIVALUE}>N/A</p>
                <span className="text-[10px] text-zinc-400">Non enregistrée en base</span>
              </div>
              <div className={KPICARD}>
                <span className={KPILABEL}>Probabilité de détection</span>
                <p className={KPIVALUE}>
                  {summary.detectionProbability !== null &&
                  summary.detectionProbability !== undefined
                    ? `${Math.round(summary.detectionProbability * 100)}%`
                    : '—'}
                </p>
                <span className="text-[10px] text-zinc-400">
                  Détections / (points configurés × observateurs)
                </span>
              </div>
            </div>
          </section>

          {/* ——— 2. Visualisations de la distribution ——— */}
          <section className="avoid-break mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
              2. Distribution des Détections
            </h2>
            {!hasObservations ? (
              <p className="mt-3 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-xs text-zinc-500">
                Aucune observation n’a encore été enregistrée pour ce projet.
              </p>
            ) : (
              <div className="mt-3 grid items-stretch gap-6 lg:grid-cols-5">
                <div className="avoid-break rounded-xl border border-line bg-white p-4 lg:col-span-3">
                  <h3 className="text-xs font-bold text-zinc-800">Détections dans le temps</h3>
                  <p className="mt-0.5 text-[10px] text-zinc-500">
                    Captures validées et points fantômes par tranche de 10 secondes.
                  </p>
                  <div className="mt-2">
                    <ReportDetectionChart points={detectionSeries} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-zinc-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold-700" /> Captures validées
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate" /> Points fantômes
                    </span>
                  </div>
                </div>
                <div className="avoid-break flex flex-col items-center justify-center rounded-xl border border-line bg-white p-4 lg:col-span-2">
                  <h3 className="self-start text-xs font-bold text-zinc-800">
                    Observations validées vs fantômes
                  </h3>
                  <ReportSplitRing
                    valid={summary.validObservationsCount}
                    ghost={summary.ghostPointsCount}
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold-700" /> Validées (
                      {summary.validObservationsCount})
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate" /> Fantômes (
                      {summary.ghostPointsCount})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ——— 3. Évaluation des Points Cibles ——— */}
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
              3. Évaluation des Points Cibles
            </h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className={TABLEHEAD}>
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Cible</th>
                    <th scope="col" className="px-4 py-2.5">Fenêtre Temporelle</th>
                    <th scope="col" className="px-4 py-2.5">Durée</th>
                    <th scope="col" className="px-4 py-2.5">Observateurs</th>
                    <th scope="col" className="px-4 py-2.5">Concordance</th>
                    <th scope="col" className="px-4 py-2.5">Délai Moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {pointsAnalytics.map((point) => (
                    <tr key={point.pointId} className="align-top">
                      <td className="px-4 py-3 font-semibold">{point.pointName}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono">
                        {formatSeconds(point.trameDebut)} → {formatSeconds(point.trameFin)}
                      </td>
                      <td className="px-4 py-3 font-mono">{point.targetDuration}s</td>
                      <td className="px-4 py-3">
                        {point.observerCount} / {summary.totalObservers}
                      </td>
                      <td className="px-4 py-3 font-bold text-zinc-900">{point.concordanceRate}%</td>
                      <td className="px-4 py-3 font-semibold text-gold-700">
                        {point.avgDelaySeconds !== null ? `+${point.avgDelaySeconds}s` : '—'}
                      </td>
                    </tr>
                  ))}
                  {pointsAnalytics.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-xs text-zinc-500">
                        Aucune fenêtre cible définie.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* ——— 4. Relevé détaillé groupé par fenêtre cible ——— */}
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
              4. Relevé des Observations par Fenêtre Cible
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Liste exhaustive des captures enregistrées, classées par fenêtre de validation
              puis points fantômes (hors trame).
            </p>

            {!hasObservations ? (
              <p className="mt-3 rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-xs text-zinc-500">
                Aucune observation à lister.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-4">
                {pointsAnalytics
                  .filter((point) => point.captures.length > 0)
                  .map((point) => (
                    <div
                      key={point.pointId}
                      className="avoid-break overflow-hidden rounded-xl border border-line"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-zinc-50 px-4 py-2.5">
                        <span className="text-xs font-bold text-zinc-800">{point.pointName}</span>
                        <span className="font-mono text-[11px] text-zinc-500">
                          {formatSeconds(point.trameDebut)} → {formatSeconds(point.trameFin)} ·{' '}
                          {point.captures.length} capture{point.captures.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-line bg-white text-[10px] uppercase tracking-wide text-zinc-400">
                          <tr>
                            <th scope="col" className="px-4 py-2">Horodatage (MM:SS)</th>
                            <th scope="col" className="px-4 py-2">Horodatage (sec)</th>
                            <th scope="col" className="px-4 py-2">Observateur</th>
                            <th scope="col" className="px-4 py-2">Délai</th>
                            <th scope="col" className="px-4 py-2">Soumission</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {point.captures.map((capture) => (
                            <tr key={capture.id} className="align-top">
                              <td className="whitespace-nowrap px-4 py-2.5 font-mono font-semibold text-gold-800">
                                {formatSeconds(capture.timestampTotal)}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-zinc-600">
                                {capture.timestampTotal}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="block font-mono text-zinc-700">
                                  {capture.observerAnonymousId}
                                </span>
                                {capture.observerEmail ? (
                                  <span className="block text-[10px] text-zinc-400">
                                    {capture.observerEmail}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-2.5">
                                {capture.delaySeconds !== null ? `+${capture.delaySeconds}s` : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-[11px] text-zinc-500">
                                {new Date(capture.createdAt).toLocaleString('fr-FR')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                {ghostPointsAnalytics.captures.length > 0 ? (
                  <div className="avoid-break overflow-hidden rounded-xl border border-line">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate/5 px-4 py-2.5">
                      <span className="text-xs font-bold text-slate">Points fantômes (hors trame)</span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {ghostPointsAnalytics.captures.length} fausse
                        {ghostPointsAnalytics.captures.length > 1 ? 's' : ''} alerte
                        {ghostPointsAnalytics.captures.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-line bg-white text-[10px] uppercase tracking-wide text-zinc-400">
                        <tr>
                          <th scope="col" className="px-4 py-2">Horodatage (MM:SS)</th>
                          <th scope="col" className="px-4 py-2">Horodatage (sec)</th>
                          <th scope="col" className="px-4 py-2">Observateur</th>
                          <th scope="col" className="px-4 py-2">Soumission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {ghostPointsAnalytics.captures.map((capture) => (
                          <tr key={capture.id} className="align-top">
                            <td className="whitespace-nowrap px-4 py-2.5 font-mono font-semibold text-slate">
                              {formatSeconds(capture.timestampTotal)}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-zinc-600">
                              {capture.timestampTotal}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="block font-mono text-zinc-700">
                                {capture.observerAnonymousId}
                              </span>
                              {capture.observerEmail ? (
                                <span className="block text-[10px] text-zinc-400">
                                  {capture.observerEmail}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-2.5 text-[11px] text-zinc-500">
                              {new Date(capture.createdAt).toLocaleString('fr-FR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* ——— 5. Bilan Individuel des Observateurs ——— */}
          <section className="avoid-break mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900">
              5. Bilan Individuel des Observateurs
            </h2>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className={TABLEHEAD}>
                  <tr>
                    <th scope="col" className="px-4 py-2.5">ID Anonyme Observateur</th>
                    <th scope="col" className="px-4 py-2.5">Total Captures</th>
                    <th scope="col" className="px-4 py-2.5">Cibles Détectées</th>
                    <th scope="col" className="px-4 py-2.5">Points Fantômes</th>
                    <th scope="col" className="px-4 py-2.5">Taux de Précision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {observersMetrics.map((obs) => (
                    <tr key={obs.userId} className="align-top">
                      <td className="px-4 py-3 font-mono font-medium">{obs.anonymousId}</td>
                      <td className="px-4 py-3">{obs.totalObservations}</td>
                      <td className="px-4 py-3 font-semibold text-gold-700">
                        {obs.validObservationsCount} ({obs.pointsDetectedCount}/
                        {project.totalDefinedPoints} cibles)
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate">{obs.ghostPointsCount}</td>
                      <td className="px-4 py-3 font-bold">{obs.precisionRate}%</td>
                    </tr>
                  ))}
                  {observersMetrics.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-xs text-zinc-500">
                        Aucun observateur pour le moment.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* ——— Cartouche de Signature & Validation ——— */}
          <div className="avoid-break mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
            <div className="flex justify-between gap-6">
              <div>
                <p className="font-semibold text-zinc-800">Responsable de l’Étude Scientifique :</p>
                <p className="mt-0.5 font-medium text-zinc-700">{author}</p>
                <p className="mt-6 text-zinc-400">Nom & Signature : _________________________</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-zinc-800">Visa & Date :</p>
                <p className="mt-0.5">
                  {formatDate(generatedAt.toISOString()) || ''} —{' '}
                  {generatedAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="mt-6 text-zinc-400">Cachet du laboratoire : ___________________</p>
              </div>
            </div>
            <p className="mt-6 text-center text-[10px] leading-relaxed text-zinc-400">
              Rapport généré par le moteur analytique ONA Field · Conforme aux exigences de
              la procédure d’observation indépendante à validation scientifique croisée. Les
              coordonnées spatiales (X/Y), l’espèce et la durée vidéo ne sont pas enregistrées par
              le protocole.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
