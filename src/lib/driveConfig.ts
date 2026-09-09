/**
 * Google Drive — configuration serveur (compte de service).
 *
 * Résolution PAresseuse des variables d'environnement : aucune erreur au démarrage si le
 * stockage n'est pas configuré — seule une opération de stockage réelle échouera avec un
 * message explicite (`DriveConfigError` dans `drive.ts`).
 *
 * Variables lues (NOMS uniquement — jamais de valeur réelle ici, ni dans les logs, ni dans Git) :
 *   GOOGLE_DRIVE_CLIENT_EMAIL  — adresse du compte de service (ex. …@….iam.gserviceaccount.com)
 *   GOOGLE_DRIVE_PRIVATE_KEY   — clé privée RSA du compte de service (PEM, `\n` échappés acceptés)
 *   GOOGLE_DRIVE_FOLDER_ID     — dossier cible dans un Google Shared Drive (optionnel, recommandé)
 *
 * CONTRAINTE GOOGLE : un compte de service n'a aucun quota de stockage personnel ; il ne peut
 * écrire des octets que dans un Google Shared Drive dont il est membre. GOOGLE_DRIVE_FOLDER_ID
 * doit donc pointer vers un dossier d'un Shared Drive (les appels Drive portent
 * `supportsAllDrives=true`). Sans dossier, le code ciblerait la racine du compte de service,
 * que Google refuse en écriture (HTTP 403 « no storage quota »).
 */

import { normalizePrivateKeyPem } from '@/lib/driveAuth'

export type DriveConfig = {
  clientEmail: string
  privateKeyPem: string
  folderId: string | null
}

/** Lit et normalise la configuration ; renvoie null si aucun identifiant n'est présent. */
export function resolveDriveConfig(): DriveConfig | null {
  const clientEmail = (process.env.GOOGLE_DRIVE_CLIENT_EMAIL ?? '').trim()
  const privateKeyRaw = (process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? '').trim()
  if (!clientEmail || !privateKeyRaw) return null

  const privateKeyPem = normalizePrivateKeyPem(privateKeyRaw)
  const folderId = (process.env.GOOGLE_DRIVE_FOLDER_ID ?? '').trim() || null

  return { clientEmail, privateKeyPem, folderId }
}
