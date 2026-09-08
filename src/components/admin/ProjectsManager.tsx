'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Archive,
  ChartColumn,
  CirclePlus,
  Eye,
  FolderKanban,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { ProjectDto } from '@/lib/types'
import CreateProjectForm from '@/components/admin/projects/CreateProjectForm'
import { formatDate } from '@/components/admin/projects/projectFormat'
import {
  deleteProject,
  listArchivedProjects,
  restoreProject,
} from '@/app/actions/projectActions'
import { friendlyActionError } from '@/lib/actionError'

type ProjectsManagerProps = {
  /** Projets ACTIFS (le filtre d'archivage vit côté serveur : `listProjects`). */
  projects: ProjectDto[]
}

/**
 * Vue maître des projets — deux états distincts : « Actifs » (création, suivi) et
 * « Archivés » (restauration / suppression définitive). Les archivés sont chargés à la
 * demande via `listArchivedProjects` ; les actions lourdes (fenêtres, benchmarks)
 * vivent dans l'espace détaillé `/admin/projects/[id]`.
 */
export default function ProjectsManager({ projects }: ProjectsManagerProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [archived, setArchived] = useState<ProjectDto[] | null>(null)
  const [archivedLoading, setArchivedLoading] = useState(false)
  const archivedLoadedRef = useRef(false)

  const totalObservations = projects.reduce(
    (sum, project) => sum + (project.observationCount ?? 0),
    0,
  )

  const showArchived = async () => {
    setView('archived')
    if (archivedLoadedRef.current || archivedLoading) return
    setArchivedLoading(true)
    try {
      const result = await listArchivedProjects()
      setArchived(result)
      archivedLoadedRef.current = true
    } catch (error) {
      toast.error('Chargement impossible', {
        description: friendlyActionError(error, 'fr'),
      })
    } finally {
      setArchivedLoading(false)
    }
  }

  const runRestore = async (id: string) => {
    const result = await restoreProject(id).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    if (result.ok) {
      setArchived((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
      router.refresh()
      toast.success('Projet réactivé', {
        description: 'Le projet redevient actif pour les observateurs.',
      })
    } else {
      toast.error('Restauration impossible', { description: result.error })
    }
  }

  const runDelete = async (id: string) => {
    const result = await deleteProject(id).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    if (result.ok) {
      setArchived((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
      router.refresh()
      toast.success('Projet supprimé définitivement', {
        description: 'Le projet et ses données liées ont été effacés.',
      })
    } else {
      toast.error('Suppression impossible', { description: result.error })
    }
  }

  const askDelete = (id: string) => {
    toast.warning('Supprimer définitivement ce projet ?', {
      description:
        'Observations, fenêtres de validation et vidéos seront irrémédiablement effacées.',
      action: { label: 'Supprimer définitivement', onClick: () => void runDelete(id) },
      cancel: { label: 'Annuler', onClick: () => {} },
    })
  }

  const archivedList = archived ?? []

  const renderTable = (list: ProjectDto[], isArchivedView: boolean) => (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              <th scope="col" className="px-5 py-3 font-semibold">Projet</th>
              <th scope="col" className="px-4 py-3 font-semibold">Sujet / Espèce</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Observations</th>
              <th scope="col" className="px-4 py-3 font-semibold">Créé le</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
            {list.map((project) => (
              <tr
                key={project.id}
                className="group transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="max-w-xs truncate font-semibold text-zinc-900 underline-offset-2 transition-colors hover:text-gold-600 hover:underline dark:text-zinc-50 dark:hover:text-gold-300"
                    >
                      {project.title}
                    </Link>
                    {isArchivedView ? (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        Archivé
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-gold-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                        Actif
                      </span>
                    )}
                  </div>
                  {project.videoUrl ? (
                    <p className="mt-1 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                      {project.videoUrl}
                    </p>
                  ) : null}
                </td>
                <td className="max-w-[16rem] px-4 py-4">
                  {project.description ? (
                    <p className="line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {project.description}
                    </p>
                  ) : (
                    <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-4 py-4 text-right">
                  <span className="font-mono text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {project.observationCount ?? 0}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(project.createdAt)}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                    >
                      Gérer
                    </Link>
                    <Link
                      href={`/admin/projects/${project.id}/analytics`}
                      title="Statistiques et analyse"
                      aria-label={`Statistiques de ${project.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      <ChartColumn aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href={`/experience/${project.id}`}
                      title={
                        isArchivedView
                          ? 'Aperçu (le projet archivé n’accepte plus de soumissions)'
                          : 'Ouvrir la session d’observation'
                      }
                      aria-label={`Ouvrir la session d’observation de ${project.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                    </Link>
                    {isArchivedView ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void runRestore(project.id)}
                          title="Réactiver ce projet"
                          aria-label={`Réactiver ${project.title}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold-600/40 bg-gold-500/10 px-2.5 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-500/20 dark:border-gold-400/30 dark:bg-gold-400/10 dark:text-gold-200 dark:hover:bg-gold-400/20"
                        >
                          <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                          Réactiver
                        </button>
                        <button
                          type="button"
                          onClick={() => askDelete(project.id)}
                          title="Supprimer définitivement"
                          aria-label={`Supprimer définitivement ${project.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-clay-300 text-clay-700 transition-colors hover:bg-clay-50 dark:border-clay-700 dark:text-clay-300 dark:hover:bg-clay-500/10"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Barre d'outils ——— */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {view === 'active' ? 'Projets actifs' : 'Projets archivés'}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {view === 'active' ? (
              <>
                {projects.length} projet{projects.length > 1 ? 's' : ''} · {totalObservations}{' '}
                observation{totalObservations > 1 ? 's' : ''} au total
              </>
            ) : archivedLoading ? (
              'Chargement des projets archivés…'
            ) : (
              <>
                {archivedList.length} projet{archivedList.length > 1 ? 's' : ''} en corbeille
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bascule Actifs / Archivés */}
          <div
            className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
            role="tablist"
            aria-label="Filtre des projets"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'active'}
              onClick={() => setView('active')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${
                view === 'active'
                  ? 'bg-ink text-milk dark:bg-milk dark:text-ink'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-100'
              }`}
            >
              Actifs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'archived'}
              onClick={() => void showArchived()}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${
                view === 'archived'
                  ? 'bg-ink text-milk dark:bg-milk dark:text-ink'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-100'
              }`}
            >
              <Archive aria-hidden="true" className="h-3.5 w-3.5" />
              Archivés
            </button>
          </div>
          {view === 'active' && !creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              <CirclePlus aria-hidden="true" className="h-4 w-4" />
              Nouveau projet
            </button>
          ) : null}
        </div>
      </div>

      {/* ——— Assistant création (tiroir) ——— */}
      {view === 'active' && creating ? (
        <CreateProjectForm
          onCreated={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {/* ——— Vue active ——— */}
      {view === 'active' ? (
        <>
          {!creating && projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                <FolderKanban aria-hidden="true" className="h-6 w-6" />
              </span>
              <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
                Aucun projet pour l’instant. Créez votre premier projet d’observation, puis ajoutez
                ses fenêtres de validation depuis sa fiche.
              </p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
              >
                <CirclePlus aria-hidden="true" className="h-4 w-4" />
                Créer un projet
              </button>
            </div>
          ) : null}
          {!creating && projects.length > 0 ? renderTable(projects, false) : null}
        </>
      ) : null}

      {/* ——— Vue archivée ——— */}
      {view === 'archived' ? (
        archivedLoading && archived === null ? (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold-600 border-t-transparent" />
            Chargement…
          </div>
        ) : archivedList.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
              <Archive aria-hidden="true" className="h-6 w-6" />
            </span>
            <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Aucun projet archivé. Les projets archivés depuis leur fiche apparaîtront ici : ils
              peuvent être réactivés à tout moment, ou supprimés définitivement.
            </p>
          </div>
        ) : (
          renderTable(archivedList, true)
        )
      ) : null}
    </div>
  )
}
