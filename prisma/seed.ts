/**
 * Seed d'amorçage — provisionne le compte administrateur initial d'un
 * environnement neuf à partir de SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 *
 * Règles de conception :
 *  - IDEMPOTENT : exécutable plusieurs fois sans créer de doublons.
 *  - SÉCURISÉ   : n'écrase jamais un compte existant d'un autre rôle (pas de
 *                 détournement de compte) et ne stocke que le hachage scrypt
 *                 du mot de passe (via src/lib/passwords, le mécanisme du projet).
 *  - SANS dépendance runtime : ces variables ne sont lues QUE par ce script.
 *    L'application (src/lib/auth.ts) n'authentifie jamais depuis l'environnement.
 *
 * Usage :
 *   1. renseignez SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD dans .env
 *   2. `npm run db:seed`  (équivaut à `prisma db seed`, charge `.env`)
 *
 * Si l'une des deux variables est absente, le seed se termine sans rien modifier
 * (message explicite) — utile en CI où le provisionnement est géré ailleurs.
 */

import { PrismaClient, Role } from '@prisma/client'
import { hashPassword } from '../src/lib/passwords'

const prisma = new PrismaClient()

const ADMIN_UNSET_MESSAGE = [
  '[Seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD non définies : aucun compte ',
  'administrateur créé. Renseignez ces variables puis relancez `npm run db:seed`.',
].join('')

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD ?? ''

  if (!email || !password) {
    console.log(ADMIN_UNSET_MESSAGE)
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    // Ne jamais « hijacker » un compte existant d'un autre rôle : on refuse de
    // promouvoir un analyste/observateur existant en ADMIN via le seed.
    if (existing.role !== Role.ADMIN) {
      console.log(
        `[Seed] Le compte « ${email} » existe déjà avec le rôle ${existing.role} : ` +
          'il ne sera pas promu administrateur automatiquement. Utilisez ' +
          'l’interface d’administration pour gérer ses permissions.',
      )
      return
    }
    // Administrateur déjà présent : rotation du mot de passe (réinitialisation).
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: await hashPassword(password), isActive: true },
    })
    console.log(
      `[Seed] Compte administrateur « ${email} » : mot de passe réinitialisé (rotation).`,
    )
    return
  }

  await prisma.user.create({
    data: {
      email,
      password: await hashPassword(password),
      role: Role.ADMIN,
      isActive: true,
    },
  })
  console.log(`[Seed] Compte administrateur « ${email} » créé.`)
}

main()
  .catch((error) => {
    console.error('[Seed] Erreur :', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
