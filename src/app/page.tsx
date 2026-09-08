import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Eye, Lock, Sparkles } from 'lucide-react'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import LanguageToggle from '@/components/LanguageToggle'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return {
    title:
      locale === 'fr'
        ? 'Vision Analytics — Laboratoire d’observation en double aveugle'
        : 'Vision Analytics — Double-blind observation laboratory',
    description: t.heroSub,
  }
}

export default async function Home() {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#FBF9F5] text-[#121417] selection:bg-[#121417] selection:text-[#FBF9F5]">
      {/* ——— 1. HEADER / NAVBAR éditorial ——— */}
      <header className="sticky top-0 z-50 w-full border-b border-[#E5E0D8] bg-[#FBF9F5]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          {/* Marque */}
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#121417]/10 bg-[#121417]/5 transition-colors group-hover:border-[#121417]/30">
              <Eye aria-hidden="true" className="h-4 w-4 text-[#121417]" />
            </span>
            <span className="flex items-center gap-2 text-base font-bold tracking-tight text-[#121417]">
              Vision Analytics
              <span className="rounded border border-[#121417]/10 bg-[#121417]/5 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#4A4E57]">
                LAB
              </span>
            </span>
          </Link>

          {/* Liens centraux (desktop) */}
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#4A4E57] md:flex">
            <Link href="/" className="transition-colors hover:text-[#121417]">
              {t.navHome}
            </Link>
            <Link
              href="/observe"
              className="flex items-center gap-1.5 transition-colors hover:text-[#121417]"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#121417]" aria-hidden="true" />
              {t.navExperiments}
            </Link>
          </nav>

          {/* Actions (droite) */}
          <div className="flex shrink-0 items-center gap-3">
            <LanguageToggle locale={locale} variant="mono" />
            <Link
              href="/login"
              className="hidden items-center gap-2 rounded-lg border border-[#121417]/15 px-3.5 py-2 text-sm font-medium text-[#121417] transition-all hover:bg-[#121417]/5 sm:inline-flex"
            >
              <Lock aria-hidden="true" className="h-3.5 w-3.5 text-[#4A4E57]" />
              <span>{t.loginCta}</span>
            </Link>
            <Link
              href="/observe"
              className="inline-flex items-center gap-2 rounded-lg bg-[#121417] px-4 py-2 text-sm font-semibold text-[#FBF9F5] shadow-md transition-all hover:scale-[1.02] hover:bg-[#2D3139]"
            >
              <Sparkles aria-hidden="true" className="h-4 w-4 text-[#FBF9F5]" />
              <span>{t.participateCta}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ——— 2. HERO (fond chaud + dégradé crème) ——— */}
      <section className="relative flex min-h-[80vh] items-center justify-center overflow-hidden border-b border-[#E5E0D8] px-6">
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
          className="absolute inset-0 bg-gradient-to-b from-[#FBF9F5]/95 via-[#FBF9F5]/80 to-[#FBF9F5]"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-8 py-16 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#121417]/10 bg-[#121417]/5 px-3.5 py-1.5 font-mono text-xs tracking-wide text-[#4A4E57]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#121417]" aria-hidden="true" />
            {t.badge}
          </p>

          <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-[#121417] sm:text-6xl lg:text-7xl">
            {t.heroTitleLead} <br />
            <span className="text-[#8C8275]">{t.heroTitleAccent}</span>
          </h1>

          <p className="max-w-2xl text-base font-normal leading-relaxed text-[#4A4E57] sm:text-lg">
            {t.heroSub}
          </p>

          <div className="flex w-full flex-col items-center gap-4 pt-2 sm:w-auto sm:flex-row">
            <Link
              href="/observe"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#121417] px-8 py-4 text-base font-semibold text-[#FBF9F5] shadow-lg transition-all hover:bg-[#2D3139] sm:w-auto"
            >
              <Sparkles aria-hidden="true" className="h-5 w-5 text-[#FBF9F5]" />
              <span>{t.heroCtaPrimary}</span>
              <ArrowUpRight
                aria-hidden="true"
                className="h-4 w-4 text-[#FBF9F5] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>

            <Link
              href="/login"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5E0D8] bg-white px-8 py-4 text-base font-medium text-[#121417] transition-all hover:bg-[#F4F0EA] sm:w-auto"
            >
              <Lock aria-hidden="true" className="h-4 w-4 text-[#4A4E57]" />
              <span>{t.heroCtaSecondary}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ——— 3. BANDEAU MONOCHROME ANTI-GRAVITY ——— */}
      <section className="flex select-none items-center justify-center overflow-hidden border-b border-[#E5E0D8] bg-[#F4F0EA] px-4 py-24 sm:py-32">
        <h2 className="text-center text-[13vw] font-black uppercase leading-none tracking-tighter text-[#121417] sm:text-[14vw]">
          {t.brandLead}
          <span className="text-[#8C8275]">{t.brandAccent}</span>
        </h2>
      </section>

      {/* ——— 4. PIED DE PAGE ——— */}
      <footer className="bg-[#FBF9F5] px-6 py-10 text-sm text-[#4A4E57] sm:px-12">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold tracking-tight text-[#121417]">Vision Analytics</span>
            <span className="text-xs text-[#8C8275]">| {t.protocolLabel}</span>
          </div>

          <div className="flex items-center gap-8 text-xs font-medium text-[#4A4E57]">
            <Link href="/observe" className="transition-colors hover:text-[#121417]">
              {t.footerExperiments}
            </Link>
            <Link href="/login" className="transition-colors hover:text-[#121417]">
              {t.footerSignIn}
            </Link>
            <span className="text-[#E5E0D8]" aria-hidden="true">
              •
            </span>
            <span>{t.rightsLabel}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
