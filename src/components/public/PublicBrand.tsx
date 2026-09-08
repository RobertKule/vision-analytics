import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'

/**
 * Bandeau monochrome « antigravité » partagé par toutes les routes publiques.
 * Typographie plein-bord VISIONANALYTICS — sans retour à la ligne, débordement
 * masqué pour éviter tout scroll horizontal.
 */
export default async function PublicBrand() {
  const locale = await getLocale()
  const t = getDictionary(locale).home

  return (
    <section
      aria-hidden="true"
      className="relative flex w-full select-none items-center justify-center overflow-hidden border-t border-[#E5E0D8] bg-[#F4F0EA] py-10 dark:border-white/10 dark:bg-[#080B0F] sm:py-14"
    >
      <h2 className="pointer-events-none whitespace-nowrap text-center text-[11vw] font-black uppercase leading-none tracking-tighter text-[#121417] sm:text-[12vw] dark:text-[#FBF9F5]">
        {t.brandLead}
        <span className="text-[#8C8275] dark:text-zinc-500">{t.brandAccent}</span>
      </h2>
    </section>
  )
}
