/**
 * Validation des variables d'environnement requises au démarrage du serveur.
 * Un message d'erreur clair est levé si une variable obligatoire est absente ou vide.
 * Ce module ne doit être importé que depuis du code serveur (Server Actions, API Routes, lib serveur).
 *
 * Les identifiants Google Drive (service account) ne sont PAS validés ici : ils ne sont
 * requis qu'au moment d'une opération de stockage réelle (`src/lib/drive.ts` les résout
 * paresseusement), pour ne pas bloquer le démarrage d'un environnement sans stockage
 * configuré.
 */

type EnvSchema = {
  DATABASE_URL: string
}

function validateEnv(): EnvSchema {
  const required = ['DATABASE_URL'] as const

  const missing: string[] = []

  for (const key of required) {
    const value = process.env[key]
    if (!value || value.trim() === '') {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[ONA Field] Variables d'environnement manquantes ou vides :\n` +
        missing.map((k) => `  • ${k}`).join('\n') +
        `\n\nVérifiez votre fichier .env (développement) ou les variables d'environnement de votre hébergeur (production).`,
    )
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
  }
}

/**
 * Variables d'environnement validées et typées.
 * Lève une erreur explicite si une variable obligatoire est absente.
 */
export const env = validateEnv()
