/**
 * CONTENU DES EMAILS — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * Tous les emails d'ONA Field partagent une identité d'expéditeur unique et des
 * objets CLAIRS, courts et immédiatement compréhensibles (jamais « Notification »,
 * « Message » ou « ONA Field » générique). Le contenu est professionnel, simple,
 * lisible sur mobile, et ne contient JAMAIS de secret ni de jeton brut — sauf le
 * lien d'accès nécessaire, qui n'est présent QUE dans l'email d'invitation.
 */

/** Nom d'expéditeur affiché — cohérent sur TOUS les emails. */
export const EMAIL_SENDER_NAME = 'ONA Field'

/** Ligne « De : » affichée, construite à partir de l'adresse réelle configurée. */
export function emailFrom(address: string): string {
  const clean = (address ?? '').trim()
  return clean ? `${EMAIL_SENDER_NAME} <${clean}>` : EMAIL_SENDER_NAME
}

/** Lien d'accès personnel d'un jeton brut (jamais le jeton brut séparé). */
export function shareLink(baseUrl: string, rawToken: string): string {
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '')
  return `${base}/share/${encodeURIComponent(rawToken)}`
}

export type EmailKind =
  | 'ANALYST_PENDING'
  | 'ANALYST_APPROVED'
  | 'ANALYST_REJECTED'
  | 'EXPERIENCE_SHARED'
  | 'OBSERVER_INVITATION'
  | 'OBSERVER_PART_SUBMITTED'
  | 'OBSERVER_SESSION_COMPLETED'
  | 'OBSERVER_REACTIVATION_REQUESTED'
  | 'OBSERVER_REACTIVATION_APPROVED'
  | 'OBSERVER_REACTIVATION_REJECTED'
  | 'ADMIN_ACCOUNT_REQUEST'
  | 'ADMIN_REACTIVATION_REQUEST'

export type EmailContext = {
  projectTitle?: string
  recipientName?: string | null
  /** Base publique de l'application (ex. https://onafield.example.com). */
  baseUrl?: string
  /** Jeton brut d'invitation (UNIQUEMENT pour OBSERVER_INVITATION). */
  rawToken?: string
}

/**
 * Objet de l'email — clair et explicite, adapté au contexte.
 * (Partie F : chaque type a son objet propre.)
 */
export function emailSubject(kind: EmailKind, context: EmailContext = {}): string {
  const project = context.projectTitle?.trim()
  switch (kind) {
    case 'ANALYST_PENDING':
      return 'Votre demande de compte ONA Field est en attente'
    case 'ANALYST_APPROVED':
      return 'Votre compte ONA Field a été approuvé'
    case 'ANALYST_REJECTED':
      return 'Votre demande de compte ONA Field a été refusée'
    case 'EXPERIENCE_SHARED':
      return 'Une expérience ONA Field vous a été partagée'
    case 'OBSERVER_INVITATION':
      return project
        ? `Votre accès au projet ${project} sur ONA Field`
        : 'Votre accès à une session d’observation ONA Field'
    case 'OBSERVER_PART_SUBMITTED':
      return 'Une partie de votre session ONA Field a été envoyée'
    case 'OBSERVER_SESSION_COMPLETED':
      return 'Votre session d’observation ONA Field est terminée'
    case 'OBSERVER_REACTIVATION_REQUESTED':
      return 'Votre demande de réactivation ONA Field a été reçue'
    case 'OBSERVER_REACTIVATION_APPROVED':
      return 'Votre accès ONA Field a été réactivé'
    case 'OBSERVER_REACTIVATION_REJECTED':
      return 'Votre demande de réactivation ONA Field a été refusée'
    case 'ADMIN_ACCOUNT_REQUEST':
      return 'Nouvelle demande de compte analyste sur ONA Field'
    case 'ADMIN_REACTIVATION_REQUEST':
      return 'Demande de réactivation d’un observateur sur ONA Field'
  }
}

/** Pied de signature commun à tous les emails. */
function signature(): string {
  return 'Cordialement,<br/><strong>ONA Field</strong><br/>Scientific Observation Platform'
}

/**
 * Corps HTML de l'email (structure simple, professionnelle, lisible sur mobile).
 */
export function emailHtml(kind: EmailKind, context: EmailContext = {}): string {
  const project = context.projectTitle?.trim() ?? 'ce projet'
  const name = context.recipientName?.trim() ?? ''
  const hello = name ? `Bonjour ${name},` : 'Bonjour,'

  let body = ''
  let action: { label: string; href: string } | null = null

  switch (kind) {
    case 'ANALYST_PENDING':
      body = 'Votre demande de compte analyste a bien été reçue. Un administrateur va la valider avant votre première connexion.'
      break
    case 'ANALYST_APPROVED':
      body = 'Votre compte analyste a été approuvé. Vous pouvez désormais vous connecter à ONA Field et créer vos expériences.'
      break
    case 'ANALYST_REJECTED':
      body = 'Votre demande de compte analyste a été refusée. Contactez l’administrateur de votre organisation pour plus d’informations.'
      break
    case 'EXPERIENCE_SHARED':
      body = `Une expérience a été partagée avec vous : « ${project} ».`
      break
    case 'OBSERVER_INVITATION': {
      const link = context.rawToken && context.baseUrl ? shareLink(context.baseUrl, context.rawToken) : ''
      body = `Vous avez été invité à participer à une session d’observation sur le projet « ${project} » avec ONA Field.`
      action = link ? { label: 'Accéder à ma session', href: link } : null
      break
    }
    case 'OBSERVER_PART_SUBMITTED':
      body = `Une partie de votre session d’observation sur « ${project} » a été envoyée. Votre session reste active : vous pouvez poursuivre les parties restantes.`
      break
    case 'OBSERVER_SESSION_COMPLETED':
      body = `Votre session d’observation sur « ${project} » est terminée. Vos captures ont été enregistrées et le projet est désormais en lecture seule.`
      break
    case 'OBSERVER_REACTIVATION_REQUESTED':
      body = 'Votre demande de réactivation a été reçue. Un administrateur doit confirmer votre accès.'
      break
    case 'OBSERVER_REACTIVATION_APPROVED':
      body = 'Votre accès a été réactivé. Vous pouvez reprendre votre session d’observation.'
      break
    case 'OBSERVER_REACTIVATION_REJECTED':
      body = 'Votre demande de réactivation n’a pas été approuvée.'
      break
    case 'ADMIN_ACCOUNT_REQUEST':
      body = 'Une nouvelle demande de compte analyste attend votre validation.'
      break
    case 'ADMIN_REACTIVATION_REQUEST':
      body = `Un observateur a demandé la réactivation de son accès sur « ${project} ».`
      break
  }

  const actionHtml = action
    ? `<a href="${action.href}" style="display:inline-block;padding:12px 20px;background:#121417;color:#FBF9F5;border-radius:8px;text-decoration:none;font-weight:600;">${action.label}</a>`
    : ''

  const inviteNote =
    kind === 'OBSERVER_INVITATION'
      ? '<p style="color:#8C8275;font-size:13px;">Ce lien est personnel et ne doit pas être partagé.</p>'
      : ''

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#121417;">`
    + `<p style="font-size:13px;font-weight:700;letter-spacing:0.08em;color:#BD8F2E;">ONA Field</p>`
    + `<p>${hello}</p><p>${body}</p>`
    + (actionHtml ? `<p style="margin:20px 0;">${actionHtml}</p>` : '')
    + inviteNote
    + `<p style="margin-top:24px;color:#4A4E57;font-size:13px;">${signature()}</p>`
    + `</div>`
}
