'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { addProjectPoint, deleteProjectPoint } from '@/app/actions/projectActions'
import type { ActionResult, ProjectPointDto } from '@/lib/types'
import {
  isTimecodePairValid,
  parseTimecodeToSeconds,
  secondsToTimecode,
} from '@/lib/timecode'
import { formatWindow, labelClass } from '@/components/admin/projects/projectFormat'
import { friendlyActionError } from '@/lib/actionError'
import Sheet from '@/components/ui/Sheet'
import StepperRail, { type StepperStep } from '@/components/ui/StepperRail'

function PointRow({ point }: { point: ProjectPointDto }) {
  const router = useRouter()

  const runDelete = async () => {
    const result = await deleteProjectPoint(point.id).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    router.refresh()
    if (result.ok) {
      toast.success('Fenêtre supprimée', {
        description: `« ${point.pointName} » (${secondsToTimecode(point.trameDebut)} → ${secondsToTimecode(
          point.trameFin,
        )}) a été retirée.`,
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
        <span className="inline-flex h-5 items-center rounded-full bg-gold-500/15 px-2 text-xs font-semibold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
          {point.pointName}
        </span>
        <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          {secondsToTimecode(point.trameDebut)} → {secondsToTimecode(point.trameFin)}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          (durée {formatWindow(point.trameFin - point.trameDebut)})
        </span>
      </div>
      <button
        type="button"
        onClick={askDelete}
        aria-label={`Supprimer ${point.pointName}`}
        className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-clay-50 hover:text-clay-600 dark:text-zinc-400 dark:hover:bg-clay-500/20 dark:hover:text-clay-300"
      >
        Supprimer
      </button>
    </li>
  )
}

const STEPS: StepperStep[] = [
  { num: 1, label: 'Nom du point' },
  { num: 2, label: 'Bornes temporelles (MM:SS)' },
]

const BOUNDS_INPUT_CLASS =
  'h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15'

/** Tiroir d'ajout d'une fenêtre : nom, puis bornes en MM:SS (début strictement avant fin). */
function PointWindowSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [pointName, setPointName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isPending, startTransition] = useTransition()

  const nameValid = pointName.trim().length > 0

  const startSeconds = parseTimecodeToSeconds(start)
  const endSeconds = parseTimecodeToSeconds(end)
  const bothFilled = start.trim() !== '' && end.trim() !== ''
  let boundsError: string | null = null
  if (bothFilled) {
    if (startSeconds === null || endSeconds === null) {
      boundsError = 'Saisissez chaque borne en MM:SS (ou HH:MM:SS).'
    } else if (startSeconds >= endSeconds) {
      boundsError = 'Le début doit précéder la fin (début < fin).'
    }
  }
  const boundsValid = isTimecodePairValid(start, end)

  const duration =
    startSeconds !== null && endSeconds !== null && startSeconds < endSeconds
      ? endSeconds - startSeconds
      : null

  const doAdd = () => {
    if (!nameValid || !boundsValid) return
    const debut = parseTimecodeToSeconds(start)
    const fin = parseTimecodeToSeconds(end)
    if (debut === null || fin === null || debut >= fin) return
    const nextName = pointName.trim()
    startTransition(async () => {
      const result: ActionResult = await addProjectPoint({
        projectId,
        pointName: nextName,
        trameDebut: debut,
        trameFin: fin,
      }).catch((error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }))
      if (result.ok) {
        toast.success('Fenêtre de validation ajoutée', {
          description: `« ${nextName} » — de ${secondsToTimecode(debut)} à ${secondsToTimecode(fin)}.`,
        })
        router.refresh()
        onClose()
      } else {
        toast.error('Ajout impossible', { description: result.error })
      }
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      labelledBy="point-window-sheet-title"
      describedBy="point-window-sheet-desc"
      widthClass="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current - 1)}
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Précédent
            </button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <button
              type="button"
              disabled={!nameValid}
              onClick={() => setStep(2)}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-6 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              Suivant
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending || !boundsValid}
              onClick={doAdd}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              {isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Plus aria-hidden="true" className="h-4 w-4" />
              )}
              {isPending ? 'Ajout…' : 'Ajouter'}
            </button>
          )}
        </div>
      }
    >
      {/* Barre supérieure */}
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id="point-window-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            Vérité terrain
          </p>
          <h2
            id="point-window-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            Ajouter une fenêtre de validation
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le formulaire"
          title="Fermer"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <StepperRail steps={STEPS} current={step} ariaLabel="Progression d'ajout d'une fenêtre" />

      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Étape {step} sur {STEPS.length} — {STEPS[step - 1]?.label}
        </p>

        <div className="mt-5">
          {step === 1 ? (
            <div>
              <label htmlFor={`point-name-${projectId}`} className={labelClass}>
                Nom du point
              </label>
              <input
                id={`point-name-${projectId}`}
                type="text"
                autoFocus
                value={pointName}
                onChange={(event) => setPointName(event.target.value)}
                placeholder="Ex. Point 2"
                className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15"
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`point-debut-${projectId}`} className={labelClass}>
                    Début (MM:SS)
                  </label>
                  <input
                    id={`point-debut-${projectId}`}
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    placeholder="01:00"
                    spellCheck={false}
                    className={BOUNDS_INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor={`point-fin-${projectId}`} className={labelClass}>
                    Fin (MM:SS)
                  </label>
                  <input
                    id={`point-fin-${projectId}`}
                    type="text"
                    inputMode="numeric"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    placeholder="02:30"
                    spellCheck={false}
                    className={BOUNDS_INPUT_CLASS}
                  />
                </div>
              </div>

              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                Format MM:SS (ou HH:MM:SS pour une durée supérieure à l’heure). Les fenêtres doivent
                rester <strong>disjointes</strong> pour attribuer chaque observation.
              </p>

              {boundsError ? (
                <p
                  role="alert"
                  className="mt-2 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-sm text-clay-700 dark:border-clay-800 dark:bg-clay-900/40 dark:text-clay-300"
                >
                  {boundsError}
                </p>
              ) : duration !== null ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Durée de la fenêtre : {formatWindow(duration)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}

export function ValidationWindowsPanel({
  projectId,
  points,
}: {
  projectId: string
  points: ProjectPointDto[]
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Fenêtres de validation ({points.length})
        </h4>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:border-gold-600/50 hover:bg-gold-500/10 hover:text-gold-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-gold-400/40 dark:hover:bg-gold-400/10 dark:hover:text-gold-200"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Ajouter une fenêtre
        </button>
      </div>

      {points.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {points.map((point) => (
            <PointRow key={point.id} point={point} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Aucune fenêtre temporelle définie. Ajoutez-en une ci-dessus.
        </p>
      )}

      {adding ? (
        <PointWindowSheet projectId={projectId} onClose={() => setAdding(false)} />
      ) : null}
    </div>
  )
}
