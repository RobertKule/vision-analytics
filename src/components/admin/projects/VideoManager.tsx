'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Film, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ActionResult, VideoAdminDto } from '@/lib/types'
import {
  addProjectVideo,
  deleteProjectVideo,
  duplicateProjectVideo,
  setProjectVideoBenchmark,
  updateProjectVideo,
} from '@/app/actions/projectActions'
import { parseTimecodeToSeconds, secondsToTimecode } from '@/lib/timecode'
import Sheet from '@/components/ui/Sheet'
import VideoUrlPicker, { type VideoUrlPickerText } from '@/components/ui/VideoUrlPicker'
import { resolveDuplicateName } from '@/lib/videoCopy'
import { labelClass } from '@/components/admin/projects/projectFormat'
import { friendlyActionError } from '@/lib/actionError'

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15'

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-800 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-milk dark:focus:ring-milk/15'

/** Textes français du sélecteur vidéo (surface admin FR). */
const VIDEO_TEXT: VideoUrlPickerText = {
  title: 'Source de la passe vidéo',
  subtitle:
    'Collez l’URL distante (vérifiée) ou le nom du fichier que les observateurs chargeront pour cet onglet.',
  urlPlaceholder: 'https://…/video.mp4',
  pasteAction: 'Coller',
  clearAction: 'Effacer',
  optionalTag: 'Requis',
  validating: 'Vérification…',
  okLabel: 'Vidéo accessible',
  okHint: 'Chaque observateur chargera sa propre copie du fichier.',
  fileLabel: 'Nom de fichier local',
  fileHint: 'Les observateurs chargeront leur propre copie du fichier.',
  invalidLabel: 'L’URL ne pointe pas vers une vidéo',
  unreachableLabel: 'Vidéo introuvable',
  unknownLabel: 'Accès impossible à vérifier',
  unknownHint:
    'Le réseau ou CORS empêche la vérification — vous pouvez conserver ou modifier cette valeur.',
}

/**
 * Confirmation exigée quand la configuration d'un type qui possède déjà des
 * observations est modifiée (Partie T) : la config actuelle est distincte des
 * données observées — modifier n'affecte que les futures sessions.
 */
const MODIFY_USED_TYPE_CONFIRM =
  'Ce type possède déjà des observations. Modifier sa configuration peut affecter les futures sessions mais ne doit pas altérer les données historiques.'

type VideoManagerProps = {
  projectId: string
  /** Passes vidéo du projet (ordre d'affichage = `orderIndex`). */
  videos: VideoAdminDto[]
  /** Types d'observation configurables (association vidéo → type). */
  observationTypes: string[]
  /** Projet archivé : configuration figée (lecture seule). */
  archived: boolean
}

/**
 * Gestionnaire des passes vidéo d'un projet (espace admin) :
 *   — associer / ré-associer une passe à un type d'observation (ou la rendre générique) ;
 *   — définir / effacer le benchmark (vérité terrain, MM:SS) d'une passe ;
 *   — ajouter une passe (source + type) ;
 *   — dupliquer une CONFIGURATION (nouveaux identifiants, fenêtres copiées, aucune
 *     observation recopiée — la copie peut viser un autre type) ;
 *   — retirer une passe (bloqué si elle porte des captures — jamais destructif).
 * Les fenêtres de validation par vidéo sont gérées dans PointWindows.
 */
