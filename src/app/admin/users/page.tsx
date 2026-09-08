import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentSession } from '@/lib/auth'
import { listUsers } from '@/app/actions/userAdminActions'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import UsersManager from '@/components/admin/UsersManager'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'User management' : 'Gestion des utilisateurs',
    description:
      locale === 'en'
        ? 'Create accounts, assign roles and manage access.'
        : 'Créez des comptes, attribuez des rôles et gérez les accès.',
  }
}

export default async function AdminUsersPage() {
  const [session, locale] = await Promise.all([getCurrentSession(), getLocale()])
  if (!session) redirect('/login')

  const users = await listUsers()
  const d = getDictionary(locale)
  const t = d.users

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-600 dark:text-forest-400">
          {t.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.subtitle}</p>
      </header>

      <UsersManager
        locale={locale}
        t={d.users}
        roleName={d.roles}
        currentUserId={session.uid}
        users={users}
      />
    </div>
  )
}
