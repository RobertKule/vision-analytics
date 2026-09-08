import Link from 'next/link'
import Image from 'next/image'
import { LayoutDashboard } from 'lucide-react'
import { getCurrentAdmin } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { homeForRole } from '@/lib/navigation'
import UserActions from '@/components/app/UserActions'

/**
 * Barre de navigation globale (serveur) des espaces protégés.
 *
 * Le côté droit (menu de profil déroulant, tiroir mobile, bascules langue /
 * thème, déconnexion) est délégué au composant client <UserActions/> qui
 * conserve son état à travers les navigations SPA entre routes applicatives.
 */
export default async function Navbar() {
  const session = await getCurrentAdmin()
  const locale = await getLocale()
  const d = getDictionary(locale)
  const t = d.nav
  const workspaceHref = session ? homeForRole(session.role) : null

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

        {/* ——— Actions (droite) : profil, tiroir mobile, bascules ——— */}
        <UserActions
          session={
            session
              ? {
                  username: session.username,
                  email: session.email,
                  role: session.role,
                }
              : null
          }
          workspaceHref={workspaceHref ?? '/observe'}
          locale={locale}
          t={t}
          roleName={d.roles}
        />
      </nav>
    </header>
  )
}
