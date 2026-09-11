import type { ReactNode } from 'react'
import AppShell from '@/components/app/AppShell'

/**
 * Espace « Expériences » (connecté) : mêmes sessions d'observation indépendantes
 * que la page publique `/observe`, mais sous la coquille applicative — barre
 * latérale repliable conservée pour maximiser la zone vidéo.
 *
 * §18 — L'onglet est l'ADMINISTRATION GLOBALE des expériences : réservé à l'ADMIN.
 * Un ANALYSTE n'y a plus accès et travaille uniquement sur les projets qui lui sont
 * déjà autorisés (`/analyst/projects`) — ses droits existants y sont intacts.
 *
 * La restriction est appliquée par `AppShell` CÔTÉ SERVEUR (redirection), pas par un
 * simple masquage de navigation : un analyste qui saisit l'URL directement est refusé.
 */
export default function ExperienceLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell allowed={['ADMIN', 'OBSERVER']}>
      {children}
    </AppShell>
  )
}
