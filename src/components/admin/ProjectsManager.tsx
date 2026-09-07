'use client'

import { useState, useTransition, type FormEvent } from 'react'
import {
  addProjectPoint,
  archiveProject,
  createProject,
  deleteProjectPoint,
} from '@/app/actions/projectActions'
import type { ActionResult, ProjectDto } from '@/lib/types'

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

const labelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'

const errorClass =
  'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300'

const successClass =
  'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'

/** Affiche une durée en secondes sous forme lisible (ex. 1 min 05 s). */
function formatWindow(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes} min ${String(rest).padStart(2, '0')} s`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ProjectsManager({ projects }: { projects: ProjectDto[] }) {
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="new-project-heading">
        <h2 id="new-project-heading" className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Nouveau projet
        </h2>
        <CreateProjectForm />
      </section>

      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Projets ({projects.length})
        </h2>
        {projects.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            Aucun projet pour l’instant. Créez le premier projet ci-dessus.
          </div>
        ) : (
          <div className="grid gap-5">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function CreateProjectForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(null)
    startTransition(async () => {
      const result: ActionResult = await createProject({ title, description, videoUrl })
      if (result.ok) {
        setTitle('')
        setDescription('')
        setVideoUrl('')
        setNotice({ type: 'success', text: 'Projet créé avec succès.' })
      } else {
        setNotice({ type: 'error', text: result.error })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
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
        <div className="sm:col-span-2">
          <label htmlFor="project-description" className={labelClass}>
            Description
          </label>
          <textarea
            id="project-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Contexte, protocole, espèces suivies…"
            className={`${inputClass} resize-y`}
          />
        </div>
        <div className="sm:col-span-2">
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
        </div>
      </div>

      {notice ? (
        <p role="status" className={`mt-3 ${notice.type === 'success' ? successClass : errorClass}`}>
          {notice.text}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? 'Création…' : 'Créer le projet'}
        </button>
      </div>
    </form>
  )
}

function ProjectCard({ project }: { project: ProjectDto }) {
  const [isPending, startTransition] = useTransition()

  const handleArchive = () => {
    if (!window.confirm(`Archiver le projet « ${project.title} » ? Ses observations sont conservées.`)) {
      return
    }
    startTransition(async () => {
      await archiveProject(project.id)
    })
  }

  return (
    <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{project.title}</h3>
          {project.createdAt ? (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Créé le {formatDate(project.createdAt)}
            </p>
          ) : null}
          {project.description ? (
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{project.description}</p>
          ) : null}
          {project.videoUrl ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <span aria-hidden="true">🎞️</span> {project.videoUrl}
            </p>
          ) : (
            <p className="mt-2 text-xs italic text-zinc-400 dark:text-zinc-500">
              Aucune vidéo cible renseignée.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleArchive}
          disabled={isPending}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-500 dark:hover:text-red-400"
        >
          {isPending ? '…' : <span aria-hidden="true">🗄️</span>} Archiver
        </button>
      </header>

      <div className="px-5 py-4">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Fenêtres de validation ({project.points.length})
        </h4>

        {project.points.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {project.points.map((point) => (
              <PointRow key={point.id} point={point} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Aucune fenêtre temporelle définie. Ajoutez-en une ci-dessous.
          </p>
        )}

        <AddPointForm projectId={project.id} />
      </div>
    </article>
  )
}

function PointRow({
  point,
}: {
  point: { id: string; pointName: string; trameDebut: number; trameFin: number }
}) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!window.confirm(`Supprimer la fenêtre « ${point.pointName} » ?`)) return
    startTransition(async () => {
      await deleteProjectPoint(point.id)
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
        onClick={handleDelete}
        disabled={isPending}
        aria-label={`Supprimer ${point.pointName}`}
        className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
      >
        {isPending ? '…' : 'Supprimer'}
      </button>
    </li>
  )
}

function AddPointForm({ projectId }: { projectId: string }) {
  const [pointName, setPointName] = useState('')
  const [trameDebut, setTrameDebut] = useState('')
  const [trameFin, setTrameFin] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice(null)

    if (!pointName.trim()) {
      setNotice({ type: 'error', text: 'Le nom du point est obligatoire.' })
      return
    }
    if (trameDebut === '' || trameFin === '') {
      setNotice({ type: 'error', text: 'Renseignez un début et une fin en secondes.' })
      return
    }

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
        setNotice({ type: 'success', text: 'Fenêtre ajoutée.' })
      } else {
        setNotice({ type: 'error', text: result.error })
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

      {notice ? (
        <p role="status" className={`mt-3 ${notice.type === 'success' ? successClass : errorClass}`}>
          {notice.text}
        </p>
      ) : null}
    </form>
  )
}
