'use client'

import { useEffect, useRef } from 'react'

/**
 * Champ de points animé (Canvas 2D natif) pour le HERO de la landing page.
 *
 * — Rendu sur `requestAnimationFrame` : les points dérivent en continu autour
 *   d'une position de repos (ressort) et suivent le pointeur (répulsion douce
 *   + légère attraction). Le suivi du curseur est écouté au niveau WINDOW —
 *   jamais sur le canvas (`pointer-events-none`), ce qui le rendrait muet.
 * — Les points tournent TOUJOURS : aucune image fixe, y compris sous
 *   `prefers-reduced-motion` (le mouvement reste doux et discret).
 * — Palette lue en direct sur la classe `.dark` de <html> (next-themes) : les
 *   points encre/or sur fond lait en clair, crème/or sur anthracite en sombre.
 *   Un `MutationObserver` recolore sans redémarrer l'animation au basculement.
 * — Redimensionnement géré (pixels physiques plafonnés à 2×) ; nettoyage
 *   complet (rAF + écouteurs + observer) au démontage ; aucun état React
 *   pendant l'animation (tout vit dans des refs) → aucune sur-render.
 *
 * Le canevas est rendu vide côté serveur : seules ses dimensions CSS comptent,
 * il n'y a donc aucun décalage d'hydratation.
 */

type Particle = {
  x: number
  y: number
  bx: number // base x — position de repos
  by: number
  vx: number
  vy: number
  r: number
  tone: number // 0 = base, 1 = doré, 2 = très discret
  phase: number
}

type Palette = {
  base: readonly [number, number, number]
  gold: readonly [number, number, number]
  line: string // « r, g, b » pour les liens entre points
}

/** Palette « sombre » : crème + or sur anthracite. */
const DARK_PALETTE: Palette = {
  base: [244, 240, 234] as const, // #F4F0EA — laiteux éditorial
  gold: [212, 163, 89] as const, // #D4A359 — accent or
  line: '244, 240, 234',
}

/** Palette « claire » : encre + or profond sur lait. */
const LIGHT_PALETTE: Palette = {
  base: [18, 20, 23] as const, // #121417 — encre éditorial
  gold: [156, 113, 27] as const, // #9C711B — or plus soutenu, lisible sur lait
  line: '18, 20, 23',
}

function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

function makeParticle(width: number, height: number, index: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    bx: Math.random() * width,
    by: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: 0.7 + Math.random() * 1.6,
    tone: index % 9 === 0 ? 1 : index % 11 === 0 ? 2 : 0,
    phase: Math.random() * Math.PI * 2,
  }
}

export default function HeroParticleField({
  density = 0.000045,
  className = '',
}: {
  /** Nombre cible de points par pixel² (approx. borné 28…150). */
  density?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let raf = 0
    let particles: Particle[] = []
    let running = true
    let dark = isDarkTheme()

    const pointer = { x: -9999, y: -9999, near: false }

    const palette = (): Palette => (dark ? DARK_PALETTE : LIGHT_PALETTE)

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height
      if (inside) {
        pointer.near = true
        pointer.x = x
        pointer.y = y
      } else {
        pointer.near = false
        pointer.x = -9999
        pointer.y = -9999
      }
    }

    const build = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.max(24, Math.min(150, Math.floor(width * height * density)))
      particles = Array.from({ length: count }, (_, i) => makeParticle(width, height, i))
    }

    const LINK_MAX = 120
    const drawFrame = (now: number) => {
      if (!running) return
      ctx.clearRect(0, 0, width, height)

      const t = now / 1000
      const { base, gold, line } = palette()
      const pointerDx = pointer.near ? pointer.x : -9999
      const pointerDy = pointer.near ? pointer.y : -9999

      for (const p of particles) {
        // Ressort : retour doux vers la position de repos.
        const ax = (p.bx - p.x) * 0.00055
        const ay = (p.by - p.y) * 0.00055
        // Répulsion du pointeur (léger halo).
        if (pointerDx > -1000) {
          const dx = p.x - pointerDx
          const dy = p.y - pointerDy
          const d2 = dx * dx + dy * dy
          if (d2 < 160 * 160 && d2 > 0.01) {
            const d = Math.sqrt(d2)
            const force = ((160 - d) / 160) * 0.028
            p.vx += (dx / d) * force
            p.vy += (dy / d) * force
          }
        }
        p.vx = (p.vx + ax) * 0.955
        p.vy = (p.vy + ay) * 0.955
        p.x += p.vx
        p.y += p.vy
        // Maintien dans la zone (repli élastique très doux aux bords).
        if (p.x < 0) p.x = 0
        if (p.x > width) p.x = width
        if (p.y < 0) p.y = 0
        if (p.y > height) p.y = height

        const [cr, cg, cb] = p.tone === 1 ? gold : base
        const twinkle = p.tone === 2 ? 0.12 : 0.32 + 0.16 * Math.sin(t * 0.8 + p.phase)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${Math.max(0.08, twinkle)})`
        ctx.fill()
      }

      // Liens très discrets entre points proches — texture « champ scientifique ».
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        if (a.tone === 2) continue
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK_MAX * LINK_MAX) {
            const alpha = (1 - Math.sqrt(d2) / LINK_MAX) * 0.05
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(${line}, ${alpha})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
        }
      }

      raf = requestAnimationFrame(drawFrame)
    }

    const onResize = () => {
      build()
      // L'animation repart du nouvel état (jamais d'image fixe).
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(drawFrame)
    }

    build()
    raf = requestAnimationFrame(drawFrame)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('resize', onResize)

    // Recoloration immédiate quand la classe `.dark` bascule (next-themes).
    const html = document.documentElement
    const observer = new MutationObserver(() => {
      dark = isDarkTheme()
    })
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', onResize)
      observer.disconnect()
    }
  }, [density])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  )
}
