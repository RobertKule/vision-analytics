'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChartColumn, CirclePlus, Eye, FolderKanban } from 'lucide-react'
import type { ProjectDto } from '@/lib/types'
import CreateProjectForm from '@/components/admin/projects/CreateProjectForm'
import { formatDate } from '@/components/admin/projects/projectFormat'

/**
 * Vue maître des projets actifs (liste table dense).
 *
 * Les actions d'édition lourdes (fenêtres de validation, archivage, copie du lien
 * de session) vivent dans l'espace détaillé `/admin/projects/[id]` ; ici chaque ligne
 * donne accès à la fiche, aux statistiques et à l'ouverture de la session.
 */
export default function ProjectsManager({ projects }: { projects: ProjectDto[] }) {
  const [view, setView] = useState<'list' | 'create'>('list')
  const totalObservations = projects.reduce(
    (sum, project) => sum + (project.observationCount ?? 0),
    0,
  )

  return (
    <div className="flex flex-col gap-6">
      {/* ——— Barre d'outils ——— */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Projets actifs
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {projects.length} projet{projects.length > 1 ? 's' : ''} · {totalObservations}{' '}
            observation{totalObservations > 1 ? 's' : ''} au total
          </p>
        </div>
        {view === 'list' ? (
          <button
            type="button"
            onClick={() => setView('create')}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
          >
            <CirclePlus aria-hidden="true" className="h-4 w-4" />
            Nouveau projet
          </button>
        ) : null}
      </div>

      {/* ——— Formulaire de création ——— */}
      {view === 'create' ? (
        <CreateProjectForm
          onCreated={() => setView('list')}
          onCancel={() => setView('list')}
        />
      ) : null}

      {/* ——— État vide ——— */}
      {view === 'list' && projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
            <FolderKanban aria-hidden="true" className="h-6 w-6" />
          </span>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
            Aucun projet pour l’instant. Créez votre premier projet d’observation, puis ajoutez ses
            fenêtres de validation depuis sa fiche.
          </p>
          <button
            type="button"
            onClick={() => setView('create')}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            <CirclePlus aria-hidden="true" className="h-4 w-4" />
            Créer un projet
          </button>
        </div>
      ) : null}

      {/* ——— Tableau maître ——— */}
      {view === 'list' && projects.length > 0 ? (
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
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    className="group transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/projects/${project.id}`}
                          className="max-w-xs truncate font-semibold text-zinc-900 underline-offset-2 transition-colors hover:text-red-600 hover:underline dark:text-zinc-50 dark:hover:text-red-400"
                        >
                          {project.title}
                        </Link>
                        <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                          Actif
                        </span>
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
                          className="inline-flex h-8 items-center rounded-lg bg-red-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-red-500"
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
                          title="Ouvrir la session d’observation"
                          aria-label={`Ouvrir la session d’observation de ${project.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        >
                          <Eye aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
