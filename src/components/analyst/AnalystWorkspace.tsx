'use client'

import { useState, useTransition } from 'react'
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
  addWindowsToProject,
  archiveOwnedProject,
  createOwnedProject,
  deleteWindowFromProject,
  shareProjectWithUser,
  unshareProjectFromUser,
} from '@/app/actions/analystActions'
import type { AnalystProjectDto } from '@/lib/types'
import { fill, type AnalystText, type Locale } from '@/lib/i18n'
import { parseTimecodeToSeconds, secondsToTimecode } from '@/lib/timecode'
import {
  analyzeWindowDrafts,
  isDraftDuplicate,
  MAX_WINDOW_ROWS,
  windowBoundsKeys,
  type WindowDraftError,
} from '@/lib/windowDraft'
import { deriveObservationNameFromVideo } from '@/lib/videoName'
import { friendlyActionError } from '@/lib/actionError'
import Sheet from '@/components/ui/Sheet'
import StepperRail, { type StepperStep } from '@/components/ui/StepperRail'
import VideoUrlPicker from '@/components/ui/VideoUrlPicker'

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
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:focus:border-milk dark:focus:ring-milk/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

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
          'text-gold-700 dark:text-gold-400',
        )}
        {chip(locale === 'en' ? 'Owned' : 'Possédés', ownedCount, 'text-gold-700 dark:text-gold-400')}
        {chip(locale === 'en' ? 'Shared' : 'Partagés', sharedCount, 'text-gold-700 dark:text-gold-400')}
        {chip(
          locale === 'en' ? 'Validation windows' : 'Fenêtres de validation',
          windowCount,
          'text-zinc-800 dark:text-zinc-100',
        )}
      </div>

      {/* ——— Nouveau projet ——— */}
      <div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
        >
          <CirclePlus aria-hidden="true" className="h-4 w-4" />
          {t.createCta}
        </button>
      </div>

      {/* ——— Liste des projets ——— */}
      {projects.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-white/60 px-6 py-14 text-center dark:border-zinc-700 dark:bg-white/5">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/10 text-gold-700 dark:bg-gold-400/10 dark:text-gold-400">
            <FolderKanban aria-hidden="true" className="h-6 w-6" />
          </span>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{t.emptyTitle}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.emptyHint}</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            <CirclePlus aria-hidden="true" className="h-4 w-4" />
            {t.createCta}
          </button>
        </div>
      ) : projects.length > 0 ? (
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
      ) : null}

      {/* ——— Assistant création (tiroir) ——— */}
      {showCreate ? (
        <CreateProjectSheet
          locale={locale}
          t={t}
          onDone={() => {
            setShowCreate(false)
          }}
        />
      ) : null}
    </div>
  )
}

/* ————————————————————————————————————————————————————————————————
 * Formulaire de création
 * ———————————————————————————————————————————————————————————————— */

