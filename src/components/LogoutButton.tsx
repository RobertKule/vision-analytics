'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/actions/authActions'

type LogoutButtonProps = {
  /** Libellé localisé (EN / FR). Par défaut français. */
  label?: string
  pendingLabel?: string
  title?: string
}

/**
 * Bouton de déconnexion administrateur (côté client : Server Action + refresh).
 */
export default function LogoutButton({
  label = 'Déconnexion',
  pendingLabel = 'Déconnexion…',
  title = 'Se déconnecter',
}: LogoutButtonProps) {
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
      title={title}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:border-amber-500 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-amber-500 dark:hover:text-amber-400"
    >
      {isPending ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
      ) : (
        <LogOut aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="hidden sm:inline">{isPending ? pendingLabel : label}</span>
    </button>
  )
}
