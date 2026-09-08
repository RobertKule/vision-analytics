'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Eye, LayoutDashboard, LogIn, LogOut, Menu, X } from 'lucide-react'
import type { Locale, NavText, RolesText } from '@/lib/i18n'
import type { SessionRole } from '@/lib/session'
import { logout } from '@/app/actions/authActions'
import LanguageToggle from '@/components/LanguageToggle'
import ThemeToggle from '@/components/ThemeToggle'

type UserActionsProps = {
  session: { username: string | null; email: string; role: SessionRole } | null
  workspaceHref: string
  locale: Locale
  t: NavText
  roleName: RolesText
}

const ROLE_BADGE: Record<SessionRole, string> = {
  ADMIN: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  ANALYST: 'bg-mist-500/15 text-mist-700 dark:text-mist-400',
  OBSERVER: 'bg-forest-500/15 text-forest-700 dark:text-forest-400',
}

function displayName(username: string | null, email: string): string {
  return username && username.trim().length > 0 ? username : email
}

function initialsOf(username: string | null, email: string): string {
  const source = (username && username.trim().length > 0 ? username : email).replace(/[^a-zA-Z0-9._-]/g, '')
  return (source[0] ?? '?').toUpperCase()
}

/**
 * Actions de droite de l'en-tête applicatif.
 *
 * Desktop (≥ md) : menu de profil déroulant (identité, rôle, lien vers son
 * espace, déconnexion en rouge) OU bouton « Connexion ».
 * Mobile (< md) : bouton hamburger à droite qui ouvre un tiroir ancré à
 * droite (90 % de la largeur, max 400 px) regroupant navigation, profil,
 * bascules langue / thème et déconnexion.
 */
