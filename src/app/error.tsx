'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw, TriangleAlert } from 'lucide-react'

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
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F4F0EA] text-[#4A4E57] dark:bg-white/5 dark:text-zinc-300">
        <TriangleAlert aria-hidden="true" className="h-7 w-7" />
      </div>

      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-[#8C8275] dark:text-zinc-400">
        Une erreur est survenue
      </p>
      <h1 className="mt-2 text-2xl font-black text-[#121417] sm:text-3xl dark:text-[#FBF9F5]">
        Impossible de charger la ressource
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[#4A4E57] dark:text-zinc-400">
        Le traitement de la requête a rencontré une anomalie inattendue. Les données enregistrées
        restent sécurisées dans la base de données.
      </p>

      {error.message && (
        <div className="mt-4 max-w-md rounded-lg border border-[#E5E0D8] bg-white/60 p-3 font-mono text-xs text-[#4A4E57] dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
          {error.message}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#121417] px-5 text-sm font-semibold text-[#FBF9F5] shadow-sm transition-colors hover:bg-[#2D3139] dark:bg-[#FBF9F5] dark:text-[#121417] dark:hover:bg-white/90"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Réessayer l’opération
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E5E0D8] px-5 text-sm font-medium text-[#121417] transition-colors hover:bg-[#F4F0EA] dark:border-white/15 dark:text-[#FBF9F5] dark:hover:bg-white/5"
        >
          Retour à l’accueil
        </Link>
      </div>
    </div>
  )
}
