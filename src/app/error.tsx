'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('Erreur interceptée par le Error Boundary :', error)
  }, [error])

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-3xl text-red-600 dark:bg-red-950/80 dark:text-red-400">
        ⚠️
      </div>

      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">
        Une erreur est survenue
      </p>
      <h1 className="mt-2 text-2xl font-black text-zinc-900 sm:text-3xl dark:text-zinc-50">
        Impossible de charger la ressource
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Le traitement de la requête a rencontré une anomalie inattendue. Les données enregistrées
        restent sécurisées dans la base de données.
      </p>

      {error.message && (
        <div className="mt-4 max-w-md rounded-lg border border-red-200 bg-red-50/50 p-3 font-mono text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error.message}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
        >
          🔄 Réessayer l'opération
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}
