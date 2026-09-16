'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { GitCompareArrows, Loader2 } from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import {
  compareAnalyticsGroups,
  type ComparableTypesDto,
  type ProjectAnalyticsOptions,
} from '@/app/actions/analyticsActions'
import {
  GROUP_A_LABEL,
  GROUP_B_LABEL,
  groupRateGap,
  type GroupComparisonModel,
  type GroupComparisonSide,
} from '@/lib/typeComparison'
import { friendlyActionError } from '@/lib/actionError'
import ClientChart from '@/components/charts/ClientChart'

/**
 * COMPARAISON PAR GROUPES A/B (§3, §6).
 *
 * Un groupe est un ENSEMBLE de types d'observation du MÊME projet. L'interface ne
 * calcule RIEN : elle envoie les deux sélections au serveur, qui résout chaque type
 * par le moteur analytique PARTAGÉ (`resolveAnalyticsView`) puis SOMME les
 * dénominateurs et les numérateurs (`buildGroupComparison`).
 *
 *     possibles(groupe) = Σ (points du type × observateurs PARTICIPANTS du type)
 *     taux(groupe) = Σ détections / Σ possibles
 *
 * Le tableau et les DEUX graphiques circulaires lisent exactement le même objet :
 * les chiffres affichés ne peuvent donc pas diverger de ceux du tableau de bord.
 */

const COLOR_DETECTED = '#BD8F2E' // or — points détectés
const COLOR_UNDETECTED = '#4A4E57' // ardoise — points possibles non détectés
const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #E5E0D8',
  fontSize: 12,
} as const

/** Un graphique circulaire par groupe : détectés vs non détectés, mêmes chiffres que la ligne. */
function GroupPie({ side }: { side: GroupComparisonSide }) {
  const slices = [
    { id: 'detected', name: 'Détectés', value: side.detections, fill: COLOR_DETECTED },
    { id: 'undetected', name: 'Non détectés', value: side.undetected, fill: COLOR_UNDETECTED },
  ]
  const total = side.detections + side.undetected

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{side.label}</h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {side.typeCount} type{side.typeCount > 1 ? 's' : ''} ·{' '}
        {side.types.map((type) => type.label).join(', ')}
      </p>

      {total === 0 ? (
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          Aucune observation possible sur ce groupe : le taux n’est pas calculable.
        </p>
      ) : (
        <div className="mt-3 flex items-center justify-center gap-6">
          <div className="h-48 w-full max-w-[15rem]">
            <ClientChart>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="85%"
                    paddingAngle={3}
                    strokeWidth={1}
                    isAnimationActive={false}
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.id} fill={slice.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </ClientChart>
          </div>
          <ul className="flex flex-col gap-2 text-xs">
            {slices.map((slice) => (
              <li key={slice.id} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: slice.fill }}
                />
                <span className="text-zinc-600 dark:text-zinc-300">{slice.name}</span>
                <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {slice.value}
                </span>
              </li>
            ))}
            <li className="mt-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <span className="text-zinc-600 dark:text-zinc-300">Taux pondéré</span>{' '}
              <span className="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                {side.rate === null ? '—' : `${Math.round(side.rate * 10000) / 100} %`}
              </span>
            </li>
          </ul>
        </div>
      )}
    </section>
  )
}

