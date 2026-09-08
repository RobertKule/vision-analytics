import Link from 'next/link'
import Image from 'next/image'
import { Eye, LayoutDashboard, LogIn, ShieldCheck } from 'lucide-react'
import { getCurrentAdmin } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { homeForRole } from '@/lib/navigation'
import LanguageToggle from '@/components/LanguageToggle'
import ThemeToggle from '@/components/ThemeToggle'
import LogoutButton from '@/components/LogoutButton'

/**
 * Barre de navigation globale (serveur).
 *
 * L'état « visiteur / connecté » et la langue (`va_locale`) sont résolus
 * côté serveur à partir des cookies : aucune bascule côté client, aucun flash.
 */
export default async function Navbar() {
  const session = await getCurrentAdmin()
  const locale = await getLocale()
  const d = getDictionary(locale)
  const t = d.nav
  const workspaceHref = session ? homeForRole(session.role) : null

  const roleBadgeClass =
    session?.role === 'ADMIN'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
      : session?.role === 'ANALYST'
        ? 'bg-mist-500/15 text-mist-700 dark:text-mist-400'
        : 'bg-forest-500/15 text-forest-700 dark:text-forest-400'

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d1117]/80">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
      >
        {/* ——— Marque ——— */}
        <Link
          href="/"
          className="group inline-flex shrink-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500/60"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-forest-500/30 transition-transform group-hover:scale-105">
            <Image
              src="/Parc National des Virunga.png"
              alt="Parc National des Virunga"
              width={40}
              height={40}
              className="h-7 w-7 object-contain"
            />
          </span>
          <span className="hidden text-sm font-bold tracking-tight text-zinc-900 sm:inline dark:text-zinc-50">
            Vision Analytics
          </span>
        </Link>

        {/* ——— Liens centraux (desktop) ——— */}
        <div className="hidden items-center gap-1 md:flex">
          <Link
            href="/observe"
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-forest-50 hover:text-forest-700 dark:text-zinc-300 dark:hover:bg-forest-500/10 dark:hover:text-forest-400"
          >
            {t.observe}
          </Link>
          {session && workspaceHref ? (
            <Link
              href={workspaceHref}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-forest-50 hover:text-forest-700 dark:text-zinc-300 dark:hover:bg-forest-500/10 dark:hover:text-forest-400"
            >
              <LayoutDashboard aria-hidden="true" className="h-3.5 w-3.5" />
              {t.dashboard}
            </Link>
          ) : null}
        </div>

        {/* ——— Actions (droite) ——— */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Raccourci mobile vers les expériences */}
          <Link
            href="/observe"
            aria-label={t.mobileObserveAria}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 md:hidden"
          >
            <Eye aria-hidden="true" className="h-4 w-4" />
          </Link>

          <LanguageToggle locale={locale} />

          {session ? (
            <>
              <span
                className="hidden max-w-[16rem] items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-1 pr-2 sm:inline-flex dark:border-white/10 dark:bg-white/5"
                title={session.email}
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass}`}
                >
                  <ShieldCheck aria-hidden="true" className="h-3 w-3" />
                  {d.roles[session.role]}
                </span>
                <span className="max-w-[10rem] truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  {session.username || session.email}
                </span>
              </span>
              <LogoutButton
                label={t.logout}
                pendingLabel={t.logoutPending}
                title={t.logout}
              />
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-forest-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-forest-500 sm:px-4 sm:text-sm"
            >
              <LogIn aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>{t.login}</span>
            </Link>
          )}

          <ThemeToggle
            ariaLabel={t.themeAria}
            title={t.themeAria}
            darkToast={t.themeDarkToast}
            lightToast={t.themeLightToast}
            toastDesc={t.themeToastDesc}
          />
        </div>
      </nav>
    </header>
  )
}
