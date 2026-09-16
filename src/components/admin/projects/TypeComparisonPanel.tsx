'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { GitCompareArrows, Loader2 } from 'lucide-react'
import {
  compareAnalyticsTypes,
  listComparableTypes,
  type ComparableTypesDto,
  type ProjectAnalyticsOptions,
} from '@/app/actions/analyticsActions'
import {
  crossTypeAgreement,
  mostObservedPoints,
  type TypeComparisonModel,
  type TypePointCell,
} from '@/lib/typeComparison'
import { friendlyActionError } from '@/lib/actionError'
import GroupComparisonPanel from '@/components/admin/projects/GroupComparisonPanel'

/**
 * COMPARAISONS D'UN PROJET — deux modes, un seul moteur.
 *
 *  — « Par type » (§14) : la matrice point × type.
 *  — « Par groupes (A/B) » (§3, §6) : deux ensembles de types, agrégés par somme
 *    de leurs dénominateurs et de leurs numérateurs (cf. `GroupComparisonPanel`).
 *
 * Dans les deux cas l'interface ne calcule RIEN : elle envoie la sélection au
 * serveur, qui résout chaque type par le moteur analytique PARTAGÉ
 * (`resolveAnalyticsView`) et renvoie des chiffres déjà agrégés. Le taux affiché
 * pour un type est donc exactement celui du tableau de bord filtré sur ce type.
 */

