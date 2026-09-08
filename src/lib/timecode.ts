/**
 * Helpers de conversion entre les saisies `MM:SS` / `HH:MM:SS` des formulaires
 * de fenêtres temporelles et les secondes entières attendues par les actions
 * serveur (`addProjectPoint`, `addWindowToProject`, …). Utilitaires purs — la
 * validation côté serveur (secondes entières, `fin >= début`) reste inchangée.
 */

/** Convertit une saisie `MM:SS` (ou `HH:MM:SS`, `M:SS`, secondes brutes) en secondes entières. */
export function parseTimecodeToSeconds(input: string): number | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (!value) return null

  // Secondes brutes : "123" ou "45"
  if (/^\d+$/.test(value)) {
    const seconds = Number(value)
    return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null
  }

  const parts = value.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every((part) => /^\d+$/.test(part))) return null

  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isSafeInteger(n))) return null
  // Le dernier segment est toujours les secondes (≤ 59) ; dans `HH:MM:SS`,
  // le segment médian est les minutes (≤ 59). Les minutes d'un `MM:SS` sont libres.
  if (nums[nums.length - 1] > 59) return null
  if (parts.length === 3 && nums[1] > 59) return null

  const total =
    parts.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1]
  return Number.isSafeInteger(total) && total >= 0 ? total : null
}

/** Formate des secondes en `MM:SS` (ou `HH:MM:SS` au-delà d'une heure). */
export function secondsToTimecode(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds,
    ).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Valide une paire de bornes : les deux se convertissent et `début < fin`. */
export function isTimecodePairValid(start: string, end: string): boolean {
  const a = parseTimecodeToSeconds(start)
  const b = parseTimecodeToSeconds(end)
  return a !== null && b !== null && a < b
}
