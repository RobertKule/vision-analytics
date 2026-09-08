'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { addProjectPoint, deleteProjectPoint } from '@/app/actions/projectActions'
import type { ActionResult, ProjectPointDto } from '@/lib/types'
import { formatWindow, inputClass, labelClass } from '@/components/admin/projects/projectFormat'

function PointRow({ point }: { point: ProjectPointDto }) {
  const router = useRouter()

  const runDelete = async () => {
    const result = await deleteProjectPoint(point.id)
    router.refresh()
    if (result.ok) {
      toast.success('Fenêtre supprimée', {
        description: `« ${point.pointName} » (${point.trameDebut} s → ${point.trameFin} s) a été retirée.`,
      })
    } else {
      toast.error('Suppression impossible', { description: result.error })
    }
  }

  const askDelete = () => {
    toast.warning('Supprimer cette fenêtre de validation ?', {
      description: `« ${point.pointName} » — les observations liées sont conservées.`,
      action: { label: 'Supprimer', onClick: () => void runDelete() },
      cancel: { label: 'Annuler', onClick: () => {} },
    })
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-5 items-center rounded-full bg-red-100 px-2 text-xs font-semibold text-red-700 dark:bg-red-900/50 dark:text-red-300">
          {point.pointName}
        </span>
        <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          {point.trameDebut} s → {point.trameFin} s
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          (durée {formatWindow(point.trameFin - point.trameDebut)})
        </span>
      </div>
      <button
        type="button"
        onClick={askDelete}
        aria-label={`Supprimer ${point.pointName}`}
        className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
      >
        Supprimer
      </button>
    </li>
  )
}

function AddPointForm({ projectId }: { projectId: string }) {
  const [pointName, setPointName] = useState('')
  const [trameDebut, setTrameDebut] = useState('')
  const [trameFin, setTrameFin] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!pointName.trim()) {
      toast.error('Nom manquant', { description: 'Le nom du point est obligatoire.' })
      return
    }
    if (trameDebut === '' || trameFin === '') {
      toast.error('Bornes manquantes', {
        description: 'Renseignez un début et une fin en secondes.',
      })
      return
    }

    const nextName = pointName.trim()
    startTransition(async () => {
      const result: ActionResult = await addProjectPoint({
        projectId,
        pointName,
        trameDebut: Number(trameDebut),
        trameFin: Number(trameFin),
      })
      if (result.ok) {
        setPointName('')
        setTrameDebut('')
        setTrameFin('')
        toast.success('Fenêtre de validation ajoutée', {
          description: `« ${nextName} » — de ${trameDebut} s à ${trameFin} s.`,
        })
        router.refresh()
      } else {
        toast.error('Ajout impossible', { description: result.error })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 p-4 dark:border-zinc-700 dark:bg-zinc-950/40"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Ajouter une fenêtre de validation
      </p>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_6rem_auto]">
        <div>
          <label htmlFor={`point-name-${projectId}`} className={labelClass}>
            Nom du point
          </label>
          <input
            id={`point-name-${projectId}`}
            type="text"
            value={pointName}
            onChange={(event) => setPointName(event.target.value)}
            placeholder="Ex. Point 2"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`point-debut-${projectId}`} className={labelClass}>
            Début (s)
          </label>
          <input
            id={`point-debut-${projectId}`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={trameDebut}
            onChange={(event) => setTrameDebut(event.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`point-fin-${projectId}`} className={labelClass}>
            Fin (s)
          </label>
          <input
            id={`point-fin-${projectId}`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={trameFin}
            onChange={(event) => setTrameFin(event.target.value)}
            placeholder="60"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isPending ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>

      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        Fenêtres exprimées en secondes (entiers). Elles doivent être disjointes pour attribuer
        automatiquement un point à chaque observation horodatée.
      </p>
    </form>
  )
}

export function ValidationWindowsPanel({
  projectId,
  points,
}: {
  projectId: string
  points: ProjectPointDto[]
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        Fenêtres de validation ({points.length})
      </h4>
      {points.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {points.map((point) => (
            <PointRow key={point.id} point={point} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Aucune fenêtre temporelle définie. Ajoutez-en une ci-dessous.
        </p>
      )}
      <AddPointForm projectId={projectId} />
    </div>
  )
}
