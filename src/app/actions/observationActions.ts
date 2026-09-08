'use server'

import { revalidatePath, unstable_cache, updateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { uploadAnnotationToCloudinary } from '@/lib/cloudinary'
import { deriveObservationNameFromVideo } from '@/lib/videoName'
import type { BlindProjectDto, BlindVideoDto, SubmitObservationsInput, SubmissionResultDto } from '@/lib/types'
import { defaultLocale, type Locale } from '@/lib/i18n'
import { Role } from '@prisma/client'

/**
 * Tag de cache partagé pour les lectures « observer » (liste + détail des
 * projets). Tout changement de projet ou nouvelle soumission invalide ces
 * lectures via `revalidateTag`.
 */
const BLIND_PROJECTS_TAG = 'blind-projects'

/** Identifiant de passe « vide » renvoyé pour la vidéo générique héritée (project.videoUrl). */
const LEGACY_GENERIC_VIDEO_ID = ''

const blindVideoSelect = {
  id: true,
  typeLabel: true,
  name: true,
  source: true,
  orderIndex: true,
} as const

/**
 * Construit la liste des passes vidéo exposées à l'observateur.
 *
 * — Un projet multi-vidéo expose ses `Video` (jamais leurs benchmarks).
 * — Un projet hérité (vidéo unique, `videoUrl` sans enregistrement `Video`) est
 *   représenté par une passe synthétique d'id `LEGACY_GENERIC_VIDEO_ID` : la
 *   soumission omet alors `videoId` et le serveur matche les fenêtres génériques.
 */
function buildBlindVideos(project: {
  videoUrl: string | null
  videos: Array<{ id: string; typeLabel: string | null; name: string | null; source: string; orderIndex: number }>
}): BlindVideoDto[] {
  const rows = project.videos.map((video) => ({
    id: video.id,
    typeLabel: video.typeLabel,
    name: video.name,
    source: video.source,
    orderIndex: video.orderIndex,
  }))

  if (rows.length > 0) return rows

  const legacy = project.videoUrl
  if (!legacy || !legacy.trim()) return []

  return [
    {
      id: LEGACY_GENERIC_VIDEO_ID,
      typeLabel: null,
      name: deriveObservationNameFromVideo(legacy),
      source: legacy,
      orderIndex: 0,
    },
  ]
}

function isValidBase64Image(dataUrl: string): boolean {
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')
}

async function queryBlindProject(projectId: string): Promise<BlindProjectDto | null> {
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
      observationTypes: true,
      createdAt: true,
      videos: {
        orderBy: { orderIndex: 'asc' },
        select: blindVideoSelect,
      },
    },
  })

  if (!project) return null

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    videoUrl: project.videoUrl,
    observationTypes: project.observationTypes,
    createdAt: project.createdAt.toISOString(),
    videos: buildBlindVideos(project),
  }
}

async function queryBlindProjects(): Promise<BlindProjectDto[]> {
  const projects = await prisma.project.findMany({
    where: { isArchived: false },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      observationTypes: true,
      createdAt: true,
      videos: {
        orderBy: { orderIndex: 'asc' },
        select: blindVideoSelect,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    videoUrl: p.videoUrl,
    observationTypes: p.observationTypes,
    createdAt: p.createdAt.toISOString(),
    videos: buildBlindVideos(p),
  }))
}

/**
 * Détail d'un projet pour la session d'observation — mis en cache.
 * RÈGLE DE LA PROCÉDURE D'OBSERVATION INDÉPENDANTE :
 * Les fenêtres de validation `ProjectPoint` sont strictement omises de la requête
 * pour éviter toute fuite vers le client de l'observateur.
 */
const getCachedBlindProject = unstable_cache(queryBlindProject, ['blind-project'], {
  tags: [BLIND_PROJECTS_TAG],
  revalidate: 300,
})

export async function getBlindProject(projectId: string): Promise<BlindProjectDto | null> {
  return getCachedBlindProject(projectId)
}

/**
 * Liste des projets actifs pour les observateurs — mise en cache.
 * RÈGLE DE LA PROCÉDURE D'OBSERVATION INDÉPENDANTE :
 * Les fenêtres de validation `ProjectPoint` sont strictement exclues de la requête.
 */
