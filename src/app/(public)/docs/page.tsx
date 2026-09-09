import type { Metadata } from 'next'
import { BookOpen, Braces } from 'lucide-react'
import { getLocale } from '@/lib/i18n-server'
import { type Locale } from '@/lib/i18n'
import { getDocs, type DocsSection } from '@/lib/docs'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: getDocs(locale as Locale).metaTitle,
    description:
      locale === 'en'
        ? 'User guides (Observer, Analyst, Administrator) and technical reference for developers.'
        : 'Guides utilisateurs (Observateur, Analyste, Administrateur) et référence technique pour développeurs.',
  }
}

const INLINE_CODE_CLASS =
  'rounded-md bg-[#121417]/5 px-1.5 py-0.5 font-mono text-[0.86em] font-medium text-[#121417] ring-1 ring-[#121417]/10 dark:bg-white/10 dark:text-[#FBF9F5] dark:ring-white/15'

/** Rend le texte en remplaçant `code` (backticks) par des éléments <code>. */
function Rich({ text }: { text: string }) {
  const parts = text.split('`')
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className={INLINE_CODE_CLASS}>
            {part}
          </code>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

function SectionBlocks({ section }: { section: DocsSection }) {
  return (
    <>
      {section.intro && (
        <p className="mt-2 text-sm font-medium italic text-[#8C8275] dark:text-zinc-500">
          {section.intro}
        </p>
      )}
      {section.blocks.map((block, index) => {
        if (block.kind === 'p') {
          return (
            <p
              key={index}
              className="mt-4 text-[15px] leading-relaxed text-[#4A4E57] dark:text-zinc-300"
            >
              <Rich text={block.text} />
            </p>
          )
        }
        if (block.kind === 'ol') {
          return (
            <ol
              key={index}
              className="mt-4 list-decimal space-y-2.5 pl-5 text-[15px] leading-relaxed text-[#4A4E57] marker:font-semibold marker:text-[#121417] dark:text-zinc-300 dark:marker:text-[#FBF9F5]"
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Rich text={item} />
                </li>
              ))}
            </ol>
          )
        }
        if (block.kind === 'ul') {
          return (
            <ul
              key={index}
              className="mt-4 list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-[#4A4E57] marker:text-[#BD8F2E] dark:text-zinc-300 dark:marker:text-[#D0A94E]"
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Rich text={item} />
                </li>
              ))}
            </ul>
          )
        }
        // block.kind === 'code'
        return (
          <pre
            key={index}
            className="mt-4 overflow-x-auto rounded-xl border border-[#E5E0D8] bg-[#F4F0EA] p-4 font-mono text-[12.5px] leading-relaxed text-[#121417] dark:border-white/10 dark:bg-white/5 dark:text-[#FBF9F5]"
          >
            <code>{block.text}</code>
          </pre>
        )
      })}
    </>
  )
}

