'use client'

import { Download, Ghost, Printer, Target, Timer, Users } from 'lucide-react'
import type { ProjectAnalyticsDto } from '@/lib/types'
import type { Locale, AnalyticsText } from '@/lib/i18n'

type AnalystAnalyticsProps = {
  locale: Locale
  t: AnalyticsText
  analytics: ProjectAnalyticsDto
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function shortId(id: string): string {
  return id.slice(0, 6)
}

/** Export CSV brut des mesures (points cibles + fantômes). */
function exportCsv(analytics: ProjectAnalyticsDto, locale: Locale): void {
  const rows: string[][] = [['project', 'title', 'window', 'observer', 'timestamp_s', 'delay_s', 'ghost']]
  for (const point of analytics.pointsAnalytics) {
    for (const capture of point.captures) {
      rows.push([
        analytics.project.title,
        analytics.project.id,
        point.pointName,
        capture.observerAnonymousId,
        String(capture.timestampTotal),
        capture.delaySeconds === null ? '' : String(capture.delaySeconds),
        capture.isGhostPoint ? '1' : '0',
      ])
    }
  }
  for (const capture of analytics.ghostPointsAnalytics.captures) {
    rows.push([
      analytics.project.title,
      analytics.project.id,
      locale === 'fr' ? 'fantôme' : 'ghost',
      capture.observerAnonymousId,
      String(capture.timestampTotal),
      '',
      '1',
    ])
  }
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    )
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `vision-analytics-${analytics.project.id}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function AnalystAnalytics({ locale, t, analytics }: AnalystAnalyticsProps) {
  const summary = analytics.summary
  const hasWindows = analytics.pointsAnalytics.length > 0
  const hasData = summary.totalObservations > 0
  const totalGhostBuckets = analytics.ghostPointsAnalytics.timelineDistribution
  const maxBucket = Math.max(1, ...totalGhostBuckets.map((bucket) => bucket.count))

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
        {stat(t.summaryObservations, String(summary.totalObservations), Users, 'bg-forest-600')}
        {stat(t.summaryObservers, String(summary.totalObservers), Users, 'bg-mist-600')}
        {stat(t.summaryConcordance, `${summary.overallConcordanceRate}%`, Target, 'bg-emerald-600')}
        {stat(t.summaryPrecision, `${summary.overallPrecisionRate}%`, Target, 'bg-forest-500')}
        {stat(t.summaryGhost, String(summary.ghostPointsCount), Ghost, 'bg-amber-500')}
        {stat(
          t.summaryDelay,
          summary.averageDetectionDelay === null ? '—' : `${summary.averageDetectionDelay}s`,
          Timer,
          'bg-zinc-700',
        )}
      </section>

      {/* ——— Exports ——— */}
      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => exportCsv(analytics, locale)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-forest-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-forest-500"
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          CSV
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 px-4 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
        >
          <Printer aria-hidden="true" className="h-3.5 w-3.5" />
          PDF
        </button>
      </section>

      {/* ——— Concordance par fenêtre cible ——— */}
      <section className={card}>
        <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
          <Target aria-hidden="true" className="h-4 w-4 text-forest-600 dark:text-forest-400" />
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-forest-500/10 px-2.5 py-1 font-mono text-xs font-bold text-forest-700 dark:text-forest-400">
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
                      className="h-full rounded-full bg-gradient-to-r from-forest-500 to-emerald-500"
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
            <Ghost aria-hidden="true" className="h-4 w-4 text-amber-500" />
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
                      className="h-full rounded-full bg-amber-500"
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
            <Users aria-hidden="true" className="h-4 w-4 text-mist-600 dark:text-mist-400" />
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
                          ? 'bg-forest-500/10 text-forest-700 dark:text-forest-400'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
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
    </div>
  )
}
