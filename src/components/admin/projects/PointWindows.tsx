'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Film, Plus, X } from 'lucide-react'
import { addProjectPointWindows, deleteProjectPoint } from '@/app/actions/projectActions'
import type { ActionResult, ProjectPointDto, VideoAdminDto } from '@/lib/types'
import { parseTimecodeToSeconds, secondsToTimecode } from '@/lib/timecode'
import {
  analyzeWindowDrafts,
  isDraftDuplicate,
  MAX_WINDOW_ROWS,
  windowBoundsKeys,
  type WindowDraftError,
} from '@/lib/windowDraft'
import { formatWindow, labelClass } from '@/components/admin/projects/projectFormat'
import { friendlyActionError } from '@/lib/actionError'
import {
  buildWindowHierarchy,
  strictlyContains,
  type AttributionWindow,
  type WindowHierarchy,
} from '@/lib/windowAttribution'
import Sheet from '@/components/ui/Sheet'
import StepperRail, { type StepperStep } from '@/components/ui/StepperRail'

/** Libellés des codes renvoyés par le noyau de saisie (`lib/windowDraft`). */
const WINDOW_DRAFT_ERROR_LABEL: Record<WindowDraftError, string> = {
  timecode: 'Saisissez chaque borne en MM:SS (ou HH:MM:SS).',
  bounds: 'Le début doit précéder la fin (début < fin).',
}

/**
 * Vue minimale attendue par le moteur d'attribution. `ProjectPointDto.videoId`
 * peut être `undefined` (lecture partielle) : on le normalise en `null`, qui
 * désigne la même passe générique héritée.
 */
function toWindow(point: ProjectPointDto): AttributionWindow {
  return {
    id: point.id,
    videoId: point.videoId ?? null,
    trameDebut: point.trameDebut,
    trameFin: point.trameFin,
  }
}

/** Relation d'une fenêtre avec ses voisines de la MÊME passe vidéo (§8, §17). */
type WindowRelation = {
  /** Profondeur d'imbrication (0 = fenêtre racine). */
  depth: number
  /** Bornes de la fenêtre englobante immédiate, si la fenêtre est incluse. */
  parentBounds: string | null
  /** Bornes de la première fenêtre qui la chevauche sans l'englober. */
  overlapBounds: string | null
}

/**
 * Décrit, pour l'affichage, la place d'une fenêtre dans la hiérarchie : incluse
 * (parent/enfant/grand-enfant) ou simplement chevauchante. Purement descriptif :
 * l'arbitrage analytique reste fait par le moteur, jamais par l'interface.
 */
function relationOf(
  point: ProjectPointDto,
  siblings: ProjectPointDto[],
  hierarchy: WindowHierarchy,
): WindowRelation {
  const depth = hierarchy.depth.get(point.id) ?? 0
  const parentId = hierarchy.parentId.get(point.id) ?? null
  const parent = parentId ? siblings.find((candidate) => candidate.id === parentId) : undefined

  // Chevauchement : ni inclusion, ni fenêtre identique, ni relation ancêtre/descendant.
  const self = toWindow(point)
  const overlaps = siblings
    .map(toWindow)
    .filter((candidate) => candidate.id !== self.id)
    .filter(
      (candidate) =>
        !strictlyContains(self, candidate) &&
        !strictlyContains(candidate, self) &&
        !(candidate.trameDebut === self.trameDebut && candidate.trameFin === self.trameFin),
    )
    .filter((candidate) => candidate.trameDebut < self.trameFin && self.trameDebut < candidate.trameFin)
    .sort((a, b) => a.trameDebut - b.trameDebut || (a.id < b.id ? -1 : 1))

  return {
    depth,
    parentBounds: parent ? `${secondsToTimecode(parent.trameDebut)} → ${secondsToTimecode(parent.trameFin)}` : null,
    overlapBounds: overlaps[0]
      ? `${secondsToTimecode(overlaps[0].trameDebut)} → ${secondsToTimecode(overlaps[0].trameFin)}`
      : null,
  }
}

