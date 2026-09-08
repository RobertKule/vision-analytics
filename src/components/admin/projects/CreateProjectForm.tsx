'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CirclePlus, Film, X } from 'lucide-react'
import { createProject } from '@/app/actions/projectActions'
import type { ActionResult } from '@/lib/types'
import Sheet from '@/components/ui/Sheet'
import StepperRail, { type StepperStep } from '@/components/ui/StepperRail'
import VideoUrlPicker, { type VideoUrlPickerText } from '@/components/ui/VideoUrlPicker'
import { labelClass } from '@/components/admin/projects/projectFormat'

type CreateProjectFormProps = {
  /** Appelé après la création réussie. */
  onCreated: () => void
  /** Appelé quand l'utilisateur referme le formulaire sans créer. */
  onCancel: () => void
}

const STEPS: StepperStep[] = [
  { num: 1, label: 'Titre du projet' },
  { num: 2, label: 'Contexte & protocole' },
  { num: 3, label: 'Vidéo cible' },
]

/** Textes français du sélecteur vidéo (surface admin FR). */
const VIDEO_TEXT: VideoUrlPickerText = {
  title: 'Importer ou sélectionner votre vidéo',
  subtitle:
    'Collez l’URL distante d’une vidéo (vérifiée), ou saisissez le nom du fichier que vos observateurs chargeront.',
  urlPlaceholder: 'https://…/video.mp4',
  pasteAction: 'Coller',
  clearAction: 'Effacer',
  optionalTag: 'Facultatif',
  validating: 'Vérification…',
  okLabel: 'Vidéo accessible',
  okHint: 'Les observateurs chargent leur propre copie du fichier.',
  fileLabel: 'Nom de fichier local',
  fileHint: 'Les observateurs chargeront leur propre copie du fichier.',
  invalidLabel: 'L’URL ne pointe pas vers une vidéo',
  unreachableLabel: 'Vidéo introuvable',
  unknownLabel: 'Accès impossible à vérifier',
  unknownHint:
    'Le réseau ou CORS empêche la vérification — vous pouvez conserver ou modifier cette valeur.',
}

/**
 * Assistant de création d'un projet (1 titre → 2 contexte → 3 vidéo cible) rendu
 * dans un panneau coulissant à droite avec indicateur « Étape X sur Y ».
 */
export default function CreateProjectForm({ onCreated, onCancel }: CreateProjectFormProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [isPending, startTransition] = useTransition()

  const titleValid = title.trim().length > 0

  const doCreate = () => {
    if (!titleValid) return
    const trimmedTitle = title.trim()
    startTransition(async () => {
      const result: ActionResult = await createProject({ title, description, videoUrl })
      if (result.ok) {
        toast.success('Projet créé avec succès', {
          description: `« ${trimmedTitle} » est prêt. Ajoutez ses fenêtres de validation.`,
        })
        router.refresh()
        onCreated()
      } else {
        toast.error('Création impossible', { description: result.error })
      }
    })
  }

  return (
    <Sheet
      open
      onClose={onCancel}
      labelledBy="create-project-sheet-title"
      describedBy="create-project-sheet-desc"
      widthClass="max-w-2xl"
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
          {step < STEPS.length ? (
            <button
              type="button"
              disabled={!titleValid || isPending}
              onClick={() => setStep((current) => current + 1)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              Suivant
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={doCreate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              {isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <CirclePlus aria-hidden="true" className="h-4 w-4" />
              )}
              {isPending ? 'Création…' : 'Créer le projet'}
            </button>
          )}
        </div>
      }
    >
      {/* Barre supérieure */}
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id="create-project-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            Administration · Projets
          </p>
          <h2
            id="create-project-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            Créer un projet d’observation
          </h2>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Fermer le formulaire de création"
          title="Fermer"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {/* Rail d'étapes */}
      <StepperRail
        steps={STEPS}
        current={step}
        ariaLabel="Progression de création d'un projet"
      />

      {/* Contenu de l'étape */}
      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Étape {step} sur {STEPS.length} — {STEPS[step - 1]?.label}
        </p>

        <div className="mt-5">
          {step === 1 ? (
            <div>
              <label htmlFor="project-title" className={labelClass}>
                Titre du projet *
              </label>
              <input
                id="project-title"
                type="text"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex. Observation nid de cigognes — juillet 2026"
                className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15"
              />
              <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                Les fenêtres de validation restent secrètes : vous les ajouterez ensuite sur la fiche
                du projet.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <label htmlFor="project-description" className={labelClass}>
                Contexte &amp; protocole
              </label>
              <textarea
                id="project-description"
                rows={7}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Espèces suivies, hypothèses, consignes aux observateurs…"
                className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15"
              />
              <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                Facultatif — visible par les observateurs avant leur session.
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-6">
              <VideoUrlPicker
                inputId="project-video"
                value={videoUrl}
                onChange={setVideoUrl}
                text={VIDEO_TEXT}
              />

              {/* Aperçu de la fiche */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Aperçu de la fiche
                </p>
                <p className="mt-2 truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  {title.trim() || 'Titre du projet…'}
                </p>
                {description.trim() ? (
                  <p className="mt-1 line-clamp-3 text-xs text-zinc-600 dark:text-zinc-400">
                    {description}
                  </p>
                ) : null}
                <p className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded bg-white px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <Film
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 text-gold-700 dark:text-gold-400"
                  />
                  <span className="truncate">{videoUrl.trim() || 'vidéo-cible.mp4'}</span>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}