export default async function DocsPage() {
  const locale = await getLocale()
  const docs = getDocs(locale as Locale)

  return (
    <div className="border-b border-[#E5E0D8] dark:border-white/10">
      {/* ——— HERO ——— */}
      <section className="border-b border-[#E5E0D8] bg-[#FBF9F5] dark:border-white/10 dark:bg-[#0D1117]">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-14 sm:px-6 lg:px-8">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#121417]/10 bg-[#121417]/5 px-3.5 py-1.5 font-mono text-xs tracking-wide text-[#4A4E57] dark:border-white/15 dark:bg-white/5 dark:text-zinc-400">
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5 text-[#BD8F2E] dark:text-[#D0A94E]" />
            {docs.heroEyebrow}
          </p>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-[#121417] dark:text-[#FBF9F5] sm:text-5xl">
            {docs.heroTitle}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[#4A4E57] dark:text-zinc-400">
            {docs.heroIntro}
          </p>
        </div>
      </section>

      {/* ——— SOMMAIRE : deux niveaux ——— */}
      <section className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="#guides"
            className="group flex flex-col gap-2 rounded-2xl border border-[#E5E0D8] bg-white/70 p-5 transition-colors hover:border-[#BD8F2E]/60 dark:border-white/10 dark:bg-white/5 dark:hover:border-[#D0A94E]/50"
          >
            <span className="flex items-center gap-2 text-base font-bold text-[#121417] dark:text-[#FBF9F5]">
              <BookOpen
                aria-hidden="true"
                className="h-5 w-5 text-[#BD8F2E] transition-transform group-hover:-translate-y-0.5 dark:text-[#D0A94E]"
              />
              {docs.tocUsers}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#4A4E57] dark:text-zinc-400">
              {docs.users.map((section) => (
                <span key={section.id} className="underline decoration-[#BD8F2E]/50 underline-offset-2">
                  {section.title}
                </span>
              ))}
            </span>
          </a>

          <a
            href="#reference"
            className="group flex flex-col gap-2 rounded-2xl border border-[#E5E0D8] bg-white/70 p-5 transition-colors hover:border-[#BD8F2E]/60 dark:border-white/10 dark:bg-white/5 dark:hover:border-[#D0A94E]/50"
          >
            <span className="flex items-center gap-2 text-base font-bold text-[#121417] dark:text-[#FBF9F5]">
              <Braces
                aria-hidden="true"
                className="h-5 w-5 text-[#BD8F2E] transition-transform group-hover:-translate-y-0.5 dark:text-[#D0A94E]"
              />
              {docs.tocDevs}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#4A4E57] dark:text-zinc-400">
              {docs.devs.slice(0, 6).map((section) => (
                <span key={section.id} className="underline decoration-[#BD8F2E]/50 underline-offset-2">
                  {section.title}
                </span>
              ))}
            </span>
          </a>
        </div>
      </section>

      {/* ——— GUIDES UTILISATEURS ——— */}
      <DocsAudience
        groupId="guides"
        title={docs.tocUsers}
        intro={docs.usersIntro}
        sections={docs.users}
      />

      {/* ——— RÉFÉRENCE DÉVELOPPEUR ——— */}
      <DocsAudience
        groupId="reference"
        title={docs.tocDevs}
        intro={docs.devsIntro}
        sections={docs.devs}
      />
    </div>
  )
}

function DocsAudience({
  groupId,
  title,
  intro,
  sections,
}: {
  groupId: string
  title: string
  intro: string
  sections: DocsSection[]
}) {
  return (
    <section
      id={groupId}
      className="scroll-mt-20 border-t border-[#E5E0D8] bg-[#FBF9F5] dark:border-white/10 dark:bg-[#0D1117]"
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h2 className="text-2xl font-extrabold tracking-tight text-[#121417] dark:text-[#FBF9F5] sm:text-3xl">
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-[#4A4E57] dark:text-zinc-400">{intro}</p>

          {/* Sous-sommaire par section (ancres) */}
          <nav aria-label={title} className="mt-5 flex flex-wrap gap-2">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-[#E5E0D8] bg-white/70 px-3 py-1 text-xs font-medium text-[#4A4E57] transition-colors hover:border-[#BD8F2E]/60 hover:text-[#7C5813] dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:border-[#D0A94E]/50 dark:hover:text-[#D0A94E]"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </header>

        <div className="space-y-10">
          {sections.map((section) => (
            <article
              key={section.id}
              id={section.id}
              className="scroll-mt-24 rounded-2xl border border-[#E5E0D8] bg-white/60 p-6 sm:p-8 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-[7px] h-4 w-1 shrink-0 rounded-full bg-[#BD8F2E] dark:bg-[#D0A94E]"
                />
                <h3 className="text-lg font-bold tracking-tight text-[#121417] dark:text-[#FBF9F5] sm:text-xl">
                  {section.title}
                </h3>
              </div>
              <div className="pl-4">
                <SectionBlocks section={section} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
