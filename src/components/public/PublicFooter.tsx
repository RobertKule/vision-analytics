import Link from 'next/link'
import Image from 'next/image'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

/**
 * Pied de page éditorial des pages publiques — marque Virunga, protocole,
 * liens secondaires et mentions. Coquille `(public)` : partagé sur `/`,
 * `/observe`, `/login`, `/register`, …
 */
export default async function PublicFooter() {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return (
    <footer className="bg-[#FBF9F5] dark:bg-[#0D1117]">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 text-sm text-[#4A4E57] dark:text-zinc-400 sm:px-6 sm:flex-row lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-[#121417]/10 dark:ring-white/15">
            <Image
              src="/Parc National des Virunga.png"
              alt=""
              width={28}
              height={28}
              className="h-6 w-6 object-contain"
            />
          </span>
          <span className="text-base font-bold tracking-tight text-[#121417] dark:text-[#FBF9F5]">
            ONA Field
          </span>
          <span className="text-xs text-[#8C8275] dark:text-zinc-500">| {t.protocolLabel}</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-[#4A4E57] dark:text-zinc-400">
          <Link href="/observe" className="transition-colors hover:text-[#121417] dark:hover:text-[#FBF9F5]">
            {t.footerExperiments}
          </Link>
          <Link href="/docs" className="transition-colors hover:text-[#121417] dark:hover:text-[#FBF9F5]">
            {t.navDocs}
          </Link>
          <Link href="/login" className="transition-colors hover:text-[#121417] dark:hover:text-[#FBF9F5]">
            {t.footerSignIn}
          </Link>
          <span aria-hidden="true" className="text-[#8C8275] dark:text-zinc-600">
            •
          </span>
          <span>{t.rightsLabel}</span>
        </div>
      </div>
    </footer>
  )
}
