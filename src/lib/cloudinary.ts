import { v2 as cloudinary } from 'cloudinary'
import { cloudinaryPublicIdFromUrl } from '@/lib/cloudinaryRef'
export { cloudinaryPublicIdFromUrl } from '@/lib/cloudinaryRef'

/**
 * Cloudinary — upload & suppression centralisés des captures annotées.
 *
 * Règles :
 *  — La base de données ne conserve QUE les références image (`imageUrl` + `imagePublicId`),
 *    jamais le binaire (stocké uniquement chez Cloudinary).
 *  — Toute suppression d'une capture doit passer par `deleteCloudinaryAsset` AVANT la
 *    suppression de la ligne en base : si Cloudinary échoue temporairement, la référence
 *    n'est pas supprimée silencieusement (on évite un asset orphelin sans traitement ultérieur).
 */

const cloudinaryEnvVars = {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
}

const missingKeys = Object.entries(cloudinaryEnvVars)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missingKeys.length > 0) {
  throw new Error(
    `Configuration Cloudinary incomplète. Variables manquantes : ${missingKeys.join(', ')}.`,
  )
}

cloudinary.config({
  cloud_name: cloudinaryEnvVars.CLOUDINARY_CLOUD_NAME,
  api_key: cloudinaryEnvVars.CLOUDINARY_API_KEY,
  api_secret: cloudinaryEnvVars.CLOUDINARY_API_SECRET,
})

/** Dossier de stockage des captures annotées (conservé pour la compatibilité des assets existants). */
export const ANNOTATION_FOLDER = 'vision-analytics/annotations'

export type CloudinaryImageReference = {
  /** URL sécurisée d'accès à l'image (persistée dans `Observation.imageUrl`). */
  secureUrl: string
  /** Identifiant Cloudinary de l'asset (persisté dans `Observation.imagePublicId`). */
  publicId: string
}

/**
 * Upload une image au format Base64 vers Cloudinary.
 * @param base64Image Chaîne encodée "data:image/png;base64,..."
 */
export async function uploadAnnotationImage(base64Image: string): Promise<CloudinaryImageReference> {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: ANNOTATION_FOLDER,
      resource_type: 'image',
    })
    return { secureUrl: result.secure_url, publicId: result.public_id }
  } catch (error) {
    console.error('Erreur lors du téléversement vers Cloudinary:', error)
    throw new Error('Échec du téléversement de la capture annotée.')
  }
}

/**
 * Upload « historique » ne renvoyant que l'URL sécurisée (compatibilité).
 * @deprecated Préférer `uploadAnnotationImage` qui renvoie aussi le `public_id`.
 */
export async function uploadAnnotationToCloudinary(base64Image: string): Promise<string> {
  const { secureUrl } = await uploadAnnotationImage(base64Image)
  return secureUrl
}

export type CloudinaryDeleteResult =
  | { ok: true; reason: 'deleted' | 'not-found' }
  | { ok: false; error: string }

/**
 * Supprime un asset Cloudinary par son `public_id`. Un asset déjà absent
 * (« not found ») est considéré comme supprimé (état final identique).
 * En cas d'erreur réseau/API transitoire, la promesse rejette : l'appelant doit
 * ALORS conserver la référence en base (pas de suppression silencieuse → pas d'orphelin).
 */
export async function deleteCloudinaryAsset(
  publicIdOrUrl: string,
): Promise<CloudinaryDeleteResult> {
  const publicId = publicIdOrUrl.includes('/upload/')
    ? cloudinaryPublicIdFromUrl(publicIdOrUrl)
    : publicIdOrUrl.trim() || null
  if (!publicId) return { ok: false, error: 'public_id Cloudinary introuvable.' }
  try {
    const response = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    })
    if (response.result === 'ok') return { ok: true, reason: 'deleted' }
    if (response.result === 'not found') return { ok: true, reason: 'not-found' }
    return { ok: false, error: `Réponse Cloudinary inattendue : ${response.result}` }
  } catch (error) {
    console.error('Erreur lors de la suppression Cloudinary:', error)
    throw new Error('Échec de la suppression de la capture chez Cloudinary.')
  }
}

/** Concurrence interne des suppressions groupées (réseau). */
const BULK_DELETE_CONCURRENCY = 4

/**
 * Suppression groupée « best effort » (purge de projet…) : chaque asset est tenté
 * individuellement ; un échec réseau sur UN asset n'interrompt pas les autres.
 * Renvoie le nombre de succès et le nombre d'échecs (les échecs peuvent ensuite être
 * signalés au journal d'audit, jamais traités en silence).
 */
export async function deleteManyCloudinaryAssets(
  references: Array<string | { publicId?: string | null; imageUrl?: string | null }>,
): Promise<{ deleted: number; failed: number }> {
  const publicIds: string[] = []
  for (const ref of references) {
    if (typeof ref === 'string') {
      if (ref) publicIds.push(ref)
    } else {
      const id = ref.publicId?.trim()
      if (id) {
        publicIds.push(id)
        continue
      }
      const fromUrl = ref.imageUrl ? cloudinaryPublicIdFromUrl(ref.imageUrl) : null
      if (fromUrl) publicIds.push(fromUrl)
    }
  }

  let deleted = 0
  let failed = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < publicIds.length) {
      const current = cursor++
      try {
        const result = await deleteCloudinaryAsset(publicIds[current])
        if (result.ok) deleted += 1
        else failed += 1
      } catch (error) {
        failed += 1
        console.error('[cloudinary] Suppression groupée : asset ignoré', publicIds[current], error)
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(BULK_DELETE_CONCURRENCY, Math.max(1, publicIds.length)) },
    () => worker(),
  )
  await Promise.all(workers)
  return { deleted, failed }
}