export default function VideoManager({
  projectId,
  videos,
  observationTypes,
  archived,
}: VideoManagerProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [modifyTarget, setModifyTarget] = useState<VideoAdminDto | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<VideoAdminDto | null>(null)
  const typeOptions = observationTypes.filter((t) => t.trim().length > 0)

  return (
    <div className="flex flex-col gap-3">
      {!archived ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Ajouter une vidéo cible
          </button>
        </div>
      ) : null}

      {videos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 px-5 py-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Aucune passe vidéo configurée.
            {archived
              ? ' Ce projet archivé n’a pas de vidéos associées.'
              : ' Ajoutez la première vidéo cible pour offrir un onglet de lecture aux observateurs.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {videos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              disabled={archived}
              onModify={setModifyTarget}
              onDuplicate={setDuplicateTarget}
            />
          ))}
        </ul>
      )}

      {!archived ? (
        <>
          <AddVideoSheet
            open={addOpen}
            onClose={() => setAddOpen(false)}
            projectId={projectId}
            typeOptions={typeOptions}
          />
          {modifyTarget ? (
            <VideoConfigSheet
              key={modifyTarget.id}
              video={modifyTarget}
              typeOptions={typeOptions}
              onClose={() => setModifyTarget(null)}
            />
          ) : null}
          {duplicateTarget ? (
            <DuplicateVideoSheet
              key={duplicateTarget.id}
              video={duplicateTarget}
              typeOptions={typeOptions}
              onClose={() => setDuplicateTarget(null)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function VideoRow({
  video,
  disabled,
  onModify,
  onDuplicate,
}: {
  video: VideoAdminDto
  disabled: boolean
  onModify: (video: VideoAdminDto) => void
  onDuplicate: (video: VideoAdminDto) => void
}) {
  const router = useRouter()

  const blocked = video.captureCount > 0 || video.pointCount > 0

  const runDelete = async () => {
    const result = await deleteProjectVideo(video.id).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    router.refresh()
    if (result.ok) {
      toast.success('Vidéo retirée', {
        description: `« ${video.name ?? video.source} » n’est plus proposée aux observateurs.`,
      })
    } else {
      toast.error('Suppression impossible', { description: result.error })
    }
  }

  const askDelete = () => {
    toast.warning('Retirer cette vidéo cible ?', {
      description: `« ${video.name ?? video.source} » — les observations déjà enregistrées ne sont pas affectées.`,
      action: { label: 'Retirer', onClick: () => void runDelete() },
      cancel: { label: 'Annuler', onClick: () => {} },
    })
  }

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 font-mono text-[11px] font-bold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
            {video.orderIndex + 1}
          </span>
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              <Film aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gold-700 dark:text-gold-400" />
              <span className="truncate">{video.name ?? video.source}</span>
            </p>
            <p className="mt-0.5 max-w-full truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
              {video.source}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
              <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                {video.typeLabel ?? 'Générique'}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {video.captureCount} capture{video.captureCount > 1 ? 's' : ''}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {video.pointCount} fenêtre{video.pointCount > 1 ? 's' : ''}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {video.benchmarkSeconds !== null
                ? `Benchmark ${secondsToTimecode(video.benchmarkSeconds)}`
                : 'Sans benchmark'}
            </p>
          </div>
        </div>

        {!disabled ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onModify(video)}
              title="Modifier la configuration de cette passe (source, libellé, type, benchmark)"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:border-gold-500/60 hover:text-gold-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-gold-400/50 dark:hover:text-gold-200"
            >
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">Modifier</span>
            </button>
            <button
              type="button"
              onClick={() => onDuplicate(video)}
              title="Dupliquer cette configuration (nouveaux identifiants — aucune observation n’est copiée)"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:border-gold-500/60 hover:text-gold-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-gold-400/50 dark:hover:text-gold-200"
            >
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">Dupliquer</span>
            </button>
            <button
              type="button"
              onClick={askDelete}
              disabled={blocked}
              title={
                blocked
                  ? 'Impossible de retirer cette vidéo : elle porte des captures ou des fenêtres rattachées. Archivez le projet pour la conserver.'
                  : 'Retirer cette vidéo cible'
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-clay-400 hover:text-clay-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-clay-500 dark:hover:text-clay-300"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">Retirer</span>
            </button>
          </div>
        ) : (
          <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
            Projet archivé
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * « Modifier » — feuille de configuration d'une passe (source, libellé, type,
 * benchmark). La configuration est distincte des données observées : quand le
 * type/vidéo porte déjà des observations, une confirmation explicite est exigée
 * avant d'appliquer (l'historique n'est jamais altéré).
 */
function VideoConfigSheet({
  video,
  typeOptions,
  onClose,
}: {
  video: VideoAdminDto
  typeOptions: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [source, setSource] = useState(video.source)
  const [name, setName] = useState(video.name ?? '')
  const [typeLabel, setTypeLabel] = useState(video.typeLabel ?? '')
  const [benchmark, setBenchmark] = useState(
    video.benchmarkSeconds !== null ? secondsToTimecode(video.benchmarkSeconds) : '',
  )
  const [isPending, startTransition] = useTransition()

  const hasObservations = video.captureCount > 0
  const sourceValid = source.trim().length > 0

  const apply = async () => {
    // Type : garde la valeur actuelle si le libellé saisi n'est plus configuré.
    const targetType = typeLabel.trim()
    const patch: { videoId: string; source?: string; typeLabel?: string | null; name?: string } = {
      videoId: video.id,
      source: source.trim(),
      typeLabel: targetType || null,
    }
    if (name.trim()) patch.name = name.trim()

    const updated = await updateProjectVideo(patch).catch((error: unknown) => ({
      ok: false,
      error: friendlyActionError(error, 'fr'),
    }))
    if (!updated.ok) {
      toast.error('Enregistrement impossible', { description: updated.error })
      return
    }

    const benchmarkSeconds = benchmark.trim() ? parseTimecodeToSeconds(benchmark.trim()) : null
    if (benchmark.trim() && benchmarkSeconds === null) {
      toast.error('Format de benchmark invalide', {
        description: 'Le benchmark n’a pas été enregistré (saisissez MM:SS).',
      })
    } else if (benchmarkSeconds !== video.benchmarkSeconds) {
      const bm = await setProjectVideoBenchmark({
        videoId: video.id,
        benchmarkSeconds,
      }).catch((error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }))
      if (!bm.ok) {
        toast.error('Benchmark non enregistré', { description: bm.error })
      }
    }

    router.refresh()
    onClose()
    toast.success('Configuration enregistrée', {
      description: hasObservations
        ? 'Les futures sessions utiliseront cette configuration ; les observations passées sont intactes.'
        : 'La passe vidéo a été mise à jour.',
    })
  }

  const doSave = () => {
    if (!sourceValid || isPending) return
    const run = () =>
      startTransition(async () => {
        await apply()
      })
    if (hasObservations) {
      toast.warning('Modifier la configuration de ce type ?', {
        description: MODIFY_USED_TYPE_CONFIRM,
        action: { label: 'Modifier', onClick: run },
        cancel: { label: 'Annuler', onClick: () => {} },
      })
    } else {
      run()
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      labelledBy="edit-video-sheet-title"
      describedBy="edit-video-sheet-desc"
      footer={
        <div className="flex items-center justify-end gap-3">
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
            disabled={isPending || !sourceValid}
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
            id="edit-video-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            Administration · Configuration vidéo
          </p>
          <h2
            id="edit-video-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            Modifier la configuration
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
        {hasObservations ? (
          <p
            role="status"
            className="rounded-lg border border-gold-600/30 bg-gold-500/10 px-3 py-2.5 text-xs leading-relaxed text-gold-900 dark:border-gold-400/30 dark:bg-gold-400/10 dark:text-gold-100"
          >
            {MODIFY_USED_TYPE_CONFIRM}
          </p>
        ) : null}

        <VideoUrlPicker
          inputId="edit-video-source"
          value={source}
          onChange={setSource}
          text={VIDEO_TEXT}
        />

        <div>
          <label htmlFor="edit-video-name" className={labelClass}>
            Nom de l’onglet (facultatif)
          </label>
          <input
            id="edit-video-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. 100m oblique — prise A"
            className={INPUT_CLASS}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Type d’observation associé</span>
          <select
            aria-label="Type d’observation associé"
            value={typeLabel}
            onChange={(event) => setTypeLabel(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Générique (l’observateur choisit)</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            Si un type est choisi, l’onglet le verrouille : chaque capture de cette vidéo portera
            ce type.
          </p>
        </label>

        <div>
          <label htmlFor="edit-video-benchmark" className={labelClass}>
            Benchmark (MM:SS) — vérité terrain
          </label>
          <input
            id="edit-video-benchmark"
            type="text"
            inputMode="numeric"
            value={benchmark}
            onChange={(event) => setBenchmark(event.target.value)}
            placeholder="Ex. 01:23"
            spellCheck={false}
            className={INPUT_CLASS}
          />
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            Confidentiel — jamais transmis aux observateurs.
          </p>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * « Dupliquer » — crée une NOUVELLE entité de configuration (nouveaux
 * identifiants, jamais un identifiant réutilisé) : la source, le libellé, le
 * benchmark et les fenêtres de validation sont copiés, mais AUCUNE observation,
 * capture, driveFileId ou historique n'est dupliqué. La copie peut viser un
 * autre type d'observation (le type B reçoit sa propre configuration).
 */
function DuplicateVideoSheet({
  video,
  typeOptions,
  onClose,
}: {
  video: VideoAdminDto
  typeOptions: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const suggestedName = resolveDuplicateName(null, video.name, video.typeLabel, video.source)
  const [name, setName] = useState(suggestedName)
  const [typeLabel, setTypeLabel] = useState(video.typeLabel ?? '')
  const [isPending, startTransition] = useTransition()

  const nameValid = name.trim().length > 0

  const doDuplicate = () => {
    if (!nameValid || isPending) return
    startTransition(async () => {
      const result: ActionResult = await duplicateProjectVideo({
        videoId: video.id,
        name: name.trim(),
        typeLabel: typeLabel.trim() || null,
      }).catch((error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }))

      if (!result.ok) {
        toast.error('Duplication impossible', { description: result.error })
        return
      }
      router.refresh()
      onClose()
      toast.success('Configuration dupliquée', {
        description:
          typeLabel.trim() && typeLabel.trim() !== (video.typeLabel ?? '')
            ? `« ${name.trim()} » est la nouvelle configuration du type « ${typeLabel.trim()} ». Aucune observation n’a été copiée.`
            : `« ${name.trim()} » est une nouvelle entité — aucune observation n’a été copiée.`,
      })
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      labelledBy="duplicate-video-sheet-title"
      describedBy="duplicate-video-sheet-desc"
      footer={
        <div className="flex items-center justify-end gap-3">
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
            onClick={doDuplicate}
            disabled={isPending || !nameValid}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Copy aria-hidden="true" className="h-4 w-4" />
            )}
            {isPending ? 'Duplication…' : 'Dupliquer la configuration'}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id="duplicate-video-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            Administration · Configuration vidéo
          </p>
          <h2
            id="duplicate-video-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            Dupliquer la configuration
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
        <p
          id="duplicate-video-sheet-desc"
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
        >
          La copie reçoit de <strong>nouveaux identifiants</strong> : source, libellé, benchmark et
          fenêtres de validation sont copiés depuis « {video.name ?? video.source} », mais{' '}
          <strong>aucune observation n’est dupliquée</strong> — la copie démarre vierge et reste
          indépendante de l’originale.
        </p>

        <div>
          <label htmlFor="duplicate-video-name" className={labelClass}>
            Nom de la configuration copiée *
          </label>
          <input
            id="duplicate-video-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. 100 m — Copie"
            className={INPUT_CLASS}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Type d’observation de la copie</span>
          <select
            aria-label="Type d’observation de la copie"
            value={typeLabel}
            onChange={(event) => setTypeLabel(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">
              {video.typeLabel
                ? 'Générique (aucun type verrouillé)'
                : 'Générique (l’observateur choisit)'}
            </option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            {video.typeLabel
              ? `Par défaut, la copie conserve le type « ${video.typeLabel} ». Choisissez un autre type pour dupliquer la configuration vers celui-ci (aucune observation de « ${video.typeLabel} » n’est recopiée).`
              : 'Choisissez un type pour rattacher la copie à une passe typée, ou gardez-la générique.'}
          </p>
        </label>
      </div>
    </Sheet>
  )
}

function AddVideoSheet({
  open,
  onClose,
  projectId,
  typeOptions,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  typeOptions: string[]
}) {
  const router = useRouter()
  const [source, setSource] = useState('')
  const [name, setName] = useState('')
  const [typeLabel, setTypeLabel] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [isPending, startTransition] = useTransition()

  const sourceValid = source.trim().length > 0

  const doAdd = () => {
    if (!sourceValid || isPending) return
    startTransition(async () => {
      const result: ActionResult = await addProjectVideo({
        projectId,
        source: source.trim(),
        typeLabel: typeLabel.trim() || null,
        name: name.trim() || null,
      }).catch((error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }))

      if (!result.ok) {
        toast.error('Association impossible', { description: result.error })
        return
      }

      // Benchmark saisi à l'ajout : appliqué sur la vidéo fraîchement créée.
      const benchmarkSeconds = benchmark.trim()
        ? parseTimecodeToSeconds(benchmark.trim())
        : null
      if (benchmark.trim() && benchmarkSeconds === null) {
        toast.error('Format de benchmark invalide', {
          description: 'Le benchmark n’a pas été enregistré (saisissez MM:SS).',
        })
      } else if (benchmarkSeconds !== null && result.id) {
        const bm = await setProjectVideoBenchmark({
          videoId: result.id,
          benchmarkSeconds,
        }).catch((error: unknown) => ({ ok: false, error: friendlyActionError(error, 'fr') }))
        if (!bm.ok) {
          toast.error('Benchmark non enregistré', { description: bm.error })
        }
      }

      router.refresh()
      onClose()
      toast.success('Vidéo cible ajoutée', {
        description: 'Réglez l’association au type et le benchmark si nécessaire.',
      })
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      labelledBy="add-video-sheet-title"
      describedBy="add-video-sheet-desc"
      footer={
        <div className="flex items-center justify-end gap-3">
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
            onClick={doAdd}
            disabled={isPending || !sourceValid}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Plus aria-hidden="true" className="h-4 w-4" />
            )}
            {isPending ? 'Ajout…' : 'Ajouter la vidéo'}
          </button>
        </div>
      }
    >
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id="add-video-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            Administration · Vidéos cibles
          </p>
          <h2
            id="add-video-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            Associer une vidéo au projet
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
        <VideoUrlPicker
          inputId="add-video-source"
          value={source}
          onChange={setSource}
          text={VIDEO_TEXT}
        />

        <div>
          <label htmlFor="add-video-name" className={labelClass}>
            Nom de l’onglet (facultatif)
          </label>
          <input
            id="add-video-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex. 100m oblique — prise A"
            className={INPUT_CLASS}
          />
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            Un nom dérivé du fichier est proposé automatiquement si vide.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>
            Type d’observation associé
          </span>
          <select
            aria-label="Type d’observation associé"
            value={typeLabel}
            onChange={(event) => setTypeLabel(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Aucun — passe générique (l’observateur choisit)</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            Si un type est choisi, l’onglet le verrouille : chaque capture de cette vidéo portera
            ce type.
          </p>
        </label>

        <div>
          <label htmlFor="add-video-benchmark" className={labelClass}>
            Benchmark (MM:SS) — vérité terrain
          </label>
          <input
            id="add-video-benchmark"
            type="text"
            inputMode="numeric"
            value={benchmark}
            onChange={(event) => setBenchmark(event.target.value)}
            placeholder="Ex. 01:23"
            spellCheck={false}
            className={INPUT_CLASS}
          />
          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            Confidentiel — jamais transmis aux observateurs. Saisie facultative (modifiable ensuite
            sur la ligne de la vidéo).
          </p>
        </div>
      </div>
    </Sheet>
  )
}