/** Cellule de matrice : `null` = ce type ne porte pas ce point (pas « 0 % »). */
function RateCell({ cell }: { cell: TypePointCell | null }) {
  if (!cell) {
    return <span className="text-zinc-300 dark:text-zinc-600">—</span>
  }
  // Trois paliers, alignés sur la lecture éditoriale du reste du tableau de bord.
  const tone =
    cell.detectionRate >= 75
      ? 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
      : cell.detectionRate >= 40
        ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300'
        : 'bg-clay-50 text-clay-700 dark:bg-clay-900/40 dark:text-clay-300'
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${tone}`}>
        {cell.detectionRate} %
      </span>
      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
        {cell.observersDetected} obs. · {cell.detections} dét.
      </span>
    </div>
  )
}

export default function TypeComparisonPanel({
  projectId,
  options,
}: {
  projectId: string
  /** Sélecteur de version transmis tel quel : comparer une version compare son époque. */
  options?: ProjectAnalyticsOptions | null
}) {
  const [mode, setMode] = useState<'type' | 'group'>('type')
  const [available, setAvailable] = useState<ComparableTypesDto[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [model, setModel] = useState<TypeComparisonModel | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    listComparableTypes(projectId)
      .then((types) => {
        if (cancelled) return
        setAvailable(types)
        // Pré-sélection : les deux premiers types porteurs de points — deux colonnes
        // suffisent à répondre à « ce type est-il mieux détecté que l'autre ? ».
        const comparable = types.filter((type) => type.comparable).map((type) => type.type)
        setSelected(comparable.slice(0, 2))
      })
      .catch(() => {
        if (!cancelled) setAvailable([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const toggle = (type: string) => {
    setSelected((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    )
  }

  const run = () => {
    if (selected.length < 2) return
    startTransition(async () => {
      const result = await compareAnalyticsTypes(projectId, selected, options ?? null).catch(
        (error: unknown) => {
          toast.error('Comparaison impossible', { description: friendlyActionError(error, 'fr') })
          return null
        },
      )
      if (result) setModel(result)
    })
  }

  const agreement = useMemo(() => (model ? crossTypeAgreement(model) : null), [model])
  const topPoints = useMemo(() => (model ? mostObservedPoints(model, 5) : []), [model])

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Mode de comparaison : par type / par groupes ——— */}
      <div
        role="tablist"
        aria-label="Mode de comparaison"
        className="inline-flex w-fit items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        {(
          [
            { id: 'type', label: 'Par type' },
            { id: 'group', label: 'Par groupes (A/B)' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              mode === tab.id
                ? 'bg-ink text-milk dark:bg-milk dark:text-ink'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'group' ? (
        <GroupComparisonPanel
          projectId={projectId}
          available={available ?? []}
          options={options ?? null}
        />
      ) : (
        <>
      {/* ——— Sélection des types ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Comparaison de types d’observation
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Sélectionnez au moins deux types du même projet. Chaque colonne est calculée par le
              moteur analytique partagé — mêmes règles que le tableau de bord et les exports.
            </p>
          </div>
          <button
            type="button"
            disabled={isPending || selected.length < 2}
            onClick={run}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            {isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <GitCompareArrows aria-hidden="true" className="h-4 w-4" />
            )}
            {isPending ? 'Comparaison…' : 'Comparer'}
          </button>
        </div>

        {available === null ? (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">Chargement des types…</p>
        ) : available.length === 0 ? (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Aucun type d’observation configuré sur ce projet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {available.map((type) => {
              const checked = selected.includes(type.type)
              return (
                <li key={type.type || '__generic__'}>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      checked
                        ? 'border-gold-500/60 bg-gold-500/10 text-gold-800 dark:text-gold-200'
                        : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5'
                    } ${type.comparable ? '' : 'opacity-60'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(type.type)}
                      className="h-3.5 w-3.5 accent-gold-600"
                    />
                    {type.label}
                    <span className="font-normal text-zinc-400">
                      {type.pointCount} point{type.pointCount > 1 ? 's' : ''}
                      {type.comparable ? '' : ' · aucun point configuré'}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {model === null ? null : model.columns.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Aucun résultat à comparer.</p>
      ) : (
        <>
          {/* ——— Réponses scientifiques tirées directement de la matrice ——— */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Type le mieux détecté
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {model.bestType === null
                  ? '—'
                  : (model.columns.find((column) => column.type === model.bestType)?.label ?? '—')}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Taux de détection moyen le plus élevé sur ses points.
                {model.weakestType !== null && model.weakestType !== model.bestType
                  ? ` Le plus faible : ${
                      model.columns.find((column) => column.type === model.weakestType)?.label ?? '—'
                    }.`
                  : ''}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Cohérence entre types
              </p>
              <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {agreement === null ? '—' : `${Math.round(agreement * 100)} %`}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                {agreement === null
                  ? 'Aucun point porté par au moins deux types : la cohérence n’est pas calculable.'
                  : '1 − écart moyen des taux par point. 100 % = types parfaitement alignés.'}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Points les plus observés
              </p>
              <ol className="mt-1 flex flex-col gap-0.5">
                {topPoints.map((point) => (
                  <li key={point.pointLabel} className="text-xs text-zinc-700 dark:text-zinc-200">
                    <span className="font-semibold">{point.pointLabel}</span>{' '}
                    <span className="text-zinc-500 dark:text-zinc-400">
                      — {point.averageRate} %
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ——— Synthèse par type ——— */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Indicateurs par type
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50/50 font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-6 py-3">Type</th>
                    <th scope="col" className="px-6 py-3">Points</th>
                    <th scope="col" className="px-6 py-3">Observateurs</th>
                    <th scope="col" className="px-6 py-3">Points possibles</th>
                    <th scope="col" className="px-6 py-3">Détections</th>
                    <th scope="col" className="px-6 py-3">Concordance</th>
                    <th scope="col" className="px-6 py-3">Précision</th>
                    <th scope="col" className="px-6 py-3">Probabilité</th>
                    <th scope="col" className="px-6 py-3">Délai moyen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {model.columns.map((column) => (
                    <tr key={column.type || '__generic__'}>
                      <td className="px-6 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        {column.label}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {column.configuredPoints}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {column.observerCount}
                      </td>
                      <td className="px-6 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                        {column.possibleObservations}
                      </td>
                      <td className="px-6 py-3 font-semibold text-gold-700 dark:text-gold-400">
                        {column.detections}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {column.concordanceRate} %
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {column.precision === null ? '—' : `${Math.round(column.precision * 100)} %`}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {column.detectionProbability === null
                          ? '—'
                          : `${Math.round(column.detectionProbability * 100)} %`}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {column.averageDetectionDelay === null
                          ? '—'
                          : `${column.averageDetectionDelay} s`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ——— Matrice Point × Type ——— */}
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Matrice point × type
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Taux de détection = observateurs ayant détecté le point / observateurs du type. Un
                tiret signale un point que ce type ne porte pas — jamais 0 %.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50/50 font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-6 py-3">Point</th>
                    {model.columns.map((column) => (
                      <th key={column.type || '__generic__'} scope="col" className="px-6 py-3">
                        {column.label}
                      </th>
                    ))}
                    <th scope="col" className="px-6 py-3">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {model.rows.map((row) => (
                    <tr key={row.pointKey} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40">
                      <td className="px-6 py-3">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {row.pointLabel}
                        </span>
                        {row.videoName ? (
                          <span className="ml-2 font-mono text-[10px] text-zinc-400">
                            {row.videoName}
                          </span>
                        ) : null}
                      </td>
                      {model.columns.map((column) => (
                        <td key={column.type || '__generic__'} className="px-6 py-3">
                          <RateCell cell={row.byType[column.type] ?? null} />
                        </td>
                      ))}
                      <td className="px-6 py-3 font-semibold text-zinc-600 dark:text-zinc-300">
                        {row.spread === null ? '—' : `${row.spread} pts`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {model.emptyTypes.length > 0 ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Types sans aucun point configuré (colonne vide, non un zéro analytique) :{' '}
              {model.emptyTypes.map((type) => type || 'Générique').join(', ')}.
            </p>
          ) : null}
        </>
      )}
        </>
      )}
    </div>
  )
}
