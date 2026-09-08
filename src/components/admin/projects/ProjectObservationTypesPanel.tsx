'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { updateProjectObservationTypes } from '@/app/actions/projectActions'
import type { ActionResult } from '@/lib/types'
import ObservationTypesEditor from '@/components/admin/projects/ObservationTypesEditor'
import { friendlyActionError } from '@/lib/actionError'

type ProjectObservationTypesPanelProps = {
  projectId: string
  /** Types actuellement persistés (servent de référence pour la réinitialisation). */
  observationTypes: string[]
  archived: boolean
}

/**
 * Panneau « Types d'observation » de la fiche projet : édite la liste proposée aux
 * observateurs et la persiste via une Server Action réservée aux administrateurs.
 * L'état local est initialisé au montage ; « Réinitialiser » revient à la liste persistée.
 */
export default function ProjectObservationTypesPanel({
  projectId,
  observationTypes,
  archived,
}: ProjectObservationTypesPanelProps) {
  const router = useRouter()
  const [types, setTypes] = useState<string[]>(observationTypes)
  const [isPending, startTransition] = useTransition()

  const isDirty = types.join('') !== observationTypes.join('')

  const reset = () => setTypes(observationTypes)

  const save = () => {
    if (archived || !isDirty) return
    const payload = types
    startTransition(async () => {
      const result: ActionResult = await updateProjectObservationTypes(projectId, payload).catch(
        (error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }),
      )
      if (result.ok) {
        toast.success('Types d’observation enregistrés', {
          description:
            payload.length > 0
              ? `${payload.length} libellé${payload.length > 1 ? 's' : ''} proposé${payload.length > 1 ? 's' : ''} aux observateurs.`
              : 'La liste est vide : les observateurs captureront sans catégorie.',
        })
        router.refresh()
      } else {
        toast.error('Enregistrement impossible', { description: result.error })
      }
    })
  }

  return (
    <div className="mt-4">
      <ObservationTypesEditor idPrefix="project-overview" value={types} onChange={setTypes} />
      {!archived ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!isDirty || isPending}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-xs font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            {isPending ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-ink" />
            ) : (
              <Save aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {isPending ? 'Enregistrement…' : 'Enregistrer les types'}
          </button>
          {isDirty ? (
            <button
              type="button"
              onClick={reset}
              disabled={isPending}
              className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-200"
            >
              Réinitialiser
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
