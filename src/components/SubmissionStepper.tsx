'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudOff,
  EyeOff,
  Loader2,
  Timer,
  Trash,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { CaptureRecord } from '@/lib/types'
import type { Locale, StepperText } from '@/lib/i18n'
import { computeTypeCompletion } from '@/lib/captureCompletion'
import { countSyncStates, type CaptureSyncMap } from '@/lib/captureSyncState'

/**
 * Phase de la finalisation signalée par l'annotateur pendant `onFinalize`.
 *  — `draining` : les captures restantes (pending/failed) sont enregistrées ;
 *  — `finalizing` : la session est certifiée côté serveur (fenêtres, vérification).
 */
export type FinalizePhase = 'draining' | 'finalizing'

export type FinalizeOutcome =
  | { ok: true; finalizedCount: number; alreadyFinalized?: boolean }
  | { ok: false; error: string; offline?: boolean }

type SubmissionStepperProps = {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectTitle: string
  captures: CaptureRecord[]
  /** Types d'observation requis par le projet (vide si aucun n'est imposé). */
  requiredTypes?: string[]
  /** Retour au lecteur pour poursuivre la capture d'un type manquant. */
  onContinueToType?: (type: string) => void
  locale: Locale
  t: StepperText
  onDeleteCapture: (captureId: string) => void
  onSubmissionSuccess: (submittedCount: number) => void
  /** Identité d'observation figée au montage — chaque capture est déjà enregistrée sous elle. */
  observerIdentifier: string
  /** Jeton de session stable (persisté avec le brouillon). */
  runId: string
  /** État de synchronisation de chaque capture (pending → syncing → synced | failed). */
  syncByKey: CaptureSyncMap
  /** Vidange des captures restantes puis certification de la session côté serveur. */
  onFinalize: (onPhase: (phase: FinalizePhase) => void) => Promise<FinalizeOutcome>
}

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '00:00.0'
  const totalTenths = Math.max(0, Math.round(totalSeconds * 10))
  const tenths = totalTenths % 10
  const total = Math.floor(totalTenths / 10)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

function pluralLabel(unit: { one: string; many: string }, count: number): string {
  return count === 1 ? unit.one : unit.many
}

export default function SubmissionStepper(props: SubmissionStepperProps) {
  if (!props.isOpen) return null
  return <SubmissionStepperModal {...props} />
}