const getCachedBlindProjects = unstable_cache(queryBlindProjects, ['blind-projects'], {
  tags: [BLIND_PROJECTS_TAG],
  revalidate: 300,
})

export async function listBlindProjects(): Promise<BlindProjectDto[]> {
  return getCachedBlindProjects()
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
        password: 'INDEPENDENT_OBSERVER_AUTO_GENERATED',
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
  const syntheticEmail = `${cleanId.toLowerCase()}@observateur.vision-analytics`
  return prisma.user.create({
    data: {
      email: syntheticEmail,
      anonymousId: cleanId,
      password: 'INDEPENDENT_OBSERVER_AUTO_GENERATED',
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
    let identifier = (input?.observerIdentifier ?? '').trim()
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

    // Vérification du projet (isArchived + types d'observation configurés)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        isArchived: true,
        observationTypes: true,
        videos: { select: { id: true, typeLabel: true } },
      },
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

    // ——— Attribution d'identité (anti-impersonation) ———
    // Session ouverte (zone connectée /experience) : l'observateur est rattaché à
    // SON compte ; un identifiant arbitraire ne peut pas être revendiqué pour
    // attribuer des observations à un autre utilisateur de la plateforme.
    // Parcours public anonyme (/observe) : l'identifiant reste libre (code anonyme
    // ou email d'un observateur indépendant), mais il ne peut jamais cibler un
    // compte de gestion ADMIN/ANALYST existant — cela reviendrait à usurper un
    // responsable de l'étude.
    const session = await getCurrentSession()
    const isEmailIdentifier = identifier.includes('@')
    if (session?.email) {
      identifier = session.email
    } else if (isEmailIdentifier) {
      const manager = await prisma.user.findFirst({
        where: { email: identifier.toLowerCase(), role: { in: [Role.ADMIN, Role.ANALYST] } },
        select: { id: true },
      })
      if (manager) {
        return {
          ok: false,
          error: msg(
            'This observer identifier matches a management account and cannot be used to submit.',
            'Cet identifiant correspond à un compte de gestion ; il ne peut pas être utilisé pour soumettre.',
          ),
        }
      }
    }

    // Récupération de l'observateur (User)
    const user = await resolveObserverUser(identifier)

    // Récupération sécurisée des fenêtres de validation définies par l'administrateur.
    // Chaque fenêtre est rattachée à une passe vidéo (`videoId`, null = passe générique).
    const validationPoints = await prisma.projectPoint.findMany({
      where: { projectId },
      select: {
        id: true,
        videoId: true,
        trameDebut: true,
        trameFin: true,
      },
    })

    // Types d'observation configurables du projet (liste proposée aux observateurs).
    const configuredTypes = project.observationTypes ?? []
    const configuredTypeSet = new Set(configuredTypes.map((type) => type.trim()))

    // Passes vidéo « typées » : une capture émise depuis cette passe doit porter ce type exact.
    const videoTypeById = new Map<string, string>()
    for (const video of project.videos) {
      if (video.typeLabel) videoTypeById.set(video.id, video.typeLabel.trim())
    }

    // Normalise l'identifiant vidéo d'une capture ('' synthétique = passe générique héritée).
    const normalizeVideoId = (value: unknown): string | null => {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed === '' || trimmed === LEGACY_GENERIC_VIDEO_ID ? null : trimmed
    }

    // Validation des types AVANT tout téléversement Cloudinary (échec rapide).
    for (let i = 0; i < observations.length; i++) {
      const rawType = observations[i]?.observationType
      const type = typeof rawType === 'string' ? rawType.trim() : ''
      const videoId = normalizeVideoId(observations[i]?.videoId)
      const typedLabel = videoId ? videoTypeById.get(videoId) : undefined

      if (typedLabel) {
        // Onglet typé : le type est imposé par l'association vidéo → type.
        if (!type || type.toLowerCase() !== typedLabel.toLowerCase()) {
          return {
            ok: false,
            error: msg(
              `Capture #${i + 1} must be typed "${typedLabel}" (its video is bound to that type).`,
              `La capture n°${i + 1} doit être typée « ${typedLabel} » (sa vidéo est rattachée à ce type).`,
            ),
          }
        }
      } else if (configuredTypes.length > 0) {
        // Passe générique : le type doit exister dans la configuration du projet.
        if (!type) {
          return {
            ok: false,
            error: msg(
              `Select an observation type for capture #${i + 1}.`,
              `Sélectionnez un type d’observation pour la capture n°${i + 1}.`,
            ),
          }
        }
        if (!configuredTypeSet.has(type)) {
          return {
            ok: false,
            error: msg(
              `Observation type "${type}" is not offered for this project.`,
              `Le type d’observation « ${type} » n’est pas proposé pour ce projet.`,
            ),
          }
        }
      }
    }

    // Déduplication par clé client (idempotence des brouillons relancés / reprise après
    // échec partiel) : une capture déjà persistée (même projet + même `clientKey`) n'est
    // NI retéléversée NI recréée. Les captures jamais envoyées partent telles quelles.
    const runId =
      typeof input?.runId === 'string' && input.runId.trim()
        ? input.runId.trim().slice(0, 120)
        : null
    const clientKeyOf = (obs: SubmitObservationsInput['observations'][number]): string | null => {
      const raw = obs?.clientKey
      if (typeof raw !== 'string') return null
      const trimmed = raw.trim()
      return trimmed ? trimmed.slice(0, 200) : null
    }
    const clientKeys = observations.map(clientKeyOf)
    const dedupeKeys = Array.from(
      new Set(clientKeys.filter((key): key is string => key !== null)),
    )
    const persistedKeys = new Set<string>()
    if (dedupeKeys.length > 0) {
      const already = await prisma.observation.findMany({
        where: { projectId, clientKey: { in: dedupeKeys } },
        select: { clientKey: true },
      })
      for (const row of already) if (row.clientKey) persistedKeys.add(row.clientKey)
    }
    const isDuplicate = (index: number): boolean => {
      const key = clientKeys[index]
      return key !== null && persistedKeys.has(key)
    }

    // Téléversement asynchrone des images vers Cloudinary
    const uploadedRecords: Array<{
      timestampTotal: number
      imageUrl: string
      pointId: string | null
      isGhostPoint: boolean
      observationType: string | null
      videoId: string | null
      clientKey: string | null
    }> = []

    for (let index = 0; index < observations.length; index++) {
      const obs = observations[index]
      if (isDuplicate(index)) continue
      const imageUrl = await uploadAnnotationToCloudinary(obs.imageDataUrl)
      const timestampTotal = Math.round(obs.timestamp)
      const observationType =
        configuredTypes.length > 0 && typeof obs.observationType === 'string'
          ? obs.observationType.trim()
          : null
      const videoId = normalizeVideoId(obs.videoId)

      // Une capture n'est évaluée que contre les fenêtres de SA passe vidéo (ou contre
      // les fenêtres génériques pour la passe héritée) — jamais contre celles d'une autre vidéo.
      const scopedPoints =
        videoId === null
          ? validationPoints.filter((point) => point.videoId === null)
          : validationPoints.filter((point) => point.videoId === videoId)

      // Recherche d'une fenêtre de validation correspondante
      const matchedPoint = scopedPoints.find(
        (point) => timestampTotal >= point.trameDebut && timestampTotal <= point.trameFin,
      )

      uploadedRecords.push({
        timestampTotal,
        imageUrl,
        pointId: matchedPoint ? matchedPoint.id : null,
        isGhostPoint: !matchedPoint, // Si aucune fenêtre ne correspond => Point Fantôme (fausse alerte)
        observationType,
        videoId,
        clientKey: clientKeys[index],
      })
    }

    // Insertion en masse dans Neon PostgreSQL. `skipDuplicates` protège l'idempotence si
    // deux lots concurrents portaient la même clé client (jamais d'erreur de contrainte).
    if (uploadedRecords.length > 0) {
      await prisma.observation.createMany({
        data: uploadedRecords.map((record) => ({
          projectId,
          userId: user.id,
          videoId: record.videoId,
          pointId: record.pointId,
          timestampTotal: record.timestampTotal,
          imageUrl: record.imageUrl,
          observationType: record.observationType,
          isGhostPoint: record.isGhostPoint,
          isVerified: true,
          sessionRunId: runId,
          clientKey: record.clientKey,
        })),
        skipDuplicates: true,
      })
    }

    updateTag(BLIND_PROJECTS_TAG)
    revalidatePath(`/observe/${projectId}`)
    revalidatePath(`/experience/${projectId}`)
    revalidatePath('/experience')
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