function CreateProjectSheet({
  locale,
  t,
  onDone,
}: {
  locale: Locale
  t: AnalystText
  onDone: () => void
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [isPending, startTransition] = useTransition()
  // Le nom saisi par l'utilisateur ne doit jamais être écrasé par la suggestion auto.
  const [titleTouchedByUser, setTitleTouchedByUser] = useState(false)

  const steps: StepperStep[] = [
    { num: 1, label: t.projectCreateStep1 },
    { num: 2, label: t.projectCreateStep2 },
    { num: 3, label: t.projectCreateStep3 },
  ]
  const titleValid = title.trim().length > 0

  /** Saisie utilisateur : on fige le nom (plus aucune suggestion automatique ensuite). */
  const handleTitleChange = (value: string) => {
    setTitleTouchedByUser(true)
    setTitle(value)
  }

  /**
   * Rattachement de la vidéo cible : si l'utilisateur n'a pas encore saisi de nom,
   * on propose automatiquement le nom de session dérivé du fichier vidéo.
   */
  const handleVideoChange = (value: string) => {
    setVideoUrl(value)
    if (!titleTouchedByUser) {
      setTitle(deriveObservationNameFromVideo(value) ?? '')
    }
  }

  const derivedSuggestion = titleTouchedByUser
    ? null
    : deriveObservationNameFromVideo(videoUrl)

  const doCreate = () => {
    if (!titleValid) return
    startTransition(async () => {
      const result = await createOwnedProject({ title, description, videoUrl, locale }).catch(
        (error: unknown) => ({ ok: false as const, error: friendlyActionError(error, locale) }),
      )
      if (result.ok) {
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
    <Sheet
      open
      onClose={onDone}
      labelledBy="analyst-create-sheet-title"
      describedBy="analyst-create-sheet-desc"
      widthClass="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current - 1)}
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {t.previous}
            </button>
          ) : (
            <span />
          )}
          {step < steps.length ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStep((current) => current + 1)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              {t.next}
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending || !titleValid}
              onClick={doCreate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              {isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <CirclePlus aria-hidden="true" className="h-4 w-4" />
              )}
              {isPending ? t.creating : t.createSubmit}
            </button>
          )}
        </div>
      }
    >
      {/* Barre supérieure */}
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id="analyst-create-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            {t.eyebrow}
          </p>
          <h2
            id="analyst-create-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            {t.createPanel}
          </h2>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label={locale === 'en' ? 'Close the form' : 'Fermer le formulaire'}
          title={locale === 'en' ? 'Close' : 'Fermer'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <StepperRail
        steps={steps}
        current={step}
        ariaLabel={locale === 'en' ? 'Project creation progress' : "Progression de création d'un projet"}
      />

      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {fill(t.stepsOf, { current: step, total: steps.length })} — {steps[step - 1]?.label}
        </p>

        <div className="mt-5">
          {step === 1 ? (
            <div>
              <label
                htmlFor="analyst-project-title"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                {t.titleLabel} *
              </label>
              <input
                id="analyst-project-title"
                type="text"
                autoFocus
                value={title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder={t.titlePlaceholder}
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">{t.createStepIntro}</p>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <label
                htmlFor="analyst-project-desc"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                {t.descLabel}
              </label>
              <textarea
                id="analyst-project-desc"
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t.descPlaceholder}
                className={`${inputClass} resize-y`}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col gap-6">
              <VideoUrlPicker
                inputId="analyst-project-video"
                value={videoUrl}
                onChange={handleVideoChange}
                text={t.videoPicker}
              />

              {derivedSuggestion && !titleTouchedByUser ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {locale === 'en' ? (
                    <>
                      Suggested session name from the video:{' '}
                      <span className="font-medium text-zinc-700 dark:text-zinc-200">
                        “{derivedSuggestion}”
                      </span>{' '}
                      — editable in step 1.
                    </>
                  ) : (
                    <>
                      Nom de session proposé d’après le fichier vidéo :{' '}
                      <span className="font-medium text-zinc-700 dark:text-zinc-200">
                        « {derivedSuggestion} »
                      </span>{' '}
                      — modifiable à l’étape 1.
                    </>
                  )}
                </p>
              ) : null}

              {/* Aperçu */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {locale === 'en' ? 'Preview' : 'Aperçu'}
                </p>
                <p className="mt-2 truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  {title.trim() || (locale === 'en' ? 'Project title…' : 'Titre du projet…')}
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
                  <span className="truncate">{videoUrl.trim() || 'observation-2026-07-14.mp4'}</span>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
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
  const [addingWindow, setAddingWindow] = useState(false)

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
    const result = await archiveOwnedProject({ projectId: project.id, locale }).catch(
      (error: unknown) => ({ ok: false as const, error: friendlyActionError(error, locale) }),
    )
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
              <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                {locale === 'en' ? 'Owner' : 'Propriétaire'}
              </span>
            ) : project.isShared ? (
              <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
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
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gold-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-gold-600 dark:bg-gold-500 dark:hover:bg-gold-400"
          >
            <ChartColumn aria-hidden="true" className="h-3.5 w-3.5" />
            {t.openStats}
          </Link>
          <Link
            href={`/experience/${project.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            <Eye aria-hidden="true" className="h-3.5 w-3.5" />
            {t.openBlind}
          </Link>
          {canArchive ? (
            <button
              type="button"
              onClick={askArchive}
              title={t.archive}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-clay-400 hover:text-clay-600 dark:border-white/10 dark:text-zinc-300 dark:hover:border-clay-500 dark:hover:text-clay-300"
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
            <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gold-700 dark:text-gold-400" />
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
          <button
            type="button"
            onClick={() => setAddingWindow(true)}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-zinc-400 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:border-gold-600/60 hover:bg-gold-500/10 hover:text-gold-800 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-gold-400/50 dark:hover:text-gold-200"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            {t.addPoint}
          </button>
        </div>

        {addingWindow ? (
          <AddWindowSheet
            projectId={project.id}
            existingWindows={project.points}
            locale={locale}
            t={t}
            onClose={() => setAddingWindow(false)}
          />
        ) : null}

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
    const result = await deleteWindowFromProject({ pointId: point.id, locale }).catch(
      (error: unknown) => ({ ok: false as const, error: friendlyActionError(error, locale) }),
    )
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
        <span className="rounded-full bg-gold-500/15 px-2 py-0.5 font-semibold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
          {point.pointName}
        </span>
        <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-200">
          {secondsToTimecode(point.trameDebut)} → {secondsToTimecode(point.trameFin)}
        </span>
      </span>
      <button
        type="button"
        onClick={() => void runDelete()}
        aria-label={`${locale === 'en' ? 'Delete' : 'Supprimer'} ${point.pointName}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-clay-50 hover:text-clay-600 dark:hover:bg-clay-900/20 dark:hover:text-clay-400"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

/* ——— Ajout d'une fenêtre ——— */
/** Une ligne de saisie : début / fin d'UNE trame temporelle. */
type AnalystIntervalDraft = { key: string; start: string; end: string }

let analystIntervalSeed = 0
function nextAnalystIntervalKey(): string {
  analystIntervalSeed += 1
  return `analyst-interval-${analystIntervalSeed}`
}

function AddWindowSheet({
  projectId,
  existingWindows,
  locale,
  t,
  onClose,
}: {
  projectId: string
  /** Trames déjà définies : détection locale des doublons exacts avant l'appel serveur. */
  existingWindows: { trameDebut: number; trameFin: number }[]
  locale: Locale
  t: AnalystText
  onClose: () => void
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [pointName, setPointName] = useState('')
  // Un point scientifique peut apparaître plusieurs fois dans la vidéo : la saisie
  // accepte d'emblée plusieurs trames (§2), sans boucle ajouter→confirmer→recommencer.
  const [intervals, setIntervals] = useState<AnalystIntervalDraft[]>([
    { key: nextAnalystIntervalKey(), start: '', end: '' },
  ])
  const [isPending, startTransition] = useTransition()

  const steps: StepperStep[] = [
    { num: 1, label: t.windowStep1 },
    { num: 2, label: t.windowStep2 },
  ]
  const nameValid = pointName.trim().length > 0

  // Diagnostic complet du tiroir : la règle vit dans `lib/windowDraft`, PARTAGÉE avec
  // l'espace administrateur et les Server Actions. Seuls les libellés sont traduits ici.
  const analysis = analyzeWindowDrafts(intervals, windowBoundsKeys(existingWindows), {
    maxWindows: MAX_WINDOW_ROWS,
  })
  const checks = analysis.checks
  const boundsValid = analysis.canSubmit
  const isDuplicate = (check: (typeof checks)[number]): boolean =>
    isDraftDuplicate(check, analysis.duplicateKeys)

  const draftErrorLabel = (error: WindowDraftError): string =>
    error === 'timecode' ? t.windowTimecodeError : t.windowBoundsError

  const updateInterval = (key: string, patch: Partial<Omit<AnalystIntervalDraft, 'key'>>) => {
    setIntervals((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    )
  }

  const addInterval = () => {
    setIntervals((current) =>
      current.length >= MAX_WINDOW_ROWS
        ? current
        : [...current, { key: nextAnalystIntervalKey(), start: '', end: '' }],
    )
  }

  const removeInterval = (key: string) => {
    setIntervals((current) =>
      current.length <= 1 ? current : current.filter((draft) => draft.key !== key),
    )
  }

  const doAdd = () => {
    if (!nameValid || !boundsValid) return
    const windows = intervals.map((draft) => ({
      trameDebut: parseTimecodeToSeconds(draft.start) as number,
      trameFin: parseTimecodeToSeconds(draft.end) as number,
    }))
    if (windows.some((window) => window.trameDebut >= window.trameFin)) return
    const nextName = pointName.trim()
    startTransition(async () => {
      const result = await addWindowsToProject({
        projectId,
        pointName: nextName,
        windows,
        locale,
      }).catch((error: unknown) => ({ ok: false as const, error: friendlyActionError(error, locale) }))
      if (result.ok) {
        toast.success(
          windows.length > 1
            ? locale === 'en'
              ? `${windows.length} frames added`
              : `${windows.length} trames ajoutées`
            : locale === 'en'
              ? 'Window added'
              : 'Fenêtre ajoutée',
        )
        router.refresh()
        onClose()
      } else {
        toast.error(locale === 'en' ? 'Add failed' : 'Ajout impossible', {
          description: result.error,
        })
      }
    })
  }

  const boundsInputClass =
    'h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15'

  return (
    <Sheet
      open
      onClose={onClose}
      labelledBy={`add-window-sheet-${projectId}`}
      describedBy={`add-window-sheet-desc-${projectId}`}
      widthClass="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current - 1)}
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {t.previous}
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
              {t.next}
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
              {isPending
                ? t.adding
                : intervals.length > 1
                  ? `${t.addCta} (${intervals.length})`
                  : t.addCta}
            </button>
          )}
        </div>
      }
    >
      {/* Barre supérieure */}
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id={`add-window-sheet-desc-${projectId}`}
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            {t.pointsLabel}
          </p>
          <h2
            id={`add-window-sheet-${projectId}`}
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            {t.addPoint}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={locale === 'en' ? 'Close the form' : 'Fermer le formulaire'}
          title={locale === 'en' ? 'Close' : 'Fermer'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <StepperRail
        steps={steps}
        current={step}
        ariaLabel={locale === 'en' ? 'Validation window progress' : "Progression d'ajout d'une fenêtre"}
      />

      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {fill(t.stepsOf, { current: step, total: steps.length })} — {steps[step - 1]?.label}
        </p>

        <div className="mt-5">
          {step === 1 ? (
            <div>
              <label
                htmlFor={`analyst-point-name-${projectId}`}
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                {t.pointNameLabel}
              </label>
              <input
                id={`analyst-point-name-${projectId}`}
                type="text"
                autoFocus
                value={pointName}
                onChange={(event) => setPointName(event.target.value)}
                placeholder={t.pointNamePlaceholder}
                className={inputClass}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="flex flex-col gap-3">
                {intervals.map((draft, index) => {
                  const check = checks[index]
                  const duplicate = isDuplicate(check)
                  const duration =
                    check.startSeconds !== null &&
                    check.endSeconds !== null &&
                    check.startSeconds < check.endSeconds
                      ? check.endSeconds - check.startSeconds
                      : null
                  return (
                    <div
                      key={draft.key}
                      className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-950/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {t.windowRowLabel} {index + 1}
                        </span>
                        {intervals.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeInterval(draft.key)}
                            aria-label={`${t.windowRemoveRow} ${index + 1}`}
                            className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-clay-50 hover:text-clay-600 dark:text-zinc-400 dark:hover:bg-clay-500/20 dark:hover:text-clay-300"
                          >
                            {t.windowRemoveRow}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor={`analyst-window-start-${draft.key}`}
                            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                          >
                            {t.windowStartLabel}
                          </label>
                          <input
                            id={`analyst-window-start-${draft.key}`}
                            type="text"
                            inputMode="numeric"
                            autoFocus={index === 0}
                            value={draft.start}
                            onChange={(event) => updateInterval(draft.key, { start: event.target.value })}
                            placeholder={t.windowStartPlaceholder}
                            spellCheck={false}
                            className={boundsInputClass}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`analyst-window-end-${draft.key}`}
                            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                          >
                            {t.windowEndLabel}
                          </label>
                          <input
                            id={`analyst-window-end-${draft.key}`}
                            type="text"
                            inputMode="numeric"
                            value={draft.end}
                            onChange={(event) => updateInterval(draft.key, { end: event.target.value })}
                            placeholder={t.windowEndPlaceholder}
                            spellCheck={false}
                            className={boundsInputClass}
                          />
                        </div>
                      </div>

                      {check.error ? (
                        <p
                          role="alert"
                          className="mt-2 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-sm text-clay-700 dark:border-clay-800 dark:bg-clay-900/40 dark:text-clay-300"
                        >
                          {draftErrorLabel(check.error)}
                        </p>
                      ) : duplicate ? (
                        <p
                          role="alert"
                          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                        >
                          {t.windowDuplicateError}
                        </p>
                      ) : duration !== null ? (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {locale === 'en' ? 'Frame duration' : 'Durée de la trame'} :{' '}
                          {secondsToTimecode(duration)}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={addInterval}
                disabled={intervals.length >= MAX_WINDOW_ROWS}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-zinc-400 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:border-gold-600/60 hover:bg-gold-500/10 hover:text-gold-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:border-gold-400/50 dark:hover:bg-gold-400/10 dark:hover:text-gold-200"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                {t.windowAddRow}
              </button>

              <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">{t.windowMultiHint}</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{t.windowAddHint}</p>

              {intervals.length > 1 && analysis.totalDurationSeconds > 0 ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {intervals.length} {t.windowCount} — {t.windowTotalDuration} :{' '}
                  {secondsToTimecode(analysis.totalDurationSeconds)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
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
      const result = await shareProjectWithUser({ projectId: project.id, username, locale }).catch(
        (error: unknown) => ({ ok: false as const, error: friendlyActionError(error, locale) }),
      )
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
    const result = await unshareProjectFromUser({ projectId: project.id, userId, locale }).catch(
      (error: unknown) => ({ ok: false as const, error: friendlyActionError(error, locale) }),
    )
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
        <Share2 aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
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
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
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
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-clay-50 hover:text-clay-600 dark:hover:bg-clay-900/20 dark:hover:text-clay-400"
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
