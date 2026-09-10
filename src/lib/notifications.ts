/**
 * SERVICE DE NOTIFICATIONS IN-APP — côté serveur UNIQUEMENT.
 *
 * Un utilisateur ne voit QUE ses propres notifications ; chaque lecture / marquage
 * est vérifié côté serveur (jamais un `userId` cible accepté du client). La
 * création est « best effort » : une panne du journal de notifications ne casse
 * jamais l'action métier qui l'a déclenchée.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

export type CreateNotificationInput = {
  userId: string
  type: string
  title: string
  message: string
}

/**
 * Crée une notification in-app pour UN utilisateur précis. Ne renvoie rien (best
 * effort) : l'appelant continue son action même si l'écriture échoue.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
      },
    })
    await recordAudit({
      userId: input.userId,
      action: AUDIT_ACTIONS.notificationCreated,
      entityType: 'user',
      entityId: input.userId,
      metadata: { type: input.type },
    })
  } catch (error) {
    console.error('[notifications] Écriture impossible (best effort) :', error)
  }
}
