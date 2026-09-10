/**
 * SERVICE EMAIL CENTRALISÉ (Resend) — côté serveur UNIQUEMENT.
 *
 * Tous les emails transactionnels d'ONA Field partent d'ici : AUCUN envoi n'est
 * dispersé dans les composants React. L'identité d'expéditeur est TOUJOURS
 * « ONA Field » et l'objet/le contenu viennent du module PUR `emailContent`.
 *
 *  - `RESEND_API_KEY` reste côté serveur (jamais exposé, jamais loggé) ;
 *  - aucun secret, mot de passe, jeton brut ou clé privée dans les emails ;
 *  - le jeton brut n'apparaît QUE dans le lien d'invitation, jamais séparément ;
 *  - l'envoi est « best effort » : un échec ne casse pas l'action métier, il est
 *    journalisé (EMAIL_SENT / EMAIL_FAILED).
 *
 * Abstraction de canal : `sendEmail` est le seul point d'envoi. L'ajout futur d'un
 * canal WhatsApp ne nécessitera pas de modifier les actions métier — elles passent
 * toutes par `notify()` / `sendEmail()`.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import { emailFrom, emailHtml, emailSubject, type EmailContext, type EmailKind } from '@/lib/emailContent'

const RESEND_API_URL = 'https://api.resend.com/emails'

/** Adresse d'expéditeur configurée (ex. noreply@domaine.com) ; '' si absente. */
function configuredFromAddress(): string {
  return (process.env.EMAIL_FROM ?? '').trim()
}

/** Base publique de l'application (pour les liens) ; repli local en dev. */
export function appBaseUrl(): string {
  const configured = (process.env.APP_URL ?? '').trim()
  if (configured) return configured
  return process.env.NODE_ENV === 'production'
    ? 'https://onafield.example.com'
    : 'http://localhost:3000'
}

/** Vrai si l'envoi d'email est configuré (clé + expéditeur présents). */
export function isEmailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY ?? '').trim() && configuredFromAddress())
}

export type SendEmailResult = { ok: true } | { ok: false; reason: 'unconfigured' | 'failed' }

/** Envoi Resend unique (POST + audit), partagé par `sendEmail` et `sendRawEmail`. */
async function postEmail(input: {
  to: string
  subject: string
  html: string
  actorId?: string | null
  auditKind: string
}): Promise<SendEmailResult> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
  const fromAddress = configuredFromAddress()

  if (!apiKey || !fromAddress) {
    console.warn('[email] Envoi ignoré : RESEND_API_KEY ou EMAIL_FROM manquant.')
    return { ok: false, reason: 'unconfigured' }
  }

  const replyTo = (process.env.EMAIL_REPLY_TO ?? '').trim() || undefined

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom(fromAddress),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    if (!response.ok) {
      // Le corps peut contenir des détails d'erreur Resend — jamais loggé tel quel.
      console.error('[email] Resend a refusé l’envoi : HTTP', response.status)
      await recordAudit({
        userId: input.actorId ?? null,
        action: AUDIT_ACTIONS.emailFailed,
        entityType: 'export',
        entityId: input.auditKind,
        metadata: { kind: input.auditKind, to: input.to },
      })
      return { ok: false, reason: 'failed' }
    }

    await recordAudit({
      userId: input.actorId ?? null,
      action: AUDIT_ACTIONS.emailSent,
      entityType: 'export',
      entityId: input.auditKind,
      metadata: { kind: input.auditKind, to: input.to, subject: input.subject },
    })
    return { ok: true }
  } catch (error) {
    console.error('[email] Échec d’envoi réseau :', error)
    await recordAudit({
      userId: input.actorId ?? null,
      action: AUDIT_ACTIONS.emailFailed,
      entityType: 'export',
      entityId: input.auditKind,
      metadata: { kind: input.auditKind, to: input.to },
    })
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Envoie un email transactionnel via Resend (fetch, aucune dépendance SDK).
 * L'expéditeur affiché est « ONA Field », l'objet et le corps viennent du module pur.
 */
export async function sendEmail(input: {
  kind: EmailKind
  to: string
  context?: EmailContext
  /** Acteur pour l'audit (email = pas de userId ciblé par défaut). */
  actorId?: string | null
}): Promise<SendEmailResult> {
  return postEmail({
    to: input.to,
    subject: emailSubject(input.kind, input.context),
    html: emailHtml(input.kind, input.context),
    actorId: input.actorId,
    auditKind: input.kind,
  })
}

/**
 * Envoie un email « libre » (objet + corps HTML fournis par l'appelant, ex. module
 * Communication admin). Même identité « ONA Field », même canal Resend, même audit.
 */
export async function sendRawEmail(input: {
  to: string
  subject: string
  html: string
  /** Identifiant du template de communication (audit). */
  auditKind?: string
  actorId?: string | null
}): Promise<SendEmailResult> {
  return postEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    actorId: input.actorId,
    auditKind: input.auditKind ?? 'MESSAGE',
  })
}

/** Compte l'utilisateur par identifiant (helper serveur partagé). */
export async function userEmailById(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  return user?.email ?? null
}
