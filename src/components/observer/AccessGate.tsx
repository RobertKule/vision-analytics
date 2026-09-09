import Link from 'next/link'
import { BookOpen, House, Lock } from 'lucide-react'

export type AccessGateText = {
  title: string
  body: string
  contactHint: string
  ctaHome: string
  ctaDocs: string
}

/**
 * Panneau « accès par invitation » des pages d'observation publiques.
 *
 * Les sessions d'observation d'ONA Field s'ouvrent uniquement via un lien d'accès
 * personnel (`/share/<JETON>`). Quiconque atteint `/observe` ou `/observe/[id]`
 * sans jeton valide (aucun cookie de portée, jeton révoqué/expiré, autre projet)
 * voit ce panneau — aucune liste publique, aucun contournement.
 */
export default function AccessGate({ text }: { text: AccessGateText }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-700 ring-1 ring-gold-500/20 dark:bg-gold-400/10 dark:text-gold-300 dark:ring-gold-500/20">
        <Lock aria-hidden="true" className="h-7 w-7" />
      </span>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
        {text.title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{text.body}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold-700 dark:text-gold-400">
        {text.contactHint}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#121417] px-4 text-sm font-semibold text-[#FBF9F5] transition-colors hover:bg-[#2D3139] dark:bg-[#FBF9F5] dark:text-[#121417] dark:hover:bg-white/90"
        >
          <House aria-hidden="true" className="h-4 w-4" />
          {text.ctaHome}
        </Link>
        <Link
          href="/docs"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <BookOpen aria-hidden="true" className="h-4 w-4" />
          {text.ctaDocs}
        </Link>
      </div>
    </div>
  )
}
