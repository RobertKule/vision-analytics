'use client'

import { useTheme } from 'next-themes'
import { Toaster as SonnerToaster } from 'sonner'

/**
 * Conteneur global des notifications `sonner`.
 * Wrapper client : sonner ne détecte pas la classe `.dark` de next-themes par
 * défaut, on lui transmet donc explicitement le thème résolu.
 */
export default function Toaster() {
  const { resolvedTheme } = useTheme()

  return (
    <SonnerToaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ duration: 5000 }}
    />
  )
}
