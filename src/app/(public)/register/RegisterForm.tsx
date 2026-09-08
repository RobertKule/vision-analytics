'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, AtSign, Eye, EyeOff, Lock, Microscope, UserRound } from 'lucide-react'
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
  'h-11 w-full rounded-lg border border-[#E5E0D8] bg-white text-sm text-[#121417] placeholder:text-[#8C8275] focus:border-[#121417] focus:outline-none focus:ring-2 focus:ring-[#121417]/15 dark:border-white/15 dark:bg-black/30 dark:text-[#FBF9F5] dark:placeholder:text-zinc-500 dark:focus:border-[#FBF9F5] dark:focus:ring-[#FBF9F5]/15'

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
        <span className="inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-[#121417]/10 dark:ring-white/15">
          <Image
            src="/Parc National des Virunga.png"
            alt="Parc National des Virunga"
            width={48}
            height={48}
            className="h-10 w-10 object-contain"
          />
        </span>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-widest text-[#8C8275] dark:text-zinc-400">
          {t.accessEyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#121417] dark:text-[#FBF9F5]">
          {t.registerTitle}
        </h1>
        <p className="mt-1 text-sm text-[#4A4E57] dark:text-zinc-400">{t.registerSubtitle}</p>
      </div>

      {/* ——— Carte d'inscription ——— */}
      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
      >
        <div className="flex flex-col gap-4">
          {/* Profil */}
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#4A4E57] dark:text-zinc-400">
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
                        ? 'border-[#121417] bg-[#121417]/5 ring-2 ring-[#121417]/10 dark:border-[#FBF9F5] dark:bg-[#FBF9F5]/10 dark:ring-[#FBF9F5]/10'
                        : 'border-[#E5E0D8] hover:border-[#8C8275]/60 dark:border-white/10 dark:hover:border-white/20'
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        selected
                          ? 'bg-[#121417] text-[#FBF9F5] dark:bg-[#FBF9F5] dark:text-[#121417]'
                          : 'bg-[#F4F0EA] text-[#4A4E57] dark:bg-white/10 dark:text-zinc-300'
                      }`}
                    >
                      {profile.icon === 'eye' ? (
                        <Eye aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <Microscope aria-hidden="true" className="h-4 w-4" />
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-[#121417] dark:text-[#FBF9F5]">
                        {profile.title}
                      </span>
                      <span className="mt-0.5 text-xs leading-relaxed text-[#4A4E57] dark:text-zinc-400">
                        {profile.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-[#8C8275] dark:text-zinc-500">{t.roleAdminDesc}</p>
          </fieldset>

          <div>
            <label
              htmlFor="reg-username"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#4A4E57] dark:text-zinc-400"
            >
              {t.usernameLabel}
            </label>
            <div className="relative">
              <UserRound
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8275]"
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
            <p className="mt-1 text-[11px] text-[#8C8275] dark:text-zinc-500">{t.usernameHint}</p>
          </div>

          <div>
            <label
              htmlFor="reg-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#4A4E57] dark:text-zinc-400"
            >
              Email
            </label>
            <div className="relative">
              <AtSign
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8275]"
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
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#4A4E57] dark:text-zinc-400"
            >
              {t.passwordLabel}
            </label>
            <div className="relative">
              <Lock
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8275]"
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
                className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#8C8275] transition-colors hover:text-[#121417] dark:hover:text-[#FBF9F5]"
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
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#4A4E57] dark:text-zinc-400"
            >
              {t.confirmLabel}
            </label>
            <div className="relative">
              <Lock
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8275]"
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
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#121417] text-sm font-semibold text-[#FBF9F5] shadow-sm transition-colors hover:bg-[#2D3139] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#FBF9F5] dark:text-[#121417] dark:hover:bg-white/90"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t.registering}
            </>
          ) : (
            t.register
          )}
        </button>
      </form>

      {/* ——— Connexion si déjà inscrit ——— */}
      <p className="mt-6 text-center text-sm text-[#4A4E57] dark:text-zinc-400">
        {t.haveAccount}{' '}
        <Link
          href="/login"
          className="font-semibold text-[#121417] underline decoration-[#121417]/40 underline-offset-2 transition-colors hover:text-[#2D3139] dark:text-[#FBF9F5] dark:decoration-[#FBF9F5]/40"
        >
          {t.loginCta}
        </Link>
      </p>

      <Link
        href="/"
        className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#8C8275] transition-colors hover:text-[#121417] dark:text-zinc-400 dark:hover:text-[#FBF9F5]"
      >
        <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
        {t.backHome}
      </Link>
    </div>
  )
}
