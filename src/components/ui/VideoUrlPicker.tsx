'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  CloudUpload,
  Eraser,
  FileVideo2,
  Link2,
  Loader2,
} from 'lucide-react'
import { validateVideoUrl } from '@/lib/videoUrl'

/** Textes du sélecteur (fournis par l'appelant pour rester bilingue). */
export type VideoUrlPickerText = {
  title: string
  subtitle: string
  urlPlaceholder: string
  pasteAction: string
  clearAction: string
  optionalTag: string
  validating: string
  okLabel: string
  okHint: string
  fileLabel: string
  fileHint: string
  invalidLabel: string
  unreachableLabel: string
  unknownLabel: string
  unknownHint: string
}

export type VideoUrlPickerProps = {
  /** URL ou nom de fichier courant (champ contrôlé). */
  value: string
  onChange: (value: string) => void
  text: VideoUrlPickerText
  inputId: string
}

/**
 * Sélecteur « Vidéo cible » (Espace 3). Aucun téléversement : l'URL est
 * conservée telle quelle (comme aujourd'hui) et les observateurs chargent leur
 * propre copie. Le champ accepte :
 *   – une URL http(s) : vérifiée côté client (format puis atteignabilité HEAD/GET) ;
 *   – un simple nom de fichier local (compatibilité avec les fiches existantes).
 * La validation n'est qu'une assistance éditoriale, jamais un garde-fou.
 */
export default function VideoUrlPicker({
  value,
  onChange,
  text,
  inputId,
}: VideoUrlPickerProps) {
  // Résultat de vérification asynchrone, rattaché à la saisie qui l'a produit.
  const [outcome, setOutcome] = useState<{ for: string; status: 'ok' | 'invalid' | 'unreachable' | 'unknown' } | null>(
    null,
  )

  useEffect(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed)) return // nom de fichier : géré dans le rendu
    let cancelled = false
    const timer = setTimeout(() => {
      void validateVideoUrl(trimmed).then((status) => {
        if (!cancelled) setOutcome({ for: trimmed, status })
      })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value])

  const trimmed = value.trim()
  let status: 'idle' | 'file' | 'validating' | 'ok' | 'invalid' | 'unreachable' | 'unknown' =
    'idle'
  if (trimmed) {
    if (!/^https?:\/\//i.test(trimmed)) status = 'file'
    else if (outcome && outcome.for === trimmed) status = outcome.status
    else status = 'validating'
  }

  const doPaste = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const clipboard = await navigator.clipboard.readText()
        if (clipboard) onChange(clipboard.trim())
      }
    } catch {
      /* permission refusée : l'utilisateur colle à la main */
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-400">
          <CloudUpload aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{text.title}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{text.subtitle}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
          {text.optionalTag}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={text.urlPlaceholder}
          spellCheck={false}
          autoComplete="off"
          className="h-10 w-full min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15"
        />
        <button
          type="button"
          onClick={() => void doPaste()}
          disabled={typeof navigator === 'undefined' || !navigator.clipboard?.readText}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
          {text.pasteAction}
        </button>
      </div>

      {/* État de validation */}
      <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
        {status === 'validating' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            {text.validating}
          </span>
        ) : status === 'file' ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/15 px-2.5 py-1 text-xs font-semibold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
              <FileVideo2 aria-hidden="true" className="h-3.5 w-3.5" />
              {text.fileLabel}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{text.fileHint}</span>
          </>
        ) : status === 'ok' ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
              {text.okLabel}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{text.okHint}</span>
          </>
        ) : status === 'invalid' || status === 'unreachable' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-100 px-2.5 py-1 text-xs font-semibold text-clay-800 dark:bg-clay-500/15 dark:text-clay-300">
            <CircleX aria-hidden="true" className="h-3.5 w-3.5" />
            {status === 'invalid' ? text.invalidLabel : text.unreachableLabel}
          </span>
        ) : status === 'unknown' ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
              <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
              {text.unknownLabel}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{text.unknownHint}</span>
          </>
        ) : null}

        {trimmed ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          >
            <Eraser aria-hidden="true" className="h-3 w-3" />
            {text.clearAction}
          </button>
        ) : null}
      </div>
    </div>
  )
}
