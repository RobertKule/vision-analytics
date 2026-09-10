/**
 * ORCHESTRATEUR DE NOTIFICATIONS — point d'entrée UNIQUE des événements métier.
 *
 * Les actions métier ne dispersent plus leurs envois : elles appellent `notify()`
 * avec les canaux voulus (in-app +/ou email). L'ajout futur d'un canal WhatsApp se
 * fera ICI, sans modifier les actions métier (Partie A / T).
 *
 * Chaque canal est « best effort » : un échec d'envoi ne casse jamais l'action
 * métier qui l'a déclenchée, il est seulement journalisé.
 */
import 'server-only'
import { createNotification } from '@/lib/notifications'
import { sendEmail } from '@/lib/email'
import type { EmailContext, EmailKind } from '@/lib/emailContent'

export type NotifyInput = {
  /** Notification in-app (optionnelle). */
  inApp?: {
    userId: string
    type: string
    title: string
    message: string
  }
  /** Email transactionnel (optionnel). */
  email?: {
    to: string
    kind: EmailKind
    context?: EmailContext
  }
  actorId?: string | null
}

/**
 * Dispatch l'événement vers les canaux demandés. Ne lève jamais : chaque canal
 * capture ses propres erreurs.
 */
export async function notify(input: NotifyInput): Promise<void> {
  if (input.inApp) {
    await createNotification(input.inApp)
  }
  if (input.email) {
    await sendEmail({
      kind: input.email.kind,
      to: input.email.to,
      context: input.email.context,
      actorId: input.actorId,
    })
  }
}
