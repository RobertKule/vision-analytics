import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, House, ShieldAlert } from 'lucide-react'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

type PageProps = {
  searchParams?: Promise<{ reason?: string }>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { reason } = (await searchParams) ?? {}
  const locale = await getLocale()
  const t = getDictionary(locale).shareAccess
  const mode =
    reason === 'used' ? 'used' : reason === 'revoked' || reason === 'expired' ? 'inactive' : 'invalid'
  return {
    title:
      mode === 'used' ? t.usedTitle : mode === 'inactive' ? t.inactiveTitle : t.invalidTitle,
    robots: { index: false, follow: false },
  }
}

/**
 * Page d'erreur d'un lien d'accès observateur. Atteinte par redirection depuis
 * `/share/<JETON>` quand le jeton est inconnu, révoqué, expiré, rattaché à un projet
 * clôturé, ou déjà utilisé (déjà ouvert par un autre navigateur / session déjà
 * soumise). Aucune session n'est créée et le jeton n'est jamais affiché.
 */
export default async function ShareInvalidPage({ searchParams }: PageProps) {
  const { reason } = (await searchParams) ?? {}
  const locale = await getLocale()
  const t = getDictionary(locale).shareAccess

  const mode =
    reason === 'used'
      ? 'used'
      : reason === 'revoked' || reason === 'expired'
        ? 'inactive'
        : reason === 'archived'
          ? 'closed'
          : 'invalid'

  const title =
    mode === 'used'
      ? t.usedTitle
      : mode === 'closed'
        ? t.closedTitle
        : mode === 'inactive'
          ? t.inactiveTitle
          : t.invalidTitle
  const body =
    mode === 'used'
      ? t.usedBody
      : mode === 'closed'
        ? t.closedBody
        : mode === 'inactive'
          ? t.inactiveBody
          : t.invalidBody

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-50 text-clay-600 ring-1 ring-clay-200/70 dark:bg-clay-500/10 dark:text-clay-300 dark:ring-clay-500/20">
        <ShieldAlert aria-hidden="true" className="h-7 w-7" />
      </span>

      <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold-700 dark:text-gold-400">
        {t.contactHint}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#121417] px-4 text-sm font-semibold text-[#FBF9F5] transition-colors hover:bg-[#2D3139] dark:bg-[#FBF9F5] dark:text-[#121417] dark:hover:bg-white/90"
        >
          <House aria-hidden="true" className="h-4 w-4" />
          {t.ctaHome}
        </Link>
        <Link
          href="/docs"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <BookOpen aria-hidden="true" className="h-4 w-4" />
          {t.ctaDocs}
        </Link>
      </div>
    </div>
  )
}
