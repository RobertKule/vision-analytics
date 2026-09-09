'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, List } from 'lucide-react'
import { useId } from 'react'

export type DocsSidebarGroup = {
  id: string
  title: string
  sections: { id: string; title: string }[]
}

/**
 * Navigation latérale de `/docs` :
 *  — sur grand écran : rail collant avec surbrillance de la section active (scroll-spy) ;
 *  — sur petit écran : panneau repliable piloté par un bouton accessible ;
 *  — chaque entrée est une ancre (`#id`) ; `aria-current` suit la section lue.
 */
export default function DocsSidebar({
  groups,
  label,
  mobileLabel,
}: {
  groups: DocsSidebarGroup[]
  label: string
  mobileLabel: string
}) {
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const allIds = useMemo(() => groups.flatMap((group) => group.sections.map((s) => s.id)), [groups])
  const [activeId, setActiveId] = useState<string>(() => allIds[0] ?? '')
  const rafId = useRef<number | null>(null)
  const ticking = useRef(false)

  // Scroll-spy : la section active est celle dont le haut passe sous ~40 % de la hauteur d'écran.
  useEffect(() => {
    const compute = () => {
      ticking.current = false
      rafId.current = null
      const probe = Math.min(window.innerHeight * 0.4, 320)
      let current = allIds[0] ?? ''
      for (const id of allIds) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= probe) current = id
      }
      setActiveId(current)
    }
    const schedule = () => {
      if (ticking.current) return
      ticking.current = true
      rafId.current = window.requestAnimationFrame(compute)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (rafId.current !== null) window.cancelAnimationFrame(rafId.current)
    }
  }, [allIds])

  // Échappe : replie le panneau mobile.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const linkBase =
    'block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors'
  const linkIdle =
    'text-[#4A4E57] hover:bg-[#121417]/5 hover:text-[#121417] dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-[#FBF9F5]'
  const linkActive =
    'bg-[#BD8F2E]/12 text-[#7C5813] dark:bg-[#D0A94E]/10 dark:text-[#D0A94E]'
  const groupLabel =
    'mt-5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8C8275] first:mt-0 dark:text-zinc-500'

  return (
    <nav aria-label={label} className="lg:sticky lg:top-24 lg:self-start">
      {/* ——— Bouton mobile ——— */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="mb-4 inline-flex w-full items-center justify-between gap-2 rounded-xl border border-[#E5E0D8] bg-white/70 px-3.5 py-2.5 text-sm font-semibold text-[#121417] transition-colors hover:border-[#BD8F2E]/60 lg:hidden dark:border-white/10 dark:bg-white/5 dark:text-[#FBF9F5] dark:hover:border-[#D0A94E]/50"
      >
        <span className="inline-flex items-center gap-2">
          <List aria-hidden="true" className="h-4 w-4 text-[#BD8F2E] dark:text-[#D0A94E]" />
          {mobileLabel}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 text-[#8C8275] transition-transform dark:text-zinc-500 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ——— Rail de navigation ——— */}
      <div
        id={panelId}
        className={`${open ? 'block' : 'hidden'} lg:block`}
      >
        <div className="max-h-[70vh] space-y-1 overflow-y-auto rounded-2xl border border-[#E5E0D8] bg-white/70 p-3 lg:max-h-[calc(100vh-11rem)] lg:border-transparent lg:bg-transparent lg:p-0 dark:border-white/10 dark:bg-white/5 dark:lg:border-transparent dark:lg:bg-transparent">
          {groups.map((group) => {
            const groupActive = group.sections.some((section) => section.id === activeId)
            return (
              <div key={group.id}>
                <a
                  href={`#${group.id}`}
                  onClick={() => setOpen(false)}
                  className={`${groupLabel} ${groupActive ? 'text-[#121417] dark:text-[#FBF9F5]' : ''}`}
                >
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#BD8F2E] dark:bg-[#D0A94E]" />
                  {group.title}
                </a>
                <ul className="mt-1 space-y-0.5">
                  {group.sections.map((section) => {
                    const isActive = section.id === activeId
                    return (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          onClick={() => setOpen(false)}
                          aria-current={isActive ? 'location' : undefined}
                          className={`${linkBase} ${isActive ? linkActive : linkIdle}`}
                        >
                          {section.title}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
