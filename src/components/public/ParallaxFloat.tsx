'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Léger déplacement vertical « parallaxe » au défilement, pour une image ou un
 * bloc décoratif. La translation est bornée à ±`strength` px et dépend de la
 * position du bloc par rapport au centre du viewport.
 *
 * — Calculée en `requestAnimationFrame` (paresseux) ; aucun état React.
 * — `prefers-reduced-motion` : aucune transformation (contenu statique).
 * — Ne bouge que lorsque le bloc est dans le viewport.
 */
export default function ParallaxFloat({
  children,
  className = '',
  strength = 12,
}: {
  children: ReactNode
  className?: string
  /** Amplitude max (px) de la translation. */
  strength?: number
}) {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const apply = () => {
      raf = 0
      const rect = outer.getBoundingClientRect()
      const vh = window.innerHeight
      if (rect.bottom < 0 || rect.top > vh) return
      const progress = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2)
      inner.style.transform = `translate3d(0, ${(-progress * strength).toFixed(2)}px, 0)`
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [strength])

  return (
    <div ref={outerRef} className={className}>
      <div ref={innerRef} className="will-change-transform">
        {children}
      </div>
    </div>
  )
}
