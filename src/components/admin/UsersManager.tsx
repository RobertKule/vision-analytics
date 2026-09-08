'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AtSign, CirclePlus, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import {
  createUserByAdmin,
  deleteUserByAdmin,
  setUserActive,
  setUserRole,
  type UserAdminRole,
} from '@/app/actions/userAdminActions'
import type { UserAdminDto } from '@/lib/types'
import type { Locale, UsersText, RolesText } from '@/lib/i18n'
import type { SessionRole } from '@/lib/session'

type UsersManagerProps = {
  locale: Locale
  t: UsersText
  roleName: RolesText
  currentUserId: string
  users: UserAdminDto[]
}

const inputClass =
  'h-11 w-full rounded-lg border border-zinc-300 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

export default function UsersManager({ locale, t, roleName, currentUserId, users }: UsersManagerProps) {
  const [view, setView] = useState<'members' | 'add'>('members')

  return (
    <div className="flex flex-col gap-5">
      {/* ——— Bascule liste / ajout ——— */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setView('members')}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
              view === 'members'
                ? 'bg-forest-600 text-white'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
            }`}
          >
            <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
            {t.membersTab}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                view === 'members' ? 'bg-white/20' : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300'
              }`}
            >
              {users.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setView('add')}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
              view === 'add'
                ? 'bg-forest-600 text-white'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
            }`}
          >
            <CirclePlus aria-hidden="true" className="h-3.5 w-3.5" />
            {t.addTab}
          </button>
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{t.subtitle}</span>
      </div>

      {view === 'members' ? (
        <MembersTable users={users} currentUserId={currentUserId} t={t} roleName={roleName} />
      ) : (
        <AddUserForm t={t} roleName={roleName} locale={locale} onDone={() => setView('members')} />
      )}
    </div>
  )
}

/* ————————————————————————————————————————————————————————————————
 * Liste des membres
 * ———————————————————————————————————————————————————————————————— */

function MembersTable({
  users,
  currentUserId,
  t,
  roleName,
}: {
  users: UserAdminDto[]
  currentUserId: string
  t: UsersText
  roleName: RolesText
}) {
  const router = useRouter()

  const roleBadge = (role: string) => {
    const base =
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide '
    if (role === 'ADMIN') return `${base}bg-amber-500/15 text-amber-700 dark:text-amber-400`
    if (role === 'ANALYST') return `${base}bg-mist-500/15 text-mist-700 dark:text-mist-400`
    return `${base}bg-forest-500/15 text-forest-700 dark:text-forest-400`
  }

  const changeRole = (user: UserAdminDto, role: string) => {
    if (user.id === currentUserId) {
      toast.error(t.selfProtected)
      return
    }
    void setUserRole({ userId: user.id, role: role as UserAdminRole }).then((r) => {
      router.refresh()
      if (!r.ok) toast.error(t.actionFailed, { description: r.error })
    })
  }

  const toggleActive = (user: UserAdminDto) => {
    if (user.id === currentUserId) {
      toast.error(t.selfProtected)
      return
    }
    void setUserActive({ userId: user.id, active: !user.isActive }).then((r) => {
      router.refresh()
      if (r.ok) toast.success(user.isActive ? t.deactivated : t.reactivated)
      else toast.error(t.actionFailed, { description: r.error })
    })
  }

  const runDelete = (user: UserAdminDto) => {
    void deleteUserByAdmin({ userId: user.id }).then((r) => {
      router.refresh()
      if (r.ok) toast.success(t.removed)
      else toast.error(t.actionFailed, { description: r.error })
    })
  }

  const askDelete = (user: UserAdminDto) => {
    toast.warning(t.deleteAsk, {
      description: user.username || user.email,
      action: { label: t.deleteYes, onClick: () => runDelete(user) },
      cancel: { label: t.cancel, onClick: () => {} },
    })
  }

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.empty}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {users.map((user) => {
        const isSelf = user.id === currentUserId
        return (
          <li
            key={user.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-300 dark:border-white/10 dark:bg-[#161b22] dark:hover:border-white/20"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
                {user.username ? (
                  <UserRound aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <AtSign aria-hidden="true" className="h-5 w-5" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {user.username || user.email}
                  </p>
                  {isSelf ? (
                    <span className="rounded-full bg-forest-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-forest-700 dark:text-forest-400">
                      {t.you}
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      user.isActive
                        ? 'bg-forest-500/10 text-forest-700 dark:text-forest-400'
                        : 'bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
                    }`}
                  >
                    {user.isActive ? t.active : t.inactive}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {user.email}
                  {user.observationCount > 0 || user.ownedProjectsCount > 0 ? (
                    <span className="ml-2 text-zinc-400 dark:text-zinc-500">
                      · {user.observationCount} {t.obsCaption} · {user.ownedProjectsCount} {t.projectsCaption}
                    </span>
                  ) : null}
                </p>
              </div>

              <span className={roleBadge(user.role)}>
                <ShieldCheck aria-hidden="true" className="mr-1 h-3 w-3" />
                {roleName[user.role as SessionRole]}
              </span>

              <select
                aria-label={t.colRole}
                disabled={isSelf}
                value={user.role}
                onChange={(event) => changeRole(user, event.target.value)}
                className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="ANALYST">ANALYST</option>
                <option value="OBSERVER">OBSERVER</option>
              </select>

              <div className="flex items-center gap-2">
                {isSelf ? null : (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleActive(user)}
                      className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold transition-colors ${
                        user.isActive
                          ? 'border-zinc-300 text-zinc-600 hover:border-amber-400 hover:text-amber-600 dark:border-zinc-700 dark:text-zinc-300'
                          : 'border-forest-300 bg-forest-50 text-forest-700 hover:bg-forest-100 dark:border-forest-700 dark:bg-forest-500/10 dark:text-forest-300'
                      }`}
                    >
                      {user.isActive ? t.deactivate : t.activate}
                    </button>
                    <button
                      type="button"
                      onClick={() => askDelete(user)}
                      aria-label={`${t.delete} — ${user.email}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-500 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ————————————————————————————————————————————————————————————————
 * Formulaire d'ajout d'un compte
 * ———————————————————————————————————————————————————————————————— */

function AddUserForm({
  t,
  roleName,
  locale,
  onDone,
}: {
  t: UsersText
  roleName: RolesText
  locale: Locale
  onDone: () => void
}) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserAdminRole>('ANALYST')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const result = await createUserByAdmin({ username, email, password, role, locale })
      if (result.ok) {
        setUsername('')
        setEmail('')
        setPassword('')
        setRole('ANALYST')
        toast.success(t.created)
        router.refresh()
        onDone()
      } else {
        toast.error(t.actionFailed, { description: result.error })
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
    >
      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{t.addTitle}</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.addHint}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="admin-new-username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.usernameLabel}
          </label>
          <input
            id="admin-new-username"
            type="text"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="j.smith"
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">{t.usernameHint}</p>
        </div>
        <div>
          <label htmlFor="admin-new-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.emailLabel}
          </label>
          <input
            id="admin-new-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="researcher@institute.edu"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="admin-new-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.passwordLabel}
          </label>
          <input
            id="admin-new-password"
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••••"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="admin-new-role" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.roleLabel}
          </label>
          <select
            id="admin-new-role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserAdminRole)}
            className={inputClass}
          >
            <option value="ADMIN">{roleName.ADMIN}</option>
            <option value="ANALYST">{roleName.ANALYST}</option>
            <option value="OBSERVER">{roleName.OBSERVER}</option>
          </select>
        </div>
      </div>

      <div className="mt-5 flex justify-end border-t border-zinc-100 pt-4 dark:border-white/10">
        <button
          type="submit"
          disabled={isPending || !username.trim() || !email.trim() || password.length < 8}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-forest-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t.creating}
            </>
          ) : (
            <>
              <CirclePlus aria-hidden="true" className="h-4 w-4" />
              {t.createCta}
            </>
          )}
        </button>
      </div>
    </form>
  )
}
