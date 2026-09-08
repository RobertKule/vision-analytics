import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Harness de tests unitaires (vitest) — uniquement des modules PURES côté serveur
 * (aucun exceljs, aucun accès navigateur, aucune base de données). Les alias
 * `@/*` du tsconfig sont reproduits pour charger les librairies sous `src/lib`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts'],
  },
})
