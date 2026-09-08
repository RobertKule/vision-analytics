'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  Camera,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Crosshair,
  Edit2,
  Film,
  History,
  MapPin,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Timer,
  Trash,
  Trash2,
  X,
} from 'lucide-react'
import type { BlindVideoDto, CaptureRecord } from '@/lib/types'
import type { AnnotatorText, CompletionText, Locale, StepperText } from '@/lib/i18n'
import SubmissionStepper from '@/components/SubmissionStepper'
import { computeTypeCompletion } from '@/lib/captureCompletion'
import { deriveObservationNameFromVideo } from '@/lib/videoName'
import {
  clearStoredDraft,
  filterObservationsToPasses,
  getAnonymousObserverId,
  loadStoredDraft,
  saveStoredDraft,
  type StoredObservationDraft,
} from '@/lib/draftStore'

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
  /**
   * Passes vidéo du projet (une par onglet de l'annotateur). Une passe est soit
   * rattachée à un type (`typeLabel` non nul → type verrouillé), soit générique
   * (`typeLabel` nul → l'observateur choisit le type parmi `observationTypes`).
   * Absent → passe unique héritée reconstruite depuis `expectedVideoUrl`.
   */
  videos?: BlindVideoDto[]
  /** Types d'observation configurables du projet (choisis par l'observateur à la capture). */
  observationTypes?: string[]
  locale: Locale
  t: {
    annotator: AnnotatorText
    stepper: StepperText
    completion: CompletionText
  }
  /**
   * Identité du brouillon local : email du compte connecté (session `/experience`),
   * absent sur le parcours public anonyme (`/observe`) où l'on retombe sur l'ID
   * anonyme du navigateur.
   */
  identityLabel?: string | null
  /** Destination du bouton « Retour » de l'écran de fin (défaut : page publique `/observe`). */
  backHref?: string
}

/**
 * Passe vidéo interne à l'annotateur. `key` vaut l'identifiant de la `Video` ou la
 * chaîne vide pour la passe « générique » héritée (projet à vidéo unique).
 */
type TabPass = {
  key: string
  typeLabel: string | null
  name: string | null
  source: string | null
}

/** Clé de la passe générique héritée (vide) — captures sans `videoId` rattaché. */
const GENERIC_TAB_KEY = ''

function normalizeTypeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/** Libellé lisible d'une passe (type imposé → nom de fichier/vidéo → repli). */
function passLabel(pass: TabPass, fallback: string): string {
  if (pass.typeLabel) return pass.typeLabel
  if (pass.name) return pass.name
  if (pass.source) return deriveObservationNameFromVideo(pass.source) ?? fallback
  return fallback
}

