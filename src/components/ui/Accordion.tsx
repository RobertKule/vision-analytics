'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

/**
 * Accordéon de section — regroupe les blocs d'une page dense (projet, statistiques,
 * détail) derrière un en-tête cliquable, à la manière des cartes de l'espace admin.
 *
 * Le corps reste MONTÉ : le repli ne fait que le masquer (`hidden`). Aucun panneau ne
 * perd son état interne (brouillons de saisie, listes déjà chargées) au repli/dépli.
 * Pour les panneaux qui déclenchent une requête au montage, `lazy` évite de les
 * charger tant que l'utilisateur ne les a pas ouverts au moins une fois.
 *
 * Accessibilité : l'en-tête est un vrai `button` (pilotable au clavier) qui expose
 * `aria-expanded` / `aria-controls` ; le corps est une région étiquetée par son titre.
 */

export type AccordionTone = 'gold' | 'slate' | 'ink'

const TONES: Record<AccordionTone, string> = {
  gold: 'bg-gold-500/15 text-gold-700 dark:bg-gold-400/10 dark:text-gold-400',
  slate: 'bg-slate/15 text-slate dark:bg-slate/20 dark:text-zinc-300',
  ink: 'bg-ink/10 text-ink dark:bg-milk/10 dark:text-milk',
}

type AccordionProps = {
  /** Slug stable : lie l'en-tête à son panneau (`aria-controls` / `aria-labelledby`). */
  id: string
  title: string
  icon?: LucideIcon
  tone?: AccordionTone
  /** Compteur affiché à droite du titre (fenêtres, observations, jetons…). */
  count?: number
  /** Ligne d'état toujours lisible, même replié — l'information ne disparaît pas. */
  hint?: string
  /** Ouvert au premier rendu ; l'utilisateur reste libre de replier. */
  defaultOpen?: boolean
  /** Ne monte le contenu qu'à la première ouverture (panneaux qui chargent des données). */
  lazy?: boolean
  /** Padding du corps, à ajuster selon le contenu imbriqué. */
  bodyClassName?: string
  children: ReactNode
}

export default function Accordion({
  id,
  title,
  icon: Icon,
  tone = 'gold',
  count,
  hint,
  defaultOpen = true,
  lazy = false,
  bodyClassName = 'px-5 pb-5 pt-2',
  children,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  // Un panneau `lazy` n'est monté qu'après sa première ouverture, puis le reste.
  const [openedOnce, setOpenedOnce] = useState(defaultOpen)

  const headerId = `accordion-${id}-header`
  const panelId = `accordion-${id}-panel`
  const showChildren = !lazy || openedOnce

  const toggle = () => {
    setOpen((current) => {
      if (!current) setOpenedOnce(true)
      return !current
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161b22]">
      <h2 className="m-0">
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {Icon ? (
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  {title}
                </span>
                {typeof count === 'number' ? (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
                    {count}
                  </span>
                ) : null}
              </span>
              {hint ? (
                <span className="mt-0.5 truncate text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                  {hint}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className={open ? bodyClassName : `hidden ${bodyClassName}`}
      >
        {showChildren ? children : null}
      </div>
    </section>
  )
}