function SubmissionStepperModal({
  onClose,
  projectTitle,
  captures,
  requiredTypes = [],
  onContinueToType,
  t,
  onDeleteCapture,
  onSubmissionSuccess,
  observerIdentifier,
  syncByKey,
  onFinalize,
}: Omit<SubmissionStepperProps, 'isOpen' | 'locale' | 'runId' | 'projectId'>) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [submittedCount, setSubmittedCount] = useState(0)
  /** Confirmation explicite requise avant de finaliser une session avec types manquants. */
  const [acknowledgeGaps, setAcknowledgeGaps] = useState(false)
  /** Phase courante de la finalisation (vidange puis certification). */
  const [sendPhase, setSendPhase] = useState<'idle' | FinalizePhase>('idle')

  const inFlightRef = useRef(false)
  const [isPending, startTransition] = useTransition()

  /** Couverture des types requis par les captures de la session. */
  const completion = useMemo(
    () => computeTypeCompletion(requiredTypes, captures),
    [captures, requiredTypes],
  )
  /** Vrai quand des types requis attendent encore une capture. */
  const gapsPresent = completion.totalRequired > 0 && !completion.allRequiredCovered

  /** État de synchronisation réel des captures (les entrées sans état sont ignorées). */
  const syncCounts = useMemo(
    () => countSyncStates(syncByKey, captures),
    [captures, syncByKey],
  )
  const allSynced =
    captures.length > 0 &&
    syncCounts.synced === captures.length &&
    syncCounts.pending === 0 &&
    syncCounts.failed === 0 &&
    syncCounts.syncing === 0
  const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false
  /** Une capture en attente d'envoi : on la voit tant que la file n'est pas vide. */
  const stillSyncing = captures.length > 0 && !allSynced

  /** Barre de progression : captures déjà enregistrées / total retenu. */
  const progressPercent =
    captures.length > 0 ? Math.round((syncCounts.synced / captures.length) * 100) : 100

  /** Verrouille navigation/fermeture pendant une finalisation en cours ou réussie. */
  const lockSession = isPending || isSuccess

  const handleGoToStep2 = () => {
    if (captures.length === 0) {
      setErrorNotice(t.errorCaptures)
      return
    }
    setErrorNotice(null)
    setCurrentStep(2)
  }

  const handleGoToStep3 = () => {
    if (!observerIdentifier.trim()) {
      setErrorNotice(t.errorIdentifier)
      return
    }
    setErrorNotice(null)
    // Chaque passage à la confirmation redemande l'acquittement des types manquants.
    setAcknowledgeGaps(false)
    setCurrentStep(3)
  }

  const handleExecuteFinalize = () => {
    if (inFlightRef.current) return // anti double-finalisation
    if (gapsPresent && !acknowledgeGaps) {
      setErrorNotice(t.typeGapTitle)
      return
    }
    setErrorNotice(null)
    inFlightRef.current = true
    startTransition(async () => {
      try {
        const outcome = await onFinalize((phase) => setSendPhase(phase))
        setSendPhase('idle')
        if (outcome.ok) {
          setSubmittedCount(outcome.finalizedCount)
          setIsSuccess(true)
          onSubmissionSuccess(outcome.finalizedCount)
        } else {
          setErrorNotice(outcome.error || t.errorNetwork)
        }
      } catch (error) {
        console.error('Finalization failed', error)
        setSendPhase('idle')
        setErrorNotice(t.errorNetwork)
      } finally {
        inFlightRef.current = false
      }
    })
  }

  const steps = [
    { num: 1, label: t.step1 },
    { num: 2, label: t.step2 },
    { num: 3, label: t.step3 },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stepper-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161b22]">
        {/* ——— En-tête du modal ——— */}
        <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-white/10">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-700 dark:text-gold-400">
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
              {t.kicker}
            </span>
            <h2 id="stepper-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              {fill(t.title, { title: projectTitle })}
            </h2>
          </div>
          {!lockSession && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-200"
              aria-label={t.closeAria}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </header>

        {/* ——— Indicateur d'étapes (Stepper) ——— */}
        <nav
          aria-label={t.progressAria}
          className="border-b border-zinc-100 bg-zinc-50/50 px-6 py-3 dark:border-white/10 dark:bg-white/[0.02]"
        >
          <ol className="flex items-center justify-between gap-2">
            {steps.map((step) => {
              const isActive = currentStep === step.num
              const isPast = currentStep > step.num || isSuccess
              return (
                <li
                  key={step.num}
                  className={`flex flex-1 items-center gap-2 text-xs font-medium sm:text-sm ${
                    isActive
                      ? 'text-gold-700 dark:text-gold-400'
                      : isPast
                        ? 'text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 dark:text-zinc-600'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isActive
                        ? 'bg-ink text-white'
                        : isPast
                          ? 'bg-gold-600 text-white'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {isPast ? (
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    ) : (
                      step.num
                    )}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* ——— Corps de l'étape active ——— */}
        <div className="flex-1 overflow-y-auto p-6">
          {errorNotice && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-clay-200 bg-clay-50 p-4 text-sm text-clay-700 dark:border-clay-800 dark:bg-clay-900/40 dark:text-clay-300"
            >
              {errorNotice}
            </div>
          )}

          {/* ÉTAPE 1 : Revue & Filtrage */}
          {currentStep === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.step1Title}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{t.step1Hint}</p>
                </div>
                <span className="rounded-full bg-gold-500/15 px-3 py-1 font-mono text-xs font-bold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
                  {fill(t.step1Count, { n: captures.length })}
                </span>
              </div>

              {completion.totalRequired > 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t.typeCoverTitle}
                    </p>
                    <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
                      {fill(t.typeCoverProgress, {
                        done: completion.completedCount,
                        total: completion.totalRequired,
                      })}
                    </span>
                  </div>

                  {/* État de chaque type requis */}
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(completion.typeCounts).map(([type, count]) => {
                      const covered = count > 0
                      return (
                        <li
                          key={type}
                          className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                            covered
                              ? 'border-gold-500/40 bg-gold-500/10 text-gold-800 dark:border-gold-400/20 dark:text-gold-200'
                              : 'border-zinc-200 bg-white text-zinc-600 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-400'
                          }`}
                        >
                          <span className="truncate font-medium">{type}</span>
                          <span className="font-mono tabular-nums text-[10px] opacity-70">
                            ×{count}
                          </span>
                          <span
                            className={
                              covered
                                ? 'font-bold uppercase tracking-wide text-gold-700 dark:text-gold-400'
                                : 'font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-600'
                            }
                          >
                            {covered ? t.typeStateCovered : t.typeStatePending}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {gapsPresent ? (
                    <div className="mt-3 rounded-lg border border-clay-200 bg-clay-50 p-3 dark:border-clay-800 dark:bg-clay-900/30">
                      <p className="flex items-start gap-1.5 text-xs font-bold text-clay-700 dark:text-clay-300">
                        <TriangleAlert
                          aria-hidden="true"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        />
                        {t.typeGapTitle}
                      </p>
                      <p className="mt-1 pl-5 text-xs leading-relaxed text-clay-600 dark:text-clay-300">
                        {t.typePendingIntro}{' '}
                        <strong className="font-semibold">
                          {completion.pendingTypes.join(' · ')}
                        </strong>
                      </p>
                      <div className="mt-2 flex justify-end">
                        {onContinueToType ? (
                          <button
                            type="button"
                            onClick={() => onContinueToType(completion.pendingTypes[0])}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                          >
                            {t.typeContinueButton}
                            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <Check
                        aria-hidden="true"
                        className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400"
                        strokeWidth={2.5}
                      />
                      {t.typeAllCovered}
                    </p>
                  )}
                </div>
              ) : null}

              {captures.length === 0 ? (
                <div className="grid place-items-center rounded-xl border-2 border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-white/15 dark:text-zinc-400">
                  <p>{t.step1Empty}</p>
                </div>
              ) : (
                <div className="grid max-h-[22rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  {captures.map((capture, index) => (
                    <article
                      key={capture.id}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-[#0d1117]"
                    >
                      <div className="relative aspect-video w-full bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={capture.imageDataUrl}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => onDeleteCapture(capture.id)}
                          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-clay-700/90 text-white shadow-sm transition-transform hover:scale-105 hover:bg-clay-600 dark:bg-clay-600/90 dark:hover:bg-clay-500"
                          title={t.deleteCapture}
                          aria-label={t.deleteCapture}
                        >
                          <Trash aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                          <Timer aria-hidden="true" className="h-3.5 w-3.5" /> {t.timePrefix}{' '}
                          {formatTime(capture.timestamp)}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          #{index + 1} · {capture.circleCount}{' '}
                          {pluralLabel(t.unitZone, capture.circleCount)}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ÉTAPE 2 : Identité Observateur (lecture seule — figée à la session) */}
          {currentStep === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {t.step2Title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {t.step2Hint}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <span className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t.recIdentifier}
                </span>
                <p className="mt-1.5 break-all font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {observerIdentifier}
                </p>
                <p className="mt-3 inline-flex items-start gap-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-700 dark:text-gold-400"
                    strokeWidth={2.5}
                  />
                  {t.identityLockedHint}
                </p>
              </div>
            </div>
          )}

          {/* ÉTAPE 3 : Finalisation & certification */}
          {currentStep === 3 && (
            <div className="flex flex-col gap-5 text-center">
              {isSuccess ? (
                <div className="py-6">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-400">
                    <Check aria-hidden="true" className="h-7 w-7" strokeWidth={2.5} />
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">
                    {t.successTitle}
                  </h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t.successBody}</p>

                  <div className="mx-auto mt-6 flex max-w-sm flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-zinc-400">{t.recCount}:</span>
                      <strong className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {submittedCount}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 font-mono dark:bg-white/5">
                      <span className="text-zinc-400">{t.recIdentifier}:</span>
                      <strong className="max-w-[10rem] truncate font-semibold text-zinc-800 dark:text-zinc-200">
                        {observerIdentifier}
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/10 text-gold-700 dark:bg-gold-400/10 dark:text-gold-400">
                    <Check aria-hidden="true" className="h-6 w-6" />
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {t.step3Title}
                  </h3>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {t.step3Hint}
                  </p>

                  <div className="mt-5 w-full max-w-sm rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left text-xs dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex justify-between border-b border-zinc-200 py-1 dark:border-white/10">
                      <span className="text-zinc-500">{t.recProject}:</span>
                      <strong className="max-w-[16rem] truncate font-semibold text-zinc-800 dark:text-zinc-200">
                        {projectTitle}
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-zinc-200 py-1 dark:border-white/10">
                      <span className="text-zinc-500">{t.recCount}:</span>
                      <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {captures.length} {pluralLabel(t.unitCapture, captures.length)}
                      </strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">{t.recIdentifier}:</span>
                      <strong className="max-w-[150px] truncate font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {observerIdentifier}
                      </strong>
                    </div>
                  </div>

                  {/* État de synchronisation réel des captures (déjà enregistrées une à une). */}
                  {captures.length > 0 ? (
                    <div className="mx-auto mt-4 w-full max-w-sm rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left dark:border-white/10 dark:bg-white/[0.03]">
                      {allSynced ? (
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <Check
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                            strokeWidth={2.5}
                          />
                          {fill(t.allSyncedLabel, { n: captures.length })}
                        </p>
                      ) : offlineNow ? (
                        <p className="inline-flex items-start gap-1.5 text-xs font-medium text-clay-700 dark:text-clay-300">
                          <CloudOff
                            aria-hidden="true"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          />
                          {t.waitingSync}
                        </p>
                      ) : (
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                          <Loader2
                            aria-hidden="true"
                            className="h-3.5 w-3.5 animate-spin text-gold-600 dark:text-gold-400"
                          />
                          {fill(t.syncingProgress, {
                            done: syncCounts.synced,
                            total: captures.length,
                          })}
                        </p>
                      )}
                    </div>
                  ) : null}

                  {gapsPresent ? (
                    <div className="mx-auto mt-5 w-full max-w-sm rounded-xl border border-clay-200 bg-clay-50 p-4 text-left dark:border-clay-800 dark:bg-clay-900/30">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-clay-700 dark:text-clay-300">
                        <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        {t.typeGapTitle}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-clay-600 dark:text-clay-300">
                        {t.typePendingIntro}{' '}
                        <strong className="font-semibold">
                          {completion.pendingTypes.join(', ')}
                        </strong>
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-clay-700 dark:text-clay-300">
                        <input
                          type="checkbox"
                          checked={acknowledgeGaps}
                          onChange={(event) => setAcknowledgeGaps(event.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-clay-300 accent-clay-700"
                        />
                        <span>{t.typeGapAcknowledge}</span>
                      </label>
                    </div>
                  ) : null}

                  {/* Barre de progression réelle (vidange puis certification). */}
                  {sendPhase !== 'idle' && (
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progressPercent}
                      aria-label={t.progressBarAria}
                      className="mt-6 w-full max-w-sm"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        <span className="truncate">
                          {sendPhase === 'finalizing'
                            ? t.finalizing
                            : offlineNow
                              ? t.waitingSync
                              : fill(t.syncingProgress, {
                                  done: syncCounts.synced,
                                  total: captures.length,
                                })}
                        </span>
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {fill(t.progressPercent, { percent: progressPercent })}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-gold-600 transition-[width] duration-300 ease-out dark:bg-gold-400"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ——— Barre d'actions en bas ——— */}
        <footer className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isSuccess ? (
            <div className="flex w-full justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-ink px-5 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
              >
                {t.finish}
              </button>
            </div>
          ) : (
            <>
              <div>
                {currentStep > 1 && !lockSession && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((prev) => (prev - 1) as 1 | 2)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-4 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {t.back}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-medium text-zinc-500 hover:text-zinc-800 disabled:opacity-50 dark:hover:text-zinc-200"
                >
                  {t.cancel}
                </button>

                {currentStep === 1 && (
                  <button
                    type="button"
                    onClick={handleGoToStep2}
                    disabled={captures.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-5 text-sm font-semibold text-milk hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                  >
                    {t.nextIdentification} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}

                {currentStep === 2 && (
                  <button
                    type="button"
                    onClick={handleGoToStep3}
                    disabled={!observerIdentifier.trim()}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-5 text-sm font-semibold text-milk hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                  >
                    {t.nextConfirmation} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}

                {currentStep === 3 && (
                  <button
                    type="button"
                    onClick={handleExecuteFinalize}
                    disabled={
                      isPending ||
                      captures.length === 0 ||
                      (gapsPresent && !acknowledgeGaps) ||
                      (stillSyncing && offlineNow)
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                  >
                    {isPending || sendPhase !== 'idle' ? (
                      <>
                        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        {t.finalizingBtn}
                      </>
                    ) : (
                      t.confirmFinalize
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
