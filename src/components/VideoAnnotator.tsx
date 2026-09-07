'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Cercle d'intérêt dessiné sur l'image.
 * Coordonnées exprimées en pixels CSS du calque (canvas), indépendantes du DPR.
 */
type AnnotationCircle = { x: number; y: number; r: number }

/** Observation capturée en session (local uniquement — persistance en étape ultérieure). */
type ObservationRecord = {
  id: string
  /** Horodatage vidéo en secondes au moment de la capture. */
  timestamp: number
  /** Capture PNG encodée en Base64 (data:image/png;base64,…). */
  imageDataUrl: string
  /** Nombre de cercles d'intérêt portés par la capture. */
  circleCount: number
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

function getLocalPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

function paintCircle(ctx: CanvasRenderingContext2D, circle: AnnotationCircle): void {
  ctx.beginPath()
  ctx.arc(circle.x, circle.y, Math.max(0, circle.r), 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(239, 68, 68, 0.12)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ef4444'
  ctx.stroke()
}

export default function VideoAnnotator() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const circlesRef = useRef<AnnotationCircle[]>([])
  const draftRef = useRef<AnnotationCircle | null>(null)
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
  const [observations, setObservations] = useState<ObservationRecord[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canAnnotate = isReady && !isPlaying && videoUrl !== null

  /** Redessine uniquement les annotations sur un calque transparent. */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const dpr = scaleRef.current || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    for (const circle of circlesRef.current) paintCircle(ctx, circle)
    if (draftRef.current) paintCircle(ctx, draftRef.current)
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
    setAnnotations([])
    redraw()
  }, [redraw])

  /** Réinitialise l'état pour une nouvelle vidéo. */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = '' // permet de re-sélectionner le même fichier
    if (!file.type.startsWith('video/')) {
      setErrorMessage('Le fichier sélectionné n’est pas une vidéo (MP4, WebM, MOV…).')
      return
    }
    setErrorMessage(null)
    clearDrawing()
    setObservations([])
    setFileName(file.name)
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setIsReady(false)
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
      // En quittant une frame annotée, on retire les cercles liés à cette frame.
      clearDrawing()
      void video.play().catch(() => {
        /* Lecture refusée par le navigateur : rien à faire. */
      })
    } else {
      video.pause()
    }
  }, [clearDrawing])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!readyRef.current || playingRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      event.preventDefault()
      canvas.setPointerCapture?.(event.pointerId)
      const point = getLocalPoint(canvas, event.clientX, event.clientY)
      draftRef.current = { x: point.x, y: point.y, r: 0 }
      redraw()
    },
    [redraw],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const draft = draftRef.current
      const canvas = canvasRef.current
      if (!draft || !canvas) return
      const point = getLocalPoint(canvas, event.clientX, event.clientY)
      draftRef.current = {
        x: draft.x,
        y: draft.y,
        r: Math.hypot(point.x - draft.x, point.y - draft.y),
      }
      redraw()
    },
    [redraw],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const draft = draftRef.current
      const canvas = canvasRef.current
      if (!draft || !canvas) return
      canvas.releasePointerCapture?.(event.pointerId)
      const point = getLocalPoint(canvas, event.clientX, event.clientY)
      const radius = Math.hypot(point.x - draft.x, point.y - draft.y)
      if (radius >= 3) {
        const next = [...circlesRef.current, { x: draft.x, y: draft.y, r: radius }]
        circlesRef.current = next
        setAnnotations(next)
      }
      draftRef.current = null
      redraw()
    },
    [redraw],
  )

  const handlePointerCancel = useCallback(() => {
    draftRef.current = null
    redraw()
  }, [redraw])

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
    for (const circle of circlesRef.current) paintCircle(ctx, circle)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const imageDataUrl = canvas.toDataURL('image/png')
    // Restaurer le calque transparent pour poursuivre l'annotation.
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    redraw()
    setObservations((previous) => [
      {
        id: generateId(),
        timestamp: video.currentTime,
        imageDataUrl,
        circleCount: circlesRef.current.length,
      },
      ...previous,
    ])
  }, [redraw, syncCanvasSize])

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    const target = Number(event.target.value)
    // Les cercles annotent une frame précise : si la frame change (ici, en
    // pause) on les retire pour éviter un décalage avec la nouvelle image.
    if (circlesRef.current.length > 0 && Math.abs(target - video.currentTime) > 0.001) {
      clearDrawing()
    }
    video.currentTime = target
    setCurrentTime(target)
  }

  const canvasPointerProps = canAnnotate
    ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
      }
    : {}

  return (
    <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
      {/* ——— Colonne principale : chargement + lecteur + commandes ——— */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* Sélection du fichier vidéo */}
        <label
          htmlFor="video-upload"
          className="flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm shadow-sm transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <span className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-3 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            Choisir une vidéo…
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
              <span aria-hidden="true">🎞️</span>
              <span className="truncate font-medium">{fileName}</span>
            </span>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">
              Vidéo locale — un fichier {`MP4, WebM ou MOV`} de votre ordinateur.
            </span>
          )}
        </label>

        {errorMessage ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
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
              }}
              onPause={() => {
                playingRef.current = false
                setIsPlaying(false)
              }}
              onEnded={() => {
                playingRef.current = false
                setIsPlaying(false)
              }}
            />

            <canvas
              ref={canvasRef}
              aria-label="Calque d’annotation de la vidéo"
              className={`absolute inset-0 h-full w-full touch-none ${
                canAnnotate ? 'cursor-crosshair' : 'pointer-events-none'
              }`}
              {...canvasPointerProps}
            />

            {!isReady ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60 text-sm text-white">
                Chargement de la vidéo…
              </div>
            ) : null}

            {isPlaying ? (
              <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
                ▶ Lecture — mettez la vidéo sur pause pour annoter
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid h-64 w-full place-items-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
            Aucune vidéo chargée. Sélectionnez un fichier ci-dessus pour démarrer une session
            d’observation.
          </div>
        )}

        {/* Commandes du lecteur */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={!isReady}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isPlaying ? (
                <>
                  <span aria-hidden="true">⏸</span> Pause
                </>
              ) : (
                <>
                  <span aria-hidden="true">▶</span> Lecture
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
                aria-label="Position dans la vidéo"
                className="w-full accent-red-600 disabled:opacity-40"
              />
              <div className="flex items-center justify-between font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                <span>⏱ {formatTime(currentTime)}</span>
                <span>Durée {formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleCapture}
              disabled={!canAnnotate || annotations.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span aria-hidden="true">📸</span> Capturer l’observation
            </button>
            <button
              type="button"
              onClick={clearDrawing}
              disabled={annotations.length === 0}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Effacer {annotations.length > 0 ? `(${annotations.length})` : 'les cercles'}
            </button>
            <p className="w-full text-xs text-zinc-500 dark:text-zinc-400 sm:w-auto sm:flex-1 sm:text-right">
              {!isReady
                ? 'Chargez une vidéo puis mettez-la en pause.'
                : isPlaying
                  ? 'Mettez sur pause, puis dessinez vos zones d’intérêt.'
                  : 'Cliquez-glissez sur la vidéo pour tracer un cercle rouge, puis capturez.'}
            </p>
          </div>
        </div>
      </div>

      {/* ——— Panneau latéral : observations capturées ——— */}
      <aside
        aria-label="Observations capturées"
        className="flex w-full shrink-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:w-80"
      >
        <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Observations capturées
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {observations.length > 0
              ? `${observations.length} observation${observations.length > 1 ? 's' : ''} en session`
              : 'Aucune capture pour le moment'}
          </p>
        </header>

        {observations.length === 0 ? (
          <div className="grid flex-1 place-items-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            <p>
              Chargez une vidéo, mettez-la en pause, tracez une zone d’intérêt puis capturez.
              La liste apparaîtra ici.
            </p>
          </div>
        ) : (
          <ol className="flex max-h-[30rem] flex-col gap-3 overflow-y-auto p-3">
            {observations.map((observation, index) => (
              <li
                key={observation.id}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {/* La capture contient déjà la frame + les cercles rouges. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={observation.imageDataUrl}
                  alt={`Capture de l’observation n°${observations.length - index}`}
                  className="block aspect-video w-full bg-black object-contain"
                />
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
                    T+ {formatTime(observation.timestamp)}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    #{observations.length - index} · {observation.circleCount} cercle
                    {observation.circleCount > 1 ? 's' : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  )
}
