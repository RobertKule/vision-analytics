import type { ReactNode } from 'react'
import AppShell from '@/components/app/AppShell'

/**
 * Espace « Expériences » (connecté) : mêmes sessions d'observation en aveugle
 * que la page publique `/observe`, mais sous la coquille applicative — barre
 * latérale repliable conservée pour maximiser la zone vidéo.
 */
export default function ExperienceLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell allowed={['ADMIN', 'ANALYST', 'OBSERVER']}>
      {children}
    </AppShell>
  )
}
