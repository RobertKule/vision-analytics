import { v2 as cloudinary } from 'cloudinary'

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

/**
 * Upload une image au format Base64 vers Cloudinary
 * @param base64Image Chaîne encodée "data:image/png;base64,..."
 */
export async function uploadAnnotationToCloudinary(base64Image: string): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'vision-analytics/annotations',
      resource_type: 'image',
    })
    return result.secure_url
  } catch (error) {
    console.error('Erreur lors du téléversement vers Cloudinary:', error)
    throw new Error('Échec du téléversement de la capture annotée.')
  }
}