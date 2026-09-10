'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { requestObserverReactivation } from '@/app/actions/observerReactivationActions'
import type { Locale } from '@/lib/i18n'

type ReactivationRequestButtonProps = {
  projectId: string
  locale: Locale
  /** Vrai si une demande est DÉJÀ en attente (lecture initiale serveur). */
  initiallyPending?: boolean
  /**
   * Textes fournis par le serveur (aucun secret) : libellés du bouton et des états.
   */
  text: {
    /** État inactif initial : « Votre session est terminée ou inactive. » */
    inactiveTitle: string
    /** Consigne : « Vous pouvez demander à l'administrateur de réactiver votre accès. » */
    inactiveHint: string
    /** Bouton : « Demander la réactivation ». */
    cta: string
    /** État déjà en attente : « Votre demande de réactivation est déjà en attente. » */
    alreadyPending: string
    /** Succès : « Votre demande de réactivation a été envoyée. » */
    sent: string
    /** Succès suite : « Un administrateur doit confirmer votre accès. » */
    sentHint: string
    /** Échec : « Impossible de demander la réactivation. » */
    error: string
  }
}

/**
 * DEMANDE DE RÉACTIVATION — bouton observateur.
 *
 * L'observateur ne réactive JAMAIS son propre accès : il crée une demande PENDING
 * que seul un ADMIN peut confirmer ou refuser. Une demande déjà en attente n'en
 * crée pas une seconde.
 */
export default function ReactivationRequestButton({
  projectId,
  locale,
  initiallyPending = false,
  text,
}: ReactivationRequestButtonProps) {
  const [pending, setPending] = useState(initiallyPending)
  const [sending, setSending] = useState(false)

  const handleRequest = async () => {
    if (pending || sending) return
    setSending(true)
    try {
      const result = await requestObserverReactivation({ projectId, locale })
      if (result.ok) {
        setPending(true)
        toast.success(text.sent, { description: text.sentHint })
      } else {
        toast.error(text.error)
      }
    } catch (error) {
      console.error('[reactivation] Demande impossible.', error)
      toast.error(text.error)
    } finally {
      setSending(false)
    }
  }

  if (pending) {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-gold-800 dark:text-gold-200"
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        {text.alreadyPending}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{text.inactiveTitle}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{text.inactiveHint}</p>
      <button
        type="button"
        onClick={() => void handleRequest()}
        disabled={sending}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
      >
        {sending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
        {text.cta}
      </button>
    </div>
  )
}
