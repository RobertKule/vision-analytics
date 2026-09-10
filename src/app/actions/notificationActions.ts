'use server'

import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

/**
 * NOTIFICATIONS IN-APP — lecture pour l'utilisateur connecté uniquement.
 *
 * Chaque action re-vérifie la session : un utilisateur ne voit et ne modifie QUE
 * ses propres notifications (jamais un `userId` cible accepté du client).
 */

export type NotificationRow = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

/** Notifications de la session courante (non lues d'abord, puis récentes). */
export async function listMyNotifications(): Promise<NotificationRow[]> {
  const session = await getCurrentSession()
  if (!session) return []

  const rows = await prisma.notification.findMany({
    where: { userId: session.uid },
    orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, type: true, title: true, message: true, readAt: true, createdAt: true },
    take: 50,
  })

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export type NotificationActionResult = { ok: true } | { ok: false; error: string }

/** Marque UNE notification comme lue (uniquement si elle appartient à la session). */
export async function markNotificationRead(notificationId: string): Promise<NotificationActionResult> {
  const session = await getCurrentSession()
  if (!session) return { ok: false, error: 'Non authentifié.' }

  const row = await prisma.notification.findFirst({
    where: { id: notificationId, userId: session.uid },
    select: { id: true },
  })
  if (!row) return { ok: false, error: 'Notification introuvable.' }

  await prisma.notification.update({
    where: { id: row.id },
    data: { readAt: new Date() },
  })
  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.notificationRead,
    entityType: 'user',
    entityId: session.uid,
    metadata: { notificationId: row.id },
  })
  return { ok: true }
}

/** Marque TOUTES les notifications de la session comme lues. */
export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  const session = await getCurrentSession()
  if (!session) return { ok: false, error: 'Non authentifié.' }

  await prisma.notification.updateMany({
    where: { userId: session.uid, readAt: null },
    data: { readAt: new Date() },
  })
  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.notificationRead,
    entityType: 'user',
    entityId: session.uid,
    metadata: { all: true },
  })
  return { ok: true }
}
