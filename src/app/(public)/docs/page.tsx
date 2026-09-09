import type { Metadata } from 'next'
import { BookOpen } from 'lucide-react'
import { getLocale } from '@/lib/i18n-server'
import { type Locale } from '@/lib/i18n'
import { getDocs, type DocsLocale, type DocsSection } from '@/lib/docs'
import DocsSidebar from '@/components/public/DocsSidebar'

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

/** Carte article : un `DocsSection` avec son ancre `#id` (cible du scroll-spy). */
function ArticleCard({ section }: { section: DocsSection }) {
  return (
    <article
      id={section.id}
      className="scroll-mt-24 rounded-2xl border border-[#E5E0D8] bg-white/70 p-6 sm:p-8 dark:border-white/10 dark:bg-white/[0.03]"
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
  )
}

/** Groupe de lecture (« Guides utilisateurs » / « Référence développeur »). */
function DocsGroup({
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
    <section id={groupId} className="scroll-mt-24">
      <header className="mb-6">
        <div className="flex items-center gap-2.5">
          <BookOpen
            aria-hidden="true"
            className="h-5 w-5 text-[#BD8F2E] dark:text-[#D0A94E]"
          />
          <h2 className="text-2xl font-extrabold tracking-tight text-[#121417] dark:text-[#FBF9F5] sm:text-3xl">
            {title}
          </h2>
        </div>
        <p className="mt-1.5 text-sm text-[#4A4E57] dark:text-zinc-400">{intro}</p>
      </header>
      <div className="space-y-5">
        {sections.map((section) => (
          <ArticleCard key={section.id} section={section} />
        ))}
      </div>
    </section>
  )
}

export default async function DocsPage() {
  const locale = await getLocale()
  const docs: DocsLocale = getDocs(locale as Locale)

  const groups = [
    {
      id: 'guides',
      title: docs.tocUsers,
      sections: docs.users.map((section) => ({ id: section.id, title: section.title })),
    },
    {
      id: 'reference',
      title: docs.tocDevs,
      sections: docs.devs.map((section) => ({ id: section.id, title: section.title })),
    },
  ]

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

      {/* ——— SOMMAIRE LATÉRAL + CONTENU ——— */}
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
          <DocsSidebar
            groups={groups}
            label={docs.navTitle}
            mobileLabel={docs.navTitle}
          />

          <div className="min-w-0 space-y-14">
            <DocsGroup
              groupId="guides"
              title={docs.tocUsers}
              intro={docs.usersIntro}
              sections={docs.users}
            />
            <div className="h-px w-full bg-[#E5E0D8] dark:bg-white/10" aria-hidden="true" />
            <DocsGroup
              groupId="reference"
              title={docs.tocDevs}
              intro={docs.devsIntro}
              sections={docs.devs}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
