import { cookies } from 'next/headers'
import { LOCALE_COOKIE, parseLocale, type Locale } from '@/lib/i18n'

/**
 * Renvoie la langue active depuis le cookie `va_locale` (côté serveur).
 * À utiliser dans les Server Components (layout, pages, metadata).
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  return parseLocale(store.get(LOCALE_COOKIE)?.value)
}
