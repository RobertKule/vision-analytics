'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, ShieldCheck, UserMinus, UserPlus } from 'lucide-react'
import {
  listAnalystAccessCandidates,
  type AnalystAccessCandidateDto,
} from '@/app/actions/projectActions'
import { shareProjectWithUser, unshareProjectFromUser } from '@/app/actions/analystActions'
import { friendlyActionError } from '@/lib/actionError'
import type { AnalystAccessDto } from '@/lib/types'

/**
 * ANALYSTES AUTORISÉS SUR UN PROJET (§1).
 *
 * L'ADMIN — et le propriétaire du projet — accordent ou retirent explicitement un
 * accès ANALYSTE de lecture/analyse. Deux niveaux seulement :
 *
 *   — « Visualiser les données » (canEdit = false) : voir le projet, ses expériences,
 *     ses fenêtres, ses statistiques, ses analyses, ses observations et ses exports.
 *     Aucune suppression, aucune administration, aucune reconfiguration.
 *   — « Modifier la configuration » (canEdit = true) : ajoute la configuration, le
 *     partage et la création de clés observateur, DANS le périmètre du projet.
 *
 * Rien n'est décidé ici : chaque case appelle une Server Action qui revérifie les
 * droits CÔTÉ SERVEUR. Masquer un bouton n'a jamais valeur de sécurité, et cette
 * interface ne fait que refléter une décision prise en base.
 */
export default function AnalystAccessPanel({
  projectId,
  projectTitle,
  /** Accès déjà accordés, fournis par le chargement serveur de la page. */
  initialAccess,
}: {
  projectId: string
  projectTitle: string
  initialAccess: AnalystAccessDto[]
}) {
  const [candidates, setCandidates] = useState<AnalystAccessCandidateDto[] | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    listAnalystAccessCandidates(projectId)
      .then((rows) => {
        if (!cancelled) setCandidates(rows)
      })
      .catch(() => {
        if (!cancelled) setCandidates([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const grantedCount = (candidates ?? []).filter((candidate) => candidate.granted).length
  const knownGranted = initialAccess.length
  const visibleGranted = candidates === null ? knownGranted : grantedCount

  const applyGrant = (candidate: AnalystAccessCandidateDto, grant: boolean, canEdit: boolean) => {
    setBusyUserId(candidate.userId)
    startTransition(async () => {
      const result = grant
        ? await shareProjectWithUser({ projectId, username: candidate.username, canEdit }).catch(
            (error: unknown) => ({
              ok: false as const,
              error: friendlyActionError(error, 'fr'),
            }),
          )
        : await unshareProjectFromUser({ projectId, userId: candidate.userId }).catch(
            (error: unknown) => ({
              ok: false as const,
              error: friendlyActionError(error, 'fr'),
            }),
          )

      setBusyUserId(null)
      if (!result.ok) {
        toast.error(grant ? 'Attribution impossible' : 'Retrait impossible', {
          description: result.error,
        })
        return
      }

      // Relecture serveur : l'interface affiche l'état RÉEL, jamais une supposition.
      const refreshed = await listAnalystAccessCandidates(projectId).catch(() => null)
      if (refreshed) setCandidates(refreshed)
      toast.success(
        grant
          ? `Accès accordé à ${candidate.username}`
          : `Accès retiré à ${candidate.username}`,
        {
          description: grant
            ? canEdit
              ? 'Permission : modifier la configuration.'
              : 'Permission : visualiser les données.'
            : 'Le compte conserve son existence, seul l’accès au projet est retiré.',
        },
      )
    })
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
            Analystes autorisés
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Projet « {projectTitle} ». Cochez un analyste pour lui accorder un accès en lecture et
            en analyse. Un analyste autorisé ne peut jamais supprimer le projet, ses expériences,
            ses types, ses fenêtres ou ses captures, ni administrer des comptes.
          </p>
        </div>
        <span className="inline-flex items-center rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {visibleGranted} analyste{visibleGranted > 1 ? 's' : ''} autorisé
          {visibleGranted > 1 ? 's' : ''}
        </span>
      </div>

      {candidates === null ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          Chargement des comptes analystes…
        </p>
      ) : candidates.length === 0 ? (
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          Aucun compte analyste actif à autoriser.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800">
          {candidates.map((candidate) => {
            const busy = busyUserId === candidate.userId && isPending
            return (
              <li
                key={candidate.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={candidate.granted}
                    disabled={busy}
                    onChange={(event) => applyGrant(candidate, event.target.checked, candidate.canEdit)}
                    aria-label={`Autoriser ${candidate.username} sur ce projet`}
                    className="h-4 w-4 accent-gold-600"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {candidate.username}
                      {busy ? (
                        <Loader2
                          aria-hidden="true"
                          className="ml-2 inline h-3 w-3 animate-spin text-zinc-400"
                        />
                      ) : null}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                      {candidate.email}
                    </span>
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                    Permission
                    <select
                      value={candidate.canEdit ? 'edit' : 'view'}
                      disabled={!candidate.granted || busy}
                      onChange={(event) =>
                        applyGrant(candidate, true, event.target.value === 'edit')
                      }
                      className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-[11px] font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                    >
                      <option value="view">Visualiser les données</option>
                      <option value="edit">Modifier la configuration</option>
                    </select>
                  </label>

                  {candidate.granted ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyGrant(candidate, false, false)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5"
                      title="Retirer l’accès de cet analyste au projet"
                    >
                      <UserMinus aria-hidden="true" className="h-3.5 w-3.5" />
                      Retirer
                    </button>
                  ) : (
                    <span
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-2.5 text-[11px] font-semibold text-zinc-400 dark:border-zinc-700 dark:text-zinc-600"
                      title="Cochez la case pour accorder l’accès"
                    >
                      <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
                      Aucun accès
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-4 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Le retrait d’un accès ne supprime AUCUNE donnée : ni le compte, ni le projet, ni les
        observations déjà réalisées. L’analyste cesse simplement de voir ce projet.
      </p>
    </section>
  )
}
