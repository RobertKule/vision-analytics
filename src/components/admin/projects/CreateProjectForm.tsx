'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CirclePlus, ClipboardList, Film, Target, X } from 'lucide-react'
import { createProject } from '@/app/actions/projectActions'
import type { ActionResult } from '@/lib/types'
import { inputClass, labelClass } from '@/components/admin/projects/projectFormat'

type CreateProjectFormProps = {
  /** Appelé après la création réussie. */
  onCreated: () => void
  /** Appelé quand l'utilisateur referme le formulaire sans créer. */
  onCancel: () => void
}

/**
 * Assistant guidé de création d'un projet d'observation (titre, contexte, vidéo cible).
 */
export default function CreateProjectForm({ onCreated, onCancel }: CreateProjectFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const trimmedTitle = title.trim()
      const result: ActionResult = await createProject({ title, description, videoUrl })
      if (result.ok) {
        setTitle('')
        setDescription('')
        setVideoUrl('')
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

  const stepClass = (done: boolean) =>
    `flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
      done ? 'bg-red-600 text-white' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
    }`

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Créer un nouveau projet d’observation
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Renseignez le contexte de l’étude, puis ajoutez ses fenêtres de validation temporelles.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fermer le formulaire de création"
            title="Annuler"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <ol className="mt-6 flex flex-col gap-6">
          <li className="flex gap-4">
            <span className={stepClass(true)}>1</span>
            <div className="flex-1">
              <label htmlFor="project-title" className={labelClass}>
                Titre du projet *
              </label>
              <input
                id="project-title"
                type="text"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex. Observation nid de cigognes — juillet 2026"
                className={inputClass}
              />
            </div>
          </li>

          <li className="flex gap-4">
            <span className={stepClass(false)}>2</span>
            <div className="flex-1">
              <label htmlFor="project-description" className={labelClass}>
                Contexte &amp; protocole
              </label>
              <textarea
                id="project-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Espèces suivies, hypothèses, consignes aux observateurs…"
                className={`${inputClass} resize-y`}
              />
            </div>
          </li>

          <li className="flex gap-4">
            <span className={stepClass(false)}>3</span>
            <div className="flex-1">
              <label htmlFor="project-video" className={labelClass}>
                Vidéo cible (fichier ou URL)
              </label>
              <input
                id="project-video"
                type="text"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="Ex. observation-2026-07-14.mp4"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                Les observateurs chargeront ce fichier localement. Les fenêtres temporelles se
                définissent ensuite depuis la fiche du projet.
              </p>
            </div>
          </li>
        </ol>

        <div className="mt-6 flex items-center gap-3 border-t border-zinc-100 pt-5 dark:border-zinc-800">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Création…
              </>
            ) : (
              <>
                <CirclePlus aria-hidden="true" className="h-4 w-4" />
                Créer le projet
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Annuler
          </button>
        </div>
      </form>

      {/* Panneau latéral : aide + aperçu */}
      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <ClipboardList aria-hidden="true" className="h-4 w-4 text-red-600 dark:text-red-400" />
            Bonnes pratiques
          </h3>
          <ul className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              Les fenêtres de validation servent de <strong>vérité terrain</strong> : elles restent
              secrètes pour les observateurs.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              Des fenêtres <strong>disjointes</strong> garantissent une attribution sans ambiguïté
              de chaque observation.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              Vous pourrez ajouter ou retirer des fenêtres tant que le projet n’est pas archivé.
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <Target aria-hidden="true" className="h-4 w-4 text-red-600 dark:text-red-400" />
            Aperçu de la fiche
          </h3>
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {title.trim() || 'Titre du projet…'}
            </p>
            {description.trim() ? (
              <p className="mt-1 line-clamp-3 text-xs text-zinc-600 dark:text-zinc-400">
                {description}
              </p>
            ) : null}
            <p className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <Film aria-hidden="true" className="h-3 w-3 shrink-0" />
              <span className="truncate">{videoUrl.trim() || 'vidéo-cible.mp4'}</span>
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}
