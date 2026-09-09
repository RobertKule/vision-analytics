'use client'

import type { LucideIcon } from 'lucide-react'

export type TabItem = {
  id: string
  label: string
  count?: number
  icon?: LucideIcon
  hint?: string
}

type TabsProps = {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
  ariaLabel?: string
  className?: string
  size?: 'md' | 'lg'
}

/**
 * Barre d'onglets sans rechargement de page.
 *
 * Composant contrôlé : la valeur active et le changement sont gérés par le parent.
 * Style « soulignement rouge » cohérent avec la charte ONA Field.
 */
export default function Tabs({
  items,
  active,
  onChange,
  ariaLabel = 'Navigation par onglets',
  className = '',
  size = 'md',
}: TabsProps) {
  const padding = size === 'lg' ? 'px-5 py-3.5 text-sm sm:text-base' : 'px-4 py-2.5 text-sm'

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`-mb-px flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === active
        const Icon = item.icon
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`panel-${item.id}`}
            id={`tab-${item.id}`}
            onClick={() => onChange(item.id)}
            title={item.hint}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 font-semibold transition-colors ${padding} ${
              isActive
                ? 'border-gold-600 text-gold-700 dark:text-gold-400'
                : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {Icon ? <Icon aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
            <span>{item.label}</span>
            {item.count !== undefined ? (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                  isActive
                    ? 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
