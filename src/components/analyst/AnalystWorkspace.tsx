'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Archive,
  ChartColumn,
  CirclePlus,
  Copy,
  Eye,
  Film,
  FolderKanban,
  Plus,
  Share2,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import {
  addWindowToProject,
  archiveOwnedProject,
  createOwnedProject,
  deleteWindowFromProject,
  shareProjectWithUser,
  unshareProjectFromUser,
} from '@/app/actions/analystActions'
import type { AnalystProjectDto } from '@/lib/types'
import type { Locale, AnalystText } from '@/lib/i18n'

type AnalystWorkspaceProps = {
  locale: Locale
  t: AnalystText
  projects: AnalystProjectDto[]
  isAdmin: boolean
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* repli ci-dessous */
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

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

export default function AnalystWorkspace({ locale, t, projects, isAdmin }: AnalystWorkspaceProps) {
  const [showCreate, setShowCreate] = useState(false)

  const ownedCount = projects.filter((project) => project.isOwner).length
  const sharedCount = projects.filter((project) => project.isShared).length
  const windowCount = projects.reduce((sum, project) => sum + project.points.length, 0)

  const chip = (label: string, value: number, accent: string) => (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${accent}`}>{value}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* ——— Synthèse ——— */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {chip(
          locale === 'en' ? 'Projects' : 'Projets',
          projects.length,
          'text-forest-600 dark:text-forest-400',
        )}
        {chip(locale === 'en' ? 'Owned' : 'Possédés', ownedCount, 'text-mist-600 dark:text-mist-400')}
        {chip(locale === 'en' ? 'Shared' : 'Partagés', sharedCount, 'text-amber-600 dark:text-amber-400')}
        {chip(
          locale === 'en' ? 'Validation windows' : 'Fenêtres de validation',
          windowCount,
          'text-zinc-800 dark:text-zinc-100',
        )}
      </div>

      {/* ——— Nouveau projet ——— */}
      <div>
        {showCreate ? (
          <CreateProjectForm
            locale={locale}
            t={t}
            onDone={() => {
              setShowCreate(false)
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-forest-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500"
          >
            <CirclePlus aria-hidden="true" className="h-4 w-4" />
            {t.createCta}
          </button>
        )}
      </div>

      {/* ——— Liste des projets ——— */}
      {projects.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 px-6 py-14 text-center dark:border-zinc-700 dark:bg-white/5">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-forest-500/10 text-forest-600 dark:text-forest-400">
            <FolderKanban aria-hidden="true" className="h-6 w-6" />
          </span>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{t.emptyTitle}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.emptyHint}</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-forest-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-forest-500"
          >
            <CirclePlus aria-hidden="true" className="h-4 w-4" />
            {t.createCta}
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-5">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              locale={locale}
              t={t}
              canArchive={project.isOwner || isAdmin}
              canShare={project.isOwner || isAdmin}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ————————————————————————————————————————————————————————————————
 * Formulaire de création
 * ———————————————————————————————————————————————————————————————— */

function CreateProjectForm({
  locale,
  t,
  onDone,
}: {
  locale: Locale
  t: AnalystText
  onDone: () => void
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) {
      toast.error(t.noTitleError)
      return
    }
    startTransition(async () => {
      const result = await createOwnedProject({ title, description, videoUrl, locale })
      if (result.ok) {
        setTitle('')
        setDescription('')
        setVideoUrl('')
        toast.success(locale === 'en' ? 'Project created' : 'Projet créé')
        router.refresh()
        onDone()
      } else {
        toast.error(locale === 'en' ? 'Creation failed' : 'Création impossible', {
          description: result.error,
        })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{t.createPanel}</h2>
        <button
          type="button"
          onClick={onDone}
          aria-label={locale === 'en' ? 'Close' : 'Fermer'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <label htmlFor="analyst-project-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.titleLabel} *
          </label>
          <input
            id="analyst-project-title"
            type="text"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t.titlePlaceholder}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="analyst-project-desc" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.descLabel}
          </label>
          <textarea
            id="analyst-project-desc"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.descPlaceholder}
            className={`${inputClass} resize-y`}
          />
        </div>
        <div>
          <label htmlFor="analyst-project-video" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.videoLabel}
          </label>
          <input
            id="analyst-project-video"
            type="text"
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="observation-2026-07-14.mp4"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{t.videoHint}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-zinc-100 pt-4 dark:border-white/10">
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-forest-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t.creating}
            </>
          ) : (
            <>
              <CirclePlus aria-hidden="true" className="h-4 w-4" />
              {t.createSubmit}
            </>
          )}
        </button>
      </div>
    </form>
  )
}

/* ————————————————————————————————————————————————————————————————
 * Carte projet
 * ———————————————————————————————————————————————————————————————— */

function ProjectCard({
  project,
  locale,
  t,
  canArchive,
  canShare,
}: {
  project: AnalystProjectDto
  locale: Locale
  t: AnalystText
  canArchive: boolean
  canShare: boolean
}) {
  const router = useRouter()

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/observe/${project.id}`
    const ok = await copyToClipboard(url)
    if (ok) {
      toast.success(locale === 'en' ? 'Session link copied' : 'Lien de session copié')
    } else {
      toast.error(locale === 'en' ? 'Copy failed' : 'Copie impossible')
    }
  }

  const runArchive = async () => {
    const result = await archiveOwnedProject({ projectId: project.id, locale })
    router.refresh()
    if (result.ok) {
      toast.success(locale === 'en' ? 'Project archived' : 'Projet archivé')
    } else {
      toast.error(locale === 'en' ? 'Archive failed' : 'Archivage impossible', {
        description: result.error,
      })
    }
  }

  const askArchive = () => {
    toast.warning(t.archiveAsk, {
      description: t.archiveDesc,
      action: { label: t.archiveYes, onClick: () => void runArchive() },
      cancel: { label: t.cancel, onClick: () => {} },
    })
  }

  const dateLabel = new Date(project.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161b22]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-white/10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{project.title}</h3>
            {project.isOwner ? (
              <span className="rounded-full bg-mist-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mist-700 dark:text-mist-400">
                {locale === 'en' ? 'Owner' : 'Propriétaire'}
              </span>
            ) : project.isShared ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                {locale === 'en' ? 'Shared' : 'Partagé'}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {t.legacy}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {project.isShared && project.ownerUsername ? (
              <>
                {t.sharedBy} {project.ownerUsername}
              </>
            ) : (
              `${locale === 'en' ? 'Created' : 'Créé le'} ${dateLabel}`
            )}
          </p>
          {project.description ? (
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">{project.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            title={t.copySessionLink}
            aria-label={`${t.copySessionLink} — ${project.title}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/analyst/projects/${project.id}/analytics`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-mist-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-mist-500"
          >
            <ChartColumn aria-hidden="true" className="h-3.5 w-3.5" />
            {t.openStats}
          </Link>
          <Link
            href={`/experience/${project.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-forest-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-forest-500"
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            {t.openBlind}
          </Link>
          {canArchive ? (
            <button
              type="button"
              onClick={askArchive}
              title={t.archive}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-400 hover:text-amber-600 dark:border-white/10 dark:text-zinc-300 dark:hover:border-amber-500 dark:hover:text-amber-400"
            >
              <Archive aria-hidden="true" className="h-3.5 w-3.5" />
              {t.archive}
            </button>
          ) : null}
        </div>
      </header>

      <div className="px-5 py-4">
        {/* Vidéo */}
        {project.videoUrl ? (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
            <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-forest-600 dark:text-forest-400" />
            <span className="truncate">{project.videoUrl}</span>
          </p>
        ) : (
          <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
            {locale === 'en' ? 'No target video set.' : 'Aucune vidéo cible renseignée.'}
          </p>
        )}

        {/* Fenêtres */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {t.pointsLabel} ({project.points.length})
          </h4>
          {project.points.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-2">
              {project.points.map((point) => (
                <WindowRow key={point.id} point={point} locale={locale} />
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{t.noPoints}</p>
          )}
          <AddWindowForm projectId={project.id} locale={locale} t={t} />
        </div>

        {/* Partage (propriétaire ou administrateur) */}
        {canShare ? <SharePanel project={project} locale={locale} t={t} /> : null}
      </div>
    </article>
  )
}

/* ——— Ligne fenêtre + suppression ——— */
function WindowRow({
  point,
  locale,
}: {
  point: { id: string; pointName: string; trameDebut: number; trameFin: number }
  locale: Locale
}) {
  const router = useRouter()
  const runDelete = async () => {
    const result = await deleteWindowFromProject({ pointId: point.id, locale })
    router.refresh()
    if (result.ok) {
      toast.success(locale === 'en' ? 'Window deleted' : 'Fenêtre supprimée')
    } else {
      toast.error(locale === 'en' ? 'Deletion failed' : 'Suppression impossible', {
        description: result.error,
      })
    }
  }
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="rounded-full bg-forest-500/10 px-2 py-0.5 font-semibold text-forest-700 dark:text-forest-400">
          {point.pointName}
        </span>
        <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
          {point.trameDebut}s → {point.trameFin}s
        </span>
      </span>
      <button
        type="button"
        onClick={() => void runDelete()}
        aria-label={`${locale === 'en' ? 'Delete' : 'Supprimer'} ${point.pointName}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

/* ——— Ajout d'une fenêtre ——— */
function AddWindowForm({ projectId, locale, t }: { projectId: string; locale: Locale; t: AnalystText }) {
  const router = useRouter()
  const [pointName, setPointName] = useState('')
  const [trameDebut, setTrameDebut] = useState('')
  const [trameFin, setTrameFin] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pointName.trim() || trameDebut === '' || trameFin === '') return
    const nextName = pointName.trim()
    startTransition(async () => {
      const result = await addWindowToProject({
        projectId,
        pointName: nextName,
        trameDebut: Number(trameDebut),
        trameFin: Number(trameFin),
        locale,
      })
      if (result.ok) {
        setPointName('')
        setTrameDebut('')
        setTrameFin('')
        toast.success(locale === 'en' ? 'Window added' : 'Fenêtre ajoutée')
        router.refresh()
      } else {
        toast.error(locale === 'en' ? 'Add failed' : 'Ajout impossible', { description: result.error })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 p-3 dark:border-white/15 dark:bg-white/5"
    >
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_5rem_5rem_auto]">
        <input
          type="text"
          value={pointName}
          onChange={(event) => setPointName(event.target.value)}
          placeholder={`${t.pointNameLabel} — ${t.pointNamePlaceholder}`}
          aria-label={t.pointNameLabel}
          className={`${inputClass} h-9 text-xs`}
        />
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={trameDebut}
          onChange={(event) => setTrameDebut(event.target.value)}
          placeholder={t.startLabel}
          aria-label={t.startLabel}
          className={`${inputClass} h-9 text-xs`}
        />
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={trameFin}
          onChange={(event) => setTrameFin(event.target.value)}
          placeholder={t.endLabel}
          aria-label={t.endLabel}
          className={`${inputClass} h-9 text-xs`}
        />
        <button
          type="submit"
          disabled={isPending || !pointName.trim() || trameDebut === '' || trameFin === ''}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isPending ? null : <Plus aria-hidden="true" className="h-3.5 w-3.5" />}
          {isPending ? '…' : t.addCta}
        </button>
      </div>
    </form>
  )
}

/* ——— Partage ——— */
function SharePanel({
  project,
  locale,
  t,
}: {
  project: AnalystProjectDto
  locale: Locale
  t: AnalystText
}) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [isPending, startTransition] = useTransition()

  const runShare = async () => {
    if (!username.trim()) return
    startTransition(async () => {
      const result = await shareProjectWithUser({ projectId: project.id, username, locale })
      if (result.ok) {
        setUsername('')
        toast.success(locale === 'en' ? 'Project shared' : 'Projet partagé')
        router.refresh()
      } else {
        toast.error(locale === 'en' ? 'Sharing failed' : 'Partage impossible', {
          description: result.error,
        })
      }
    })
  }

  const runUnshare = async (userId: string, name: string) => {
    const result = await unshareProjectFromUser({ projectId: project.id, userId, locale })
    router.refresh()
    if (result.ok) {
      toast.success(locale === 'en' ? 'Access removed' : 'Accès retiré', { description: name })
    } else {
      toast.error(locale === 'en' ? 'Operation failed' : 'Opération impossible', {
        description: result.error,
      })
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-white/10 dark:bg-white/5">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        <Share2 aria-hidden="true" className="h-3.5 w-3.5 text-forest-600 dark:text-forest-400" />
        {t.sharePanel}
      </h4>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.shareHint}</p>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <UserRound aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void runShare()
              }
            }}
            placeholder={t.sharePlaceholder}
            aria-label={t.sharePanel}
            className={`${inputClass} h-9 pl-9 text-xs`}
          />
        </div>
        <button
          type="button"
          disabled={isPending || !username.trim()}
          onClick={() => void runShare()}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-forest-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {isPending ? null : t.shareCta}
        </button>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          {t.accessTitle}
        </p>
        {project.sharedWith.length === 0 ? (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{t.nobodyYet}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {project.sharedWith.map((person) => (
              <li
                key={person.userId}
                className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-xs dark:bg-white/5"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">
                    {person.username || person.email}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void runUnshare(person.userId, person.username || person.email)}
                  aria-label={`${t.removeAccessAria} ${person.username || person.email}`}
                  title={`${t.removeAccessAria} ${person.username || person.email}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
