'use client'

import { useEffect, useState } from 'react'

/**
 * Garde le rendu SSR de Recharts : `ResponsiveContainer` exige une taille
 * mesurable, absente au pré-rendu. `mounted` bascule via `requestAnimationFrame`
 * (jamais de `setState` synchrone dans le corps de l'effet), après quoi l'enfant
 * (les graphiques) est monté dans son conteneur à hauteur fixe.
 *
 * Chaque graphique est rendu par l'appelant dans un `div` de hauteur fixe
 * (`h-56 w-full`, etc.) ; `isAnimationActive={false}` sur les graphiques évite
 * le flocon de `ResizeObserver` en build/test.
 */
export default function ClientChart({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!mounted) {
    return (
      <div
        role="status"
        aria-label="Chargement des visualisations"
        className="flex h-56 w-full items-center justify-center text-sm text-mute"
      >
        …
      </div>
    )
  }

  return <>{children}</>
}
