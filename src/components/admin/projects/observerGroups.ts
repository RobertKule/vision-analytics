import type { ProjectObservationRowDto } from '@/lib/types'
import { observerLabelOf } from '@/lib/exportHelpers'

export type ObserverGroup = {
  observerId: string
  label: string
  email: string | null
  anonymousId: string
  count: number
  validCount: number
  ghostCount: number
  firstAt: string
  lastAt: string
}

/** Regroupe des observations à plat par observateur (toutes sessions soumises = « Actif »). */
export function buildObserverGroups(rows: ProjectObservationRowDto[]): ObserverGroup[] {
  const map = new Map<string, ObserverGroup>()

  for (const row of rows) {
    if (!row.observerId) continue
    let group = map.get(row.observerId)
    if (!group) {
      group = {
        observerId: row.observerId,
        label: observerLabelOf(row),
        email: row.observerEmail,
        anonymousId: row.observerAnonymousId,
        count: 0,
        validCount: 0,
        ghostCount: 0,
        firstAt: row.createdAt,
        lastAt: row.createdAt,
      }
      map.set(row.observerId, group)
    }
    group.count += 1
    if (row.isGhostPoint) group.ghostCount += 1
    else group.validCount += 1
    if (row.createdAt < group.firstAt) group.firstAt = row.createdAt
    if (row.createdAt > group.lastAt) group.lastAt = row.createdAt
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}
