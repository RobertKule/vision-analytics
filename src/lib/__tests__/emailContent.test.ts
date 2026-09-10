import { describe, expect, it } from 'vitest'
import {
  EMAIL_SENDER_NAME,
  emailFrom,
  emailHtml,
  emailSubject,
  shareLink,
  type EmailKind,
} from '@/lib/emailContent'

/**
 * PARTIE W/Y — CONTENU DES EMAILS (noyau PUR).
 *
 * Règles : expéditeur = « ONA Field », objet CLAIR (jamais générique), contenu
 * professionnel lisible, aucun secret ni jeton brut (sauf le lien d'invitation).
 */

describe('identité d’expéditeur (Partie E)', () => {
  it('le nom d’expéditeur est toujours « ONA Field »', () => {
    expect(EMAIL_SENDER_NAME).toBe('ONA Field')
  })

  it('la ligne « From » porte le nom + l’adresse réelle', () => {
    expect(emailFrom('noreply@domaine.com')).toBe('ONA Field <noreply@domaine.com>')
  })

  it('sans adresse, on retombe sur le nom seul', () => {
    expect(emailFrom('')).toBe('ONA Field')
  })
})

describe('objets des emails (Partie F)', () => {
  const cases: Array<[EmailKind, string]> = [
    ['ANALYST_PENDING', 'Votre demande de compte ONA Field est en attente'],
    ['ANALYST_APPROVED', 'Votre compte ONA Field a été approuvé'],
    ['ANALYST_REJECTED', 'Votre demande de compte ONA Field a été refusée'],
    ['EXPERIENCE_SHARED', 'Une expérience ONA Field vous a été partagée'],
    ['OBSERVER_PART_SUBMITTED', 'Une partie de votre session ONA Field a été envoyée'],
    ['OBSERVER_SESSION_COMPLETED', 'Votre session d’observation ONA Field est terminée'],
    ['OBSERVER_REACTIVATION_REQUESTED', 'Votre demande de réactivation ONA Field a été reçue'],
    ['OBSERVER_REACTIVATION_APPROVED', 'Votre accès ONA Field a été réactivé'],
    ['OBSERVER_REACTIVATION_REJECTED', 'Votre demande de réactivation ONA Field a été refusée'],
    ['ADMIN_ACCOUNT_REQUEST', 'Nouvelle demande de compte analyste sur ONA Field'],
    ['ADMIN_REACTIVATION_REQUEST', 'Demande de réactivation d’un observateur sur ONA Field'],
  ]
  it.each(cases)('%s → objet explicite', (kind, expected) => {
    expect(emailSubject(kind)).toBe(expected)
  })

  it('invitation : l’objet contient le nom du projet', () => {
    expect(emailSubject('OBSERVER_INVITATION', { projectTitle: 'Virunga' })).toBe(
      'Votre accès au projet Virunga sur ONA Field',
    )
  })

  it('aucun objet générique (« Notification », « Message », « ONA Field » seul)', () => {
    for (const kind of [
      'ANALYST_PENDING',
      'ANALYST_APPROVED',
      'EXPERIENCE_SHARED',
      'OBSERVER_INVITATION',
    ] as EmailKind[]) {
      const subject = emailSubject(kind, { projectTitle: 'X' })
      expect(subject).not.toBe('Notification')
      expect(subject).not.toBe('Message')
      expect(subject).not.toBe('ONA Field')
    }
  })
})

describe('lien d’accès personnel (Partie H/P)', () => {
  it('construit le lien /share/<token> sans révéler le token séparément', () => {
    expect(shareLink('https://onafield.example.com', 'abc123')).toBe(
      'https://onafield.example.com/share/abc123',
    )
    expect(shareLink('https://onafield.example.com/', 'abc123')).toBe(
      'https://onafield.example.com/share/abc123',
    )
  })
})

describe('contenu HTML (Partie G/Y)', () => {
  it('contient la marque, un bouton pour l’invitation et la signature', () => {
    const html = emailHtml('OBSERVER_INVITATION', {
      projectTitle: 'Virunga',
      baseUrl: 'https://onafield.example.com',
      rawToken: 'tok_123',
      recipientName: 'Robert',
    })
    expect(html).toContain('ONA Field')
    expect(html).toContain('Accéder à ma session')
    expect(html).toContain('/share/tok_123')
    expect(html).toContain('Scientific Observation Platform')
    expect(html).toContain('Bonjour Robert')
  })

  it('le jeton brut n’apparaît que dans le lien, jamais ailleurs', () => {
    const html = emailHtml('OBSERVER_INVITATION', {
      baseUrl: 'https://onafield.example.com',
      rawToken: 'tok_secret',
    })
    // Le token apparaît dans l'URL, mais jamais comme texte nu séparé.
    expect(html).toContain('https://onafield.example.com/share/tok_secret')
    expect(html).not.toContain('tok_secret</')
    expect(html).not.toContain('>tok_secret<')
  })

  it('un email sans invitation ne contient ni lien ni jeton', () => {
    const html = emailHtml('ANALYST_APPROVED', {})
    expect(html).not.toContain('/share/')
    expect(html).not.toContain('tok_')
  })

  it('reste lisible sur mobile (aucune largeur fixe trop grande)', () => {
    const html = emailHtml('EXPERIENCE_SHARED', {})
    expect(html).not.toMatch(/width:\s*\d{4,}px/)
    expect(html).toContain('max-width:560px')
  })
})
