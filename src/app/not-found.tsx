import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 font-mono text-xl font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        404
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
        Page ou ressource introuvable
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Le projet, la session ou la page demandé(e) n’existe pas ou a été archivé(e).
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/observe"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
        >
          Sessions d’observation
        </Link>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Retour à l’accueil
        </Link>
      </div>
    </div>
  )
}
