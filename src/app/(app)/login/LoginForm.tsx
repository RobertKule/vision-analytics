'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Eye, EyeOff, Leaf, Lock, LogIn, Sparkles, User } from 'lucide-react'
import { login, loginDemo, type AuthResult } from '@/app/actions/authActions'
import type { Locale, AuthText, RolesText } from '@/lib/i18n'
import { homeForRole, resolvePostLoginRedirect } from '@/lib/navigation'

type LoginFormProps = {
  locale: Locale
  t: AuthText
  roleName: RolesText
  demoAvailable: boolean
}

export default function LoginForm({ locale, t, roleName, demoAvailable }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const applyAuthResult = (result: AuthResult) => {
    if (result.ok) {
      setErrorMessage(null)
      toast.success(
        locale === 'en' ? 'Welcome back' : 'Bon retour',
        {
          description: roleName[result.role],
        },
      )
      const from = searchParams.get('from')
      router.push(resolvePostLoginRedirect(from, homeForRole(result.role)))
      router.refresh()
    } else {
      setErrorMessage(result.error)
    }
  }

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    startTransition(async () => {
      applyAuthResult(await login({ identifier, password, locale }))
    })
  }

  const handleDemoLogin = () => {
    setErrorMessage(null)
    startTransition(async () => {
      applyAuthResult(await loginDemo())
    })
  }

  const inputClass =
    'h-11 w-full rounded-lg border border-zinc-300 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

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
          {t.loginTitle}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t.loginSubtitle}</p>
      </div>

      {/* ——— Carte de connexion ——— */}
      <form
        onSubmit={handleLogin}
        className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="login-identifier"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              {t.identifierLabel}
            </label>
            <div className="relative">
              <User
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              />
              <input
                id="login-identifier"
                type="text"
                autoComplete="username"
                required
                autoFocus
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={t.identifierPlaceholder}
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
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
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
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
          disabled={isPending || !identifier.trim() || !password}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-forest-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {t.signingIn}
            </>
          ) : (
            <>
              <LogIn aria-hidden="true" className="h-4 w-4" />
              {t.signIn}
            </>
          )}
        </button>
      </form>

      {/* ——— Connexion Démo 1-clic (développement) ——— */}
      {demoAvailable ? (
        <div className="mt-4">
          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            <span>{roleName.ADMIN}</span>
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isPending}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-forest-300 bg-forest-50/60 text-sm font-semibold text-forest-700 transition-colors hover:bg-forest-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-forest-900 dark:bg-forest-950/20 dark:text-forest-300 dark:hover:bg-forest-950/40"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            {t.demoAdmin}
          </button>
          <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            {t.demoTag}
          </p>
        </div>
      ) : null}

      {/* ——— Création de compte ——— */}
      <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {t.noAccount}{' '}
        <Link
          href="/register"
          className="font-semibold text-forest-600 underline decoration-forest-500/40 underline-offset-2 transition-colors hover:text-forest-500 dark:text-forest-400"
        >
          {t.createAccountCta}
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
