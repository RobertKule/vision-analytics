'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Archive,
  Calendar,
  ChartColumn,
  Copy,
  Eye,
  FileDown,
  Film,
  Microscope,
  Pencil,
  RotateCcw,
  Tags,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type { AdminProjectDetailDto, ProjectPointDto, VideoAdminDto } from '@/lib/types'
import {
  archiveProject,
  deleteProject,
  restoreProject,
  updateProject,
} from '@/app/actions/projectActions'
import { ValidationWindowsPanel } from '@/components/admin/projects/PointWindows'
import ProjectObservationTypesPanel from '@/components/admin/projects/ProjectObservationTypesPanel'
import VideoManager from '@/components/admin/projects/VideoManager'
import Sheet from '@/components/ui/Sheet'
import { copyToClipboard, formatDate, formatDateTime, labelClass } from '@/components/admin/projects/projectFormat'
import { friendlyActionError } from '@/lib/actionError'

type ProjectOverviewTabProps = {
  project: AdminProjectDetailDto['project']
  points: ProjectPointDto[]
  /** Passes vidéo du projet (association vidéo → type, benchmarks). */
  videos: VideoAdminDto[]
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
    </div>
  )
}

export default function ProjectOverviewTab({ project, points, videos }: ProjectOverviewTabProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

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

  const runArchive = async () => {
    const result = await archiveProject(project.id).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    if (result.ok) {
      toast.success('Projet archivé', {
        description: `« ${project.title} » est masqué de la liste active.`,
      })
      router.push('/admin/projects')
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

  const runRestore = async () => {
    const result = await restoreProject(project.id).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    router.refresh()
    if (result.ok) {
      toast.success('Projet réactivé', {
        description: `« ${project.title} » redevient actif pour les observateurs.`,
      })
    } else {
      toast.error('Restauration impossible', { description: result.error })
    }
  }

  const runDelete = async () => {
    const result = await deleteProject(project.id).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    if (result.ok) {
      toast.success('Projet supprimé définitivement', {
        description: `« ${project.title} » et ses données liées ont été effacées.`,
      })
      router.push('/admin/projects')
    } else {
      toast.error('Suppression impossible', { description: result.error })
    }
  }

  const askDelete = () => {
    toast.warning('Supprimer définitivement ce projet ?', {
      description: `« ${project.title} » — observations, fenêtres et vidéos seront irrémédiablement effacées.`,
      action: { label: 'Supprimer définitivement', onClick: () => void runDelete() },
      cancel: { label: 'Annuler', onClick: () => {} },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Fiche projet ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  project.isArchived
                    ? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
                    : 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
                }`}
              >
                {project.isArchived ? 'Archivé' : 'Actif'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
                Créé le {formatDate(project.createdAt)}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {project.title}
            </h2>
            {project.description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {project.description}
              </p>
            ) : null}
            {project.videoUrl ? (
              <p className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg bg-zinc-100 px-3 py-1.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gold-700 dark:text-gold-400" />
                <span className="truncate">{project.videoUrl}</span>
              </p>
            ) : (
              <p className="mt-3 text-xs italic text-zinc-400 dark:text-zinc-500">
                Aucune vidéo cible renseignée — la session proposera un chargement manuel.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/experience/${project.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              <Eye aria-hidden="true" className="h-3.5 w-3.5" /> Session d’observation
            </Link>
            <Link
              href={`/admin/projects/${project.id}/analytics`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <ChartColumn aria-hidden="true" className="h-3.5 w-3.5" /> Analyse complète
            </Link>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <Copy aria-hidden="true" className="h-3.5 w-3.5" /> Copier le lien
            </button>
            {project.observationCount > 0 ? (
              <a
                href={`/api/admin/projects/${project.id}/export-global`}
                onClick={() =>
                  toast.info('Préparation de l’Export Global…', {
                    description: 'Le téléchargement démarre à la fin de la génération du ZIP.',
                  })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:border-gold-500/60 hover:bg-gold-500/5 hover:text-gold-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-gold-400/50 dark:hover:bg-gold-400/5 dark:hover:text-gold-200"
                title="Export Global du Projet — relevé complet + données et images de chaque observateur (.zip)"
              >
                <FileDown aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
                Export Global du Projet
              </a>
            ) : (
              <span
                className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                title="Aucune observation à exporter pour le moment."
              >
                <FileDown aria-hidden="true" className="h-3.5 w-3.5" /> Export Global du Projet
              </span>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              <span>Modifier</span>
            </button>
            {project.isArchived ? (
              <>
                <button
                  type="button"
                  onClick={() => void runRestore()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gold-600/40 bg-gold-500/10 px-3 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-500/20 dark:border-gold-400/30 dark:bg-gold-400/10 dark:text-gold-200 dark:hover:bg-gold-400/20"
                >
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>Réactiver</span>
                </button>
                <button
                  type="button"
                  onClick={askDelete}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-clay-300 px-3 text-xs font-medium text-clay-700 transition-colors hover:bg-clay-50 dark:border-clay-700 dark:text-clay-300 dark:hover:bg-clay-500/10"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>Supprimer</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={askArchive}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-clay-400 hover:text-clay-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-clay-500 dark:hover:text-clay-300"
              >
                <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                <span>Archiver</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ——— Statistiques clés ——— */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Observations" value={project.observationCount} />
        <StatCard label="Observateurs" value={project.observerCount} />
        <StatCard label="Fenêtres de validation" value={project.pointsCount} />
        <StatCard label="Vidéos cibles" value={videos.length} />
      </div>

      {/* ——— Fenêtres de validation (gestion) ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <Microscope aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
          Vérité terrain — fenêtres temporelles secrètes
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Ces fenêtres restent invisibles pour les observateurs : elles servent à attribuer chaque
          capture à un point (ou à une fausse alerte) lors de l’analyse. Chaque fenêtre est
          rattachée à une vidéo (donc à son type) : une capture n’est validée que par les fenêtres
          de la vidéo observée.
        </p>

        {project.isArchived ? (
          <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            Projet archivé : les fenêtres de validation sont figées. Désarchivez (réactivation) pour
            les modifier.
          </p>
        ) : (
          <div className="mt-4">
            <ValidationWindowsPanel projectId={project.id} points={points} videos={videos} />
          </div>
        )}
      </section>

      {/* ——— Types d'observation (configuration observateurs) ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <Tags aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
          Types d’observation
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Catégories que les observateurs choisissent pour qualifier chaque capture lors de leur
          session (ex. « 100m oblique », « Faune détectée », « Bâtiment / Infrastructures »).
        </p>

        {project.isArchived ? (
          <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            Projet archivé : la liste des types d’observation est figée. Désarchivez (réactivation)
            pour la modifier.
          </p>
        ) : (
          <ProjectObservationTypesPanel
            projectId={project.id}
            observationTypes={project.observationTypes}
            archived={false}
          />
        )}
      </section>

      {/* ——— Passes vidéo (association vidéo → type, benchmarks) ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              <Film aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
              Vidéos cibles &amp; types associés
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Chaque vidéo devient un onglet de l’annotateur. L’association à un type verrouille
              celui-ci pour toutes les captures de la passe ; le benchmark est la vérité terrain
              confidentielle (jamais visible des observateurs).
            </p>
          </div>
        </div>

        {project.isArchived ? (
          <p className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
            Projet archivé : les vidéos et leurs benchmarks sont figés. Réactivez le projet pour les
            modifier.
          </p>
        ) : null}

        <div className="mt-4">
          <VideoManager
            projectId={project.id}
            videos={videos}
            observationTypes={project.observationTypes}
            archived={project.isArchived}
          />
        </div>
      </section>

      {/* ——— Activité ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          <Users aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
          Soumissions
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {project.observationCount} observation{project.observationCount > 1 ? 's' : ''} par{' '}
          {project.observerCount} observateur{project.observerCount > 1 ? 's' : ''}.{' '}
          {project.observationCount > 0
            ? 'Consultez le détail et les exports dans les onglets « Observations » et « Activité des observateurs ».'
            : 'Aucune session soumise pour le moment — partagez le lien de session pour lancer les observations.'}
        </p>
        {project.observationCount > 0 ? (
          <p className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
            {formatDateTime(project.createdAt)}
          </p>
        ) : null}
      </section>

      {/* ——— Édition (titre / description) ——— */}
      <ProjectEditSheet
        open={editing}
        onClose={() => setEditing(false)}
        projectId={project.id}
        title={project.title}
        description={project.description}
      />
    </div>
  )
}

function ProjectEditSheet({
  open,
  onClose,
  projectId,
  title,
  description,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  title: string
  description: string | null
}) {
  const router = useRouter()
  const [draftTitle, setDraftTitle] = useState(title)
  const [draftDescription, setDraftDescription] = useState(description ?? '')
  const [isPending, startTransition] = useTransition()

  const titleValid = draftTitle.trim().length > 0

  const doSave = () => {
    if (!titleValid || isPending) return
    startTransition(async () => {
      const result = await updateProject({
        projectId,
        title: draftTitle.trim(),
        description: draftDescription,
      }).catch((error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }))
      if (result.ok) {
        toast.success('Projet mis à jour', {
          description: 'Le titre et le contexte ont été enregistrés.',
        })
        router.refresh()
        onClose()
      } else {
        toast.error('Enregistrement impossible', { description: result.error })
      }
    })
  }

  const inputClass =
    'h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15'
  const textareaClass = inputClass.replace('h-11', 'h-auto resize-y py-2')

  return (
    <Sheet
      open={open}
      onClose={onClose}
      labelledBy="edit-project-sheet-title"
      describedBy="edit-project-sheet-desc"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={doSave}
            disabled={isPending || !titleValid}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Pencil aria-hidden="true" className="h-4 w-4" />
            )}
            {isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id="edit-project-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            Administration · Projets
          </p>
          <h2
            id="edit-project-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            Modifier le projet
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div>
          <label htmlFor="edit-project-title" className={labelClass}>
            Titre du projet *
          </label>
          <input
            id="edit-project-title"
            type="text"
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="edit-project-description" className={labelClass}>
            Contexte &amp; protocole
          </label>
          <textarea
            id="edit-project-description"
            rows={6}
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            className={textareaClass}
          />
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            Les types d’observation se modifient depuis le panneau dédié de la fiche.
          </p>
        </div>
      </div>
    </Sheet>
  )
}
