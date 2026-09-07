'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

/**
 * Bouton de bascule Dark / Light.
 *
 * Les deux icônes sont rendues en permanence et affichées via les variantes
 * CSS `dark:` (la classe `.dark` est posée sur <html> par next-themes).
 * → aucune bascule côté état React, donc aucun risque d'hydration mismatch
 *   ni de rendu en cascade après montage.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  const toggleTheme = () => {
    const target = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(target)
    toast.info(target === 'dark' ? 'Mode sombre activé' : 'Mode clair activé', {
      description: 'Votre préférence est enregistrée pour cette session.',
    })
  }

  return (
    <button
      type="button"
      aria-label="Changer de thème (clair / sombre)"
      title="Changer de thème (clair / sombre)"
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-600 shadow-sm transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
    >
      {/* En mode sombre : proposer Sun (→ clair). En mode clair : proposer Moon (→ sombre). */}
      <Sun aria-hidden="true" className="hidden h-4 w-4 dark:block" />
      <Moon aria-hidden="true" className="h-4 w-4 dark:hidden" />
    </button>
  )
}
