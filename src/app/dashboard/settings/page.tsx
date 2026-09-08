import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Languages, Moon, Settings as SettingsIcon, UserRound } from 'lucide-react'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import LanguageToggle from '@/components/LanguageToggle'
import ThemeToggle from '@/components/ThemeToggle'
import LogoutButton from '@/components/LogoutButton'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'Settings' : 'Paramètres',
  }
}

export default async function SettingsPage() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')

  const locale = await getLocale()
  const d = getDictionary(locale)
  const t = d.shell
  const nav = d.nav

  const cardClass = 'rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]'

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-forest-600 dark:text-forest-400">
          <SettingsIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {t.settings}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t.settings}
        </h1>
      </header>

      <div className="flex flex-col gap-5">
        {/* ——— Profil ——— */}
        <section className={cardClass}>
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
            <UserRound aria-hidden="true" className="h-4 w-4 text-forest-600 dark:text-forest-400" />
            {locale === 'en' ? 'Account' : 'Compte'}
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {session.username ? (locale === 'en' ? 'Username' : 'Nom d’utilisateur') : 'Email'}
              </dt>
              <dd className="mt-1 truncate font-mono text-xs text-zinc-800 dark:text-zinc-100">
                {session.username || session.email}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Email</dt>
              <dd className="mt-1 truncate font-mono text-xs text-zinc-800 dark:text-zinc-100">
                {session.email}
              </dd>
            </div>
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-white/10">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {locale === 'en' ? 'Role' : 'Rôle'}
              </dt>
              <dd className="mt-1 text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                {d.roles[session.role]}
              </dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-white/10">
            <LogoutButton label={nav.logout} pendingLabel={nav.logoutPending} title={nav.logout} />
          </div>
        </section>

        {/* ——— Apparence ——— */}
        <section className={cardClass}>
          <h2 className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
            <Moon aria-hidden="true" className="h-4 w-4 text-mist-600 dark:text-mist-400" />
            {nav.themeAria}
          </h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-white/10">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{nav.themeAria}</p>
            <ThemeToggle
              ariaLabel={nav.themeAria}
              title={nav.themeAria}
              darkToast={nav.themeDarkToast}
              lightToast={nav.themeLightToast}
              toastDesc={nav.themeToastDesc}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-white/10">
            <p className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              <Languages aria-hidden="true" className="h-4 w-4 text-forest-600 dark:text-forest-400" />
              Language
            </p>
            <LanguageToggle locale={locale} />
          </div>
        </section>
      </div>
    </div>
  )
}
