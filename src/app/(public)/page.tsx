import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import HeroParticleField from '@/components/public/HeroParticleField'
import ParallaxFloat from '@/components/public/ParallaxFloat'
import DemoVideo from '@/components/public/DemoVideo'

/**
 * Vidéo de démonstration (YouTube) — emplacement PRÉPARÉ, pas de lecteur interne.
 * Renseigner l'URL le jour venu ; tant qu'elle est absente, le composant
 * `DemoVideo` affiche un placeholder élégant (aucune requête, aucune vidéo).
 */
const DEMO_YOUTUBE_URL: string | null = null

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return {
    title:
      locale === 'fr'
        ? 'ONA Field — Laboratoire d’observation scientifique'
        : 'ONA Field — Scientific observation platform',
    description: t.heroSub,
  }
}

/**
 * Page d'accueil publique — deux sections :
 *   1. HERO plein écran sombre — typographie monumentale blanche + champ de
 *      points (Canvas 2D) ; CTA « Accéder à la plateforme » → /login.
 *   2. SECTION PRODUIT deux colonnes — copy produit à gauche, capture de
 *      l'annotateur (public/home/PageVideoAnnotor.png) à droite.
 * La section monumentale « ONA FIELD » (typographie plein-bord) et le pied de
 * page sont fournis par la coquille `(public)/layout.tsx` (PublicBrand).
 *
 * Jamais de lien d'observation publique / inscription ici : accès réservé
 * (compte validé par un ADMIN, ou lien de partage d'un jeton).
 */
