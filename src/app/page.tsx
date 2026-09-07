import type { Metadata } from 'next'
import Link from 'next/link'
import { EyeOff, FileDown, Leaf, LogIn, ShieldCheck, Timer, Users } from 'lucide-react'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

const featureIcons = [Timer, EyeOff, Users, FileDown]

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return {
    title:
      locale === 'en'
        ? 'Vision Analytics — Double-blind scientific video observation'
        : 'Vision Analytics — Observation vidéo scientifique en double aveugle',
    description: t.lead,
  }
}

export default async function Home() {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
      {/* ——— Héros Virunga ——— */}
      <section className="relative flex flex-1 flex-col justify-center overflow-hidden py-16 sm:py-24">
        {/* Halo décoratif (emeraude / ambre) */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-24 h-80 w-80 rounded-full bg-forest-500/15 blur-3xl dark:bg-forest-500/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-mist-500/10 blur-3xl dark:bg-mist-500/15" />

        <div className="relative">
          <p className="inline-flex items-center gap-2 self-start rounded-full border border-forest-500/30 bg-forest-500/10 px-3 py-1 text-xs font-semibold text-forest-700 dark:text-forest-400">
            <Leaf aria-hidden="true" className="h-3.5 w-3.5" />
            {t.eyebrow}
          </p>

          <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-zinc-50">
            {t.h1Lead}{' '}
            <span className="bg-gradient-to-r from-forest-500 via-forest-600 to-mist-500 bg-clip-text text-transparent">
              {t.h1Accent}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t.lead}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <Link
              href="/observe"
              className="group inline-flex h-auto flex-1 items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-forest-500 to-forest-700 px-6 py-3.5 text-left shadow-lg shadow-forest-500/20 transition-all hover:shadow-forest-500/30 sm:flex-none"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm transition-transform group-hover:scale-105">
                <Leaf aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-base font-bold leading-tight text-white">{t.ctaParticipate}</span>
                <span className="text-xs font-medium text-forest-100/90">{t.ctaParticipateHint}</span>
              </span>
            </Link>

            <Link
              href="/login"
              className="group inline-flex h-auto flex-1 items-center justify-center gap-3 rounded-2xl border border-zinc-300 bg-white/80 px-6 py-3.5 text-left shadow-sm backdrop-blur transition-all hover:border-forest-500/50 hover:shadow-md sm:flex-none dark:border-white/10 dark:bg-white/5"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900/5 text-zinc-600 transition-colors group-hover:bg-forest-500/10 group-hover:text-forest-700 dark:bg-white/10 dark:text-zinc-300 dark:group-hover:text-forest-400">
                <LogIn aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-base font-bold leading-tight text-zinc-900 dark:text-zinc-50">
                  {t.ctaSignIn}
                </span>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{t.ctaSignInHint}</span>
              </span>
            </Link>
          </div>

          <p className="mt-5 inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-forest-600 dark:text-forest-400" />
            {t.note}
          </p>
        </div>
      </section>

      {/* ——— Fonctionnalités ——— */}
      <section aria-labelledby="features-title" className="pb-16 sm:pb-20">
        <div className="mb-6 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-forest-600 dark:text-forest-400">
            {t.featuresEyebrow}
          </p>
          <h2 id="features-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t.featuresTitle}
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.features.map((feature, index) => {
            const Icon = featureIcons[index] ?? Leaf
            return (
              <article
                key={feature.title}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-forest-500/40 hover:shadow-lg hover:shadow-forest-500/5 dark:border-white/10 dark:bg-[#161b22] dark:hover:border-forest-500/30"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-forest-500/10 text-forest-600 dark:text-forest-400">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{feature.desc}</p>
              </article>
            )
          })}
        </div>
      </section>

      {/* ——— Pied de page minimal ——— */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 py-8 text-xs text-zinc-400 dark:border-white/10 dark:text-zinc-500">
        <span>{t.footerTagline}</span>
        <Link
          href="/observe"
          className="font-medium text-zinc-500 underline-offset-2 transition-colors hover:text-forest-600 hover:underline dark:text-zinc-400 dark:hover:text-forest-400"
        >
          {t.footerCta}
        </Link>
      </footer>
    </main>
  )
}
