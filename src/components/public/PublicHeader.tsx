import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Lock } from 'lucide-react'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { homeForRole } from '@/lib/navigation'
import LanguageToggle from '@/components/LanguageToggle'
import ThemeToggle from '@/components/ThemeToggle'

/**
 * En-tête éditorial des pages publiques (milk cream / dark charcoal).
 * Marque officielle Virunga + bascule thème (Sun/Moon) et langue (EN/FR).
 * Sert de navigation unique pour TOUTES les routes publiques (`(public)`).
 */
export default async function PublicHeader() {
  const session = await getCurrentSession()
  const locale = await getLocale()
  const t = getDictionary(locale).home

  const navLink =
    'text-sm font-medium text-[#4A4E57] transition-colors hover:text-[#121417] dark:text-zinc-400 dark:hover:text-[#FBF9F5]'

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E5E0D8] bg-[#FBF9F5]/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0D1117]/85">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
      >
        {/* ——— Marque officielle Virunga ——— */}
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-[#121417]/10 transition-shadow group-hover:ring-[#121417]/25 dark:ring-white/15">
            <Image
              src="/Parc National des Virunga.png"
              alt="Parc National des Virunga"
              width={40}
              height={40}
              priority
              className="h-8 w-8 object-contain"
            />
          </span>
          <span className="flex min-w-0 items-center gap-2 text-base font-bold tracking-tight text-[#121417] dark:text-[#FBF9F5]">
            <span className="truncate">ONA Field</span>
            <span className="hidden rounded border border-[#121417]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4A4E57] sm:inline dark:border-white/15 dark:text-zinc-400">
              LAB
            </span>
          </span>
        </Link>

        {/* ——— Liens centraux (desktop) ——— */}
        <nav className="hidden items-center gap-7 md:flex" aria-label="Liens publics">
          <Link href="/" className={navLink}>
            {t.navHome}
          </Link>
          <Link href="/observe" className={`${navLink} inline-flex items-center gap-1.5`}>
            <span className="h-2 w-2 rounded-full bg-[#121417] dark:bg-[#FBF9F5]" aria-hidden="true" />
            {t.navExperiments}
          </Link>
          <Link href="/docs" className={`${navLink} underline decoration-[#121417]/25 decoration-1 underline-offset-4 hover:decoration-[#121417] dark:decoration-white/25 dark:hover:decoration-[#FBF9F5]`}>
            {t.navDocs}
          </Link>
        </nav>

        {/* ——— Actions (droite) : langue, thème, compte ——— */}
        <div className="flex shrink-0 items-center gap-2.5">
          <LanguageToggle locale={locale} variant="mono" />
          <ThemeToggle />

          {session ? (
            <Link
              href={homeForRole(session.role)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#121417] px-3.5 text-xs font-semibold text-[#FBF9F5] shadow-sm transition-all hover:bg-[#2D3139] sm:px-4 sm:text-sm dark:bg-[#FBF9F5] dark:text-[#121417] dark:hover:bg-white/90"
            >
              <span className="hidden sm:inline">{t.mySpace}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#121417]/20 bg-transparent px-3 text-xs font-semibold text-[#121417] transition-colors hover:bg-[#121417]/5 sm:px-4 sm:text-sm dark:border-white/20 dark:text-[#FBF9F5] dark:hover:bg-white/10"
            >
              <Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{t.loginCta}</span>
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
