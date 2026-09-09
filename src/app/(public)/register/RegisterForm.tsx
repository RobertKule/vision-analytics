'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, AtSign, Eye, EyeOff, Lock, UserRound } from 'lucide-react'
import { register, type AuthResult } from '@/app/actions/authActions'
import { friendlyActionError } from '@/lib/actionError'
import type { Locale, AuthText } from '@/lib/i18n'

type RegisterFormProps = {
  locale: Locale
  t: AuthText
}

const inputClass =
  'h-11 w-full rounded-lg border border-[#E5E0D8] bg-white text-sm text-[#121417] placeholder:text-[#8C8275] focus:border-[#121417] focus:outline-none focus:ring-2 focus:ring-[#121417]/15 dark:border-white/15 dark:bg-black/30 dark:text-[#FBF9F5] dark:placeholder:text-zinc-500 dark:focus:border-[#FBF9F5] dark:focus:ring-[#FBF9F5]/15'

/**
 * Inscription publique — demande de compte ANALYST uniquement.
 *
 * L'inscription ne crée ni session ni compte actif : elle dépose une demande que
 * l'ADMIN doit valider (voir `/admin/users`, onglet « Demandes »). L'observateur
 * n'a PAS de parcours d'inscription publique : son accès passe par un lien de
 * partage (jeton projet).
 */
export default function RegisterForm({ locale, t }: RegisterFormProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    if (password !== confirm) {
      setErrorMessage(t.confirmMismatch)
      return
    }

    startTransition(async () => {
      try {
        const result: AuthResult = await register({ username, email, password, locale })
        if (result.ok) {
          setSubmitted(true)
        } else {
          setErrorMessage(result.error)
        }
      } catch (error) {
        // Échec de transport (réseau, serveur redémarré…) : message explicite, pas de rejet non géré.
        console.error('register transport error', error)
        setErrorMessage(friendlyActionError(error, locale))
      }
    })
  }

  // ——— Écran de confirmation : demande envoyée, en attente de validation ADMIN ———
  if (submitted) {
    return (
      <div className="flex flex-col">
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
            {t.registerPendingTitle}
          </h1>
        </div>

        <div className="mt-8 rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
          <p className="text-sm leading-relaxed text-[#4A4E57] dark:text-zinc-300">
            {t.registerPendingBody}
          </p>
          <p className="mt-3 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2.5 text-xs leading-relaxed text-gold-800 dark:border-gold-800 dark:bg-gold-900/30 dark:text-gold-200">
            {t.registerPendingHint}
          </p>
        </div>

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

      {/* ——— Carte de demande ——— */}
      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
      >
        <div className="flex flex-col gap-4">
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

        <p className="mt-4 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2.5 text-xs leading-relaxed text-gold-800 dark:border-gold-800 dark:bg-gold-900/30 dark:text-gold-200">
          {t.registerAnalystNote}
        </p>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2.5 text-sm text-clay-700 dark:border-clay-800 dark:bg-clay-900/40 dark:text-clay-300"
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
