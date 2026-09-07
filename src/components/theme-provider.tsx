'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes'

/**
 * Fournisseur de thème pour l'application.
 * - `defaultTheme="system"` : suit la préférence du système à la première visite.
 * - `attribute="class"`    : bascule la classe `.dark` sur <html> (cf. globals.css).
 * - `enableSystem`         : autorise le thème "system" et sa résolution clair/sombre.
 */
export default function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