function isRemoteSource(value: string | null | undefined): boolean {
  return Boolean(value) && /^https?:\/\//i.test(value?.trim() ?? '')
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

/** Date et heure courtes (locale) d'une sauvegarde de brouillon. */
function formatSavedAt(iso: string, locale: Locale): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const BASE_COLOR = '#10b981'
const SELECT_COLOR = '#22d3ee'

/** Clés d'étiquette de zone (3×3) indexées en ordre « ligne majeure » (haut → bas). */
const ZONE_KEYS = [
  'topLeft',
  'topCenter',
  'topRight',
  'middleLeft',
  'center',
  'middleRight',
  'bottomLeft',
  'bottomCenter',
  'bottomRight',
] as const

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
  videos,
  observationTypes,
  locale,
  t,
  backHref,
  identityLabel,
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
  const controlsTimerRef = useRef<number | null>(null)

  /**
   * Passes vidéo du projet, dans l'ordre des onglets. Une passe porte soit un type
   * verrouillé (`typeLabel`), soit une source à charger (URL distante streamée par
   * référence, ou nom de fichier que l'observateur charge localement). Un projet
   * hérité à vidéo unique est représenté par une passe générique unique.
   */
  const passes: TabPass[] = useMemo(() => {
    const provided = videos && videos.length > 0 ? videos : null
    if (provided) {
      return provided.map((video) => ({
        key: video.id || GENERIC_TAB_KEY,
        typeLabel: (video.typeLabel ?? '').trim() || null,
        name: (video.name ?? '').trim() || null,
        source: (video.source ?? '').trim() || null,
      }))
    }
    const legacySource = expectedVideoUrl?.trim()
    return [
      {
        key: GENERIC_TAB_KEY,
        typeLabel: null,
        name: legacySource ? deriveObservationNameFromVideo(legacySource) : null,
        source: legacySource || null,
      },
    ]
  }, [videos, expectedVideoUrl])

  /** Onglet actif (par défaut : la première passe). */
  const [activeKey, setActiveKey] = useState<string>(() => passes[0]?.key ?? GENERIC_TAB_KEY)
  const activePass: TabPass | null = passes.find((pass) => pass.key === activeKey) ?? passes[0] ?? null
  /** Type verrouillé par l'association vidéo → type de l'onglet actif (null = passe générique). */
  const lockedType = activePass?.typeLabel ?? null

  /**
   * Sources effectivement chargées par onglet (fichier local ou URL collée), pour
   * restaurer la lecture quand on revient sur un onglet — jamais supprimées au
   * changement d'onglet. Les URLs `blob:` ne sont révoquées qu'au remplacement ou
   * au démontage, pas à la bascule.
   */
  const tabLoadsRef = useRef<Record<string, { url: string; label: string | null }>>({})

  /** Types d'observation configurables du projet (liste propre, sans vide). */
  const typeOptions = useMemo(
    () => (observationTypes ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
    [observationTypes],
  )
  /** Vrai quand le projet impose un type à chaque capture. */
  const typeRequired = typeOptions.length > 0
  /** Type choisi pour la capture à venir (passe générique uniquement). */
  const [nextObservationType, setNextObservationType] = useState<string>('')
  /** Vrai quand la capture à venir peut partir (un type est résolu). */
  const captureTypeReady = lockedType !== null || !typeRequired || Boolean(nextObservationType.trim())

  /**
   * Source initiale : au montage, une première passe distante démarre sa lecture
   * (comportement hérité de la vidéo unique) ; une passe sans source attend un
   * fichier local. Les bascules suivantes passent par `applyPass` (jamais un effet).
   */
  const [videoUrl, setVideoUrl] = useState<string | null>(() => {
    const first = passes[0]
    if (!first) return null
    return isRemoteSource(first.source) ? first.source : null
  })
  const [fileName, setFileName] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [annotations, setAnnotations] = useState<AnnotationCircle[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [observations, setObservations] = useState<CaptureRecord[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /**
   * Types « couvrables » de la session = configuration du projet restreinte à ce
   * que les onglets permettent réellement de produire :
   *  — une passe générique (sans type verrouillé) permet de capturer n'importe quel
   *    type configuré ;
   *  — sans passe générique, seuls les types verrouillés par une passe sont exigibles.
   * Le protocole ne doit jamais bloquer une soumission sur un type qu'aucun onglet
   * ne peut produire.
   */
  const requiredCoverableTypes = useMemo(() => {
    if (typeOptions.length === 0) return typeOptions
    let hasGenericPass = false
    const lockedKeys = new Set<string>()
    for (const pass of passes) {
      if (pass.typeLabel) lockedKeys.add(normalizeTypeKey(pass.typeLabel))
      else hasGenericPass = true
    }
    if (hasGenericPass) return typeOptions
    return typeOptions.filter((option) => lockedKeys.has(normalizeTypeKey(option)))
  }, [passes, typeOptions])

  /** Couverture réelle de la session, agrégée sur TOUS les onglets (rien n'est supprimé à la bascule). */
  const completion = useMemo(
    () => computeTypeCompletion(requiredCoverableTypes, observations),
    [requiredCoverableTypes, observations],
  )
  /** Vrai quand le projet exige au moins un type. */
  const hasRequiredTypes = completion.totalRequired > 0
  /** CTA « Soumettre toutes les observations » dès que les types requis sont tous couverts. */
  const showSendAllLabel = hasRequiredTypes && completion.allRequiredCovered

  /** Captures de l'onglet courant (le carrousel n'affiche que la passe active). */
  const tabObservations = useMemo(
    () =>
      activeKey === GENERIC_TAB_KEY
        ? observations.filter((capture) => !capture.videoId)
        : observations.filter((capture) => capture.videoId === activeKey),
    [activeKey, observations],
  )
  const [manualUrl, setManualUrl] = useState('')
  const [isStepperOpen, setIsStepperOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [ended, setEnded] = useState(false)
  const [endPromptDismissed, setEndPromptDismissed] = useState(false)
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  /** Commandes plein écran : visibles quand on bouge la souris, masquées en lecture. */
  const [controlsVisible, setControlsVisible] = useState(true)
  /** Capture active du carrousel (null → dernière ajoutée, la plus récente). */
  const [activeId, setActiveId] = useState<string | null>(null)

  /** Suit l'état du plein écran natif (bouton ou touche Échap) du lecteur. */
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(
        Boolean(containerRef.current && document.fullscreenElement === containerRef.current),
      )
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [containerRef])

  const toggleFullscreen = () => {
    const scene = containerRef.current
    if (!scene) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else if (typeof scene.requestFullscreen === 'function') {
      setControlsVisible(true)
      void scene.requestFullscreen()
    }
  }

  /** Ré-affiche les commandes plein écran et reprogramme leur masquage. */
  const pokeControls = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = window.setTimeout(() => {
      if (playingRef.current) setControlsVisible(false)
    }, 2500)
  }, [])

  // Masquage initial après quelques secondes de lecture plein écran (exécuté via le
  // callback du minuteur, jamais synchroniquement dans le corps de l'effet).
  useEffect(() => {
    if (!isFullscreen) return
    const id = window.setTimeout(() => {
      if (playingRef.current) setControlsVisible(false)
    }, 3200)
    return () => window.clearTimeout(id)
  }, [isFullscreen])

  // Nettoie le minuteur de masquage au démontage.
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current)
    }
  }, [])

  // Révoque toutes les URLs `blob:` des onglets au démontage (jamais à la bascule :
  // revenir sur un onglet doit restaurer la lecture de son fichier local).
  useEffect(() => {
    const loads = tabLoadsRef.current
    return () => {
      for (const key of Object.keys(loads)) {
        const url = loads[key]?.url
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
    }
  }, [])

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

  /**
   * Charge une passe : coupe la lecture précédente, réinitialise l'état transitoire
   * du lecteur (jamais les observations déjà enregistrées des autres onglets) puis
   * choisit la source — URL distante (streamée par référence), fichier local déjà
   * chargé pour cet onglet, ou attente d'un fichier. Appelé au montage et à chaque
   * bascule d'onglet (déclenché par `applyPass` référencé depuis l'effet ci-dessous,
   * afin que les réinitialisations ne soient jamais des setState synchrones).
   */
  const applyPass = useCallback(
    (key: string) => {
      const pass = passes.find((item) => item.key === key)
      if (!pass) return
      const video = videoRef.current
      if (video && !video.paused) video.pause()
      clearDrawing()
      setErrorMessage(null)
      setActiveId(null)
      setEnded(false)
      setEndPromptDismissed(false)
      setDuration(0)
      setCurrentTime(0)
      setIsPlaying(false)
      setIsReady(false)
      setControlsVisible(true)
      readyRef.current = false
      playingRef.current = false

      const saved = tabLoadsRef.current[pass.key]
      if (saved) {
        setVideoUrl(saved.url)
        setFileName(saved.label)
      } else if (isRemoteSource(pass.source)) {
        setVideoUrl(pass.source)
        setFileName(null)
      } else {
        setVideoUrl(null)
        setFileName(null)
      }
    },
    [clearDrawing, passes],
  )

  /**
   * Bascule d'onglet : applique la passe cible (remise à zéro transitoire du
   * lecteur, jamais des observations enregistrées) puis l'active. Déclenché par les
   * seuls chemins qui changent `activeKey` — clic sur un onglet ou « type suivant » —
   * pour ne jamais réinitialiser l'état dans un effet.
   */
  const selectPass = useCallback(
    (key: string) => {
      if (key === activeKey) return
      applyPass(key)
      setActiveKey(key)
    },
    [activeKey, applyPass],
  )

  const handleDeleteCapture = useCallback((captureId: string) => {
    setObservations((prev) => prev.filter((item) => item.id !== captureId))
    // La capture active disparaît : on revient à la dernière restante.
    setActiveId((current) => (current === captureId ? null : current))
  }, [])

  /** Requalifie une capture existante (correctif avant soumission). */
  const setCaptureType = useCallback((captureId: string, value: string) => {
    setObservations((prev) =>
      prev.map((capture) =>
        capture.id === captureId
          ? { ...capture, observationType: value.trim() || null }
          : capture,
      ),
    )
  }, [])

  /**
   * « Modifier » une observation : repositionne le lecteur sur l'horodatage de la
   * capture pour la re-annoter sur place. La capture précédente est retirée — on
   * en enregistre une corrigée sur la même frame.
   */
  const handleEditCapture = (captureId: string) => {
    const capture = observations.find((item) => item.id === captureId)
    if (!capture) return
    setObservations((prev) => prev.filter((item) => item.id !== captureId))
    setActiveId(null)
    clearDrawing()
    const video = videoRef.current
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = capture.timestamp
      setCurrentTime(capture.timestamp)
    }
  }

  /** Ouvre la boîte de confirmation de soumission (Confirmer / Suivre / Annuler). */
  const openSubmitConfirm = () => {
    if (observations.length === 0) return
    if (typeRequired && observations.some((capture) => !capture.observationType)) {
      setErrorMessage(t.annotator.obsTypeMissing)
      return
    }
    if (!isOnline) {
      setErrorMessage(t.annotator.offlineSubmitBlocked)
      return
    }
    setEndPromptDismissed(true)
    setIsConfirmOpen(true)
  }

  /** Charge un fichier local pour l'onglet actif et réinitialise la session de CETTE passe. */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = '' // permet de re-sélectionner le même fichier
    if (!file.type.startsWith('video/')) {
      setErrorMessage(t.annotator.fileTypeError)
      return
    }
    // On ne réinitialise que la session de l'onglet actif : les observations déjà
    // enregistrées pour les AUTRES passes ne sont jamais supprimées.
    setObservations((prev) =>
      activeKey === GENERIC_TAB_KEY
        ? prev.filter((capture) => Boolean(capture.videoId))
        : prev.filter((capture) => capture.videoId !== activeKey),
    )
    setErrorMessage(null)
    clearDrawing()
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
    const previous = tabLoadsRef.current[activeKey]
    if (previous && previous.url.startsWith('blob:')) URL.revokeObjectURL(previous.url)
    const url = URL.createObjectURL(file)
    tabLoadsRef.current[activeKey] = { url, label: file.name }
    setVideoUrl(url)
  }

  /**
   * Fallback « charger une URL » : permet d'observer quand le projet n'a pas de
   * vidéo pré-configurée (l'analyste n'a fourni aucune URL) ou depuis le lecteur
   * de démonstration. La vidéo est lue par référence, jamais stockée.
   */
  const handleLoadUrl = () => {
    const raw = manualUrl.trim()
    if (!raw) return
    const url = raw
    const isHttp = /^https?:\/\//i.test(raw)
    const isObject = /^(blob:|data:)/.test(raw)
    if (!isHttp && !isObject) {
      setErrorMessage(t.annotator.urlInvalid)
      return
    }
    if (isObject && !url.startsWith('blob:')) {
      // data: URLs ne sont pas diffusables en stream fiable.
      setErrorMessage(t.annotator.urlInvalid)
      return
    }
    setErrorMessage(null)
    clearDrawing()
    // Repli « charger une URL » : ne réinitialise que la passe active.
    setObservations((prev) =>
      activeKey === GENERIC_TAB_KEY
        ? prev.filter((capture) => Boolean(capture.videoId))
        : prev.filter((capture) => capture.videoId !== activeKey),
    )
    setSubmittedCount(null)
    setFileName(null)
    setDuration(0)
    setCurrentTime(0)
    setIsPlaying(false)
    setIsReady(false)
    setEnded(false)
    setEndPromptDismissed(false)
    readyRef.current = false
    playingRef.current = false
    const previous = tabLoadsRef.current[activeKey]
    if (previous && previous.url.startsWith('blob:')) URL.revokeObjectURL(previous.url)
    tabLoadsRef.current[activeKey] = { url, label: null }
    setVideoUrl(url)
  }

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
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    } catch {
      setErrorMessage(t.annotator.remoteTaintError)
      return
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const selected = selectedIdRef.current
    for (const circle of circlesRef.current) paintCircle(ctx, circle, circle.id === selected)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    let imageDataUrl: string
    try {
      imageDataUrl = canvas.toDataURL('image/png')
    } catch {
      setErrorMessage(t.annotator.remoteTaintError)
      return
    }
    // Restaurer le calque transparent pour poursuivre l'annotation.
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    redraw()
    // Centre des cercles normalisé (0–1) : étiquette de zone du carrousel uniquement.
    const cssWidth = canvas.width / dpr
    const cssHeight = canvas.height / dpr
    const n = circlesRef.current.length
    const focus = circlesRef.current.reduce(
      (sum, circle) => ({ x: sum.x + circle.x / cssWidth, y: sum.y + circle.y / cssHeight }),
      { x: 0, y: 0 },
    )
    const centroid =
      n > 0 && cssWidth > 0 && cssHeight > 0
        ? {
            x: Math.min(1, Math.max(0, focus.x / n)),
            y: Math.min(1, Math.max(0, focus.y / n)),
          }
        : undefined
    const capture: CaptureRecord = {
      id: generateId(),
      timestamp: video.currentTime,
      imageDataUrl,
      circleCount: n,
      // Type verrouillé par l'onglet (association vidéo → type), sinon type choisi
      // par l'observateur (null si le projet n'impose rien).
      observationType: lockedType ?? (typeRequired ? nextObservationType.trim() : null),
      // Passe vidéo d'origine de la capture ; null = passe générique héritée.
      videoId: activeKey === GENERIC_TAB_KEY ? null : activeKey,
      centroid,
    }
    setObservations((previous) => [capture, ...previous])
    // Les marqueurs restent affichés : l'observateur peut en ajuster sur la frame
    // avant une nouvelle capture, ou les effacer pour changer de frame.
  }, [
    activeKey,
    lockedType,
    nextObservationType,
    redraw,
    syncCanvasSize,
    t.annotator.remoteTaintError,
    typeRequired,
  ])

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

  /**
   * Onglet capable de produire un type : passe verrouillée sur ce type, sinon une
   * passe générique (sélecteur libre), sinon la première passe (repli).
   */
  const typeToPassKey = useCallback(
    (type: string): string | null => {
      const wanted = normalizeTypeKey(type)
      const typed = passes.find(
        (pass) => pass.typeLabel && normalizeTypeKey(pass.typeLabel) === wanted,
      )
      if (typed) return typed.key
      const generic = passes.find((pass) => !pass.typeLabel)
      if (generic) return generic.key
      return passes[0]?.key ?? null
    },
    [passes],
  )

  /** Type requis encore en attente vers lequel avancer (null si tout est couvert). */
  const nextPendingType = completion.pendingTypes[0] ?? null

  /**
   * « Passer au type suivant » (stepper ou bandeau de couverture) : referme les
   * modales, bascule sur l'onglet capable de produire le type manquant et prépare
   * le sélecteur pour une passe générique. Le lecteur observateur ne reçoit jamais
   * de fenêtre cible (protocole en aveugle) : on ne peut donc pas « aller à » une trame.
   */
  const handleContinueToType = useCallback(
    (type: string) => {
      const nextKey = typeToPassKey(type)
      if (nextKey !== null && nextKey !== activeKey) selectPass(nextKey)
      // Une passe générique s'appuie sur le sélecteur : on pré-sélectionne le type.
      setNextObservationType(type)
      setEndPromptDismissed(true)
      setErrorMessage(null)
      setIsConfirmOpen(false)
      setIsStepperOpen(false)
    },
    [activeKey, selectPass, typeToPassKey],
  )

  /** « Lecture à cet instant » depuis une capture du carrousel. */
  const handlePlayCapture = useCallback(
    (capture: CaptureRecord) => {
      const video = videoRef.current
      if (!video || !Number.isFinite(video.duration)) return
      video.currentTime = capture.timestamp
      setCurrentTime(capture.timestamp)
      clearDrawing()
      void video.play().catch(() => {
        /* Lecture refusée par le navigateur : rien à faire. */
      })
    },
    [clearDrawing],
  )

  /**
   * Capture « instantanée » : point d'entrée commun aux boutons et aux raccourcis
   * clavier. Quand le projet impose un type, on refuse tant qu'aucun n'est choisi
   * (message localisé affiché par l'appelant).
   */
  const triggerCapture = useCallback(() => {
    if (!canAnnotate || annotations.length === 0) return
    if (!captureTypeReady) {
      setErrorMessage(t.annotator.obsTypeMissing)
      return
    }
    handleCapture()
  }, [
    annotations.length,
    canAnnotate,
    captureTypeReady,
    handleCapture,
    t.annotator.obsTypeMissing,
  ])

  /**
   * Raccourcis clavier (lecture / pause + capture) actifs dès qu'une vidéo est
   * chargée. Espace : lecture / pause sans faire défiler la page ; C ou Entrée :
   * capture immédiate. On ne les intercepte jamais quand l'utilisateur saisit du
   * texte ou qu'un contrôle (bouton, lien) a le focus.
   */
  useEffect(() => {
    if (!videoUrl) return
    if (isStepperOpen || isConfirmOpen || submittedCount !== null) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      const onInteractiveControl = Boolean(target.closest('button, a'))
      if (event.code === 'Space') {
        // Un bouton focalisé conserve son comportement natif (Espace = activer).
        if (onInteractiveControl) return
        event.preventDefault()
        togglePlayback()
        return
      }
      if (event.code === 'KeyC' || event.code === 'Enter') {
        if (onInteractiveControl) return
        if (event.ctrlKey || event.metaKey || event.altKey) return
        event.preventDefault()
        triggerCapture()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    isConfirmOpen,
    isStepperOpen,
    submittedCount,
    togglePlayback,
    triggerCapture,
    videoUrl,
  ])

  // ——— Carrousel : ordre chronologique (ancienne → récente) de l'ONGLET actif ———
  const display = useMemo(() => [...tabObservations].reverse(), [tabObservations])

  const activeIndex = useMemo(() => {
    if (display.length === 0) return -1
    if (activeId) {
      const index = display.findIndex((item) => item.id === activeId)
      if (index !== -1) return index
    }
    return display.length - 1
  }, [activeId, display])

  const activeCapture = activeIndex >= 0 ? display[activeIndex] : null

  const stepCapture = useCallback(
    (direction: 1 | -1) => {
      setActiveId((current) => {
        if (display.length === 0) return null
        const from = current ? display.findIndex((item) => item.id === current) : -1
        const base = from === -1 ? display.length - 1 : from
        const target = Math.min(display.length - 1, Math.max(0, base + direction))
        if (target === base) return current
        return display[target]?.id ?? null
      })
    },
    [display],
  )

  /** Libellé de zone (3×3) depuis le centroid normalisé d'une capture. */
  const zoneLabel = (centroid: { x: number; y: number }): string => {
    const col = centroid.x < 1 / 3 ? 0 : centroid.x > 2 / 3 ? 2 : 1
    const row = centroid.y < 1 / 3 ? 0 : centroid.y > 2 / 3 ? 2 : 1
    return t.annotator.zones[ZONE_KEYS[row * 3 + col]]
  }

  // ——— Brouillon local de session (reprise) & état de connexion ———
  // Le brouillon est écrit pour (utilisateur connecté sinon ID anonyme du navigateur)
  // sur ce projet. Il n'est jamais purgé avant une soumission confirmée ou un abandon
  // explicite ; le serveur déduplique par `clientKey` si une reprise ré-envoyait une
  // capture déjà persistée. Jamais de mot de passe, jeton ni fenêtre de validation ici.
  const draftOwnerRef = useRef<string>('')
  const pendingSnapshotRef = useRef<StoredObservationDraft | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const [resumeDraft, setResumeDraft] = useState<StoredObservationDraft | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const [isOnline, setIsOnline] = useState(true)

  /**
   * Au montage, charge le brouillon de la session (identité + projet) pour proposer
   * une reprise. Le décompte démarre seulement quand ce chargement a abouti
   * (`draftReady`), afin qu'une sauvegarde ne puisse jamais écraser un brouillon
   * encore non proposé à la reprise.
   */
  useEffect(() => {
    if (!projectId) return
    const owner = (identityLabel ?? '').trim() || getAnonymousObserverId()
    draftOwnerRef.current = owner
    let cancelled = false
    void loadStoredDraft(owner, projectId)
      .then((draft) => {
        if (cancelled) return
        if (draft && draft.observations.length > 0) setResumeDraft(draft)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn('Impossible de lire le brouillon local de session.', error)
        }
      })
      .finally(() => {
        if (!cancelled) setDraftReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [identityLabel, projectId])

  /** Écrit immédiatement la dernière copie en attente (bascule hors ligne, soumission…). */
  const flushPendingSnapshot = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const snapshot = pendingSnapshotRef.current
    pendingSnapshotRef.current = null
    if (!snapshot) return
    void saveStoredDraft(snapshot).catch((error: unknown) => {
      console.warn('Impossible de sauvegarder le brouillon local de session.', error)
    })
  }, [])

  /** Supprime définitivement le brouillon de la session courante (identité, projet). */
  const clearPersistedDraft = useCallback(() => {
    const owner = draftOwnerRef.current
    if (!projectId || !owner) return
    void clearStoredDraft(owner, projectId).catch((error: unknown) => {
      console.warn('Impossible de supprimer le brouillon local de session.', error)
    })
  }, [projectId])

  /**
   * Sauvegarde automatique (débounce ~600 ms) : chaque changement de captures ou
   * d'onglet actif remplace la copie en attente ; un seul minuteur écrit la plus
   * récente. Suspendue tant qu'un brouillon attend une décision (reprendre/ignorer)
   * et après une soumission confirmée (le brouillon est alors purgé).
   */
  useEffect(() => {
    if (!projectId) return
    const owner = draftOwnerRef.current
    if (!owner || !draftReady || resumeDraft || submittedCount !== null) return
    if (observations.length === 0) return
    pendingSnapshotRef.current = {
      version: 1,
      projectId,
      owner,
      savedAt: new Date().toISOString(),
      activeTab: activeKey,
      observations,
    }
    if (saveTimerRef.current !== null) return
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const snapshot = pendingSnapshotRef.current
      pendingSnapshotRef.current = null
      if (!snapshot) return
      void saveStoredDraft(snapshot).catch((error: unknown) => {
        console.warn('Impossible de sauvegarder le brouillon local de session.', error)
      })
    }, 600)
  }, [activeKey, draftReady, observations, projectId, resumeDraft, submittedCount])

  /** Au démontage, écrit la dernière copie en attente (navigation, fermeture…). */
  useEffect(() => {
    return () => {
      flushPendingSnapshot()
    }
  }, [flushPendingSnapshot])

  /** Écoute les bascules de connexion : hors ligne, le brouillon reste écrit en local. */
  useEffect(() => {
    const sync = () => {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true
      setIsOnline(online)
      if (!online) flushPendingSnapshot()
    }
    const id = window.setTimeout(sync, 0)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [flushPendingSnapshot])

  /**
   * Reprend une session sauvegardée : seules les captures des passes encore présentes
   * sont restaurées (un projet peut avoir évolué entre deux visites), puis l'onglet
   * sauvegardé est ré-activé s'il existe toujours.
   */
  const handleResumeDraft = () => {
    const draft = resumeDraft
    if (!draft) return
    const availableKeys = passes.map((pass) => pass.key)
    const restored = filterObservationsToPasses(draft.observations, availableKeys)
    setObservations(restored)
    setActiveId(null)
    setResumeDraft(null)
    if (draft.activeTab && draft.activeTab !== activeKey) {
      const stillAvailable = new Set(availableKeys)
      if (stillAvailable.has(draft.activeTab)) selectPass(draft.activeTab)
    }
  }

  /** Abandon explicite du brouillon : suppression définitive, session vierge. */
  const handleDiscardDraft = () => {
    setResumeDraft(null)
    clearPersistedDraft()
  }

  const handleSubmissionSuccess = useCallback(
    (count: number) => {
      // Toute la session a été confirmée : plus aucun brouillon à reprendre.
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      pendingSnapshotRef.current = null
      setObservations([])
      clearDrawing()
      setSubmittedCount(count)
      clearPersistedDraft()
      toast.success(t.annotator.toastSuccessTitle, {
        description: t.annotator.toastSuccessDesc,
      })
    },
    [
      clearDrawing,
      clearPersistedDraft,
      t.annotator.toastSuccessDesc,
      t.annotator.toastSuccessTitle,
    ],
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
      <div className="rounded-2xl border border-gold-500/30 bg-white p-8 text-center shadow-sm sm:p-12 dark:border-gold-400/20 dark:bg-[#161b22]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-300">
          <CheckCircle aria-hidden="true" className="h-9 w-9" />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-gold-700 dark:text-gold-300">
          {t.completion.kicker}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t.completion.title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t.completion.body}
        </p>

        <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-white/10 dark:bg-white/5">
          <span className="font-mono text-3xl font-black tabular-nums text-gold-700 dark:text-gold-300">
            {submittedCount}
          </span>
          <span className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.completion.statLabel}
          </span>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={backHref ?? '/observe'}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
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
    <div className="flex w-full flex-col gap-4">
      {/* ——— Hors ligne : tout reste enregistré sur l'appareil ——— */}
      {!isOnline ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-clay-200 bg-clay-50 px-3.5 py-2.5 text-xs leading-relaxed text-clay-700 dark:border-clay-800/60 dark:bg-clay-900/30 dark:text-clay-300"
        >
          <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.annotator.offlineWarning}</span>
        </div>
      ) : null}

      {/* ——— Reprise : une session non soumise est encore là ——— */}
      {resumeDraft ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-3"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-300">
              <History aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t.annotator.draftResumeTitle}
              </p>
              <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {fill(t.annotator.draftResumeBody, {
                  n: resumeDraft.observations.length,
                  saved: formatSavedAt(resumeDraft.savedAt, locale),
                })}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              {t.annotator.draftDiscardAction}
            </button>
            <button
              type="button"
              onClick={handleResumeDraft}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              {t.annotator.draftResumeAction}
            </button>
          </div>
        </div>
      ) : null}

      {/* Confirmation discrète que la session est auto-sauvegardée sur l'appareil. */}
      {projectId && draftReady && resumeDraft === null && submittedCount === null && observations.length > 0 ? (
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          <CheckCircle aria-hidden="true" className="h-3 w-3 text-gold-600 dark:text-gold-400" />
          {t.annotator.draftStatus}
        </p>
      ) : null}

      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start">
      {/* ——— Colonne principale : chargement + lecteur + commandes ——— */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* ——— Onglets des passes vidéo + couverture des types requis ——— */}
        {passes.length > 1 ? (
          <section aria-label={t.annotator.tabBarAria} className="flex flex-col gap-2">
            <div
              role="tablist"
              aria-label={t.annotator.tabBarAria}
              className="flex flex-wrap items-stretch gap-2"
            >
              {passes.map((pass) => {
                const isActiveTab = pass.key === activeKey
                const passCount = observations.filter(
                  (observation) =>
                    (observation.videoId ?? null) ===
                    (pass.key === GENERIC_TAB_KEY ? null : pass.key),
                ).length
                const mainLabel = passLabel(pass, t.annotator.passNameFallback)
                const subLabel = pass.typeLabel ? pass.name : null
                return (
                  <button
                    key={pass.key}
                    type="button"
                    role="tab"
                    aria-selected={isActiveTab}
                    aria-label={mainLabel}
                    onClick={() => selectPass(pass.key)}
                    className={`flex min-w-0 flex-1 basis-56 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-all sm:flex-none ${
                      isActiveTab
                        ? 'border-gold-500 bg-gold-500/10 shadow-sm ring-1 ring-gold-500/30'
                        : 'border-line bg-white hover:border-gold-500/50 dark:border-white/10 dark:bg-[#161b22] dark:hover:border-gold-500/30'
                    }`}
                  >
                    <span
                      className={`flex min-w-0 w-full items-center justify-between gap-2 text-sm font-semibold ${
                        isActiveTab
                          ? 'text-gold-800 dark:text-gold-200'
                          : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      <span className="min-w-0 truncate">{mainLabel}</span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                          passCount > 0
                            ? 'bg-gold-500/20 text-gold-800 dark:text-gold-200'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
                        }`}
                        title={fill(t.annotator.tabCountLabel, { n: passCount })}
                      >
                        {passCount > 0 ? (
                          <CheckCircle aria-hidden="true" className="h-3 w-3" />
                        ) : null}
                        {passCount}
                      </span>
                    </span>
                    {subLabel ? (
                      <span className="w-full truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {subLabel}
                      </span>
                    ) : pass.typeLabel ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">
                        {t.annotator.lockedTypeTag}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {projectId && observations.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
                {hasRequiredTypes ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    <CheckCircle
                      aria-hidden="true"
                      className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400"
                    />
                    {completion.allRequiredCovered
                      ? t.annotator.typesAllCovered
                      : fill(t.annotator.typesProgress, {
                          done: completion.completedCount,
                          total: completion.totalRequired,
                        })}
                  </span>
                ) : null}
                {hasRequiredTypes && !completion.allRequiredCovered && nextPendingType ? (
                  <button
                    type="button"
                    onClick={() => handleContinueToType(nextPendingType)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gold-600/30 bg-gold-500/10 px-3 text-xs font-semibold text-gold-800 transition-colors hover:bg-gold-500/20 dark:border-gold-400/20 dark:text-gold-200"
                  >
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    {fill(t.annotator.nextTypeButton, { type: nextPendingType })}
                  </button>
                ) : null}
                <span className="min-w-2 flex-1" />
                <button
                  type="button"
                  onClick={openSubmitConfirm}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                  <span>
                    {showSendAllLabel
                      ? fill(t.annotator.sendAllObservations, { n: observations.length })
                      : `${t.annotator.sendObservations} (${observations.length})`}
                  </span>
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Sélection du fichier vidéo */}
        <label
          htmlFor="video-upload"
          className="flex cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm transition-colors hover:border-gold-500/50 dark:border-white/10 dark:bg-[#161b22]"
        >
          <span className="inline-flex h-9 items-center justify-center rounded-lg bg-ink px-3 font-medium text-milk dark:bg-milk dark:text-ink">
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
              {activePass && isRemoteSource(activePass.source) ? (
                <span className="inline-flex items-center gap-1.5">
                  <Film
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-gold-700 dark:text-gold-400"
                  />
                  {t.annotator.remoteStreamingTag}
                </span>
              ) : activePass?.source ? (
                fill(t.annotator.recommendedVideo, { name: activePass.source })
              ) : (
                t.annotator.localVideoHint
              )}
            </span>
          )}
        </label>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-sm text-clay-700 dark:border-clay-800 dark:bg-clay-900/40 dark:text-clay-300"
          >
            {errorMessage}
          </p>
        ) : null}

        {/* Scène vidéo + calque d'annotation */}
        {videoUrl ? (
          <div
            ref={containerRef}
            {...(isFullscreen
              ? { onPointerMove: pokeControls, onTouchStart: pokeControls }
              : {})}
            className={
              isFullscreen
                ? 'relative flex h-full w-full items-center justify-center overflow-hidden bg-black'
                : 'relative w-full overflow-hidden rounded-xl bg-black'
            }
          >
            <video
              key={activeKey}
              ref={videoRef}
              src={videoUrl}
              className={
                isFullscreen
                  ? 'block max-h-full w-full object-contain'
                  : 'block h-auto w-full object-contain'
              }
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
                setControlsVisible(true)
              }}
              onEnded={() => {
                playingRef.current = false
                setIsPlaying(false)
                setEnded(true)
                setControlsVisible(true)
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
              <div
                className={`absolute left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-400/40 bg-black/75 px-3 py-2 text-xs text-white shadow-lg backdrop-blur ${
                  isFullscreen ? 'top-3' : 'bottom-3'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Crosshair aria-hidden="true" className="h-4 w-4 shrink-0 text-gold-300" />
                  <span className="truncate font-mono tabular-nums">
                    x {Math.round(selectedCircle.x)} · y {Math.round(selectedCircle.y)} · r{' '}
                    {Math.round(selectedCircle.r)}px
                  </span>
                  <span className="hidden items-center gap-1 font-mono tabular-nums text-gold-300 sm:inline-flex">
                    <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                    T+ {formatTime(selectedCircle.placedAt)}
                  </span>
                  <span className="hidden text-zinc-400 lg:inline">{t.annotator.selMoveHint}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDeleteSelected(selectedCircle.id)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-clay-600 px-2.5 font-medium text-white transition-colors hover:bg-clay-500"
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

            {/* ——— Surimpression plein écran : transport + capture toujours utilisables ——— */}
            {isFullscreen ? (
              <div
                onPointerMove={pokeControls}
                onTouchStart={pokeControls}
                className={`absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-12 transition-opacity duration-300 ${
                  controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <div className="rounded-xl border border-white/10 bg-black/75 p-3 shadow-2xl backdrop-blur">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePlayback}
                      disabled={!isReady}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white/15 px-4 text-sm font-medium text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
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
                        className="w-full accent-gold-400 disabled:opacity-40"
                      />
                      <div className="flex items-center justify-between font-mono text-xs tabular-nums text-white/75">
                        <span className="inline-flex items-center gap-1">
                          <Timer aria-hidden="true" className="h-3.5 w-3.5" />
                          T+ {formatTime(currentTime)}
                        </span>
                        <span>
                          {t.annotator.duration} {formatTime(duration)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={toggleFullscreen}
                      disabled={!isReady}
                      aria-label={t.annotator.fullscreenExit}
                      title={t.annotator.fullscreenExit}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minimize2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                    {lockedType ? (
                      <span
                        title={t.annotator.lockedTypeTag}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold-400/50 bg-white/10 px-2.5"
                      >
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gold-300">
                          {t.annotator.obsTypeLabel}
                        </span>
                        <span className="min-w-0 text-xs font-bold text-white">{lockedType}</span>
                      </span>
                    ) : typeRequired ? (
                      <label
                        title={t.annotator.obsTypeLabel}
                        className={`inline-flex h-9 items-center gap-2 rounded-lg border bg-white/10 px-2.5 ${
                          nextObservationType.trim()
                            ? 'border-gold-400/50'
                            : 'border-gold-400/80'
                        }`}
                      >
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gold-300">
                          {t.annotator.obsTypeLabel}
                          {!nextObservationType.trim() ? ' *' : ''}
                        </span>
                        <select
                          value={nextObservationType}
                          onChange={(event) => setNextObservationType(event.target.value)}
                          aria-label={t.annotator.obsTypeLabel}
                          className="min-w-0 max-w-[10rem] rounded-md bg-transparent text-xs font-semibold text-white outline-none [&>option]:bg-zinc-900 [&>option]:text-white"
                        >
                          <option value="">{t.annotator.obsTypePlaceholder}</option>
                          {typeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <button
                      type="button"
                      onClick={triggerCapture}
                      disabled={!canAnnotate || annotations.length === 0}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 text-sm font-semibold text-black transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Camera aria-hidden="true" className="h-4 w-4" /> {t.annotator.capture}
                    </button>
                    <button
                      type="button"
                      onClick={clearDrawing}
                      disabled={annotations.length === 0}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash aria-hidden="true" className="h-4 w-4" />
                      {annotations.length > 0
                        ? fill(t.annotator.clearWithCount, { n: annotations.length })
                        : t.annotator.clearCircles}
                    </button>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                      <Camera aria-hidden="true" className="h-3.5 w-3.5" />
                      {tabObservations.length}{' '}
                      {pluralLabel(t.annotator.unitObservation, tabObservations.length)}
                    </span>
                  </div>
                  {!captureTypeReady && annotations.length > 0 ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-gold-300/90">
                      {t.annotator.obsTypeMissing}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleLoadUrl()
            }}
            className="grid w-full place-items-center rounded-xl border-2 border-dashed border-zinc-300 bg-white px-6 py-10 text-center dark:border-white/15 dark:bg-[#161b22]"
          >
            <div className="w-full max-w-md">
              <Camera aria-hidden="true" className="mx-auto h-7 w-7 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {t.annotator.noVideoTitle}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.annotator.noVideoHint}</p>

              {/* Fallback : coller une URL de vidéo directe */}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(event) => setManualUrl(event.target.value)}
                  placeholder={t.annotator.urlPlaceholder}
                  aria-label={t.annotator.urlPlaceholder}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-white/15 dark:bg-[#0d1117] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-milk dark:focus:ring-milk/20"
                />
                <button
                  type="submit"
                  disabled={!manualUrl.trim()}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                >
                  <Play aria-hidden="true" className="h-4 w-4" />
                  {t.annotator.urlLoad}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Commandes du lecteur */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={togglePlayback}
              disabled={!isReady}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
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
                className="w-full accent-gold-600 disabled:opacity-40"
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
            <button
              type="button"
              onClick={toggleFullscreen}
              disabled={!isReady}
              aria-label={isFullscreen ? t.annotator.fullscreenExit : t.annotator.fullscreenEnter}
              title={isFullscreen ? t.annotator.fullscreenExit : t.annotator.fullscreenEnter}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {isFullscreen ? (
                <Minimize2 aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Maximize2 aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
            {lockedType ? (
              <span
                title={t.annotator.lockedTypeTag}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gold-500/40 bg-gold-500/5 px-2.5"
              >
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gold-700 dark:text-gold-400">
                  {t.annotator.obsTypeLabel}
                </span>
                <span className="min-w-0 max-w-[12rem] truncate text-xs font-bold text-zinc-900 dark:text-gold-200">
                  {lockedType}
                </span>
              </span>
            ) : typeRequired ? (
              <label
                title={t.annotator.obsTypeLabel}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 ${
                  nextObservationType.trim()
                    ? 'border-zinc-300 bg-white dark:border-white/15 dark:bg-white/5'
                    : 'border-gold-500/60 bg-gold-500/5'
                }`}
              >
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gold-700 dark:text-gold-400">
                  {t.annotator.obsTypeLabel}
                  {!nextObservationType.trim() ? ' *' : ''}
                </span>
                <select
                  value={nextObservationType}
                  onChange={(event) => setNextObservationType(event.target.value)}
                  aria-label={t.annotator.obsTypeLabel}
                  className="min-w-0 max-w-[12rem] cursor-pointer rounded-md bg-transparent text-xs font-semibold text-zinc-900 outline-none dark:text-zinc-100"
                >
                  <option value="">{t.annotator.obsTypePlaceholder}</option>
                  {typeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              onClick={triggerCapture}
              disabled={!canAnnotate || annotations.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
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
                  : !captureTypeReady
                    ? t.annotator.obsTypeMissing
                    : t.annotator.hintPaused}
            </p>
            {isReady ? (
              <p className="w-full text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500 sm:text-right">
                {t.annotator.shortcutsHelp}
              </p>
            ) : null}
          </div>
        </div>

        {/* ——— Invite de fin de vidéo ——— */}
        {showEndPrompt ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-300">
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
              {passes.length > 1 && hasRequiredTypes && !completion.allRequiredCovered && nextPendingType ? (
                <button
                  type="button"
                  onClick={() => handleContinueToType(nextPendingType)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-xs font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                >
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                  {fill(t.annotator.nextTypeButton, { type: nextPendingType })}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openSubmitConfirm}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-xs font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                >
                  <Send aria-hidden="true" className="h-3.5 w-3.5" />
                  {t.annotator.endSubmit}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* ——— Panneau latéral : observations capturées (carrousel) ——— */}
      <aside
        aria-label={t.annotator.panelTitle}
        className="flex w-full shrink-0 flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161b22] lg:w-80"
      >
        <header className="border-b border-zinc-100 px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {t.annotator.panelTitle}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {tabObservations.length > 0
              ? fill(t.annotator.panelCount, { n: tabObservations.length })
              : t.annotator.panelEmptyTitle}
          </p>
        </header>

        {tabObservations.length === 0 || !activeCapture ? (
          <div className="grid flex-1 place-items-center px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            <div>
              <Send aria-hidden="true" className="mx-auto h-6 w-6 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-2 max-w-[12rem] text-xs leading-relaxed">{t.annotator.panelEmptyHint}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Scène : capture active en plein format */}
            <div className="relative border-b border-zinc-100 bg-black dark:border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeCapture.imageDataUrl}
                alt=""
                className="block aspect-video w-full bg-black object-contain"
              />

              {/* Badge « Capture X sur Y » */}
              <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
                {fill(t.annotator.captureBadge, {
                  current: activeIndex + 1,
                  total: display.length,
                })}
              </span>

              {/* Navigation précédente / suivante */}
              {display.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => stepCapture(-1)}
                    disabled={activeIndex <= 0}
                    aria-label={t.annotator.prevCaptureAria}
                    title={t.annotator.prevCaptureAria}
                    className="absolute left-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepCapture(1)}
                    disabled={activeIndex >= display.length - 1}
                    aria-label={t.annotator.nextCaptureAria}
                    title={t.annotator.nextCaptureAria}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight aria-hidden="true" className="h-5 w-5" />
                  </button>
                </>
              ) : null}

              {/* Actions sur la capture (fond dégradé) */}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2.5 pt-8">
                <button
                  type="button"
                  onClick={() => handlePlayCapture(activeCapture)}
                  title={fill(t.annotator.playAt, {
                    time: formatTime(activeCapture.timestamp),
                  })}
                  className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg bg-white/20 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/30"
                >
                  <Play aria-hidden="true" className="h-3.5 w-3.5 shrink-0 fill-current" />
                  <span className="truncate">
                    {fill(t.annotator.playAt, {
                      time: formatTime(activeCapture.timestamp),
                    })}
                  </span>
                </button>
                <span className="min-w-2 flex-1" />
                <button
                  type="button"
                  onClick={() => handleEditCapture(activeCapture.id)}
                  aria-label={fill(t.annotator.editCaptureAria, { n: activeIndex + 1 })}
                  title={fill(t.annotator.editCaptureAria, { n: activeIndex + 1 })}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/40 text-white transition-colors hover:bg-black/60"
                >
                  <Edit2 aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCapture(activeCapture.id)}
                  aria-label={fill(t.annotator.deleteCaptureAria, { n: activeIndex + 1 })}
                  title={fill(t.annotator.deleteCaptureAria, { n: activeIndex + 1 })}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/40 text-white transition-colors hover:bg-clay-600"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Métadonnées : horodatage · cercles · zone */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-zinc-100 px-4 py-3 dark:border-white/10">
              <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
                <Timer aria-hidden="true" className="h-3.5 w-3.5 text-zinc-400" />
                T+ {formatTime(activeCapture.timestamp)}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {activeCapture.circleCount}{' '}
                {pluralLabel(t.stepper.unitZone, activeCapture.circleCount)}
              </span>
              {activeCapture.centroid ? (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <MapPin aria-hidden="true" className="h-3 w-3 text-gold-600 dark:text-gold-400" />
                  {zoneLabel(activeCapture.centroid)}
                </span>
              ) : null}
              {lockedType ? (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gold-700 dark:text-gold-400">
                    {t.annotator.obsTypeLabel}
                  </span>
                  <span className="min-w-0 max-w-[10rem] truncate rounded-md border border-gold-500/30 bg-gold-500/5 px-1.5 py-0.5 font-semibold text-zinc-900 dark:border-gold-400/20 dark:text-gold-200">
                    {lockedType}
                  </span>
                </span>
              ) : typeRequired ? (
                <label className="inline-flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gold-700 dark:text-gold-400">
                    {t.annotator.obsTypeLabel}
                  </span>
                  <select
                    value={activeCapture.observationType ?? ''}
                    onChange={(event) => setCaptureType(activeCapture.id, event.target.value)}
                    aria-label={t.annotator.obsTypeLabel}
                    className="min-w-0 cursor-pointer rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-semibold text-zinc-900 outline-none focus:border-gold-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">{t.annotator.obsTypePlaceholder}</option>
                    {typeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            {/* Vignettes (ancienne → récente) */}
            {display.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto border-b border-zinc-100 px-4 py-3 dark:border-white/10">
                {display.map((observation, index) => (
                  <button
                    key={observation.id}
                    type="button"
                    onClick={() => setActiveId(observation.id)}
                    aria-label={fill(t.annotator.captureBadge, {
                      current: index + 1,
                      total: display.length,
                    })}
                    className={`shrink-0 overflow-hidden rounded-lg transition-shadow ${
                      index === activeIndex
                        ? 'ring-2 ring-gold-500'
                        : 'ring-1 ring-zinc-200 hover:ring-zinc-300 dark:ring-white/10'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={observation.imageDataUrl}
                      alt=""
                      className="block aspect-video w-24 bg-black object-contain"
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {/* Pied ancré : envoi des observations (passe unique ; multi-passe → CTA global) */}
            {projectId && submittedCount === null && passes.length === 1 ? (
              <footer className="mt-auto border-t border-zinc-100 p-3 dark:border-white/10">
                <button
                  type="button"
                  onClick={openSubmitConfirm}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                  <span>
                    {showSendAllLabel
                      ? fill(t.annotator.sendAllObservations, { n: tabObservations.length })
                      : `${t.annotator.sendObservations} (${tabObservations.length})`}
                  </span>
                </button>
              </footer>
            ) : null}
          </>
        )}
      </aside>

      {/* ——— Boîte de confirmation d'envoi : Confirmer / Suivre / Annuler ——— */}
      {isConfirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-confirm-title"
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
        >
          <button
            type="button"
            aria-label={t.annotator.confirmCancel}
            onClick={() => setIsConfirmOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#161b22]">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-700 dark:text-gold-300">
              {t.annotator.confirmKicker}
            </p>
            <h3
              id="submit-confirm-title"
              className="mt-2 text-xl font-bold text-zinc-900 dark:text-zinc-50"
            >
              {t.annotator.confirmTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {fill(t.annotator.confirmBody, { n: observations.length })}
            </p>

            <div className="mt-6 flex flex-col-reverse items-stretch justify-end gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                <X aria-hidden="true" className="h-4 w-4" />
                {t.annotator.confirmCancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEndPromptDismissed(true)
                  setIsConfirmOpen(false)
                }}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-gold-600/30 bg-gold-500/10 px-4 text-sm font-semibold text-gold-700 transition-colors hover:bg-gold-500/20 dark:text-gold-300"
              >
                <Play aria-hidden="true" className="h-4 w-4" />
                {t.annotator.confirmFollow}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmOpen(false)
                  setIsStepperOpen(true)
                }}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                {t.annotator.confirmSend}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Stepper de soumission */}
      {projectId ? (
        <SubmissionStepper
          isOpen={isStepperOpen}
          onClose={() => setIsStepperOpen(false)}
          projectId={projectId}
          projectTitle={projectTitle || ''}
          captures={observations}
          requiredTypes={requiredCoverableTypes}
          onContinueToType={handleContinueToType}
          locale={locale}
          t={t.stepper}
          onDeleteCapture={handleDeleteCapture}
          onSubmissionSuccess={handleSubmissionSuccess}
        />
      ) : null}
      </div>
    </div>
  )
}
