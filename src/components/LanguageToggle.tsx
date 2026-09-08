'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n'

/**
 * Bascule de langue EN / FR.
 * Écrit le cookie `va_locale` puis rafraîchit l'arbre serveur : les Server
 * Components relisent la langue et retransmettent les dictionnaires traduits
 * aux composants clients (qui conservent leur état local).
 */
type LanguageToggleProps = {
  locale: Locale
  /** `mono` : variante monochrome écrue / ardoise pour les pages éditoriales. */
  variant?: 'default' | 'mono'
}

export default function LanguageToggle({ locale, variant = 'default' }: LanguageToggleProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const applyLocale = (next: Locale) => {
    if (next === locale) return
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    startTransition(() => router.refresh())
  }

  const buttonClass = (active: boolean) =>
    variant === 'mono'
      ? `inline-flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
          active
            ? 'bg-[#121417] text-[#FBF9F5] shadow-sm dark:bg-[#FBF9F5] dark:text-[#121417]'
            : 'text-[#4A4E57] hover:text-[#121417] dark:text-zinc-400 dark:hover:text-[#FBF9F5]'
        }`
      : `inline-flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
          active
            ? 'bg-forest-500 text-white shadow-sm'
            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
        }`

  const containerClass =
    variant === 'mono'
      ? 'inline-flex items-center gap-0.5 rounded-lg border border-[#121417]/15 bg-white/50 p-0.5 dark:border-white/15 dark:bg-white/5'
      : 'inline-flex items-center gap-0.5 rounded-lg border border-zinc-300 bg-white p-0.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900'

  return (
    <div
      role="group"
      aria-label="Language / Langue"
      className={`${containerClass} ${isPending ? 'opacity-70' : ''}`}
    >
      <button type="button" onClick={() => applyLocale('en')} className={buttonClass(locale === 'en')}>
        EN
      </button>
      <button type="button" onClick={() => applyLocale('fr')} className={buttonClass(locale === 'fr')}>
        FR
      </button>
    </div>
  )
}
