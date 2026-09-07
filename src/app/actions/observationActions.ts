'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { uploadAnnotationToCloudinary } from '@/lib/cloudinary'
import type { BlindProjectDto, SubmitObservationsInput, SubmissionResultDto } from '@/lib/types'
import { defaultLocale, type Locale } from '@/lib/i18n'
import { Role } from '@prisma/client'

function isValidBase64Image(dataUrl: string): boolean {
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')
}

/**
 * Récupère les données d'un projet pour la session d'observation.
 * RÈGLE DU PROTOCOLE EN AVEUGLE :
 * Les fenêtres de validation `ProjectPoint` sont strictement omises de la requête
 * pour éviter toute fuite vers le client de l'observateur.
 */
export async function getBlindProject(projectId: string): Promise<BlindProjectDto | null> {
  if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
    return null
  }

  const project = await prisma.project.findUnique({
    where: {
      id: projectId.trim(),
      isArchived: false,
    },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      createdAt: true,
    },
  })

  if (!project) return null

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    videoUrl: project.videoUrl,
    createdAt: project.createdAt.toISOString(),
  }
}

/**
 * Liste tous les projets actifs pour les observateurs.
 * RÈGLE DU PROTOCOLE EN AVEUGLE :
 * Les fenêtres de validation `ProjectPoint` sont strictement exclues de la requête.
 */
export async function listBlindProjects(): Promise<BlindProjectDto[]> {
  const projects = await prisma.project.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    videoUrl: p.videoUrl,
    createdAt: p.createdAt.toISOString(),
  }))
}

/**
 * Résout ou crée l'utilisateur observateur associé à l'identifiant fourni.
 * Préserve l'anonymat scientifique en gérant soit un UUID anonyme, soit un email.
 */
async function resolveObserverUser(identifier: string) {
  const cleanId = identifier.trim()
  const isEmail = cleanId.includes('@')

  if (isEmail) {
    const existing = await prisma.user.findUnique({
      where: { email: cleanId.toLowerCase() },
    })
    if (existing) return existing

    return prisma.user.create({
      data: {
        email: cleanId.toLowerCase(),
        password: 'BLIND_OBSERVER_AUTO_GENERATED',
        role: Role.OBSERVER,
      },
    })
  }

  // Identifiant anonyme (ex. UUID ou code observateur)
  const existingByAnon = await prisma.user.findUnique({
    where: { anonymousId: cleanId },
  })
  if (existingByAnon) return existingByAnon

  // Création avec email factice unique pour satisfaire la contrainte unique de User.email
  const syntheticEmail = `${cleanId.toLowerCase()}@blind.vision-analytics`
  return prisma.user.create({
    data: {
      email: syntheticEmail,
      anonymousId: cleanId,
      password: 'BLIND_OBSERVER_AUTO_GENERATED',
      role: Role.OBSERVER,
    },
  })
}

/**
 * Server Action pour valider et persister un lot d'observations.
 * 1. Téléversement Cloudinary sécurisé des images Base64 côté serveur.
 * 2. Récupération des fenêtres scientifiques confidentielles en BDD.
 * 3. Validation temporelle automatique : attribution de `pointId` et détection de point fantôme (`isGhostPoint`).
 * 4. Persistance dans PostgreSQL (Neon).
 */
export async function submitObservations(
  input: SubmitObservationsInput,
): Promise<SubmissionResultDto> {
  const locale: Locale = input?.locale === 'fr' ? 'fr' : defaultLocale
  // Messages localisés (EN / FR) renvoyés au client de l'observateur.
  const msg = (en: string, fr: string) => (locale === 'en' ? en : fr)

  try {
    const projectId = (input?.projectId ?? '').trim()
    const identifier = (input?.observerIdentifier ?? '').trim()
    const observations = input?.observations

    if (!projectId) {
      return { ok: false, error: msg('Missing project identifier.', 'Identifiant de projet manquant.') }
    }

    if (!identifier) {
      return {
        ok: false,
        error: msg('Observer identifier is required.', 'Identifiant de l’observateur obligatoire.'),
      }
    }

    if (!Array.isArray(observations) || observations.length === 0) {
      return { ok: false, error: msg('No observation to submit.', 'Aucune observation à soumettre.') }
    }

    // Validation des captures
    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i]
      if (typeof obs.timestamp !== 'number' || obs.timestamp < 0 || !Number.isFinite(obs.timestamp)) {
        return {
          ok: false,
          error: msg(
            `Invalid timestamp for observation #${i + 1}.`,
            `Horodatage invalide pour l’observation n°${i + 1}.`,
          ),
        }
      }
      if (!isValidBase64Image(obs.imageDataUrl)) {
        return {
          ok: false,
          error: msg(
            `Invalid image format for observation #${i + 1}.`,
            `Format d’image invalide pour l’observation n°${i + 1}.`,
          ),
        }
      }
    }

    // Vérification du projet
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, isArchived: true },
    })

    if (!project) {
      return {
        ok: false,
        error: msg('The specified project could not be found.', 'Le projet spécifié est introuvable.'),
      }
    }

    if (project.isArchived) {
      return {
        ok: false,
        error: msg(
          'This project is archived. Submissions are closed.',
          'Ce projet est archivé. Les soumissions sont clôturées.',
        ),
      }
    }

    // Récupération de l'observateur (User)
    const user = await resolveObserverUser(identifier)

    // Récupération sécurisée des fenêtres de validation définies par l'administrateur
    const validationPoints = await prisma.projectPoint.findMany({
      where: { projectId },
      select: {
        id: true,
        trameDebut: true,
        trameFin: true,
      },
    })

    // Téléversement asynchrone des images vers Cloudinary
    const uploadedRecords: Array<{
      timestampTotal: number
      imageUrl: string
      pointId: string | null
      isGhostPoint: boolean
    }> = []

    for (const obs of observations) {
      const imageUrl = await uploadAnnotationToCloudinary(obs.imageDataUrl)
      const timestampTotal = Math.round(obs.timestamp)

      // Recherche d'une fenêtre de validation correspondante
      const matchedPoint = validationPoints.find(
        (point) => timestampTotal >= point.trameDebut && timestampTotal <= point.trameFin,
      )

      uploadedRecords.push({
        timestampTotal,
        imageUrl,
        pointId: matchedPoint ? matchedPoint.id : null,
        isGhostPoint: !matchedPoint, // Si aucune fenêtre ne correspond => Point Fantôme (fausse alerte)
      })
    }

    // Insertion en masse dans Neon PostgreSQL
    await prisma.observation.createMany({
      data: uploadedRecords.map((record) => ({
        projectId,
        userId: user.id,
        pointId: record.pointId,
        timestampTotal: record.timestampTotal,
        imageUrl: record.imageUrl,
        isGhostPoint: record.isGhostPoint,
        isVerified: true,
      })),
    })

    revalidatePath(`/observe/${projectId}`)
    revalidatePath('/admin/projects')

    return {
      ok: true,
      submittedCount: uploadedRecords.length,
      message: msg(
        'Observations transmitted and recorded successfully.',
        'Observations transmises et enregistrées avec succès.',
      ),
    }
  } catch (error) {
    console.error('Erreur lors de la soumission des observations :', error)
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : msg(
              'An unexpected error occurred while submitting. Please retry.',
              'Une erreur inattendue est survenue lors de la soumission. Réessayez.',
            ),
    }
  }
}
