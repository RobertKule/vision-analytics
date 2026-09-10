'use client'

import { ImageIcon } from 'lucide-react'
import type { ProjectObservationRowDto } from '@/lib/types'
import { CAPTURE_IMAGE_UNAVAILABLE } from '@/lib/captureImageAccess'
import { observerLabelOf } from '@/lib/exportHelpers'
import { formatClock, formatDateTime } from '@/components/admin/projects/projectFormat'

function PointChip({ row }: { row: ProjectObservationRowDto }) {
  if (row.isGhostPoint || !row.pointLabel) {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
        Fantôme
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gold-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
      {row.pointLabel}
    </span>
  )
}

/**
 * Galerie / tableau des captures d'une sélection d'observations.
 *
 * Les images des captures sont servies par l'ENDPOINT SÉCURISÉ
 * (`/api/captures/<id>/image`) : les fichiers Google Drive restent privés, et le
 * serveur vérifie la session et l'autorisation avant de renvoyer le moindre octet.
 * Une image indisponible affiche « Image indisponible », jamais un détail technique.
 */
export default function CaptureGallery({
  rows,
  showObserver = true,
}: {
  rows: ProjectObservationRowDto[]
  showObserver?: boolean
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950">
        <ImageIcon aria-hidden="true" className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Aucune capture à afficher.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
            <th scope="col" className="px-4 py-2.5 font-semibold">Capture</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Horodatage</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Point</th>
            {showObserver ? (
              <th scope="col" className="px-4 py-2.5 font-semibold">Observateur</th>
            ) : null}
            <th scope="col" className="px-4 py-2.5 font-semibold">Soumission</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
          {rows.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
              <td className="px-4 py-2">
                <a
                  href={row.imageEndpoint}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Ouvrir la capture en grand"
                  className="group inline-flex"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.imageEndpoint}
                    alt={`Capture à ${formatClock(row.timestampTotal)}`}
                    loading="lazy"
                    onError={(event) => {
                      // Capture retirée du stockage ou lecture Drive impossible :
                      // on remplace la miniature par le message unique, sans détail.
                      const image = event.currentTarget
                      image.style.display = 'none'
                      image.parentElement?.setAttribute('data-unavailable', 'true')
                    }}
                    className="h-14 w-20 rounded-md border border-zinc-200 object-cover transition-transform group-hover:scale-105 dark:border-zinc-700"
                  />
                  <span className="hidden items-center rounded-md border border-dashed border-zinc-300 px-2 py-1 text-[10px] font-medium text-zinc-500 group-data-[unavailable=true]:inline-flex dark:border-zinc-700 dark:text-zinc-400">
                    {CAPTURE_IMAGE_UNAVAILABLE}
                  </span>
                </a>
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatClock(row.timestampTotal)}
                </span>
                <span className="ml-2 font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  {row.timestampTotal} s
                </span>
              </td>
              <td className="px-4 py-2">
                <PointChip row={row} />
              </td>
              {showObserver ? (
                <td className="max-w-[14rem] truncate px-4 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                  {observerLabelOf(row)}
                </td>
              ) : null}
              <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                {formatDateTime(row.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
