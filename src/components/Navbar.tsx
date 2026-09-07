import Link from 'next/link'
import { Activity, Eye, LayoutDashboard, LogIn, ShieldCheck } from 'lucide-react'
import { getCurrentAdmin } from '@/lib/auth'
import ThemeToggle from '@/components/ThemeToggle'
import LogoutButton from '@/components/LogoutButton'

/**
 * Barre de navigation globale (serveur).
 *
 * L'état « visiteur / administrateur » est résolu côté serveur à partir du
 * cookie de session signé : aucune valeur sensible n'est jamais envoyée au
 * client tant que l'utilisateur n'est pas authentifié, et aucun flash de
 * chargement n'apparaît (contrairement à une résolution en `useEffect`).
 *
 * Liens visiteur : Accueil, Sessions d'observation, Connexion.
 * Liens administrateur : Dashboard, badge identité + Déconnexion.
 */
export default async function Navbar() {
  const session = await getCurrentAdmin()

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
      >
        {/* ——— Marque ——— */}
        <Link
          href="/"
          className="group inline-flex shrink-0 items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm transition-colors group-hover:bg-red-500">
            <Activity aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="hidden text-sm font-bold tracking-tight text-zinc-900 sm:inline dark:text-zinc-50">
            Vision Analytics
          </span>
        </Link>

        {/* ——— Liens centraux (desktop) ——— */}
        <div className="hidden items-center gap-1 md:flex">
          <Link
            href="/observe"
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            Sessions d’observation
          </Link>
          {session ? (
            <Link
              href="/admin/projects"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <LayoutDashboard aria-hidden="true" className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          ) : null}
        </div>

        {/* ——— Actions (droite) ——— */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Raccourci mobile vers les sessions d'observation */}
          <Link
            href="/observe"
            aria-label="Sessions d’observation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 md:hidden"
          >
            <Eye aria-hidden="true" className="h-4 w-4" />
          </Link>

          {session ? (
            <>
              <span
                className="hidden max-w-[14rem] items-center gap-1.5 overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 sm:inline-flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                title={session.email}
              >
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                <span className="truncate">{session.email}</span>
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-red-500 sm:px-4 sm:text-sm"
            >
              <LogIn aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span>Connexion</span>
            </Link>
          )}

          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
