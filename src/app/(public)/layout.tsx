import type { ReactNode } from 'react'
import PublicHeader from '@/components/public/PublicHeader'
import PublicBrand from '@/components/public/PublicBrand'
import PublicFooter from '@/components/public/PublicFooter'

/**
 * Coquille éditoriale UNIQUE de toutes les routes publiques — `/`, `/observe`,
 * `/login`, `/register` — qui partagent exactement le même en-tête (logo
 * Virunga + thème + langue), le même bandeau « antigravité » et le même pied
 * de page. Palette : lait crème (#FBF9F5) en clair, anthracite (#0D1117) en
 * sombre, sans accent vert.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FBF9F5] text-[#121417] selection:bg-[#121417] selection:text-[#FBF9F5] dark:bg-[#0D1117] dark:text-[#FBF9F5] dark:selection:bg-[#FBF9F5] dark:selection:text-[#121417]">
      <PublicHeader />
      <main className="flex flex-1 flex-col">{children}</main>
      <PublicBrand />
      <PublicFooter />
    </div>
  )
}
