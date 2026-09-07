'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions/authActions'

/**
 * Bouton de déconnexion administrateur (côté client : Server Action + refresh).
 */
export default function LogoutButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleLogout = () => {
    startTransition(async () => {
      await logout()
      router.push('/')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:border-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-500 dark:hover:text-red-400"
      title="Se déconnecter"
    >
      {isPending ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
      ) : (
        <LogOut aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="hidden sm:inline">{isPending ? 'Déconnexion…' : 'Déconnexion'}</span>
    </button>
  )
}