function PointRow({
  point,
  relation,
}: {
  point: ProjectPointDto
  /** Absente pour les listes plates hors passe vidéo (aucune hiérarchie à décrire). */
  relation?: WindowRelation
}) {
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
    <li
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
      // Indentation visuelle : plus la fenêtre est spécifique, plus elle est en retrait.
      style={relation && relation.depth > 0 ? { marginLeft: `${Math.min(relation.depth, 3) * 14}px` } : undefined}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          {secondsToTimecode(point.trameDebut)} → {secondsToTimecode(point.trameFin)}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          (durée {formatWindow(point.trameFin - point.trameDebut)})
        </span>
        {relation?.parentBounds ? (
          <span className="inline-flex items-center rounded-full bg-gold-500/15 px-2 py-0.5 text-[10px] font-semibold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
            incluse dans {relation.parentBounds}
          </span>
        ) : null}
        {relation?.overlapBounds ? (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
            chevauche {relation.overlapBounds}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={askDelete}
        aria-label={`Supprimer la fenêtre ${secondsToTimecode(point.trameDebut)} → ${secondsToTimecode(point.trameFin)} de ${point.pointName}`}
        className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-clay-50 hover:text-clay-600 dark:text-zinc-400 dark:hover:bg-clay-500/20 dark:hover:text-clay-300"
      >
        Supprimer
      </button>
    </li>
  )
}

const STEPS: StepperStep[] = [
  { num: 1, label: 'Nom du point' },
  { num: 2, label: 'Trames temporelles (MM:SS)' },
]

const BOUNDS_INPUT_CLASS =
  'h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15'

/**
 * Dernier segment d'une source (ou nom) pour étiqueter une passe sans type ni nom.
 * Utilisé uniquement pour l'affichage admin — jamais transmis aux observateurs.
 */
function shortSourceLabel(video: VideoAdminDto): string {
  const leaf = (video.source ?? '').split(/[\\/]/).pop()?.trim()
  if (!leaf) return `Vidéo ${video.orderIndex + 1}`
  return leaf.length > 46 ? `${leaf.slice(0, 45)}…` : leaf
}

/** Libellé principal d'une passe (type associé prioritaire, puis nom, puis source). */
function videoLabel(video: VideoAdminDto): string {
  return video.typeLabel?.trim() || video.name?.trim() || shortSourceLabel(video)
}

/** Pastille du contexte type d'une passe. */
function TypeChip({ label }: { label: string }) {
  const generic = label === 'Générique'
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        generic
          ? 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300'
          : 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
      }`}
    >
      <span className="truncate">{label}</span>
    </span>
  )
}

/** Une ligne de saisie : début / fin d'UNE trame temporelle. */
type IntervalDraft = { key: string; start: string; end: string }

let intervalKeySeed = 0
function nextIntervalKey(): string {
  intervalKeySeed += 1
  return `interval-${intervalKeySeed}`
}

/**
 * Tiroir d'ajout de fenêtres de validation : nom du point, puis AUTANT de trames
 * temporelles que nécessaire (§2). Un point scientifique peut apparaître plusieurs
 * fois dans la même vidéo — l'utilisateur saisit tous ses intervalles d'un seul
 * geste, sans boucle « ajouter → confirmer → recommencer ».
 *
 * Les chevauchements et inclusions sont autorisés (le moteur d'attribution les
 * arbitre) ; seuls les doublons EXACTS, avec l'existant ou dans la saisie, sont
 * refusés — l'attribution serait ambiguë pour rien.
 */
function PointWindowSheet({
  projectId,
  targetVideo,
  existingWindows,
  onClose,
}: {
  projectId: string
  /** Passe (donc type) à laquelle les fenêtres seront rattachées ; null = passe générique héritée. */
  targetVideo: VideoAdminDto | null
  /** Fenêtres déjà définies pour CETTE passe (détection locale des doublons exacts). */
  existingWindows: ProjectPointDto[]
  onClose: () => void
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [pointName, setPointName] = useState('')
  const [intervals, setIntervals] = useState<IntervalDraft[]>([
    { key: nextIntervalKey(), start: '', end: '' },
  ])
  const [isPending, startTransition] = useTransition()

  const nameValid = pointName.trim().length > 0

  // Diagnostic complet du tiroir : la règle vit dans `lib/windowDraft`, partagée avec
  // les Server Actions. Aucune validation de bornes n'est réécrite ici.
  const analysis = analyzeWindowDrafts(
    intervals,
    windowBoundsKeys(existingWindows),
    { maxWindows: MAX_WINDOW_ROWS },
  )
  const checks = analysis.checks
  const boundsValid = analysis.canSubmit

  const targetLabel = targetVideo ? videoLabel(targetVideo) : 'Passe générique du projet'
  const targetChip = targetVideo ? targetVideo.typeLabel?.trim() || 'Générique' : 'Générique'

  const updateInterval = (key: string, patch: Partial<Omit<IntervalDraft, 'key'>>) => {
    setIntervals((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    )
  }

  const addInterval = () => {
    setIntervals((current) =>
      current.length >= MAX_WINDOW_ROWS
        ? current
        : [...current, { key: nextIntervalKey(), start: '', end: '' }],
    )
  }

  const removeInterval = (key: string) => {
    setIntervals((current) => (current.length <= 1 ? current : current.filter((draft) => draft.key !== key)))
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
      const result: ActionResult = await addProjectPointWindows({
        projectId,
        pointName: nextName,
        videoId: targetVideo ? targetVideo.id : null,
        windows,
      }).catch((error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }))
      if (result.ok) {
        toast.success(
          windows.length > 1 ? `${windows.length} trames ajoutées` : 'Fenêtre de validation ajoutée',
          {
            description: `« ${nextName} » — ${windows
              .map((window) => `${secondsToTimecode(window.trameDebut)}→${secondsToTimecode(window.trameFin)}`)
              .join(', ')}${targetVideo ? ` (${targetLabel})` : ''}.`,
          },
        )
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
              {isPending
                ? 'Ajout…'
                : intervals.length > 1
                  ? `Ajouter ${intervals.length} trames`
                  : 'Ajouter'}
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
            Ajouter des trames de validation
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

      <StepperRail steps={STEPS} current={step} ariaLabel="Progression d'ajout de trames" />

      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          Étape {step} sur {STEPS.length} — {STEPS[step - 1]?.label}
        </p>

        <div className="mt-5">
          {/* Contexte type/vidéo — une trame valide TOUJOURS une passe précise. */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
            <Film aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
            <TypeChip label={targetChip} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
              {targetVideo ? targetVideo.name?.trim() || shortSourceLabel(targetVideo) : targetLabel}
            </span>
          </div>

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
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                Un même point peut apparaître plusieurs fois dans la vidéo : l’étape suivante accepte
                toutes ses trames temporelles.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="flex flex-col gap-3">
                {intervals.map((draft, index) => {
                  const check = checks[index]
                  const isDuplicate = isDraftDuplicate(check, analysis.duplicateKeys)
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
                          Trame {index + 1}
                        </span>
                        {intervals.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeInterval(draft.key)}
                            aria-label={`Retirer la trame ${index + 1}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-clay-50 hover:text-clay-600 dark:hover:bg-clay-500/20 dark:hover:text-clay-300"
                          >
                            <X aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`point-debut-${draft.key}`} className={labelClass}>
                            Début (MM:SS)
                          </label>
                          <input
                            id={`point-debut-${draft.key}`}
                            type="text"
                            inputMode="numeric"
                            autoFocus={index === 0}
                            value={draft.start}
                            onChange={(event) => updateInterval(draft.key, { start: event.target.value })}
                            placeholder="01:00"
                            spellCheck={false}
                            className={BOUNDS_INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <label htmlFor={`point-fin-${draft.key}`} className={labelClass}>
                            Fin (MM:SS)
                          </label>
                          <input
                            id={`point-fin-${draft.key}`}
                            type="text"
                            inputMode="numeric"
                            value={draft.end}
                            onChange={(event) => updateInterval(draft.key, { end: event.target.value })}
                            placeholder="02:30"
                            spellCheck={false}
                            className={BOUNDS_INPUT_CLASS}
                          />
                        </div>
                      </div>

                      {check.error ? (
                        <p
                          role="alert"
                          className="mt-2 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-sm text-clay-700 dark:border-clay-800 dark:bg-clay-900/40 dark:text-clay-300"
                        >
                          {WINDOW_DRAFT_ERROR_LABEL[check.error]}
                        </p>
                      ) : isDuplicate ? (
                        <p
                          role="alert"
                          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                        >
                          Cette trame existe déjà pour cette passe (doublon exact).
                        </p>
                      ) : duration !== null ? (
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          Durée de la trame : {formatWindow(duration)}
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
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:border-gold-600/50 hover:bg-gold-500/10 hover:text-gold-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-gold-400/40 dark:hover:bg-gold-400/10 dark:hover:text-gold-200"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                Ajouter une trame
              </button>

              <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
                Format MM:SS (ou HH:MM:SS au-delà de l’heure). Les trames peuvent se
                <strong> chevaucher</strong> ou s’<strong>inclure</strong> : chaque observation reste
                attribuée à une seule trame, la plus spécifique d’abord.
              </p>

              {intervals.length > 1 && analysis.totalDurationSeconds > 0 ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {intervals.length} trames — durée cumulée{' '}
                  {formatWindow(analysis.totalDurationSeconds)}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}

/**
 * Un POINT LOGIQUE et toutes ses trames temporelles — c'est-à-dire les fenêtres
 * qui partagent le même nom au sein de la même passe vidéo (§19).
 */
function LogicalPointGroup({
  name,
  points,
  hierarchy,
}: {
  name: string
  points: ProjectPointDto[]
  hierarchy: WindowHierarchy
}) {
  const ordered = [...points].sort(
    (a, b) => a.trameDebut - b.trameDebut || a.trameFin - b.trameFin || (a.id < b.id ? -1 : 1),
  )
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 items-center rounded-full bg-gold-500/15 px-2 text-xs font-semibold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
          {name}
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {ordered.length} trame{ordered.length > 1 ? 's' : ''} pour ce point
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {ordered.map((point) => (
          <PointRow key={point.id} point={point} relation={relationOf(point, ordered, hierarchy)} />
        ))}
      </ul>
    </div>
  )
}

/** Sous-liste des fenêtres d'une même passe (donc d'un même type). */
function VideoWindowGroup({
  projectId,
  video,
  points,
  emptyText,
}: {
  projectId: string
  /** null = passe générique héritée (aucune vidéo configurée). */
  video: VideoAdminDto | null
  points: ProjectPointDto[]
  emptyText: string
}) {
  const [adding, setAdding] = useState(false)
  const typeLabel = video ? video.typeLabel?.trim() || 'Générique' : 'Générique'

  // Hiérarchie parent/enfant calculée UNE fois par passe : purement indicative ici,
  // l'arbitrage analytique appartient au moteur (`windowAttribution`).
  const hierarchy = useMemo(() => buildWindowHierarchy(points.map(toWindow)), [points])
  const groups = useMemo(() => {
    const byName = new Map<string, { name: string; points: ProjectPointDto[] }>()
    for (const point of points) {
      const name = point.pointName?.trim() || 'Point sans nom'
      const key = name.replace(/\s+/g, ' ').toLowerCase()
      const group = byName.get(key)
      if (group) group.points.push(point)
      else byName.set(key, { name, points: [point] })
    }
    return [...byName.values()]
  }, [points])

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {video ? (
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 font-mono text-[11px] font-bold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
              {video.orderIndex + 1}
            </span>
          ) : (
            <Film aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <TypeChip label={typeLabel} />
              {video ? (
                <span className="min-w-0 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {video.name?.trim() || shortSourceLabel(video)}
                </span>
              ) : null}
            </div>
            {points.length > 0 ? (
              <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                {points.length} trame{points.length > 1 ? 's' : ''} · {groups.length} point
                {groups.length > 1 ? 's' : ''}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:border-gold-600/50 hover:bg-gold-500/10 hover:text-gold-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-gold-400/40 dark:hover:bg-gold-400/10 dark:hover:text-gold-200"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Ajouter un point
        </button>
      </div>

      {points.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2.5">
          {groups.map((group) => (
            <LogicalPointGroup
              key={group.name.toLowerCase()}
              name={group.name}
              points={group.points}
              hierarchy={hierarchy}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400">{emptyText}</p>
      )}

      {adding ? (
        <PointWindowSheet
          projectId={projectId}
          targetVideo={video}
          existingWindows={points}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}

/**
 * Fenêtres de validation d'un projet, GROUPÉES PAR PASSE VIDÉO (donc par type
 * d'observation). Chaque fenêtre valide la timeline d'UNE vidéo : sans rattachement,
 * l'attribution point/fantôme serait ambiguë dès que plusieurs vidéos typées existent.
 *
 * — Projet multi-vidéos : une carte par vidéo (type associé affiché) + ajout scoped.
 * — Projet à vidéo unique / hérité (aucune passe configurée) : liste plate générique.
 */
export function ValidationWindowsPanel({
  projectId,
  points,
  videos,
}: {
  projectId: string
  points: ProjectPointDto[]
  videos: VideoAdminDto[]
}) {
  const ordered = [...videos].sort((a, b) => a.orderIndex - b.orderIndex)
  const total = points.length

  // Fenêtres sans vidéo rattachée (modèle hérité / « vidéo unique » du projet).
  const legacyPoints = points.filter((point) => !point.videoId)

  if (ordered.length === 0) {
    // Aucune passe vidéo configurée : on conserve le flux générique historique.
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Fenêtres de validation ({total})
          </h4>
          <AddGenericButton projectId={projectId} existingWindows={points} />
        </div>
        {total > 0 ? (
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
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Fenêtres de validation ({total})
          </h4>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Chaque trame est rattachée à la passe (et donc au type) qu’elle valide — les
            observations d’une vidéo ne sont comparées qu’à ses propres trames.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {ordered.map((video) => {
          const videoPoints = points.filter((point) => point.videoId === video.id)
          return (
            <VideoWindowGroup
              key={video.id}
              projectId={projectId}
              video={video}
              points={videoPoints}
              emptyText="Aucune trame pour cette passe pour l’instant — ajoutez la première ci-dessus."
            />
          )
        })}

        {/* Fenêtres héritées sans vidéo : préservées (lecture seule de rattachement). */}
        {legacyPoints.length > 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3.5 py-3 dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex flex-wrap items-center gap-2">
              <Film aria-hidden="true" className="h-4 w-4 text-zinc-400" />
              <TypeChip label="Sans vidéo (héritage)" />
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                {legacyPoints.length} trame{legacyPoints.length > 1 ? 's' : ''} sans rattachement
              </span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              Créées avant la configuration des passes vidéo : elles ne valident que les
              observations génériques sans vidéo. Recréez-les sur la passe concernée puis retirez-les.
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {legacyPoints.map((point) => (
                <PointRow key={point.id} point={point} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Bouton « Ajouter une fenêtre » du flux générique hérité (aucune passe configurée). */
function AddGenericButton({
  projectId,
  existingWindows,
}: {
  projectId: string
  existingWindows: ProjectPointDto[]
}) {
  const [adding, setAdding] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:border-gold-600/50 hover:bg-gold-500/10 hover:text-gold-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-gold-400/40 dark:hover:bg-gold-400/10 dark:hover:text-gold-200"
      >
        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
        Ajouter une fenêtre
      </button>
      {adding ? (
        <PointWindowSheet
          projectId={projectId}
          targetVideo={null}
          existingWindows={existingWindows}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </>
  )
}
