import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return {
    title:
      locale === 'fr'
        ? 'Laboratoire d’observation en double aveugle'
        : 'Double-blind observation laboratory',
    description: t.heroSub,
  }
}

/**
 * Page d'accueil publique — uniquement le HERO.
 * L'en-tête, le bandeau « antigravité » et le pied de page sont fournis par la
 * coquille `(public)/layout.tsx` et partagés avec `/observe`, `/login`, etc.
 */
export default async function Home() {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return (
    <section className="relative flex min-h-[78vh] items-center justify-center overflow-hidden border-b border-[#E5E0D8] px-6 dark:border-white/10">
      {/* Texture de fond pure CSS — tons sable / ardoise très diffus */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage: [
            'radial-gradient(58% 52% at 74% 16%, rgba(212, 163, 89, 0.30), transparent 62%)',
            'radial-gradient(46% 42% at 14% 82%, rgba(45, 49, 57, 0.10), transparent 60%)',
            'radial-gradient(42% 46% at 30% 24%, rgba(212, 163, 89, 0.12), transparent 58%)',
            'radial-gradient(60% 60% at 50% 55%, rgba(244, 240, 234, 0.85), transparent 72%)',
          ].join(', '),
        }}
      />
      {/* Dégradé crème doux par-dessus */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#FBF9F5]/95 via-[#FBF9F5]/80 to-[#FBF9F5] dark:from-[#0D1117]/95 dark:via-[#0D1117]/80 dark:to-[#0D1117]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-8 py-20 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#121417]/10 bg-[#121417]/5 px-3.5 py-1.5 font-mono text-xs tracking-wide text-[#4A4E57] dark:border-white/15 dark:bg-white/5 dark:text-zinc-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#121417] dark:bg-[#FBF9F5]" aria-hidden="true" />
          {t.badge}
        </p>

        <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-[#121417] dark:text-[#FBF9F5] sm:text-6xl lg:text-7xl">
          {t.heroTitleLead} <br />
          <span className="text-[#8C8275]">{t.heroTitleAccent}</span>
        </h1>

        <p className="max-w-2xl text-base font-normal leading-relaxed text-[#4A4E57] dark:text-zinc-400 sm:text-lg">
          {t.heroSub}
        </p>

        <div className="flex w-full flex-col items-center gap-4 pt-2 sm:w-auto sm:flex-row">
          <Link
            href="/observe"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#121417] px-8 py-4 text-base font-semibold text-[#FBF9F5] shadow-lg transition-all hover:bg-[#2D3139] sm:w-auto dark:bg-[#FBF9F5] dark:text-[#121417] dark:hover:bg-white/90"
          >
            <Sparkles aria-hidden="true" className="h-5 w-5" />
            <span>{t.heroCtaPrimary}</span>
            <ArrowUpRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>

          <Link
            href="/login"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E0D8] bg-white/70 px-8 py-4 text-base font-medium text-[#121417] transition-all hover:bg-[#F4F0EA] sm:w-auto dark:border-white/15 dark:bg-white/5 dark:text-[#FBF9F5] dark:hover:bg-white/10"
          >
            <span>{t.heroCtaSecondary}</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
