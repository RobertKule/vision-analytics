'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Activity,
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Sparkles,
} from 'lucide-react'
import { loginAdmin, loginDemo, type AuthResult } from '@/app/actions/authActions'

type LoginFormProps = {
  demoAvailable: boolean
}

export default function LoginForm({ demoAvailable }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const redirectAfterLogin = () => {
    const from = searchParams.get('from')
    // Uniquement des destinations internes d'administration (anti open-redirect).
    return from && from.startsWith('/admin') ? from : '/admin/projects'
  }

  const applyAuthResult = (result: AuthResult) => {
    if (result.ok) {
      setErrorMessage(null)
      toast.success('Connexion réussie', {
        description: 'Redirection vers le tableau de bord…',
      })
      router.push(redirectAfterLogin())
      router.refresh()
    } else {
      setErrorMessage(result.error)
    }
  }

  const handleEmailLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    startTransition(async () => {
      applyAuthResult(await loginAdmin({ email, password }))
    })
  }

  const handleDemoLogin = () => {
    setErrorMessage(null)
    startTransition(async () => {
      applyAuthResult(await loginDemo())
    })
  }

  return (
    <div className="flex flex-col">
      {/* ——— En-tête de carte ——— */}
      <div className="flex flex-col items-center text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm">
          <Activity aria-hidden="true" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
          Espace Administrateur
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Accédez au pilotage des projets et des analyses scientifiques.
        </p>
      </div>

      {/* ——— Carte de connexion ——— */}
      <form
        onSubmit={handleEmailLogin}
        className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Adresse email
            </label>
            <div className="relative">
              <Mail aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@institut.fr"
                className="h-11 w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Mot de passe
            </label>
            <div className="relative">
              <Lock aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••••"
                className="h-11 w-full rounded-lg border border-zinc-300 bg-white pl-10 pr-10 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
          disabled={isPending || !email.trim() || !password}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Connexion en cours…
            </>
          ) : (
            <>
              <LogIn aria-hidden="true" className="h-4 w-4" />
              Se connecter
            </>
          )}
        </button>
      </form>

      {/* ——— Connexion Démo 1-clic (développement) ——— */}
      {demoAvailable ? (
        <div className="mt-4">
          <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-widest text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            ou
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isPending}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-red-300 bg-red-50/60 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Démo Admin en 1 clic
          </button>
          <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            Compte de démonstration — désactivé en environnement de production.
          </p>
        </div>
      ) : null}

      <Link
        href="/"
        className="mt-6 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
        Retour à l’accueil
      </Link>
    </div>
  )
}
