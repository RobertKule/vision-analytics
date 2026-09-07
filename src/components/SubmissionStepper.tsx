'use client'

import { useState, useTransition } from 'react'
import type { CaptureRecord, SubmissionResultDto } from '@/lib/types'
import { submitObservations } from '@/app/actions/observationActions'

type SubmissionStepperProps = {
  isOpen: boolean
  onClose: () => void
  projectId: string
  projectTitle: string
  captures: CaptureRecord[]
  onDeleteCapture: (captureId: string) => void
  onSubmissionSuccess: () => void
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
      setErrorNotice('Vous devez conserver au moins une capture pour soumettre la session.')
      return
    }
    setErrorNotice(null)
    setCurrentStep(2)
  }

  const handleGoToStep3 = () => {
    if (!effectiveIdentifier) {
      setErrorNotice(
        identityMode === 'anonymous'
          ? 'Veuillez renseigner ou générer un identifiant anonyme.'
          : 'Veuillez renseigner une adresse email valide.',
      )
      return
    }
    if (identityMode === 'email' && !effectiveIdentifier.includes('@')) {
      setErrorNotice('L’adresse email saisie est invalide.')
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
        observations: captures.map((c) => ({
          timestamp: c.timestamp,
          imageDataUrl: c.imageDataUrl,
        })),
      }

      const result: SubmissionResultDto = await submitObservations(payload)

      if (result.ok) {
        setIsSuccess(true)
        setSubmittedCount(result.submittedCount)
        onSubmissionSuccess()
      } else {
        setErrorNotice(result.error)
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stepper-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        {/* ——— En-tête du modal ——— */}
        <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              Protocole en Aveugle
            </span>
            <h2 id="stepper-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Soumission de la session — {projectTitle}
            </h2>
          </div>
          {!isPending && !isSuccess && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Fermer la boîte de dialogue"
            >
              ✕
            </button>
          )}
        </header>

        {/* ——— Indicateur d'étapes (Stepper) ——— */}
        <nav aria-label="Progression de la soumission" className="border-b border-zinc-100 bg-zinc-50/50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          <ol className="flex items-center justify-between gap-2">
            {[
              { num: 1, label: '1. Filtrage des captures' },
              { num: 2, label: '2. Identité observateur' },
              { num: 3, label: '3. Envoi & Validation' },
            ].map((step) => {
              const isActive = currentStep === step.num
              const isPast = currentStep > step.num || isSuccess
              return (
                <li
                  key={step.num}
                  className={`flex flex-1 items-center gap-2 text-xs font-medium sm:text-sm ${
                    isActive
                      ? 'text-red-600 dark:text-red-400'
                      : isPast
                        ? 'text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 dark:text-zinc-600'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isActive
                        ? 'bg-red-600 text-white'
                        : isPast
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {isPast ? '✓' : step.num}
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
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
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
                    Vérifiez vos captures avant soumission
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Supprimez les captures involontaires ou imprécises. Seules les images retenues
                    seront analysées.
                  </p>
                </div>
                <span className="rounded-full bg-red-100 px-3 py-1 font-mono text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                  {captures.length} capture{captures.length > 1 ? 's' : ''} retenue
                  {captures.length > 1 ? 's' : ''}
                </span>
              </div>

              {captures.length === 0 ? (
                <div className="grid place-items-center rounded-xl border-2 border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <p>Toutes les captures ont été supprimées. Annulez ou reprenez des annotations sur la vidéo.</p>
                </div>
              ) : (
                <div className="grid max-h-[22rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  {captures.map((capture, index) => (
                    <article
                      key={capture.id}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="relative aspect-video w-full bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={capture.imageDataUrl}
                          alt={`Observation à ${formatTime(capture.timestamp)}`}
                          className="h-full w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => onDeleteCapture(capture.id)}
                          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/90 text-white shadow-sm transition-transform hover:scale-105 hover:bg-red-600"
                          title="Supprimer cette capture"
                          aria-label={`Supprimer l’observation de ${formatTime(capture.timestamp)}`}
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                          ⏱ T+ {formatTime(capture.timestamp)}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          #{index + 1} · {capture.circleCount} zone{capture.circleCount > 1 ? 's' : ''}
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
                  Identification pour l’analyse scientifique
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Pour garantir l’impartialité des résultats scientifiques en double aveugle, vos
                  observations sont indexées sous un identifiant pseudonymisé.
                </p>
              </div>

              {/* Sélecteur de mode d'identification */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIdentityMode('anonymous')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                    identityMode === 'anonymous'
                      ? 'border-red-600 bg-red-50/50 shadow-sm dark:border-red-500 dark:bg-red-950/20'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                    Recommandé
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    ID Anonyme
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Identifiant unique conservé localement sans données personnelles.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIdentityMode('email')}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                    identityMode === 'email'
                      ? 'border-red-600 bg-red-50/50 shadow-sm dark:border-red-500 dark:bg-red-950/20'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                    Alternative
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Email Observateur
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Associe vos soumissions à votre adresse de recherche.
                  </span>
                </button>
              </div>

              {identityMode === 'anonymous' ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <label htmlFor="anon-id-input" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Votre identifiant anonyme de session
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id="anon-id-input"
                      type="text"
                      value={anonymousId}
                      onChange={(e) => setAnonymousId(e.target.value)}
                      className="h-10 flex-1 rounded-lg border border-zinc-300 bg-white px-3 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleRegenerateId}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      🔄 Régénérer
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Cet identifiant est réutilisé sur vos futures sessions depuis ce navigateur.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <label htmlFor="observer-email" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Adresse email de l’observateur
                  </label>
                  <input
                    id="observer-email"
                    type="email"
                    placeholder="observateur.scientifique@institut.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                    ✓
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">
                    Soumission enregistrée avec succès !
                  </h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {submittedCount} observation{submittedCount > 1 ? 's ont été téléversées' : ' a été téléversée'} vers le stockage sécurisé Cloudinary et synchronisée{submittedCount > 1 ? 's' : ''} dans la base de données scientifique.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    <span>Identifiant :</span>
                    <strong className="font-semibold">{effectiveIdentifier}</strong>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
                    ☁️
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    Prêt pour la transmission finale
                  </h3>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Les captures annotées seront téléversées sur Cloudinary puis comparées aux
                    fenêtres de validation secrètes du projet pour enregistrement en BDD.
                  </p>

                  <div className="mt-5 w-full max-w-sm rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left text-xs dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-500">Projet cible :</span>
                      <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{projectTitle}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                      <span className="text-zinc-500">Observations :</span>
                      <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{captures.length} capture(s)</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Identifiant :</span>
                      <strong className="truncate max-w-[150px] font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {effectiveIdentifier}
                      </strong>
                    </div>
                  </div>

                  {isPending && (
                    <div className="mt-6 flex flex-col items-center gap-2">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Téléversement des captures Cloudinary & validation en cours…
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ——— Barre d'actions en bas ——— */}
        <footer className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
          {isSuccess ? (
            <div className="flex w-full justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Terminer la session
              </button>
            </div>
          ) : (
            <>
              <div>
                {currentStep > 1 && !isPending && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((prev) => (prev - 1) as 1 | 2)}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 px-4 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    ← Précédent
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
                  Annuler
                </button>

                {currentStep === 1 && (
                  <button
                    type="button"
                    onClick={handleGoToStep2}
                    disabled={captures.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Suivant : Identification →
                  </button>
                )}

                {currentStep === 2 && (
                  <button
                    type="button"
                    onClick={handleGoToStep3}
                    disabled={!effectiveIdentifier}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    Suivant : Vérification →
                  </button>
                )}

                {currentStep === 3 && (
                  <button
                    type="button"
                    onClick={handleExecuteSubmission}
                    disabled={isPending || captures.length === 0}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? 'Envoi en cours…' : 'Confirmer et Téléverser'}
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
