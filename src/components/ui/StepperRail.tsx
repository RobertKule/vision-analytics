'use client'

import { Check } from 'lucide-react'

export type StepperStep = {
  num: number
  label: string
}

type StepperRailProps = {
  steps: StepperStep[]
  /** étape active (1-indexée). */
  current: number
  /** marque toutes les étapes comme terminées (après soumission). */
  done?: boolean
  ariaLabel: string
}

/**
 * Indicateur d'étapes « X sur Y » (rail), extrait de l'anatomie du rail du
 * `SubmissionStepper` : bulles numérotées actives/passées/futures.
 */
export default function StepperRail({ steps, current, done = false, ariaLabel }: StepperRailProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="border-b border-line bg-cream/60 px-5 py-3 dark:border-white/10 dark:bg-white/[0.02]"
    >
      <ol className="flex items-center justify-between gap-2">
        {steps.map((step) => {
          const isActive = current === step.num
          const isPast = current > step.num || done
          return (
            <li
              key={step.num}
              className={`flex flex-1 items-center gap-2 text-xs font-medium sm:text-sm ${
                isActive
                  ? 'text-gold-700 dark:text-gold-400'
                  : isPast
                    ? 'text-ink dark:text-milk'
                    : 'text-mute dark:text-zinc-600'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isActive
                    ? 'bg-ink text-milk'
                    : isPast
                      ? 'bg-gold-600 text-white'
                      : 'bg-zinc-200 text-mute dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {isPast ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : step.num}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
