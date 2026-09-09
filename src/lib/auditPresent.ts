/**
 * Présentation des lignes du journal d'audit (filtrage des métadonnées,
 * ton des actions, formatage des dates). Ne contient aucun secret : les
 * métadonnées stockées excluent déjà mots de passe, jetons et tokens.
 */

import type { AuditMetadata } from '@/lib/audit'
import type { Locale } from '@/lib/i18n'

/** Métadonnées redondantes ou trop internes pour l'affichage. */
const HIDDEN_KEYS = new Set([
  'projectId',
  'title',
  'fields',
  'types',
  'windowAdded',
  'windowRemoved',
  'code',
  'id',
])

function clamp(value: string): string {
  return value.length > 26 ? `${value.slice(0, 26)}…` : value
}

function formatValue(key: string, value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (typeof value === 'number') return String(value)
  if (key === 'role') return value
  return clamp(value)
}

/** Puces « clé : valeur » à partir des métadonnées utiles de la ligne. */
export function auditDetailChips(metadata: AuditMetadata, limit = 6): string[] {
  const chips: string[] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue
    if (HIDDEN_KEYS.has(key)) continue
    if (typeof value === 'object') continue
    chips.push(`${key} : ${formatValue(key, value as string | number | boolean)}`)
    if (chips.length >= limit) break
  }
  return chips
}

/** Actions « à retenir » : échecs, suppressions, désactivations, retraits. */
export function isDestructiveAuditAction(action: string): boolean {
  if (action.endsWith('_FAILURE')) return true
  return (
    action === 'USER_DELETED' ||
    action === 'USER_DEACTIVATED' ||
    action === 'PROJECT_ARCHIVED' ||
    action === 'PROJECT_DELETED' ||
    action === 'VIDEO_REMOVED'
  )
}

/** Date affichée localisée, ex. « 08 sept. 2026, 14:32 ». */
export function auditDateLabel(iso: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Nom d'affichage d'un acteur (username → email → identifiant anonyme). */
export function auditActorName(actor: {
  username: string | null
  email: string | null
  anonymousId: string | null
} | null): string | null {
  if (!actor) return null
  return actor.username?.trim() || actor.email?.trim() || actor.anonymousId?.trim() || null
}