export default function UserActions({
  session,
  workspaceHref,
  locale,
  t,
  roleName,
}: UserActionsProps) {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Échap ferme le tiroir / le menu de profil.
  useEffect(() => {
    if (!isMenuOpen && !isProfileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
        setIsProfileOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMenuOpen, isProfileOpen])

  // Verrouille le défilement du fond pendant que le tiroir mobile est ouvert.
  useEffect(() => {
    if (!isMenuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isMenuOpen])

  const handleLogout = () => {
    startTransition(async () => {
      await logout()
      router.push('/')
      router.refresh()
    })
  }

  const userName = session ? displayName(session.username, session.email) : ''
  const userInitials = session ? initialsOf(session.username, session.email) : ''
  const roleBadge = session ? ROLE_BADGE[session.role] : ''

  const avatar = (sizeClass: string) => (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-forest-500 to-forest-700 font-bold text-white ${sizeClass}`}
      aria-hidden="true"
    >
      {userInitials}
    </span>
  )

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* Bascules (desktop/tablette) — aussi présentes dans le tiroir mobile */}
      <div className="hidden items-center gap-2 sm:flex">
        <ThemeToggle
          ariaLabel={t.themeAria}
          title={t.themeAria}
          darkToast={t.themeDarkToast}
          lightToast={t.themeLightToast}
          toastDesc={t.themeToastDesc}
        />
        <LanguageToggle locale={locale} />
      </div>

      {/* Voile invisible : ferme le menu de profil au clic extérieur */}
      {session && isProfileOpen ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setIsProfileOpen(false)}
          className="fixed inset-0 z-40 cursor-default"
        />
      ) : null}

      {/* Profil déroulant ou connexion (desktop) */}
      {session ? (
        <div className="relative hidden md:block">
          <button
            type="button"
            onClick={() => setIsProfileOpen((open) => !open)}
            aria-label={t.profileAria}
            aria-haspopup="menu"
            aria-expanded={isProfileOpen}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-1 pr-2 text-xs font-semibold text-zinc-700 shadow-sm transition-colors hover:border-forest-500/50 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-forest-500/40"
          >
            {avatar('h-7 w-7 text-[11px]')}
            <span className="hidden max-w-[10rem] truncate lg:inline">{userName}</span>
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {isProfileOpen ? (
            <div
              role="menu"
              aria-label={t.profileAria}
              className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#0d1117]"
            >
              {/* ——— Identité ——— */}
              <div className="border-b border-zinc-100 p-4 dark:border-white/10">
                <div className="flex items-center gap-3">
                  {avatar('h-11 w-11 text-base')}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">
                      {userName}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {session.email}
                    </p>
                  </div>
                </div>
                <span
                  className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${roleBadge}`}
                >
                  {roleName[session.role]}
                </span>
              </div>

              {/* ——— Navigation ——— */}
              <div className="p-1.5">
                <Link
                  href={workspaceHref}
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-forest-50 hover:text-forest-700 dark:text-zinc-200 dark:hover:bg-forest-500/10 dark:hover:text-forest-400"
                >
                  <LayoutDashboard
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-zinc-400"
                  />
                  {t.myWorkspace}
                </Link>
              </div>

              {/* ——— Déconnexion ——— */}
              <div className="border-t border-zinc-100 p-1.5 dark:border-white/10">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  disabled={isPending}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  {isPending ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                  ) : (
                    <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
                  )}
                  {isPending ? t.logoutPending : t.logout}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <Link
          href="/login"
          className="hidden h-9 items-center justify-center gap-1.5 rounded-lg bg-forest-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500 md:inline-flex"
        >
          <LogIn aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t.login}</span>
        </Link>
      )}

      {/* Bouton hamburger (mobile) */}
      <button
        type="button"
        onClick={() => setIsMenuOpen(true)}
        aria-label={t.menuOpenAria}
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 md:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      {/* ——— Tiroir mobile (ancré à droite, 90 % de la largeur) ——— */}
      {isMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t.menuOpenAria}>
          <button
            type="button"
            aria-label={t.menuCloseAria}
            onClick={() => setIsMenuOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 flex w-[90vw] max-w-[400px] flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0d1117]">
            {/* En-tête du panneau */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-white/10">
              <p className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Vision Analytics
              </p>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                aria-label={t.menuCloseAria}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Profil ou connexion */}
            {session ? (
              <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-4 dark:border-white/10">
                {avatar('h-11 w-11 text-base')}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">
                    {userName}
                  </p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {session.email}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadge}`}
                >
                  {roleName[session.role]}
                </span>
              </div>
            ) : (
              <div className="border-b border-zinc-100 px-4 py-4 dark:border-white/10">
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-forest-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500"
                >
                  <LogIn aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {t.login}
                </Link>
              </div>
            )}

            {/* Liens de navigation */}
            <nav aria-label={t.menuOpenAria} className="flex-1 overflow-y-auto px-2 py-3">
              <ul className="flex flex-col gap-1">
                <li>
                  <Link
                    href="/observe"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-forest-50 hover:text-forest-700 dark:text-zinc-200 dark:hover:bg-forest-500/10 dark:hover:text-forest-400"
                  >
                    <Eye aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
                    {t.observe}
                  </Link>
                </li>
                {session ? (
                  <li>
                    <Link
                      href={workspaceHref}
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-forest-50 hover:text-forest-700 dark:text-zinc-200 dark:hover:bg-forest-500/10 dark:hover:text-forest-400"
                    >
                      <LayoutDashboard aria-hidden="true" className="h-4 w-4 shrink-0 text-zinc-400" />
                      {t.myWorkspace}
                    </Link>
                  </li>
                ) : null}
              </ul>
            </nav>

            {/* Bascules langue / thème */}
            <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-4 dark:border-white/10">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {locale === 'fr' ? 'Apparence' : 'Appearance'}
              </span>
              <div className="flex items-center gap-2">
                <LanguageToggle locale={locale} />
                <ThemeToggle
                  ariaLabel={t.themeAria}
                  title={t.themeAria}
                  darkToast={t.themeDarkToast}
                  lightToast={t.themeLightToast}
                  toastDesc={t.themeToastDesc}
                />
              </div>
            </div>

            {/* Déconnexion */}
            {session ? (
              <div className="border-t border-zinc-100 p-3 dark:border-white/10">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isPending}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-50 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
                >
                  {isPending ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                  ) : (
                    <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
                  )}
                  {isPending ? t.logoutPending : t.logout}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
