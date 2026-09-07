'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  Camera,
  CheckCircle,
  Crosshair,
  Film,
  Pause,
  Play,
  RotateCcw,
  Send,
  Timer,
  Trash,
  X,
} from 'lucide-react'
import type { CaptureRecord } from '@/lib/types'
import type { AnnotatorText, CompletionText, Locale, StepperText } from '@/lib/i18n'
import SubmissionStepper from '@/components/SubmissionStepper'

/**
 * Marqueur (cercle d'intérêt) dessiné sur l'image.
 * Coordonnées en pixels CSS du calque (canvas), indépendantes du DPR.
 * `placedAt` = horodatage vidéo (s) au moment du placement → mémoire locale.
 */
type AnnotationCircle = {
  id: string
  x: number
  y: number
  r: number
  placedAt: number
}

type VideoAnnotatorProps = {
  projectId?: string
  projectTitle?: string
  expectedVideoUrl?: string | null
  locale: Locale
  t: {
    annotator: AnnotatorText
    stepper: StepperText
    completion: CompletionText
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Formate un nombre de secondes en `MM:SS.d`. */
function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '00:00.0'
  const totalTenths = Math.max(0, Math.round(totalSeconds * 10))
  const tenths = totalTenths % 10
  const total = Math.floor(totalTenths / 10)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
}

/** Remplit un gabarit `{{cle}}` (variante locale pour ne pas embarquer le dictionnaire). */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

function pluralLabel(unit: { one: string; many: string }, count: number): string {
  return count === 1 ? unit.one : unit.many
}

const BASE_COLOR = '#10b981'
const SELECT_COLOR = '#22d3ee'

function getLocalPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

function paintCircle(
  ctx: CanvasRenderingContext2D,
  circle: AnnotationCircle,
  selected: boolean,
): void {
  ctx.beginPath()
  ctx.arc(circle.x, circle.y, Math.max(0, circle.r), 0, Math.PI * 2)
  ctx.fillStyle = selected ? 'rgba(34, 211, 238, 0.14)' : 'rgba(16, 185, 129, 0.12)'
  ctx.fill()
  ctx.lineWidth = selected ? 2.5 : 3
  ctx.strokeStyle = selected ? SELECT_COLOR : BASE_COLOR
  ctx.setLineDash(selected ? [6, 4] : [])
  ctx.stroke()
  ctx.setLineDash([])
  // Point central — toujours visible, même pour un tout petit cercle.
  ctx.beginPath()
  ctx.arc(circle.x, circle.y, 2, 0, Math.PI * 2)
  ctx.fillStyle = selected ? SELECT_COLOR : BASE_COLOR
  ctx.fill()
}

export default function VideoAnnotator({
  projectId,
  projectTitle,
  expectedVideoUrl,
  locale,
  t,
}: VideoAnnotatorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const circlesRef = useRef<AnnotationCircle[]>([])
  const draftRef = useRef<AnnotationCircle | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)
  const scaleRef = useRef(1)
  const readyRef = useRef(false)
  const playingRef = useRef(false)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [annotations, setAnnotations] = useState<AnnotationCircle[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [observations, setObservations] = useState<CaptureRecord[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isStepperOpen, setIsStepperOpen] = useState(false)
  const [ended, setEnded] = useState(false)
  const [endPromptDismissed, setEndPromptDismissed] = useState(false)
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)

  const canAnnotate = isReady && !isPlaying && videoUrl !== null

  const selectCircle = useCallback((id: string | null) => {
    selectedIdRef.current = id
    setSelectedId(id)
  }, [])

  /** Redessine les annotations sur un calque transparent. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const dpr = scaleRef.current || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const selected = selectedIdRef.current
    for (const circle of circlesRef.current) paintCircle(ctx, circle, circle.id === selected)
    if (draftRef.current) paintCircle(ctx, draftRef.current, false)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [])

  /** Aligne la résolution interne du canvas sur sa taille affichée (× DPR). */
  const syncCanvasSize = useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const rect = container.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(rect.width * dpr))
    const height = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    scaleRef.current = dpr
    redraw()
  }, [redraw])

  const clearDrawing = useCallback(() => {
    circlesRef.current = []
    draftRef.current = null
    dragRef.current = null
    selectCircle(null)
    setAnnotations([])
    redraw()
  }, [redraw, selectCircle])

  const handleDeleteCapture = useCallback((captureId: string) => {
    setObservations((prev) => prev.filter((item) => item.id !== captureId))
  }, [])

  /** Réinitialise l'état pour une nouvelle vidéo. */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = '' // permet de re-sélectionner le même fichier
    if (!file.type.startsWith('video/')) {
      setErrorMessage(t.annotator.fileTypeError)
      return
    }
    setErrorMessage(null)
    clearDrawing()
    setObservations([])
    setSubmittedCount(null)
    setFileName(file.name)
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setIsReady(false)
    setEnded(false)
    setEndPromptDismissed(false)
    readyRef.current = false
    playingRef.current = false
    setVideoUrl(URL.createObjectURL(file))
  }

  // Révoque l'ancienne URL objet quand la source change (ou au démontage).
  useEffect(() => {
    const url = videoUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [videoUrl])

  // Redimensionne le canvas dès que la vidéo est prête, puis à chaque redimensionnement.
  useEffect(() => {
    if (!isReady) return
    const container = containerRef.current
    if (!container) return
    syncCanvasSize()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(syncCanvasSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [isReady, syncCanvasSize])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      // En quittant une frame annotée, on retire les marqueurs liés à cette frame.
      clearDrawing()
      void video.play().catch(() => {
        /* Lecture refusée par le navigateur : rien à faire. */
      })
    } else {
      video.pause()
    }
  }, [clearDrawing])

  const defaultRadius = useCallback((): number => {
    const container = containerRef.current
    if (!container) return 22
    const rect = container.getBoundingClientRect()
    const base = Math.min(rect.width, rect.height)
    return Math.max(14, Math.min(44, Math.round(base * 0.05)))
  }, [])

  /** Trouve le marqueur le plus haut sous un point (dernier tracé en premier). */
  const hitTest = useCallback((pointX: number, pointY: number): number => {
    const circles = circlesRef.current
    for (let i = circles.length - 1; i >= 0; i--) {
      const circle = circles[i]
      const tolerance = Math.max(circle.r + 10, 26)
      if (Math.hypot(circle.x - pointX, circle.y - pointY) <= tolerance) return i
    }
    return -1
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!readyRef.current || playingRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      event.preventDefault()
      canvas.setPointerCapture?.(event.pointerId)
      const point = getLocalPoint(canvas, event.clientX, event.clientY)

      // Sélection + déplacement d'un marqueur existant.
      const hitIndex = hitTest(point.x, point.y)
      if (hitIndex >= 0) {
        const circle = circlesRef.current[hitIndex]
        dragRef.current = {
          id: circle.id,
          startX: point.x,
          startY: point.y,
          origX: circle.x,
          origY: circle.y,
        }
        selectCircle(circle.id)
        return
      }

      // Nouveau tracé (cliqué-glissé ou clic simple pour un marqueur).
      dragRef.current = null
      const video = videoRef.current
      draftRef.current = {
        id: generateId(),
        x: point.x,
        y: point.y,
        r: 0,
        placedAt: video && Number.isFinite(video.currentTime) ? video.currentTime : 0,
      }
      selectCircle(null)
      redraw()
    },
    [hitTest, redraw, selectCircle],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const point = getLocalPoint(canvas, event.clientX, event.clientY)

      // Déplacement d'un marqueur sélectionné.
      const drag = dragRef.current
      if (drag) {
        const circles = circlesRef.current
        const index = circles.findIndex((c) => c.id === drag.id)
        if (index >= 0) {
          const circle = circles[index]
          const dx = point.x - drag.startX
          const dy = point.y - drag.startY
          const container = containerRef.current
          const rect = container?.getBoundingClientRect()
          const maxX = rect ? rect.width - circle.r : circle.x
          const maxY = rect ? rect.height - circle.r : circle.y
          const moved = {
            ...circle,
            x: Math.min(Math.max(drag.origX + dx, circle.r), Math.max(circle.r, maxX)),
            y: Math.min(Math.max(drag.origY + dy, circle.r), Math.max(circle.r, maxY)),
          }
          circles[index] = moved
          setAnnotations([...circles])
          redraw()
        }
        return
      }

      // Redimensionnement du brouillon.
      const draft = draftRef.current
      if (!draft) return
      draftRef.current = {
        ...draft,
        r: Math.hypot(point.x - draft.x, point.y - draft.y),
      }
      redraw()
    },
    [redraw],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.releasePointerCapture?.(event.pointerId)

      if (dragRef.current) {
        dragRef.current = null
        return
      }

      const draft = draftRef.current
      if (!draft) return
      const point = getLocalPoint(canvas, event.clientX, event.clientY)
      const radius = Math.hypot(point.x - draft.x, point.y - draft.y)
      // Clic simple → marqueur de taille par défaut (placement précis, horodaté).
      const final: AnnotationCircle = {
        ...draft,
        r: radius < 3 ? defaultRadius() : Math.max(3, radius),
      }
      circlesRef.current = [...circlesRef.current, final]
      draftRef.current = null
      setAnnotations([...circlesRef.current])
      selectCircle(final.id)
      redraw()
    },
    [defaultRadius, redraw, selectCircle],
  )

  const handlePointerCancel = useCallback(() => {
    draftRef.current = null
    dragRef.current = null
    redraw()
  }, [redraw])

  const handleDeleteSelected = useCallback(
    (id: string) => {
      circlesRef.current = circlesRef.current.filter((c) => c.id !== id)
      if (selectedIdRef.current === id) selectCircle(null)
      setAnnotations([...circlesRef.current])
      redraw()
    },
    [redraw, selectCircle],
  )

  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const video = videoRef.current
    if (!canvas || !ctx || !video) return
    if (video.readyState < 2) return
    if (circlesRef.current.length === 0) return
    // Recalibre le buffer avant d'y figer la frame (résolution × DPR).
    syncCanvasSize()
    const dpr = scaleRef.current || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Figer la frame vidéo courante dans l'image de capture.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const selected = selectedIdRef.current
    for (const circle of circlesRef.current) paintCircle(ctx, circle, circle.id === selected)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const imageDataUrl = canvas.toDataURL('image/png')
    // Restaurer le calque transparent pour poursuivre l'annotation.
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    redraw()
    const capture: CaptureRecord = {
      id: generateId(),
      timestamp: video.currentTime,
      imageDataUrl,
      circleCount: circlesRef.current.length,
    }
    setObservations((previous) => [capture, ...previous])
    // Les marqueurs restent affichés : l'observateur peut en ajuster sur la frame
    // avant une nouvelle capture, ou les effacer pour changer de frame.
  }, [redraw, syncCanvasSize])

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    const target = Number(event.target.value)
    if (circlesRef.current.length > 0 && Math.abs(target - video.currentTime) > 0.001) {
      clearDrawing()
    }
    video.currentTime = target
    setCurrentTime(target)
  }

  const handleSubmissionSuccess = useCallback(
    (count: number) => {
      setObservations([])
      clearDrawing()
      setSubmittedCount(count)
      toast.success(t.annotator.toastSuccessTitle, {
        description: t.annotator.toastSuccessDesc,
      })
    },
    [clearDrawing, t.annotator.toastSuccessDesc, t.annotator.toastSuccessTitle],
  )

  const canvasPointerProps = canAnnotate
    ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
      }
    : {}

  const selectedCircle = selectedId
    ? annotations.find((circle) => circle.id === selectedId) ?? null
    : null

  const showEndPrompt =
    projectId && ended && observations.length > 0 && !isStepperOpen && !endPromptDismissed

  // ——— Écran de fin de session (après soumission réussie) ———
  if (projectId && submittedCount !== null && !isStepperOpen) {
    return (
      <div className="rounded-2xl border border-forest-500/25 bg-white p-8 text-center shadow-sm sm:p-12 dark:border-forest-500/20 dark:bg-[#161b22]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-forest-500/15 text-forest-600 dark:text-forest-400">
          <CheckCircle aria-hidden="true" className="h-9 w-9" />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-forest-600 dark:text-forest-400">
          {t.completion.kicker}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t.completion.title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t.completion.body}
        </p>

        <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-white/10 dark:bg-white/5">
          <span className="font-mono text-3xl font-black tabular-nums text-forest-600 dark:text-forest-400">
            {submittedCount}
          </span>
          <span className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.completion.statLabel}
          </span>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/observe"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500"
          >
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            {t.completion.back}
          </Link>
          <button
            type="button"
            onClick={() => {
              setSubmittedCount(null)
              setEnded(false)
              setEndPromptDismissed(false)
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            {t.completion.again}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
      {/* ——— Colonne principale : chargement + lecteur + commandes ——— */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Sélection du fichier vidéo */}
        <label
          htmlFor="video-upload"
          className="flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm transition-colors hover:border-forest-500/40 dark:border-white/10 dark:bg-[#161b22]"
        >
          <span className="inline-flex h-9 items-center justify-center rounded-lg bg-forest-600 px-3 font-medium text-white">
            {t.annotator.chooseVideo}
          </span>
          <input
            id="video-upload"
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={handleFileChange}
          />
          {fileName ? (
            <span className="inline-flex min-w-0 items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <Film aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{fileName}</span>
            </span>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">
              {expectedVideoUrl
                ? fill(t.annotator.recommendedVideo, { name: expectedVideoUrl })
                : t.annotator.localVideoHint}
            </span>
          )}
        </label>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {errorMessage}
          </p>
        ) : null}

        {/* Scène vidéo + calque d'annotation */}
        {videoUrl ? (
          <div ref={containerRef} className="relative w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              className="block h-auto w-full"
              playsInline
              preload="metadata"
              onClick={togglePlayback}
              onLoadedMetadata={() => {
                const video = videoRef.current
                if (!video) return
                const videoDuration = video.duration
                setDuration(Number.isFinite(videoDuration) ? videoDuration : 0)
                readyRef.current = true
                playingRef.current = false
                setIsPlaying(false)
                setIsReady(true)
              }}
              onTimeUpdate={() => {
                const video = videoRef.current
                if (video) setCurrentTime(video.currentTime)
              }}
              onPlay={() => {
                playingRef.current = true
                setIsPlaying(true)
                setEnded(false)
                setEndPromptDismissed(false)
              }}
              onPause={() => {
                playingRef.current = false
                setIsPlaying(false)
              }}
              onEnded={() => {
                playingRef.current = false
                setIsPlaying(false)
                setEnded(true)
              }}
            />

            <canvas
              ref={canvasRef}
              aria-label="Annotation layer"
              className={`absolute inset-0 h-full w-full touch-none ${
                canAnnotate ? 'cursor-crosshair' : 'pointer-events-none'
              }`}
              {...canvasPointerProps}
            />

            {!isReady ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60 text-sm text-white">
                {t.annotator.loading}
              </div>
            ) : null}

            {isPlaying ? (
              <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
                <Play aria-hidden="true" className="h-3 w-3 fill-current" />
                {t.annotator.playingChip}
              </div>
            ) : null}

            {/* Palet d'édition du marqueur sélectionné */}
            {selectedCircle && canAnnotate ? (
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/30 bg-black/75 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Crosshair aria-hidden="true" className="h-4 w-4 shrink-0 text-cyan-300" />
                  <span className="truncate font-mono tabular-nums">
                    x {Math.round(selectedCircle.x)} · y {Math.round(selectedCircle.y)} · r{' '}
                    {Math.round(selectedCircle.r)}px
                  </span>
                  <span className="hidden items-center gap-1 font-mono tabular-nums text-forest-300 sm:inline-flex">
                    <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                    T+ {formatTime(selectedCircle.placedAt)}
                  </span>
                  <span className="hidden text-zinc-400 lg:inline">{t.annotator.selMoveHint}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteSelected(selectedCircle.id)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-red-500/90 px-2.5 font-medium text-white transition-colors hover:bg-red-500"
                  >
                    <Trash aria-hidden="true" className="h-3.5 w-3.5" />
                    {t.annotator.selDelete}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCircle(null)}
                    aria-label={t.annotator.selDismiss}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid h-64 w-full place-items-center rounded-xl border-2 border-dashed border-zinc-300 bg-white px-6 text-center dark:border-white/15 dark:bg-[#161b22]">
            <div>
              <Camera aria-hidden="true" className="mx-auto h-7 w-7 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {t.annotator.noVideoTitle}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.annotator.noVideoHint}</p>
            </div>
          </div>
        )}

        {/* Commandes du lecteur */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={!isReady}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-forest-600 px-4 text-sm font-medium text-white transition-colors hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPlaying ? (
                <>
                  <Pause aria-hidden="true" className="h-4 w-4" /> {t.annotator.pause}
                </>
              ) : (
                <>
                  <Play aria-hidden="true" className="h-4 w-4" /> {t.annotator.play}
                </>
              )}
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.05}
                value={currentTime}
                onChange={handleSeek}
                disabled={!isReady || duration <= 0}
                aria-label={t.annotator.seekAria}
                className="w-full accent-forest-500 disabled:opacity-40"
              />
              <div className="flex items-center justify-between font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                  T+ {formatTime(currentTime)}
                </span>
                <span>
                  {t.annotator.duration} {formatTime(duration)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={handleCapture}
              disabled={!canAnnotate || annotations.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-forest-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Camera aria-hidden="true" className="h-4 w-4" /> {t.annotator.capture}
            </button>
            <button
              type="button"
              onClick={clearDrawing}
              disabled={annotations.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              <Trash aria-hidden="true" className="h-4 w-4" />
              {annotations.length > 0
                ? fill(t.annotator.clearWithCount, { n: annotations.length })
                : t.annotator.clearCircles}
            </button>
            <p className="w-full text-xs text-zinc-500 dark:text-zinc-400 sm:w-auto sm:flex-1 sm:text-right">
              {!isReady
                ? t.annotator.hintLoad
                : isPlaying
                  ? t.annotator.hintPlaying
                  : t.annotator.hintPaused}
            </p>
          </div>
        </div>

        {/* ——— Invite de fin de vidéo ——— */}
        {showEndPrompt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Timer aria-hidden="true" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t.annotator.endTitle}
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{t.annotator.endBody}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEndPromptDismissed(true)}
                className="inline-flex h-9 items-center rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                {t.annotator.endLater}
              </button>
              <button
                type="button"
                onClick={() => setIsStepperOpen(true)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-xs font-semibold text-amber-950 shadow-sm transition-colors hover:bg-amber-400"
              >
                <Send aria-hidden="true" className="h-3.5 w-3.5" />
                {t.annotator.endSubmit}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ——— Panneau latéral : observations capturées ——— */}
      <aside
        aria-label={t.annotator.panelTitle}
        className="flex w-full shrink-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161b22] lg:w-80"
      >
        <header className="border-b border-zinc-100 px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {t.annotator.panelTitle}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {observations.length > 0
              ? fill(t.annotator.panelCount, { n: observations.length })
              : t.annotator.panelEmptyTitle}
          </p>
        </header>

        {observations.length === 0 ? (
          <div className="grid flex-1 place-items-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            <div>
              <Send aria-hidden="true" className="mx-auto h-6 w-6 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-2 max-w-[12rem] text-xs leading-relaxed">{t.annotator.panelEmptyHint}</p>
            </div>
          </div>
        ) : (
          <>
            <ol className="flex max-h-[26rem] flex-col gap-3 overflow-y-auto p-3">
              {observations.map((observation, index) => (
                <li
                  key={observation.id}
                  className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-[#0d1117]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={observation.imageDataUrl}
                    alt=""
                    className="block aspect-video w-full bg-black object-contain"
                  />
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
                      T+ {formatTime(observation.timestamp)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        #{observations.length - index} · {observation.circleCount}{' '}
                        {pluralLabel(t.annotator.unitCircle, observation.circleCount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCapture(observation.id)}
                        className="text-xs text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                        title={fill(t.annotator.deleteCaptureAria, { n: observations.length - index })}
                        aria-label={fill(t.annotator.deleteCaptureAria, {
                          n: observations.length - index,
                        })}
                      >
                        <Trash aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            {projectId && submittedCount === null ? (
              <footer className="border-t border-zinc-100 p-3 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsStepperOpen(true)}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-forest-500 to-forest-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:from-forest-600 hover:to-forest-700"
                >
                  <span>{fill(t.annotator.submit, { n: observations.length })}</span>
                  <Send aria-hidden="true" className="h-4 w-4" />
                </button>
              </footer>
            ) : null}
          </>
        )}
      </aside>

      {/* Stepper de soumission */}
      {projectId ? (
        <SubmissionStepper
          isOpen={isStepperOpen}
          onClose={() => setIsStepperOpen(false)}
          projectId={projectId}
          projectTitle={projectTitle || ''}
          captures={observations}
          locale={locale}
          t={t.stepper}
          onDeleteCapture={handleDeleteCapture}
          onSubmissionSuccess={handleSubmissionSuccess}
        />
      ) : null}
    </div>
  )
}
