import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { homeForRole } from '@/lib/navigation'
import type { SessionRole } from '@/lib/session'
import AppSidebar from '@/components/app/AppSidebar'

/**
 * Coquille applicative des espaces protégés : barre latérale repliable /
 * redimensionnable à gauche, contenu défilant à droite. Le rôle de la session
 * détermine la navigation proposée (Overview, Expériences, Projets, Utilisateurs…).
 */
export default async function AppShell({
  allowed,
  children,
}: {
  allowed: SessionRole[]
  children: ReactNode
}) {
  const [session, locale] = await Promise.all([getCurrentSession(), getLocale()])
  if (!session) redirect('/login')
  if (!allowed.includes(session.role)) redirect(homeForRole(session.role))

  const d = getDictionary(locale)
  const roleName = d.roles[session.role]

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full items-stretch overflow-hidden">
      <AppSidebar
        role={session.role}
        userName={session.username || session.email}
        roleName={roleName}
        t={d.shell}
      />
      <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-50 dark:bg-[#0d1117]">
        {children}
      </main>
    </div>
  )
}
