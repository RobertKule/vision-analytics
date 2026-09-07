'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Archive,
  ChartColumn,
  CirclePlus,
  ClipboardList,
  Copy,
  Eye,
  Film,
  FolderKanban,
  Target,
} from 'lucide-react'
import {
  addProjectPoint,
  archiveProject,
  createProject,
  deleteProjectPoint,
} from '@/app/actions/projectActions'
import type { ActionResult, ProjectDto } from '@/lib/types'
import Tabs from '@/components/ui/Tabs'

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

const labelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'

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

/** Copie du texte dans le presse-papiers avec repli pour les contextes non sécurisés. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* bascule sur le repli textarea */
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

export default function ProjectsManager({ projects }: { projects: ProjectDto[] }) {
  const [tab, setTab] = useState<'active' | 'new'>('active')

  const totalWindows = projects.reduce((sum, project) => sum + project.points.length, 0)
  const projectsWithoutWindows = projects.filter((project) => project.points.length === 0).length

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        ariaLabel="Gestion des projets"
        size="lg"
        active={tab}
        onChange={(id) => setTab(id as 'active' | 'new')}
        items={[
          { id: 'active', label: 'Projets Actifs', count: projects.length, icon: FolderKanban },
          { id: 'new', label: 'Nouveau Projet', icon: CirclePlus },
        ]}
      />

      {/* ——— Onglet : Projets Actifs ——— */}
      {tab === 'active' && (
        <section aria-labelledby="active-projects-heading" className="flex flex-col gap-5">
          {/* Bandeau de synthèse rapide */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Projets en cours
              </p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                {projects.length}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Fenêtres de validation
              </p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                {totalWindows}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                réparties sur l’ensemble des projets
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Projets à compléter
              </p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                {projectsWithoutWindows}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                aucune fenêtre temporelle définie
              </p>
            </div>
          </div>

          <h2 id="active-projects-heading" className="sr-only">
            Projets actifs
          </h2>

          {projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                <FolderKanban aria-hidden="true" className="h-6 w-6" />
              </span>
              <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
                Aucun projet pour l’instant. Créez votre premier projet d’observation dans
                l’onglet <strong className="font-semibold">Nouveau Projet</strong>.
              </p>
              <button
                type="button"
                onClick={() => setTab('new')}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
              >
                <CirclePlus aria-hidden="true" className="h-4 w-4" />
                Créer un projet
              </button>
            </div>
          ) : (
            <div className="grid gap-5">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ——— Onglet : Nouveau Projet (assistant guidé) ——— */}
      {tab === 'new' && <CreateProjectSection onCreated={() => setTab('active')} />}
    </div>
  )
}

/* ————————————————————————————————————————————————————————————————————————
 * Assistant guidé de création
 * ———————————————————————————————————————————————————————————————————————— */

function CreateProjectSection({ onCreated }: { onCreated: () => void }) {
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
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          Créer un nouveau projet d’observation
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Renseignez le contexte de l’étude, puis ajoutez ses fenêtres de validation temporelles.
        </p>

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
                définissent ensuite depuis la carte du projet.
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

/* ————————————————————————————————————————————————————————————————————————
 * Carte projet + gestion des fenêtres
 * ———————————————————————————————————————————————————————————————————————— */

function ProjectCard({ project }: { project: ProjectDto }) {
  const router = useRouter()

  const runArchive = async () => {
    const result = await archiveProject(project.id)
    router.refresh()
    if (result.ok) {
      toast.success('Projet archivé', {
        description: `« ${project.title} » est masqué de la liste active.`,
      })
    } else {
      toast.error('Archivage impossible', { description: result.error })
    }
  }

  const askArchive = () => {
    toast.warning('Archiver ce projet ?', {
      description: `« ${project.title} » — les observations restent conservées en base.`,
      action: { label: 'Archiver', onClick: () => void runArchive() },
      cancel: { label: 'Annuler', onClick: () => {} },
    })
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/observe/${project.id}`
    const ok = await copyToClipboard(url)
    if (ok) {
      toast.success('Lien de session copié', {
        description: 'Transmettez-le aux observateurs de votre protocole.',
      })
    } else {
      toast.error('Copie impossible', { description: url })
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{project.title}</h3>
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
              <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> {project.videoUrl}
            </p>
          ) : (
            <p className="mt-2 text-xs italic text-zinc-400 dark:text-zinc-500">
              Aucune vidéo cible renseignée.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            title="Copier le lien de session pour les observateurs"
            aria-label={`Copier le lien de session du projet ${project.title}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-500 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/admin/projects/${project.id}/analytics`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <ChartColumn aria-hidden="true" className="h-3.5 w-3.5" /> Statistiques
          </Link>
          <Link
            href={`/observe/${project.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-red-500"
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" /> Tester en aveugle
          </Link>
          <button
            type="button"
            onClick={askArchive}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 text-xs font-medium text-zinc-600 transition-colors hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-500 dark:hover:text-red-400"
          >
            <Archive aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Archiver</span>
          </button>
        </div>
      </header>

      <div className="px-6 py-5">
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
