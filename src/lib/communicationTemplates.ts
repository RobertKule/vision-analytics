/**
 * TEMPLATES DE COMMUNICATION EMAIL — noyau PUR (aucun DOM, aucune I/O, testable).
 *
 * Module centralisé de templates prédéfinis pour l'espace ADMIN « Communication ».
 * Chaque template est une définition TypeScript statique (pas de CMS, pas de table) :
 * `subject` et `body` contiennent des variables `{variable}` remplacées à l'envoi.
 *
 * ─── RÈGLES ─────────────────────────────────────────────────────────────────
 *  — Une variable non disponible est remplacée par une chaîne VIDE (jamais
 *    « undefined », « null », ni « [object Object] »).
 *  — Aucun secret (mot de passe, clé API, cookie, token brut) dans les templates.
 *  — Un message de communication ne donne AUCUN droit d'accès : aucun lien de
 *    session/token n'est fabriqué pour une personne qui n'a pas déjà un accès
 *    autorisé (`{sessionLink}` / `{reactivationLink}` restent vides par défaut).
 */

/** Template de communication prédéfini. */
export type CommunicationTemplate = {
  id: string
  name: string
  subject: string
  body: string
  /** Variables documentées (toutes optionnelles à l'usage). */
  variables: string[]
}

/** Contexte de variables : clé → valeur (string). Une clé absente ⇒ vide. */
export type CommunicationVariableContext = Record<string, string | number | null | undefined>

/**
 * Remplace les occurrences `{variable}` d'un texte par les valeurs du contexte.
 * Une variable absente / nulle est remplacée par une chaîne vide — jamais un
 * libellé technique.
 */
export function renderTemplateVariables(
  text: string,
  context: CommunicationVariableContext,
): string {
  return (text ?? '').replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
    const value = context[key]
    if (value === undefined || value === null) return ''
    return String(value)
  })
}

/** Variables « identité » communes, disponibles dans tous les templates. */
export function baseVariables(input: {
  observerName?: string | null
  recipientEmail?: string | null
}): CommunicationVariableContext {
  return {
    observerName: input.observerName ?? '',
    recipientEmail: input.recipientEmail ?? '',
  }
}

const TEMPLATES: CommunicationTemplate[] = [
  {
    id: 'invitation',
    name: 'Invitation à participer',
    subject: 'Participez à cette expérience ONA Field',
    body: [
      'Bonjour,',
      '',
      'Nous vous invitons à participer à l’expérience {projectName} sur ONA Field.',
      '',
      '{message}',
      '',
      'Cordialement,',
      'ONA Field',
    ].join('\n'),
    variables: ['projectName', 'message'],
  },
  {
    id: 'thanks',
    name: 'Merci pour votre participation',
    subject: 'Merci pour votre participation à l’expérience ONA Field',
    body: [
      'Bonjour,',
      '',
      'Merci pour votre participation à l’expérience {projectName}.',
      '',
      'Nous avons reçu {observationCount} observations.',
      '',
      'Moyenne : {average}',
      'Taux de complétion : {completionRate}',
      '',
      'Merci pour votre contribution aux données scientifiques.',
      '',
      'Cordialement,',
      'ONA Field',
    ].join('\n'),
    variables: ['projectName', 'observationCount', 'average', 'completionRate'],
  },
  {
    id: 'session-update',
    name: 'Mise à jour d’une session',
    subject: 'Une mise à jour concerne votre session ONA Field',
    body: [
      'Bonjour,',
      '',
      'Une mise à jour a été effectuée concernant votre session ONA Field.',
      '',
      '{message}',
      '',
      'Merci de consulter votre accès ONA Field et, si nécessaire, de demander la réactivation de votre session.',
      '',
      'Cordialement,',
      'ONA Field',
    ].join('\n'),
    variables: ['message'],
  },
  {
    id: 'observation-question',
    name: 'Question concernant une observation',
    subject: 'Question concernant votre observation ONA Field',
    body: [
      'Bonjour,',
      '',
      'Nous avons une question concernant votre observation dans ONA Field :',
      '',
      '{message}',
      '',
      'Merci pour votre retour.',
      '',
      'Cordialement,',
      'ONA Field',
    ].join('\n'),
    variables: ['message'],
  },
  {
    id: 'free',
    name: 'Message libre',
    subject: '',
    body: '',
    variables: [],
  },
]

/** Tous les templates prédéfinis (ordre d'affichage stable). */
export const COMMUNICATION_TEMPLATES: readonly CommunicationTemplate[] = TEMPLATES

/** Retrouve un template par identifiant (null si inconnu). */
export function getCommunicationTemplate(id: string): CommunicationTemplate | null {
  return TEMPLATES.find((template) => template.id === id) ?? null
}

// ——— Destinataires ———

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Normalise une adresse (minuscule, espaces retirés). */
export function normalizeRecipientEmail(raw: string): string {
  return (raw ?? '').trim().toLowerCase()
}

/** Vrai si l'adresse est syntaxiquement valide. */
export function isValidRecipientEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(normalizeRecipientEmail(raw))
}

export type NormalizedRecipients = {
  /** Adresses valides, dédupliquées, normalisées. */
  valid: string[]
  /** Valeurs brutes invalides (signalées, sans bloquer les autres). */
  invalid: string[]
}

/**
 * Normalise + valide + déduplique une liste d'adresses (internes et/ou externes).
 * Une adresse invalide n'empêche jamais les adresses valides d'être traitées.
 */
export function normalizeRecipientEmails(inputs: readonly string[]): NormalizedRecipients {
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []
  for (const raw of inputs ?? []) {
    const email = normalizeRecipientEmail(raw)
    if (!isValidRecipientEmail(email)) {
      invalid.push((raw ?? '').trim())
      continue
    }
    if (seen.has(email)) continue
    seen.add(email)
    valid.push(email)
  }
  return { valid, invalid }
}
