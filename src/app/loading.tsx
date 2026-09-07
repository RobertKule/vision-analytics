export default function GlobalLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 sm:px-6">
      {/* En-tête skeleton */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-28 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-8 w-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>

      {/* Grille skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-7 w-28 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-2 w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
        ))}
      </div>

      {/* Grand bloc principal skeleton */}
      <div className="mt-8 flex h-72 w-full animate-pulse flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
        <p className="mt-3 text-xs font-medium text-zinc-400">Chargement des données scientifiques…</p>
      </div>
    </div>
  )
}
