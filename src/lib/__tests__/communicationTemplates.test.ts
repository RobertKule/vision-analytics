import { describe, expect, it } from 'vitest'
import {
  COMMUNICATION_TEMPLATES,
  baseVariables,
  getCommunicationTemplate,
  isValidRecipientEmail,
  normalizeRecipientEmail,
  normalizeRecipientEmails,
  renderTemplateVariables,
} from '@/lib/communicationTemplates'
import { renderPlainTextEmailHtml } from '@/lib/emailContent'

/**
 * MODULE COMMUNICATION — templates + destinataires + variables (noyau PUR).
 */

describe('validation et normalisation d’adresse email', () => {
  it('normalise en minuscules sans espaces', () => {
    expect(normalizeRecipientEmail('  Robert@Example.com ')).toBe('robert@example.com')
  })

  it('valide une adresse simple et rejette une adresse invalide', () => {
    expect(isValidRecipientEmail('chercheur@universite.fr')).toBe(true)
    expect(isValidRecipientEmail('pas-une-adresse')).toBe(false)
    expect(isValidRecipientEmail('')).toBe(false)
    expect(isValidRecipientEmail('a@b')).toBe(false)
  })
})

describe('déduplication + mélange internes/externes', () => {
  it('déduplique les adresses en double (casse comprise)', () => {
    const result = normalizeRecipientEmails([
      'marie@example.com',
      'Marie@Example.com',
      'jean@example.com',
    ])
    expect(result.valid).toEqual(['marie@example.com', 'jean@example.com'])
  })

  it('une adresse invalide n’annule pas les adresses valides', () => {
    const result = normalizeRecipientEmails(['ok@example.com', 'invalide', 'autre@example.com'])
    expect(result.valid).toEqual(['ok@example.com', 'autre@example.com'])
    expect(result.invalid).toEqual(['invalide'])
  })

  it('chaque destinataire distinct reçoit un email distinct (liste plate, sans groupement)', () => {
    const result = normalizeRecipientEmails(['a@x.fr', 'b@x.fr', 'c@x.fr'])
    expect(result.valid).toHaveLength(3)
    expect(new Set(result.valid).size).toBe(3)
  })
})

describe('templates prédéfinis', () => {
  it('expose les 5 templates attendus', () => {
    const ids = COMMUNICATION_TEMPLATES.map((t) => t.id)
    expect(ids).toContain('invitation')
    expect(ids).toContain('thanks')
    expect(ids).toContain('session-update')
    expect(ids).toContain('observation-question')
    expect(ids).toContain('free')
  })

  it('retrouve un template par identifiant, null sinon', () => {
    expect(getCommunicationTemplate('thanks')?.name).toBe('Merci pour votre participation')
    expect(getCommunicationTemplate('inconnu')).toBeNull()
  })

  it('le template source reste INCHANGÉ après personnalisation (copie modifiée)', () => {
    const template = getCommunicationTemplate('invitation')!
    const original = template.body
    // Simule la personnalisation admin sur une COPIE.
    const customized = { ...template, body: template.body + '\n\nMerci particulièrement.' }
    expect(customized.body).not.toBe(original)
    expect(template.body).toBe(original)
  })
})

describe('rendu des variables', () => {
  it('remplace les variables présentes', () => {
    const rendered = renderTemplateVariables('Projet {projectName} · {message}', {
      projectName: 'Virunga',
      message: 'Bonjour !',
    })
    expect(rendered).toBe('Projet Virunga · Bonjour !')
  })

  it('une variable ABSENTE est remplacée par une chaîne VIDE (jamais undefined/null)', () => {
    const rendered = renderTemplateVariables('X={missing} Y={alsoMissing}', {})
    expect(rendered).toBe('X= Y=')
    expect(rendered).not.toContain('undefined')
    expect(rendered).not.toContain('null')
    expect(rendered).not.toContain('[object Object]')
  })

  it('une valeur nulle est traitée comme vide', () => {
    expect(renderTemplateVariables('{v}', { v: null })).toBe('')
  })

  it('les variables d’identité sont disponibles via baseVariables', () => {
    const ctx = baseVariables({ observerName: 'Marie', recipientEmail: 'marie@x.fr' })
    expect(renderTemplateVariables('{observerName} / {recipientEmail}', ctx)).toBe(
      'Marie / marie@x.fr',
    )
  })
})

describe('HTML des emails', () => {
  it('échappe le HTML injecté (aucun balisage exécutable)', () => {
    const html = renderPlainTextEmailHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('ne fabrique aucun lien automatiquement et ne contient aucun token', () => {
    const html = renderPlainTextEmailHtml('Merci pour votre participation\n\nLigne deux')
    expect(html).toContain('ONA Field')
    expect(html).not.toContain('href=')
    expect(html).not.toContain('/share/')
  })

  it('conserve l’identité ONA Field et reste lisible mobile', () => {
    const html = renderPlainTextEmailHtml('Bonjour')
    expect(html).toContain('ONA Field')
    expect(html).toContain('max-width:560px')
  })
})
