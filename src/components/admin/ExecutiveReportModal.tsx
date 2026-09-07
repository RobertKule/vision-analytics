'use client'

import type { ProjectAnalyticsDto } from '@/lib/types'

type ExecutiveReportModalProps = {
  isOpen: boolean
  onClose: () => void
  analytics: ProjectAnalyticsDto
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ExecutiveReportModal({
  isOpen,
  onClose,
  analytics,
}: ExecutiveReportModalProps) {
  if (!isOpen) return null

  const { project, summary, pointsAnalytics, ghostPointsAnalytics, observersMetrics } = analytics

  const handlePrint = () => {
    window.print()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-6"
    >
      <div className="relative flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 print:max-h-none print:w-full print:border-none print:shadow-none print:rounded-none">
        {/* Barre d'action supérieure (masquée à l'impression) */}
        <header className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">
              📑
            </span>
            <h2 id="report-modal-title" className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              Rapport Exécutif d’Analyse — Aperçu & Impression PDF
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <span aria-hidden="true">🖨️</span> Imprimer / Enregistrer en PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Fermer le rapport"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ——— CONTENU DU RAPPORT FORMEL (Imprimable) ——— */}
        <div className="flex-1 overflow-y-auto p-8 font-sans text-zinc-900 dark:text-zinc-100 print:overflow-visible print:p-0">
          {/* Entête institutionnelle */}
          <div className="border-b-2 border-red-600 pb-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-red-600">
                  Vision Analytics · Protocole Scientifique en Double Aveugle
                </p>
                <h1 className="mt-1 text-2xl font-black text-zinc-950 dark:text-white sm:text-3xl">
                  Rapport Exécutif de Concordance
                </h1>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  Réf. Étude : VA-{project.id.slice(0, 8).toUpperCase()} · Émis le{' '}
                  {new Date().toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block rounded-lg bg-zinc-100 px-3 py-1 font-mono text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  CONFIDENTIEL
                </span>
              </div>
            </div>

            {/* Métadonnées de l'étude */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-zinc-50 p-4 text-xs dark:bg-zinc-950 sm:grid-cols-4">
              <div>
                <span className="text-zinc-500">Projet Analysé :</span>
                <p className="font-bold text-zinc-900 dark:text-zinc-100">{project.title}</p>
              </div>
              <div>
                <span className="text-zinc-500">Vidéo Source :</span>
                <p className="font-mono font-medium">{project.videoUrl || 'Non spécifiée'}</p>
              </div>
              <div>
                <span className="text-zinc-500">Cibles Scientifiques :</span>
                <p className="font-bold">{project.totalDefinedPoints} point(s)</p>
              </div>
              <div>
                <span className="text-zinc-500">Observateurs Actifs :</span>
                <p className="font-bold">{summary.totalObservers} participant(s)</p>
              </div>
            </div>
          </div>

          {/* ——— Indicateurs Clés de Synthèse ——— */}
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              1. Synthèse des Résultats d’Observation
            </h2>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-500">Taux de Concordance</span>
                <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">
                  {summary.overallConcordanceRate}%
                </p>
                <span className="text-[10px] text-zinc-400">Cohérence inter-observateurs</span>
              </div>

              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-500">Précision de Détection</span>
                <p className="mt-1 text-2xl font-black text-zinc-900 dark:text-zinc-100">
                  {summary.overallPrecisionRate}%
                </p>
                <span className="text-[10px] text-zinc-400">
                  {summary.validObservationsCount} / {summary.totalObservations} captures
                </span>
              </div>

              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-500">Fausses Alertes</span>
                <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">
                  {summary.ghostPointsCount}
                </p>
                <span className="text-[10px] text-zinc-400">Points fantômes détectés</span>
              </div>

              <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="text-[11px] text-zinc-500">Temps de Réaction Moyen</span>
                <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {summary.averageDetectionDelay !== null ? `+${summary.averageDetectionDelay}s` : '—'}
                </p>
                <span className="text-[10px] text-zinc-400">Latence moyenne de saisie</span>
              </div>
            </div>
          </section>

          {/* ——— Tableau Détaillé des Cibles ——— */}
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              2. Évaluation des Points Cibles
            </h2>

            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Cible</th>
                    <th scope="col" className="px-4 py-2.5">Fenêtre Temporelle</th>
                    <th scope="col" className="px-4 py-2.5">Durée</th>
                    <th scope="col" className="px-4 py-2.5">Observateurs</th>
                    <th scope="col" className="px-4 py-2.5">Concordance</th>
                    <th scope="col" className="px-4 py-2.5">Délai Moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {pointsAnalytics.map((point) => (
                    <tr key={point.pointId}>
                      <td className="px-4 py-3 font-semibold">{point.pointName}</td>
                      <td className="px-4 py-3 font-mono">
                        {formatSeconds(point.trameDebut)} - {formatSeconds(point.trameFin)}
                      </td>
                      <td className="px-4 py-3 font-mono">{point.targetDuration}s</td>
                      <td className="px-4 py-3">
                        {point.observerCount} / {summary.totalObservers}
                      </td>
                      <td className="px-4 py-3 font-bold text-zinc-900 dark:text-zinc-100">
                        {point.concordanceRate}%
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                        {point.avgDelaySeconds !== null ? `+${point.avgDelaySeconds}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ——— Distribution des Fausses Alertes ——— */}
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              3. Analyse des Fausses Alertes (Points Fantômes)
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Un total de {ghostPointsAnalytics.totalGhostPoints} point(s) fantôme(s) a été consigné
              hors des fenêtres d’acceptation scientifique, représentant un taux d’erreur global de{' '}
              <strong>{ghostPointsAnalytics.ghostRate}%</strong>.
            </p>

            {ghostPointsAnalytics.timelineDistribution.filter((b) => b.count > 0).length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ghostPointsAnalytics.timelineDistribution
                  .filter((b) => b.count > 0)
                  .map((bucket) => (
                    <div
                      key={bucket.startSecond}
                      className="rounded-lg border border-red-200 bg-red-50/50 p-2 text-center text-xs dark:border-red-900 dark:bg-red-950/20"
                    >
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">
                        Tranche {bucket.intervalLabel}
                      </span>
                      <p className="font-bold text-red-600 dark:text-red-400">
                        {bucket.count} fausse{bucket.count > 1 ? 's' : ''} alerte{bucket.count > 1 ? 's' : ''}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* ——— Tableau de Rigueur des Observateurs ——— */}
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              4. Bilan Individuel des Observateurs
            </h2>

            <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">ID Anonyme Observateur</th>
                    <th scope="col" className="px-4 py-2.5">Total Captures</th>
                    <th scope="col" className="px-4 py-2.5">Cibles Détectées</th>
                    <th scope="col" className="px-4 py-2.5">Points Fantômes</th>
                    <th scope="col" className="px-4 py-2.5">Taux de Précision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {observersMetrics.map((obs) => (
                    <tr key={obs.userId}>
                      <td className="px-4 py-3 font-mono font-medium">{obs.anonymousId}</td>
                      <td className="px-4 py-3">{obs.totalObservations}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                        {obs.validObservationsCount} ({obs.pointsDetectedCount}/{project.totalDefinedPoints} cibles)
                      </td>
                      <td className="px-4 py-3 font-semibold text-red-600 dark:text-red-400">
                        {obs.ghostPointsCount}
                      </td>
                      <td className="px-4 py-3 font-bold">{obs.precisionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ——— Cartouche de Signature & Validation ——— */}
          <div className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800 print:mt-16">
            <div className="flex justify-between">
              <div>
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Responsable de l’Étude Scientifique :
                </p>
                <p className="mt-8 text-zinc-400">Nom & Signature : _________________________</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">Visa & Date :</p>
                <p className="mt-8 text-zinc-400">Cachet du laboratoire : ___________________</p>
              </div>
            </div>
            <p className="mt-6 text-center text-[10px] text-zinc-400">
              Rapport généré par le moteur analytique Vision Analytics · Conforme aux exigences du
              protocole d’analyse vidéo en double aveugle.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
