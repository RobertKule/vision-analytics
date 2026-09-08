import type { ReactNode } from 'react'
import Navbar from '@/components/Navbar'

/**
 * Coquille des pages applicatives (connexion, inscription, observation et
 * espaces protégés). La page marketing racine `/` est volontairement exclue de
 * ce groupe : elle possède sa propre navigation éditoriale « milk cream ».
 */
export default function AppZoneLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />
      {children}
    </div>
  )
}
