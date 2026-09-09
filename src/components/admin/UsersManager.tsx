'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AtSign,
  CalendarClock,
  CirclePlus,
  Layers,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import {
  createUserByAdmin,
  deleteUserByAdmin,
  setUserActive,
  setUserRole,
  type UserAdminRole,
} from '@/app/actions/userAdminActions'
import type { UserAdminDto } from '@/lib/types'
import type { Locale, UsersText, RolesText } from '@/lib/i18n'
import { fill } from '@/lib/i18n'
import type { SessionRole } from '@/lib/session'
import Sheet from '@/components/ui/Sheet'
import StepperRail, { type StepperStep } from '@/components/ui/StepperRail'
import Tabs from '@/components/ui/Tabs'
import { friendlyActionError } from '@/lib/actionError'

type UsersManagerProps = {
  locale: Locale
  t: UsersText
  roleName: RolesText
  currentUserId: string
  users: UserAdminDto[]
}

type RoleTab = UserAdminRole

/** Date courte + heure, localisée (dernière activité d'un observateur). */
function formatActivityDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function UsersManager({ locale, t, roleName, currentUserId, users }: UsersManagerProps) {
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState<RoleTab>('OBSERVER')

  const counts: Record<RoleTab, number> = { OBSERVER: 0, ANALYST: 0, ADMIN: 0 }
  for (const user of users) {
    if (user.role in counts) counts[user.role as RoleTab]++
  }

  const visibleUsers = users.filter((user) => user.role === tab)

  const tabItems = [
    { id: 'OBSERVER', label: t.roleTabObservers, count: counts.OBSERVER },
    { id: 'ANALYST', label: t.roleTabAnalysts, count: counts.ANALYST },
    { id: 'ADMIN', label: t.roleTabAdmins, count: counts.ADMIN },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* ——— Barre d'outils ——— */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
        >
          <CirclePlus aria-hidden="true" className="h-4 w-4" />
          {t.addTab}
        </button>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{t.subtitle}</span>
      </div>

      {/* ——— Onglets par rôle : Observateurs · Analystes · Administrateurs ——— */}
      <Tabs
        items={tabItems}
        active={tab}
        onChange={(id) => setTab(id as RoleTab)}
        ariaLabel={t.title}
      />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-4">
        <MembersTable
          users={visibleUsers}
          currentUserId={currentUserId}
          t={t}
          roleName={roleName}
          locale={locale}
          showObserverMeta={tab === 'OBSERVER'}
        />
      </div>

      {adding ? (
        <AddUserSheet
          key={tab}
          locale={locale}
          t={t}
          roleName={roleName}
          initialRole={tab}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}

/* ————————————————————————————————————————————————————————————————
 * Liste des membres du rôle actif
 * ———————————————————————————————————————————————————————————————— */

function MembersTable({
  users,
  currentUserId,
  t,
  roleName,
  locale,
  showObserverMeta = false,
}: {
  users: UserAdminDto[]
  currentUserId: string
  t: UsersText
  roleName: RolesText
  locale: Locale
  showObserverMeta?: boolean
}) {
  const router = useRouter()

  const roleBadge =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'

  const changeRole = (user: UserAdminDto, role: string) => {
    if (user.id === currentUserId) {
      toast.error(t.selfProtected)
      return
    }
    void setUserRole({ userId: user.id, role: role as UserAdminRole })
      .then((r) => {
        router.refresh()
        if (!r.ok) toast.error(t.actionFailed, { description: r.error })
      })
      .catch((error: unknown) => {
        toast.error(t.actionFailed, { description: friendlyActionError(error, locale) })
      })
  }

  const toggleActive = (user: UserAdminDto) => {
    if (user.id === currentUserId) {
      toast.error(t.selfProtected)
      return
    }
    void setUserActive({ userId: user.id, active: !user.isActive })
      .then((r) => {
        router.refresh()
        if (r.ok) toast.success(user.isActive ? t.deactivated : t.reactivated)
        else toast.error(t.actionFailed, { description: r.error })
      })
      .catch((error: unknown) => {
        toast.error(t.actionFailed, { description: friendlyActionError(error, locale) })
      })
  }

  const runDelete = (user: UserAdminDto) => {
    void deleteUserByAdmin({ userId: user.id })
      .then((r) => {
        router.refresh()
        if (r.ok) toast.success(t.removed)
        else toast.error(t.actionFailed, { description: r.error })
      })
      .catch((error: unknown) => {
        toast.error(t.actionFailed, { description: friendlyActionError(error, locale) })
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
                    <span className="rounded-full border border-gold-600/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-700 dark:border-gold-400/50 dark:text-gold-300">
                      {t.you}
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      user.isActive
                        ? 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
                        : 'bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-zinc-400'
                    }`}
                  >
                    {user.isActive ? t.active : t.inactive}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {user.email}
                  {!showObserverMeta && (user.observationCount > 0 || user.ownedProjectsCount > 0) ? (
                    <span className="ml-2 text-zinc-400 dark:text-zinc-500">
                      · {user.observationCount} {t.obsCaption} · {user.ownedProjectsCount} {t.projectsCaption}
                    </span>
                  ) : null}
                </p>
                {showObserverMeta ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <Layers aria-hidden="true" className="h-3 w-3 text-gold-600 dark:text-gold-400" />
                      {user.observationCount} {t.obsCaption} · {user.sessionsCount} {t.sessionsLabel}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock
                        aria-hidden="true"
                        className="h-3 w-3 text-gold-600 dark:text-gold-400"
                      />
                      {t.lastActivityLabel} :{' '}
                      {user.lastActivityAt ? formatActivityDate(user.lastActivityAt, locale) : t.activityNone}
                    </span>
                  </p>
                ) : null}
              </div>

              <span className={roleBadge}>
                <ShieldCheck aria-hidden="true" className="mr-1 h-3 w-3" />
                {roleName[user.role as SessionRole]}
              </span>

              <select
                aria-label={t.colRole}
                disabled={isSelf}
                value={user.role}
                onChange={(event) => changeRole(user, event.target.value)}
                className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-milk dark:focus:ring-milk/15"
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
                          ? 'border-zinc-300 text-zinc-600 hover:border-clay-400 hover:bg-clay-50 hover:text-clay-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-clay-500 dark:hover:bg-clay-500/15 dark:hover:text-clay-300'
                          : 'border-gold-600/40 bg-gold-500/15 text-gold-800 hover:bg-gold-500/25 dark:border-gold-400/20 dark:bg-gold-400/10 dark:text-gold-200'
                      }`}
                    >
                      {user.isActive ? t.deactivate : t.activate}
                    </button>
                    <button
                      type="button"
                      onClick={() => askDelete(user)}
                      aria-label={`${t.delete} — ${user.email}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 text-zinc-500 transition-colors hover:border-clay-400 hover:bg-clay-50 hover:text-clay-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-clay-500 dark:hover:bg-clay-500/20 dark:hover:text-clay-300"
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
 * Tiroir d'ajout d'un compte (2 étapes)
 * ———————————————————————————————————————————————————————————————— */

const STEPS: StepperStep[] = [
  { num: 1, label: 'Compte' },
  { num: 2, label: 'Rôle' },
]

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15'

function AddUserSheet({
  locale,
  t,
  roleName,
  initialRole = 'ANALYST',
  onClose,
}: {
  locale: Locale
  t: UsersText
  roleName: RolesText
  initialRole?: UserAdminRole
  onClose: () => void
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserAdminRole>(initialRole)
  const [isPending, startTransition] = useTransition()

  const step1Valid = username.trim().length > 0 && email.trim().length > 0 && password.length >= 8

  const doCreate = () => {
    if (!step1Valid) return
    startTransition(async () => {
      const result = await createUserByAdmin({ username, email, password, role, locale }).catch(
        (error: unknown) => ({ ok: false, error: friendlyActionError(error, locale) }),
      )
      if (result.ok) {
        toast.success(t.created)
        router.refresh()
        onClose()
      } else {
        toast.error(t.actionFailed, { description: result.error })
      }
    })
  }

  const stepTitle = (current: number) =>
    fill(t.stepsOf, { current, total: STEPS.length }) +
    (current === 1 ? ` — ${t.addUserStep1}` : ` — ${t.addUserStep2}`)

  return (
    <Sheet
      open
      onClose={onClose}
      labelledBy="add-user-sheet-title"
      describedBy="add-user-sheet-desc"
      widthClass="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current - 1)}
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {t.previous}
            </button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <button
              type="button"
              disabled={!step1Valid}
              onClick={() => setStep(2)}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-6 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              {t.next}
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={doCreate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
            >
              {isPending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <CirclePlus aria-hidden="true" className="h-4 w-4" />
              )}
              {isPending ? t.creating : t.createCta}
            </button>
          )}
        </div>
      }
    >
      {/* Barre supérieure */}
      <div className="flex items-start justify-between gap-3 border-b border-line bg-milk px-6 py-4 dark:border-white/10 dark:bg-card">
        <div>
          <p
            id="add-user-sheet-desc"
            className="text-[11px] font-bold uppercase tracking-widest text-gold-700 dark:text-gold-400"
          >
            {t.addTitle}
          </p>
          <h2
            id="add-user-sheet-title"
            className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-50"
          >
            {t.addHint}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le formulaire"
          title="Fermer"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <StepperRail steps={STEPS} current={step} ariaLabel="Progression de création d'un compte" />

      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{stepTitle(step)}</p>

        <div className="mt-5">
          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="admin-new-username"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {t.usernameLabel}
                </label>
                <input
                  id="admin-new-username"
                  type="text"
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="j.smith"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">{t.usernameHint}</p>
              </div>
              <div>
                <label
                  htmlFor="admin-new-email"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {t.emailLabel}
                </label>
                <input
                  id="admin-new-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="researcher@institute.edu"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="admin-new-password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {t.passwordLabel}
                </label>
                <input
                  id="admin-new-password"
                  type="text"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                  8 caractères minimum — communiqué à l’utilisateur.
                </p>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-5">
              <div>
                <label
                  htmlFor="admin-new-role"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  {t.roleLabel}
                </label>
                <select
                  id="admin-new-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as UserAdminRole)}
                  className={INPUT_CLASS}
                >
                  <option value="ADMIN">{roleName.ADMIN}</option>
                  <option value="ANALYST">{roleName.ANALYST}</option>
                  <option value="OBSERVER">{roleName.OBSERVER}</option>
                </select>
              </div>

              {/* Récapitulatif */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Récapitulatif
                </p>
                <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-zinc-500 dark:text-zinc-400">{t.usernameLabel}</dt>
                    <dd className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
                      {username.trim() || '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-zinc-500 dark:text-zinc-400">{t.emailLabel}</dt>
                    <dd className="truncate font-mono text-xs text-zinc-900 dark:text-zinc-50">
                      {email.trim() || '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-zinc-500 dark:text-zinc-400">{t.roleLabel}</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {roleName[role]}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
  )
}