/** Sélecteur de types d'un groupe : cases à cocher, un type ne pouvant être que dans un groupe. */
function GroupSelector({
  label,
  description,
  types,
  selected,
  disabledTypes,
  onToggle,
}: {
  label: string
  description: string
  types: ComparableTypesDto[]
  selected: readonly string[]
  /** Types déjà pris par l'autre groupe — proposés mais non sélectionnables. */
  disabledTypes: readonly string[]
  onToggle: (type: string) => void
}) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{description}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {types.map((type) => {
          const checked = selected.includes(type.type)
          const taken = !checked && disabledTypes.includes(type.type)
          return (
            <li key={`${label}-${type.type || '__generic__'}`}>
              <label
                title={taken ? 'Ce type est déjà dans l’autre groupe.' : undefined}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  taken
                    ? 'cursor-not-allowed border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-600'
                    : checked
                      ? 'cursor-pointer border-gold-500/60 bg-gold-500/10 text-gold-800 dark:text-gold-200'
                      : 'cursor-pointer border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={taken}
                  onChange={() => onToggle(type.type)}
                  className="h-3.5 w-3.5 accent-gold-600"
                />
                {type.label}
                <span className="font-normal text-zinc-400">
                  {type.pointCount} point{type.pointCount > 1 ? 's' : ''}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function GroupComparisonPanel({
  projectId,
  available,
  options,
}: {
  projectId: string
  /** Types comparables du projet — chargés une fois par le panneau parent. */
  available: ComparableTypesDto[]
  /** Sélecteur de version transmis tel quel : comparer une version compare son époque. */
  options?: ProjectAnalyticsOptions | null
}) {
  const [groupASelection, setGroupASelection] = useState<string[]>([])
  const [groupBSelection, setGroupBSelection] = useState<string[]>([])
  const [model, setModel] = useState<GroupComparisonModel | null>(null)
  const [isPending, startTransition] = useTransition()

  const toggle = (
    side: 'a' | 'b',
    type: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    other: readonly string[],
  ) => {
    if (other.includes(type)) return // un type ne peut pas être dans les deux groupes
    setter((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    )
  }

  const gap = useMemo(() => (model ? groupRateGap(model) : null), [model])
  const canRun = groupASelection.length > 0 && groupBSelection.length > 0 && !isPending

  const run = () => {
    if (!canRun) return
    startTransition(async () => {
      const result = await compareAnalyticsGroups(
        projectId,
        groupASelection,
        groupBSelection,
        options ?? null,
      ).catch((error: unknown) => {
        toast.error('Comparaison impossible', { description: friendlyActionError(error, 'fr') })
        return null
      })
      if (!result) return
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setModel(result.model)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Comparaison par groupes
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Répartissez les types du projet en deux groupes (au moins un type par groupe, aucun
              type dans les deux). Les points possibles d’un groupe sont la somme des points
              possibles de ses types — jamais un dénominateur commun.
            </p>
          </div>
          <button
            type="button"
            disabled={!canRun}
            onClick={run}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            {isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <GitCompareArrows aria-hidden="true" className="h-4 w-4" />
            )}
            {isPending ? 'Comparaison…' : 'Comparer les groupes'}
          </button>
        </div>

        {available.length === 0 ? (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Aucun type d’observation configuré sur ce projet.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <GroupSelector
              label={GROUP_A_LABEL}
              description="Types d’observation du premier groupe."
              types={available}
              selected={groupASelection}
              disabledTypes={groupBSelection}
              onToggle={(type) => toggle('a', type, setGroupASelection, groupBSelection)}
            />
            <GroupSelector
              label={GROUP_B_LABEL}
              description="Types d’observation du second groupe."
              types={available}
              selected={groupBSelection}
              disabledTypes={groupASelection}
              onToggle={(type) => toggle('b', type, setGroupBSelection, groupASelection)}
            />
          </div>
        )}
      </section>

      {model === null ? null : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <GroupPie side={model.groupA} />
            <GroupPie side={model.groupB} />
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Résultats par groupe
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Taux pondéré = détections du groupe / points possibles du groupe. Chaque type garde
                son propre dénominateur (points du type × observateurs ayant participé à ce type).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50/50 font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-6 py-3">Groupe</th>
                    <th scope="col" className="px-6 py-3">Types</th>
                    <th scope="col" className="px-6 py-3">Observateurs</th>
                    <th scope="col" className="px-6 py-3">Points possibles</th>
                    <th scope="col" className="px-6 py-3">Détections</th>
                    <th scope="col" className="px-6 py-3">Non détectés</th>
                    <th scope="col" className="px-6 py-3">Taux pondéré</th>
                    <th scope="col" className="px-6 py-3">Fausses alertes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {[model.groupA, model.groupB].map((side) => (
                    <tr key={side.label}>
                      <td className="px-6 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                        {side.label}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {side.typeCount}
                      </td>
                      <td className="px-6 py-3 text-zinc-700 dark:text-zinc-300">
                        {side.observerCount}
                      </td>
                      <td className="px-6 py-3 font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                        {side.possibleObservations}
                      </td>
                      <td className="px-6 py-3 font-semibold tabular-nums text-gold-700 dark:text-gold-400">
                        {side.detections}
                      </td>
                      <td className="px-6 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                        {side.undetected}
                      </td>
                      <td className="px-6 py-3 font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                        {side.rate === null ? '—' : `${Math.round(side.rate * 10000) / 100} %`}
                      </td>
                      <td className="px-6 py-3 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {side.ghostEvents}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {gap !== null ? (
              <p className="border-t border-zinc-100 px-6 py-3 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                Écart de taux pondéré : {gap > 0 ? '+' : ''}
                {gap} point{gap === 1 ? '' : 's'} de pourcentage ({GROUP_A_LABEL} − {GROUP_B_LABEL}).
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-100 p-6 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Détail des types par groupe
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Chaque ligne montre le dénominateur propre du type, tel que les groupes l’additionnent.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-100 bg-zinc-50/50 font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="px-6 py-3">Groupe</th>
                    <th scope="col" className="px-6 py-3">Type</th>
                    <th scope="col" className="px-6 py-3">Points</th>
                    <th scope="col" className="px-6 py-3">Observateurs</th>
                    <th scope="col" className="px-6 py-3">Points possibles</th>
                    <th scope="col" className="px-6 py-3">Détections</th>
                    <th scope="col" className="px-6 py-3">Taux</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {[model.groupA, model.groupB].flatMap((side) =>
                    side.types.map((type) => (
                      <tr key={`${side.label}-${type.type || '__generic__'}`}>
                        <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">{side.label}</td>
                        <td className="px-6 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                          {type.label}
                        </td>
                        <td className="px-6 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {type.pointCount}
                        </td>
                        <td className="px-6 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {type.participants}
                        </td>
                        <td className="px-6 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {type.possibleObservations}
                        </td>
                        <td className="px-6 py-3 tabular-nums font-semibold text-gold-700 dark:text-gold-400">
                          {type.detections}
                        </td>
                        <td className="px-6 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                          {type.rate === null ? '—' : `${Math.round(type.rate * 10000) / 100} %`}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
