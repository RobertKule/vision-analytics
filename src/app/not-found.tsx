import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F4F0EA] font-mono text-xl font-bold text-[#4A4E57] dark:bg-white/5 dark:text-zinc-300">
        404
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-[#121417] sm:text-3xl dark:text-[#FBF9F5]">
        Page ou ressource introuvable
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[#4A4E57] dark:text-zinc-400">
        Le projet, la session ou la page demandé(e) n’existe pas ou a été archivé(e).
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/observe"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#121417] px-5 text-sm font-semibold text-[#FBF9F5] shadow-sm transition-colors hover:bg-[#2D3139] dark:bg-[#FBF9F5] dark:text-[#121417] dark:hover:bg-white/90"
        >
          Sessions d’observation
        </Link>
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
