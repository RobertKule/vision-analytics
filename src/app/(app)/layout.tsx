import type { ReactNode } from 'react'
import Navbar from '@/components/Navbar'

/**
 * Coquille des espaces protégés (dashboard, analyste, admin) : barre de
 * navigation applicative au-dessus du contenu. Les routes publiques (`/`,
 * `/observe`, `/login`, `/register`) vivent dans `(public)` et partagent leur
 * propre coquille éditoriale « milk cream » (src/app/(public)/layout.tsx).
 */
export default function AppZoneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />
      {children}
    </div>
  )
}
