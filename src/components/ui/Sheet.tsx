'use client'

import { useEffect } from 'react'

type SheetProps = {
  open: boolean
  onClose: () => void
  /** id de l'en-tête du panneau (accessibilité `aria-labelledby`). */
  labelledBy?: string
  /** id d'un paragraphe descriptif (accessibilité `aria-describedby`). */
  describedBy?: string
  /** largeur du panneau (par défaut `max-w-xl` sur `w-full`). */
  widthClass?: string
  children: React.ReactNode
  /** pied de panneau collant (barre d'actions Précédent / Suivant / Confirmer). */
  footer?: React.ReactNode
}

/**
 * Panneau coulissant ancré à droite (right sheet), même anatomie que le tiroir
 * mobile de `UserActions` : voile + `role="dialog" aria-modal`, Échap pour
 * fermer, verrouillage du défilement du fond. `aria-modal` sans focus-trap
 * (cohérent avec les overlays existants du projet).
 */
export default function Sheet({
  open,
  onClose,
  labelledBy,
  describedBy,
  widthClass = 'max-w-xl',
  children,
  footer,
}: SheetProps) {
  // Échap ferme le panneau.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Verrouille le défilement du fond pendant que le panneau est ouvert.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l border-line bg-milk shadow-2xl animate-[sheet-in_0.25s_ease-out] dark:border-white/10 dark:bg-card ${widthClass}`}
      >
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <footer className="border-t border-line p-4 dark:border-white/10">{footer}</footer>
        ) : null}
      </div>
    </div>
  )
}
