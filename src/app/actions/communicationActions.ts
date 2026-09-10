'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import { sendRawEmail } from '@/lib/email'
import { renderPlainTextEmailHtml } from '@/lib/emailContent'
import {
  baseVariables,
  normalizeRecipientEmails,
  renderTemplateVariables,
  type CommunicationTemplate,
  type CommunicationVariableContext,
} from '@/lib/communicationTemplates'
import { resolveAnalyticsView } from '@/lib/analyticsVersionStore'

/**
 * MODULE « COMMUNICATION » (espace ADMIN).
 *
 * Envoi de messages libres / à partir de templates, vers des destinataires ONA Field
 * (utilisateurs connus) et/ou des adresses externes. Chaque destinataire reçoit SON
 * propre email (jamais de champ To/Cc/Bcc partagé). Un message de communication ne
 * donne AUCUN droit d'accès, ne crée AUCUN compte/session/token.
 *
 * Réservé ADMIN (vérifié côté serveur) ; historique + audit conservés.
 */

/** Templates prédéfinis (définition centralisée, aucune table). */
export async function listCommunicationTemplates(): Promise<CommunicationTemplate[]> {
  const admin = await getCurrentAdmin()
  if (!admin) return []
  // Retourne une copie pour éviter toute mutation partagée.
  return await import('@/lib/communicationTemplates').then((mod) =>
    mod.COMMUNICATION_TEMPLATES.map((template) => ({ ...template })),
  )
}

export type SendCommunicationInput = {
  /** Identifiants des utilisateurs ONA Field (observateurs/analystes). */
  recipientUserIds?: string[]
  /** Adresses externes (sans compte ONA Field). */
  recipientEmails?: string[]
  templateId?: string
  /** Objet final (pré-rempli depuis le template, modifiable). */
  subject: string
  /** Corps final TEXTE (pré-rempli depuis le template, modifiable). */
  body: string
  /** Message libre inséré dans `{message}`. */
  message?: string
  /** Projet/expérience pour les variables statistiques (optionnel). */
  projectId?: string
}

export type SendCommunicationResult =
  | { ok: true; successCount: number; failureCount: number; invalid: string[]; recipientCount: number }
  | { ok: false; error: string }

/**
 * Envoie une campagne de communication : un email individuel par destinataire.
 * Succès/échec comptés individuellement ; un échec n'annule jamais les autres.
 */
export async function sendCommunication(
  input: SendCommunicationInput,
): Promise<SendCommunicationResult> {
  const admin = await getCurrentAdmin()
  if (!admin) return { ok: false, error: 'Accès réservé aux administrateurs.' }

  // ——— Destinataires internes (emails + nom d'affichage) ———
  const userIds = (input?.recipientUserIds ?? []).filter((id): id is string => Boolean(id))
  const internal = new Map<string, { email: string; name: string }>()
  if (userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, username: true },
    })
    for (const user of users) {
      internal.set(user.id, { email: user.email, name: user.username?.trim() || user.email })
    }
  }
  const internalEmails = Array.from(internal.values()).map((entry) => entry.email)

  // ——— Fusion + normalisation + déduplication ———
  const { valid, invalid } = normalizeRecipientEmails([
    ...internalEmails,
    ...(input?.recipientEmails ?? []).filter((email): email is string => Boolean(email)),
  ])
  if (valid.length === 0) {
    return { ok: false, error: 'Aucun destinataire valide.' }
  }

  const subject = (input?.subject ?? '').trim()
  const body = (input?.body ?? '').trim()
  if (!subject) return { ok: false, error: 'L’objet de l’email est requis.' }

  // ——— Contexte de campagne (projet + statistiques issues du moteur analytique) ———
  const campaignContext: CommunicationVariableContext = {
    ...baseVariables({}),
    message: input?.message ?? '',
  }
  if (input?.projectId) {
    const view = await resolveAnalyticsView(input.projectId, null, null)
    if (view) {
      campaignContext.projectName = view.config.projectTitle
      campaignContext.experienceName = view.config.projectTitle
      campaignContext.observationCount = String(view.metrics.rawCaptureCount)
      campaignContext.average =
        view.metrics.averageDetectionDelay !== null
          ? `${view.metrics.averageDetectionDelay}s`
          : ''
      campaignContext.completionRate =
        view.metrics.detectionProbability !== null
          ? `${Math.round(view.metrics.detectionProbability * 100)}%`
          : ''
    }
  }

  // ——— Un email par destinataire ———
  let successCount = 0
  let failureCount = 0
  for (const email of valid) {
    const observerName = Array.from(internal.values()).find((entry) => entry.email === email)?.name ?? ''
    const perRecipient: CommunicationVariableContext = {
      ...campaignContext,
      ...baseVariables({ observerName, recipientEmail: email }),
    }
    const renderedSubject = renderTemplateVariables(subject, perRecipient)
    const renderedBody = renderTemplateVariables(body, perRecipient)
    const result = await sendRawEmail({
      to: email,
      subject: renderedSubject,
      html: renderPlainTextEmailHtml(renderedBody),
      auditKind: input?.templateId ?? 'MESSAGE',
      actorId: admin.uid,
    })
    if (result.ok) successCount += 1
    else failureCount += 1
  }

  // ——— Historique (résumé uniquement, jamais le contenu ni les adresses) ———
  await prisma.communication.create({
    data: {
      authorId: admin.uid,
      subject,
      templateId: input?.templateId ?? null,
      recipientCount: valid.length,
      successCount,
      failureCount,
    },
  })

  await recordAudit({
    userId: admin.uid,
    action: AUDIT_ACTIONS.emailSent,
    entityType: 'export',
    entityId: 'communication',
    metadata: {
      templateId: input?.templateId ?? null,
      subject,
      recipientCount: valid.length,
      successCount,
      failureCount,
    },
  })

  revalidatePath('/admin')

  return { ok: true, successCount, failureCount, invalid, recipientCount: valid.length }
}

/** Ligne d'historique de communication. */
export type CommunicationRow = {
  id: string
  authorLabel: string
  subject: string
  templateId: string | null
  recipientCount: number
  successCount: number
  failureCount: number
  createdAt: string
}

/** Historique des campagnes (ADMIN uniquement). */
export async function listCommunications(): Promise<CommunicationRow[]> {
  const admin = await getCurrentAdmin()
  if (!admin) return []
  const rows = await prisma.communication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { author: { select: { username: true, email: true } } },
  })
  return rows.map((row) => ({
    id: row.id,
    authorLabel: row.author?.username?.trim() || row.author?.email || '—',
    subject: row.subject,
    templateId: row.templateId,
    recipientCount: row.recipientCount,
    successCount: row.successCount,
    failureCount: row.failureCount,
    createdAt: row.createdAt.toISOString(),
  }))
}
