'use client'

import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Trophy, Users } from 'lucide-react'
import type { ProjectObservationRowDto } from '@/lib/types'
import CaptureGallery from '@/components/admin/projects/CaptureGallery'
import { buildObserverGroups } from '@/components/admin/projects/observerGroups'
import { formatDate } from '@/components/admin/projects/projectFormat'

type ObserverActivityTabProps = {
  projectId: string
  projectTitle: string
  rows: ProjectObservationRowDto[]
}

const GOLD_LABEL = 'font-mono text-[11px] font-bold uppercase tracking-wide text-gold-600 dark:text-gold-400'

/**
 * Onglet « Activité des observateurs » : liste des observateurs, sélection,
 * puis panneau de leurs captures + téléchargement ZIP individuel.
 * Identifiant d'un observateur = son userId (toutes sessions confondues = « Actif »).
 */
export default function ObserverActivityTab({ projectId, projectTitle, rows }: ObserverActivityTabProps) {
  const groups = useMemo(() => buildObserverGroups(rows), [rows])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Aucun état dans un effet : le défaut est calculé au rendu (premier observateur).
  const activeObserverId = selectedId ?? groups[0]?.observerId ?? null
  const activeGroup = groups.find((group) => group.observerId === activeObserverId) ?? null

  const captures = useMemo(
    () => (activeGroup ? rows.filter((row) => row.observerId === activeGroup.observerId) : []),
    [rows, activeGroup],
  )

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-950">
        <Users aria-hidden="true" className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Aucune observation soumise — aucun observateur à afficher pour le moment.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      {/* ——— Liste des observateurs ——— */}
      <aside className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Observateurs ({groups.length})
        </p>
        <ul className="flex flex-col gap-1.5">
          {groups.map((group) => {
            const isActive = group.observerId === activeObserverId
            return (
              <li key={group.observerId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(group.observerId)}
                  aria-pressed={isActive}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'border-gold-600 bg-gold-500/10 dark:border-gold-400/60 dark:bg-gold-400/10'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {group.label}
                    </span>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      {group.count}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {group.ghostCount > 0 ? (
                      <span className={GOLD_LABEL}>{group.ghostCount} fantôme{group.ghostCount > 1 ? 's' : ''}</span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Trophy aria-hidden="true" className="h-3 w-3 text-gold-600" />
                      {group.validCount} validée{group.validCount > 1 ? 's' : ''}
                    </span>
                    <span>dernier {formatDate(group.lastAt)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* ——— Captures de l'observateur sélectionné ——— */}
      {activeGroup ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-zinc-900 dark:text-zinc-50">
                Captures de {activeGroup.label}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {activeGroup.count} observation{activeGroup.count > 1 ? 's' : ''} · du{' '}
                {formatDate(activeGroup.firstAt)} au {formatDate(activeGroup.lastAt)}
              </p>
            </div>
            <a
              href={`/api/admin/projects/${projectId}/export-observer-excel?userId=${encodeURIComponent(activeGroup.observerId)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:border-gold-500/60 hover:bg-gold-500/5 hover:text-gold-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-gold-400/50 dark:hover:bg-gold-400/5 dark:hover:text-gold-200"
              title="Télécharger le classeur individuel de cet observateur (ONA_Field_Observateur_…) — Synthèse, une feuille par type, Données brutes"
            >
              <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
              Classeur de l’observateur (.xlsx)
            </a>
            <a
              href={`/api/admin/projects/${projectId}/captures?observerId=${encodeURIComponent(activeGroup.observerId)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              Images de l’observateur (.zip)
            </a>
          </div>

          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Le bouton « Classeur de l’observateur » télécharge le rapport individuel{' '}
            <span className="font-mono">ONA_Field_Observateur_…_Date.xlsx</span> conforme à la
            spécification : Synthèse (points détectés uniques / points possibles, probabilité par
            type), une feuille par type d’observation utilisé, puis le relevé{' '}
            <span className="font-mono">Données_Brutes</span> de ses captures certifiées. Pour le
            projet « {projectTitle} », le ZIP « Images de l’observateur » rassemble ces captures et
            un relevé associé — quelques secondes selon le nombre d’images.
          </p>

          <CaptureGallery rows={captures} showObserver={false} />
        </section>
      ) : null}
    </div>
  )
}
