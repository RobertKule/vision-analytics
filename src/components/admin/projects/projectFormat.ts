/**
 * Helpers d'affichage partagés de l'espace administrateur « Projets ».
 * Fonctions pures (aucun hook) : sûres en composant client comme en route serveur.
 */

export const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

export const labelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'

/** Date courte française (ex. 14 juil. 2026). */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Date et heure françaises (ex. 14 juil. 2026, 09:05). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Durée en secondes sous forme lisible (ex. 1 min 05 s). */
export function formatWindow(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes} min ${String(rest).padStart(2, '0')} s`
}

/** Horodatage vidéo mm:ss (pour le temps de capture). */
export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Copie du texte dans le presse-papiers avec repli pour les contextes non sécurisés. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* bascule sur le repli textarea */
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
