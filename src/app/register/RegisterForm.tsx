'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, AtSign, Eye, EyeOff, Leaf, Lock, Microscope, UserRound } from 'lucide-react'
import { register, type AuthResult } from '@/app/actions/authActions'
import type { RegisterableRole } from '@/lib/auth'
import type { Locale, AuthText, RolesText } from '@/lib/i18n'
import { homeForRole } from '@/lib/navigation'

type RegisterFormProps = {
  locale: Locale
  t: AuthText
  roleName: RolesText
}

type ProfileChoice = { role: RegisterableRole; title: string; hint: string; icon: 'eye' | 'microscope' }

const inputClass =
  'h-11 w-full rounded-lg border border-zinc-300 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

export default function RegisterForm({ locale, t, roleName }: RegisterFormProps) {
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<RegisterableRole>('OBSERVER')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const profiles: ProfileChoice[] = [
    {
      role: 'OBSERVER',
      title: t.roleObserver,
      hint: t.roleObserverHint,
      icon: 'eye',
    },
    {
      role: 'ANALYST',
      title: t.roleAnalyst,
      hint: t.roleAnalystHint,
      icon: 'microscope',
    },
  ]

  const applyAuthResult = (result: AuthResult) => {
    if (result.ok) {
      setErrorMessage(null)
      toast.success(
        locale === 'en' ? 'Welcome' : 'Bienvenue',
        { description: roleName[result.role] },
      )
      router.push(homeForRole(result.role))
      router.refresh()
    } else {
      setErrorMessage(result.error)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    if (password !== confirm) {
      setErrorMessage(t.confirmMismatch)
      return
    }

    startTransition(async () => {
      applyAuthResult(await register({ username, email, password, role, locale }))
    })
  }

  return (
    <div className="flex flex-col">
      {/* ——— En-tête de carte ——— */}
      <div className="flex flex-col items-center text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-forest-500 to-forest-700 text-white shadow-sm">
          <Leaf aria-hidden="true" className="h-6 w-6" />
        </span>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-forest-600 dark:text-forest-400">
          {t.accessEyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t.registerTitle}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.registerSubtitle}</p>
      </div>

      {/* ——— Carte d'inscription ——— */}
      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
      >
        <div className="flex flex-col gap-4">
          {/* Profil */}
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t.roleLabel}
            </legend>
            <div className="grid gap-2">
              {profiles.map((profile) => {
                const selected = role === profile.role
                return (
                  <button
                    key={profile.role}
                    type="button"
                    onClick={() => setRole(profile.role)}
                    aria-pressed={selected}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? 'border-forest-500 bg-forest-50/70 ring-2 ring-forest-500/20 dark:border-forest-500 dark:bg-forest-500/10'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20'
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        selected
                          ? 'bg-forest-600 text-white'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-300'
                      }`}
                    >
                      {profile.icon === 'eye' ? (
                        <Eye aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <Microscope aria-hidden="true" className="h-4 w-4" />
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {profile.title}
                      </span>
                      <span className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {profile.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">{t.roleAdminDesc}</p>
          </fieldset>

          <div>
            <label
              htmlFor="reg-username"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              {t.usernameLabel}
            </label>
            <div className="relative">
              <UserRound
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                required
                autoFocus
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t.usernamePlaceholder}
                className={`${inputClass} pl-10`}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">{t.usernameHint}</p>
          </div>

          <div>
            <label
              htmlFor="reg-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              Email
            </label>
            <div className="relative">
              <AtSign
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="researcher@institute.edu"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reg-password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              {t.passwordLabel}
            </label>
            <div className="relative">
              <Lock
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
                className={`${inputClass} pl-10 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? t.hidePassword : t.showPassword}
                title={showPassword ? t.hidePassword : t.showPassword}
                className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Eye aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="reg-confirm"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              {t.confirmLabel}
            </label>
            <div className="relative">
              <Lock
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="••••••••••••"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
          >
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending || !username.trim() || !email.trim() || !password || !confirm}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-forest-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t.registering}
            </>
          ) : (
            t.register
          )}
        </button>
      </form>

      {/* ——— Connexion si déjà inscrit ——— */}
      <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {t.haveAccount}{' '}
        <Link
          href="/login"
          className="font-semibold text-forest-600 underline decoration-forest-500/40 underline-offset-2 transition-colors hover:text-forest-500 dark:text-forest-400"
        >
          {t.loginCta}
        </Link>
      </p>

      <Link
        href="/"
        className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
        {t.backHome}
      </Link>
    </div>
  )
}
