'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  setObserverAnalysisInclusion,
} from '@/app/actions/observerInclusionActions'
import type { ObserverInclusionSummaryDto, ObserverMetricDto } from '@/lib/types'
import { friendlyActionError } from '@/lib/actionError'

/**
 * PÉRIMÈTRE HUMAIN DE L'ANALYSE (§12, §13) — ADMIN uniquement.
 *
 * Affiche EXPLICITEMENT combien d'observateurs participent, combien sont comptés et
 * lesquels sont écartés. DÉCLASSER n'efface rien : les captures RAW, les sessions et
 * l'historique restent en base ; seul le moteur analytique courant cesse de compter
 * l'observateur — dans le numérateur COMME dans le dénominateur.
 */
export default function ObserverInclusionPanel({
  projectId,
  observers,
  inclusion,
  canManage,
}: {
  projectId: string
  /** Observateurs participant à l'analyse courante (donc non déclassés). */
  observers: ObserverMetricDto[]
  inclusion?: ObserverInclusionSummaryDto
  /** Réservé aux ADMIN : un analyste voit le périmètre mais ne le modifie pas. */
  canManage: boolean
}) {
  const router = useRouter()
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  if (!inclusion) return null

  const excludedIds = new Set(inclusion.excludedObservers.map((entry) => entry.userId))
  const excludable = observers.filter((observer) => !excludedIds.has(observer.userId))

  const run = (payload: {
    userId: string
    status: 'INCLUDED' | 'EXCLUDED'
    reason?: string | null
    done: string
  }) => {
    startTransition(async () => {
      const result = await setObserverAnalysisInclusion({
        projectId,
        userId: payload.userId,
        status: payload.status,
        reason: payload.reason ?? null,
      }).catch((error: unknown) => ({ ok: false as const, error: friendlyActionError(error, 'fr') }))
      if (result.ok) {
        toast.success(payload.done)
        setTarget('')
        setReason('')
        router.refresh()
      } else {
        toast.error('Modification impossible', { description: result.error })
      }
    })
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Périmètre humain de l’analyse
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Le dénominateur des concordances et probabilités est{' '}
            <strong className="font-semibold text-zinc-700 dark:text-zinc-200">
              {inclusion.included}
            </strong>{' '}
            observateur{inclusion.included > 1 ? 's' : ''} compté
            {inclusion.included > 1 ? 's' : ''} sur {inclusion.participating} participant
            {inclusion.participating > 1 ? 's' : ''} — l’observateur déclassé sort du numérateur
            ET du dénominateur.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/15 px-2.5 py-1 font-semibold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
            {inclusion.included} compté{inclusion.included > 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-50 px-2.5 py-1 font-semibold text-clay-700 dark:bg-clay-900/40 dark:text-clay-300">
            <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />
            {inclusion.excluded} déclassé{inclusion.excluded > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {inclusion.excludedObservers.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {inclusion.excludedObservers.map((entry) => (
            <li
              key={entry.userId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-clay-200 bg-clay-50/60 px-3 py-2 dark:border-clay-800 dark:bg-clay-900/20"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                  {entry.displayName}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {entry.reason ? `Motif : ${entry.reason}` : 'Aucun motif consigné'}
                  {entry.excludedAt
                    ? ` · ${new Date(entry.excludedAt).toLocaleDateString('fr-FR')}`
                    : ''}
                </p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    run({
                      userId: entry.userId,
                      status: 'INCLUDED',
                      done: 'Observateur rétabli dans l’analyse',
                    })
                  }
                  className="inline-flex h-7 items-center rounded-md border border-zinc-300 px-2.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-white disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  Rétablir
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Aucun observateur déclassé : toutes les données certifiées sont comptées.
        </p>
      )}

      {canManage && excludable.length > 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Déclasser un observateur
          </p>
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Aucune donnée n’est supprimée : ses captures restent consultables pour l’audit.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <label
                htmlFor={`exclude-observer-${projectId}`}
                className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
              >
                Observateur
              </label>
              <select
                id={`exclude-observer-${projectId}`}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900 focus:border-ink focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">Sélectionner…</option>
                {excludable.map((observer) => (
                  <option key={observer.userId} value={observer.userId}>
                    {observer.email || observer.anonymousId}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-[2]">
              <label
                htmlFor={`exclude-reason-${projectId}`}
                className="mb-1 block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
              >
                Motif scientifique (obligatoire)
              </label>
              <input
                id={`exclude-reason-${projectId}`}
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="Ex. protocole non respecté sur la passe 2"
                className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <button
              type="button"
              disabled={isPending || !target || reason.trim().length === 0}
              onClick={() =>
                run({
                  userId: target,
                  status: 'EXCLUDED',
                  reason: reason.trim(),
                  done: 'Observateur déclassé de l’analyse',
                })
              }
              className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              Déclasser
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
