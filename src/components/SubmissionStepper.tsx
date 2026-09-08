'use client'

import { useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudUpload,
  EyeOff,
  RefreshCw,
  Timer,
  Trash,
  X,
} from 'lucide-react'
import type { CaptureRecord, SubmissionResultDto } from '@/lib/types'
import { submitObservations } from '@/app/actions/observationActions'
import type { Locale, StepperText } from '@/lib/i18n'

type SubmissionStepperProps = {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectTitle: string
  captures: CaptureRecord[]
  locale: Locale
  t: StepperText
  onDeleteCapture: (captureId: string) => void
  onSubmissionSuccess: (submittedCount: number) => void
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

function getStoredOrNewAnonymousId(): string {
  if (typeof window === 'undefined') return ''
  const stored = localStorage.getItem('va_observer_anonymous_id')
  if (stored && stored.trim()) return stored.trim()

  const newId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  localStorage.setItem('va_observer_anonymous_id', newId)
  return newId
}

export default function SubmissionStepper(props: SubmissionStepperProps) {
  if (!props.isOpen) return null
  return <SubmissionStepperModal {...props} />
}

function SubmissionStepperModal({
  onClose,
  projectId,
  projectTitle,
  captures,
  locale,
  t,
  onDeleteCapture,
  onSubmissionSuccess,
}: Omit<SubmissionStepperProps, 'isOpen'>) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [identityMode, setIdentityMode] = useState<'anonymous' | 'email'>('anonymous')
  const [anonymousId, setAnonymousId] = useState<string>(getStoredOrNewAnonymousId)
  const [email, setEmail] = useState<string>('')
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [submittedCount, setSubmittedCount] = useState(0)

  const [isPending, startTransition] = useTransition()

  const handleRegenerateId = () => {
    const newId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem('va_observer_anonymous_id', newId)
    setAnonymousId(newId)
  }

  const effectiveIdentifier =
    identityMode === 'anonymous' ? anonymousId.trim() : email.trim().toLowerCase()

  const handleGoToStep2 = () => {
    if (captures.length === 0) {
      setErrorNotice(t.errorCaptures)
      return
    }
    setErrorNotice(null)
    setCurrentStep(2)
  }

  const handleGoToStep3 = () => {
    if (!effectiveIdentifier) {
      setErrorNotice(identityMode === 'anonymous' ? t.errorIdentifier : t.errorEmailRequired)
      return
    }
    if (identityMode === 'email' && !effectiveIdentifier.includes('@')) {
      setErrorNotice(t.errorEmailInvalid)
      return
    }
    setErrorNotice(null)
    setCurrentStep(3)
  }

  const handleExecuteSubmission = () => {
    setErrorNotice(null)
    startTransition(async () => {
      const payload = {
        projectId,
        observerIdentifier: effectiveIdentifier,
        locale,
        observations: captures.map((c) => ({
          timestamp: c.timestamp,
          imageDataUrl: c.imageDataUrl,
        })),
      }

      const result: SubmissionResultDto = await submitObservations(payload)

      if (result.ok) {
        setIsSuccess(true)
        setSubmittedCount(result.submittedCount)
        onSubmissionSuccess(result.submittedCount)
      } else {
        setErrorNotice(result.error)
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
          {!isPending && !isSuccess && (
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

          {/* ÉTAPE 2 : Identité Observateur */}
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

              {/* Sélecteur de mode d'identification */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIdentityMode('anonymous')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                    identityMode === 'anonymous'
                      ? 'border-gold-600 bg-gold-500/[0.06] shadow-sm dark:border-gold-500 dark:bg-gold-400/10'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20'
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-gold-700 dark:text-gold-400">
                    {t.recommendedTag}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.anonTitle}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.anonDesc}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIdentityMode('email')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                    identityMode === 'email'
                      ? 'border-gold-600 bg-gold-500/[0.06] shadow-sm dark:border-gold-500 dark:bg-gold-400/10'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20'
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                    {t.alternativeTag}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.emailTitle}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.emailDesc}</span>
                </button>
              </div>

              {identityMode === 'anonymous' ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <label
                    htmlFor="anon-id-input"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                  >
                    {t.anonLabel}
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id="anon-id-input"
                      type="text"
                      value={anonymousId}
                      onChange={(e) => setAnonymousId(e.target.value)}
                      className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900 dark:border-white/15 dark:bg-[#0d1117] dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleRegenerateId}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
                    >
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t.regen}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{t.anonHint}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <label
                    htmlFor="observer-email"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                  >
                    {t.emailLabel}
                  </label>
                  <input
                    id="observer-email"
                    type="email"
                    placeholder={t.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-white/15 dark:bg-[#0d1117] dark:text-zinc-100"
                  />
                </div>
              )}
            </div>
          )}

          {/* ÉTAPE 3 : Téléversement & Envoi */}
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
                        {effectiveIdentifier}
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/10 text-gold-700 dark:bg-gold-400/10 dark:text-gold-400">
                    <CloudUpload aria-hidden="true" className="h-6 w-6" />
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
                        {effectiveIdentifier}
                      </strong>
                    </div>
                  </div>

                  {isPending && (
                    <div className="mt-6 flex flex-col items-center gap-2">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-gold-600 border-t-transparent" />
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {t.uploading}
                      </p>
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
                {currentStep > 1 && !isPending && (
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
                    disabled={!effectiveIdentifier}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-5 text-sm font-semibold text-milk hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                  >
                    {t.nextConfirmation} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}

                {currentStep === 3 && (
                  <button
                    type="button"
                    onClick={handleExecuteSubmission}
                    disabled={isPending || captures.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                  >
                    {isPending ? t.uploadingBtn : t.confirmUpload}
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
