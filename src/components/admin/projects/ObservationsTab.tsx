'use client'

import { useMemo, useState } from 'react'
import { Filter } from 'lucide-react'
import type { ProjectObservationRowDto, ProjectPointDto } from '@/lib/types'
import CaptureGallery from '@/components/admin/projects/CaptureGallery'
import { observerLabelOf } from '@/lib/exportHelpers'

const selectClass =
  'h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15'

type ObservationsTabProps = {
  rows: ProjectObservationRowDto[]
  points: ProjectPointDto[]
}

/**
 * Onglet « Observations » : relevé filtrable des captures soumises.
 * Filtres locaux (type validé/fantôme, point cible, observateur) appliqués en mémoire.
 */
export default function ObservationsTab({ rows, points }: ObservationsTabProps) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'valid' | 'ghost'>('all')
  const [pointFilter, setPointFilter] = useState<string>('all')
  const [observerFilter, setObserverFilter] = useState<string>('all')

  const observers = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      if (!map.has(row.observerId)) map.set(row.observerId, observerLabelOf(row))
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (typeFilter === 'valid' && row.isGhostPoint) return false
      if (typeFilter === 'ghost' && !row.isGhostPoint) return false
      if (pointFilter === 'ghost') {
        if (!row.isGhostPoint && row.pointId) return false
      } else if (pointFilter !== 'all' && row.pointId !== pointFilter) {
        return false
      }
      if (observerFilter !== 'all' && row.observerId !== observerFilter) return false
      return true
    })
  }, [rows, typeFilter, pointFilter, observerFilter])

  const count = (pred: (row: ProjectObservationRowDto) => boolean) => rows.filter(pred).length

  return (
    <div className="flex flex-col gap-4">
      {/* ——— Barre de filtres ——— */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter aria-hidden="true" className="h-4 w-4 text-zinc-400" />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer les observations">
          <select
            aria-label="Type d’observation"
            className={selectClass}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as 'all' | 'valid' | 'ghost')}
          >
            <option value="all">Toutes ({rows.length})</option>
            <option value="valid">Validées ({count((r) => !r.isGhostPoint)})</option>
            <option value="ghost">Fantômes ({count((r) => r.isGhostPoint)})</option>
          </select>

          <select
            aria-label="Point cible"
            className={selectClass}
            value={pointFilter}
            onChange={(event) => setPointFilter(event.target.value)}
          >
            <option value="all">Tous les points</option>
            {points.map((point) => (
              <option key={point.id} value={point.id}>
                {point.pointName}
              </option>
            ))}
            <option value="ghost">Hors trame (fantôme)</option>
          </select>

          <select
            aria-label="Observateur"
            className={selectClass}
            value={observerFilter}
            onChange={(event) => setObserverFilter(event.target.value)}
          >
            <option value="all">Tous les observateurs ({observers.length})</option>
            {observers.map(([observerId, label]) => (
              <option key={observerId} value={observerId}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {filtered.length} observation{filtered.length > 1 ? 's' : ''} affichée
        {filtered.length > 1 ? 's' : ''} — cliquez sur une miniature pour l’ouvrir en grand.
      </p>

      <CaptureGallery rows={filtered} showObserver />
    </div>
  )
}