export default async function Home() {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return (
    <>
      {/* ————————————————— HERO · plein cadre, mode clair & sombre ————————————————— */}
      <section className="relative isolate flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#FBF9F5] text-[#121417] dark:bg-[#0A0C10] dark:text-[#FBF9F5]">
        {/* Champ de points animé (Canvas 2D, plein cadre) */}
        <HeroParticleField />

        {/* Voiles radiaux très légers — profondeur, adaptés clair/sombre */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(52%_44%_at_72%_12%,rgba(212,163,89,0.22),transparent_64%)] dark:bg-[radial-gradient(52%_44%_at_72%_12%,rgba(212,163,89,0.16),transparent_64%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(44%_40%_at_16%_86%,rgba(74,78,87,0.10),transparent_62%)] dark:bg-[radial-gradient(44%_40%_at_16%_86%,rgba(122,133,153,0.14),transparent_62%)]"
        />
        {/* Vignette basse douce pour la lisibilité du bas de zone */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#FBF9F5]/70 dark:to-[#0A0C10]/70"
        />

        {/* Contenu centré */}
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 py-28 text-center lg:px-8">
          <p className="mb-7 inline-flex items-center gap-3 font-mono text-xs uppercase tracking-[0.32em] text-[#B8872A] dark:text-[#D4A359]/90">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#B8872A] dark:bg-[#D4A359]" />
            {t.heroEyebrow}
          </p>

          <h1 className="text-[clamp(4.2rem,13vw,11rem)] font-black leading-[0.92] tracking-tighter">
            <span className="block">{t.heroTitleLead}</span>
            <span className="block text-[#121417]/55 dark:text-[#FBF9F5]/60">{t.heroTitleAccent}</span>
          </h1>

          <p className="mt-9 max-w-2xl text-base font-normal leading-relaxed text-[#4A4E57] sm:text-lg dark:text-[#FBF9F5]/70">
            {t.heroSub}
          </p>

          <div className="mt-11 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#121417] px-8 py-4 text-base font-semibold text-[#FBF9F5] shadow-[0_10px_40px_-14px_rgba(18,20,23,0.45)] transition-all hover:bg-[#2D3139] sm:w-auto dark:bg-[#FBF9F5] dark:text-[#121417] dark:shadow-[0_10px_40px_-14px_rgba(251,249,245,0.45)] dark:hover:bg-white"
            >
              <span>{t.heroCtaPrimary}</span>
              <ArrowUpRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>

            <Link
              href="/docs"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#121417]/15 bg-[#121417]/[0.03] px-8 py-4 text-base font-medium text-[#121417]/85 backdrop-blur-sm transition-colors hover:bg-[#121417]/[0.07] sm:w-auto dark:border-[#FBF9F5]/25 dark:bg-[#FBF9F5]/[0.04] dark:text-[#FBF9F5]/85 dark:hover:bg-[#FBF9F5]/[0.09]"
            >
              <span>{t.heroCtaSecondary}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ——————————————— SECTION PRODUIT · deux colonnes (lait / anthracite) ——————————————— */}
      <section className="bg-[#FBF9F5] text-[#121417] dark:bg-[#0B0E13] dark:text-[#FBF9F5]">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-24 sm:py-28 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20 lg:px-8 lg:py-36">
          {/* ——— Copy ——— */}
          <div className="flex flex-col items-start">
            <p className="inline-flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-[#B8872A] dark:text-[#D4A359]/90">
              <span aria-hidden="true" className="h-px w-8 bg-[#B8872A]/70 dark:bg-[#D4A359]/70" />
              {t.productEyebrow}
            </p>

            <h2 className="mt-6 max-w-xl text-3xl font-bold leading-[1.08] tracking-tight text-[#121417] sm:text-4xl lg:text-[2.75rem] dark:text-[#FBF9F5]">
              {t.productTitle}
            </h2>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#4A4E57] sm:text-lg dark:text-zinc-400">
              {t.productLead}
            </p>

            <ul className="mt-10 w-full space-y-6">
              {t.productPoints.map((point, index) => (
                <li key={point.title} className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E0D8] font-mono text-[11px] font-semibold text-[#B8872A] dark:border-white/10 dark:text-[#D4A359]/90"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-[#121417] dark:text-[#FBF9F5]">
                      {point.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[#4A4E57] dark:text-zinc-400">
                      {point.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href="/docs"
              className="group mt-12 inline-flex items-center gap-2 text-sm font-semibold text-[#121417] dark:text-[#FBF9F5]"
            >
              <span className="underline decoration-[#B8872A]/60 decoration-2 underline-offset-4 transition-colors group-hover:decoration-[#B8872A] dark:decoration-[#D4A359]/60 dark:group-hover:decoration-[#D4A359]">
                {t.productCta}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>

          {/* ——— Capture ——— */}
          <ParallaxFloat strength={14} className="relative lg:pl-6">
            {/* Plaque décorative en retrait derrière la capture */}
            <div
              aria-hidden="true"
              className="absolute -inset-4 -z-10 hidden translate-x-5 translate-y-6 rounded-[2rem] bg-[#F4F0EA] ring-1 ring-[#E5E0D8] sm:block dark:bg-[#161B22] dark:ring-white/[0.06]"
            />
            <figure className="relative overflow-hidden rounded-[1.75rem] bg-[#0D1117] shadow-[0_40px_90px_-40px_rgba(18,20,23,0.45)] ring-1 ring-[#121417]/10 dark:ring-white/10">
              <Image
                src="/home/PageVideoAnnotor.png"
                alt={t.productAlt}
                width={1892}
                height={1085}
                priority
                sizes="(min-width: 1024px) 48vw, 92vw"
                className="h-auto w-full"
              />
            </figure>
          </ParallaxFloat>
        </div>
      </section>

      {/* ——————————— SECTION DÉMO · vidéo de démonstration (emplacement YouTube) ——————————— */}
      <section className="bg-[#FBF9F5] text-[#121417] dark:bg-[#0B0E13] dark:text-[#FBF9F5]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-24 sm:py-28 lg:px-8 lg:py-32">
          <p className="inline-flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-[#B8872A] dark:text-[#D4A359]/90">
            <span aria-hidden="true" className="h-px w-8 bg-[#B8872A]/70 dark:bg-[#D4A359]/70" />
            {t.demoEyebrow}
          </p>

          <h2 className="mt-6 max-w-2xl text-center text-3xl font-bold leading-[1.08] tracking-tight text-[#121417] sm:text-4xl lg:text-[2.75rem] dark:text-[#FBF9F5]">
            {t.demoTitle}
          </h2>

          <p className="mt-6 max-w-2xl text-center text-base leading-relaxed text-[#4A4E57] sm:text-lg dark:text-zinc-400">
            {t.demoLead}
          </p>

          {/* Emplacement du lecteur : placeholder tant que DEMO_YOUTUBE_URL est vide */}
          <div className="mt-12 w-full max-w-4xl">
            <DemoVideo
              youtubeUrl={DEMO_YOUTUBE_URL}
              playLabel={t.demoPlay}
              frameLabel={t.demoFrameLabel}
              placeholderTitle={t.demoPlaceholderTitle}
              placeholderHint={t.demoPlaceholderHint}
            />
          </div>
        </div>
      </section>
    </>
  )
}
