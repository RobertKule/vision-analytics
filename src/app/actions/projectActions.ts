'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentAdmin } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import { deriveObservationNameFromVideo } from '@/lib/videoName'
import type {
  ActionResult,
  AdminProjectDetailDto,
  ProjectDto,
  ProjectObservationRowDto,
  VideoAdminDto,
} from '@/lib/types'

/** Doit rester synchronisé avec observationActions.ts (lectures observateur). */
const BLIND_PROJECTS_TAG = 'blind-projects'

type CreateProjectInput = {
  title: string
  description?: string | null
  videoUrl?: string | null
  observationTypes?: string[]
  /** Vidéos associées dès la création (chacune rattachée à un type ou générique). */
  videos?: Array<{ source: string; typeLabel?: string | null; name?: string | null }>
}

type AddProjectPointInput = {
  projectId: string
  pointName: string
  trameDebut: number
  trameFin: number
  /** Fenêtre rattachée à une passe vidéo précise ; null = fenêtre « générique ». */
  videoId?: string | null
}

type UpdateProjectInput = {
  projectId: string
  title?: string
  description?: string | null
  /** Ne met à jour les types que si fourni (sinon inchangé). */
  observationTypes?: string[]
}

type VideoPayload = { videoId: string; source?: string; typeLabel?: string | null; name?: string | null }

const VIDEO_BENCHMARK_MAX_SECONDS = 7 * 3600 // garde-fou serveur (durée vidéo non persistée)

/** Revalide les chemins affectés par toute mutation d'un projet. */
function revalidateProject(projectId: string) {
  revalidatePath('/admin/projects')
  revalidatePath('/observe')
  revalidatePath('/experience')
  revalidatePath(`/observe/${projectId}`)
  revalidatePath(`/experience/${projectId}`)
  updateTag(BLIND_PROJECTS_TAG)
}

/**
 * Nettoie une liste de types d'observation : chaque entrée est trimée, dédupliquée,
 * limitée en longueur, et les valeurs vides sont retirées (liste plafonnée à 40).
 */
function sanitizeObservationTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || trimmed.length > 80) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
    if (result.length >= 40) break
  }
  return result
}

function parseSeconds(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

/**
 * Actions d'administration (zone /admin) : chaque mutation est gardée par
 * `getCurrentAdmin()` qui exige un rôle réellement ADMIN — jamais une simple
 * session OBSERVER / ANALYST, même en devinant l'URL d'une Server Action.
 */

/** Liste des projets non archivés avec leurs fenêtres temporelles triées. */
export async function listProjects(): Promise<ProjectDto[]> {
  const projects = await prisma.project.findMany({
    where: { isArchived: false },
    include: {
      points: {
        orderBy: { trameDebut: 'asc' },
      },
      _count: {
        select: { observations: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    description: project.description,
    videoUrl: project.videoUrl,
    observationTypes: project.observationTypes,
    createdAt: project.createdAt.toISOString(),
    observationCount: project._count.observations,
    points: project.points.map((point) => ({
      id: point.id,
      pointName: point.pointName,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      videoId: point.videoId,
    })),
  }))
}

/**
 * Liste des projets ARCHIVÉS (restauration / suppression définitive).
 * Distincte de `listProjects` : la vue maître distingue clairement les deux états
 * plutôt que de mélanger « actifs » et « archivés » dans un seul tableau.
 */
export async function listArchivedProjects(): Promise<ProjectDto[]> {
  if (!(await getCurrentAdmin())) return []
  const projects = await prisma.project.findMany({
    where: { isArchived: true },
    include: {
      _count: { select: { observations: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return projects.map((project) => ({
    id: project.id,
    title: project.title,
    description: project.description,
    videoUrl: project.videoUrl,
    observationTypes: project.observationTypes,
    createdAt: project.createdAt.toISOString(),
    observationCount: project._count.observations,
    points: [],
  }))
}

function toVideoAdminDto(video: {
  id: string
  projectId: string
  typeLabel: string | null
  name: string | null
  source: string
  orderIndex: number
  benchmarkSeconds: number | null
  createdAt: Date
  _count: { observations: number; points: number }
}): VideoAdminDto {
  return {
    id: video.id,
    projectId: video.projectId,
    typeLabel: video.typeLabel,
    name: video.name,
    source: video.source,
    orderIndex: video.orderIndex,
    benchmarkSeconds: video.benchmarkSeconds,
    captureCount: video._count.observations,
    pointCount: video._count.points,
    createdAt: video.createdAt.toISOString(),
  }
}

/**
 * Détail d'un projet pour l'espace administrateur (onglets + exports + vidéos).
 *
 * Source unique des relevés « à plat » : les onglets Observations / Activité des
 * observateurs et les exports CSV / JSON en dérivent tous. La liste des points
 * (fenêtres secrètes) et des benchmarks vidéo n'est renvoyée qu'aux profils
 * autorisés (canManage) — jamais aux pages observateur (getBlindProject).
 */
export async function getAdminProjectDetail(
  projectId: string,
): Promise<AdminProjectDetailDto | null> {
  const id = typeof projectId === 'string' ? projectId.trim() : ''
  if (!id) return null

  const accessLevel = await getCurrentProjectAccess(id)
  if (!canManage(accessLevel)) return null

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      points: {
        orderBy: { trameDebut: 'asc' },
      },
      videos: {
        orderBy: { orderIndex: 'asc' },
        include: {
          _count: {
            select: { observations: true, points: true },
          },
        },
      },
    },
  })
  if (!project) return null

  const observations = await prisma.observation.findMany({
    where: { projectId: project.id },
    include: {
      user: {
        select: { id: true, username: true, email: true, anonymousId: true },
      },
      point: {
        select: { pointName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const videoLabelById = new Map<string, string>()
  for (const video of project.videos) {
    videoLabelById.set(video.id, video.name ?? video.typeLabel ?? video.source)
  }

  const rows: ProjectObservationRowDto[] = observations.map((obs) => ({
    id: obs.id,
    timestampTotal: obs.timestampTotal,
    isGhostPoint: obs.isGhostPoint,
    imageUrl: obs.imageUrl,
    createdAt: obs.createdAt.toISOString(),
    observationType: obs.observationType,
    pointId: obs.pointId,
    pointLabel: obs.point?.pointName ?? null,
    videoId: obs.videoId,
    observerId: obs.user.id,
    observerUsername: obs.user.username,
    observerEmail: obs.user.email,
    observerAnonymousId: obs.user.anonymousId,
  }))

  return {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      isArchived: project.isArchived,
      observationTypes: project.observationTypes,
      createdAt: project.createdAt.toISOString(),
      observationCount: rows.length,
      observerCount: new Set(rows.map((row) => row.observerId)).size,
      pointsCount: project.points.length,
    },
    points: project.points.map((point) => ({
      id: point.id,
      pointName: point.pointName,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      videoId: point.videoId,
    })),
    videos: project.videos.map((video) => toVideoAdminDto(video)),
    rows,
  }
}

/** Crée un nouveau projet d'observation (et ses vidéos éventuelles, de façon atomique). */
export async function createProject(input: CreateProjectInput): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const title = (input?.title ?? '').trim()
    if (!title) {
      return { ok: false, error: 'Le titre du projet est obligatoire.' }
    }

    const observationTypes = sanitizeObservationTypes(input?.observationTypes)
    const typeSet = new Set(observationTypes.map((t) => t.toLowerCase()))
    const videos = Array.isArray(input?.videos) ? input.videos.slice(0, 40) : []

    // Chaque vidéo fournie est rattachée à un type existant de la configuration (ou générique).
    for (const video of videos) {
      const source = (video?.source ?? '').trim()
      if (!source) {
        return { ok: false, error: 'Chaque vidéo doit avoir une source valide.' }
      }
      const typeLabel = typeof video?.typeLabel === 'string' ? video.typeLabel.trim() : ''
      if (typeLabel && !typeSet.has(typeLabel.toLowerCase())) {
        return { ok: false, error: `Le type « ${typeLabel} » n’existe pas dans la configuration.` }
      }
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title,
          description: input?.description?.trim() || null,
          videoUrl: input?.videoUrl?.trim() || null,
          observationTypes,
        },
        select: { id: true },
      })

      for (let i = 0; i < videos.length; i++) {
        const video = videos[i]
        const source = (video?.source ?? '').trim()
        await tx.video.create({
          data: {
            projectId: created.id,
            source,
            typeLabel: video?.typeLabel?.trim() || null,
            name: video?.name?.trim() || deriveObservationNameFromVideo(source),
            orderIndex: i,
          },
        })
      }
      return created
    })

    revalidateProject(project.id)
    return { ok: true, id: project.id }
  } catch (error) {
    console.error('Erreur lors de la création du projet :', error)
    return { ok: false, error: 'Impossible de créer le projet. Réessayez.' }
  }
}

/**
 * Édition du projet (drawer admin) : titre, description, et — pour un projet
 * ACTIF — les types d'observation (non destructifs vis-à-vis de l'historique).
 */
export async function updateProject(input: UpdateProjectInput): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  const projectId = typeof input?.projectId === 'string' ? input.projectId.trim() : ''
  if (!projectId) return { ok: false, error: 'Identifiant de projet invalide.' }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, isArchived: true },
    })
    if (!project) return { ok: false, error: 'Projet introuvable.' }

    const patch: { title?: string; description?: string | null; observationTypes?: string[] } = {}

    if (typeof input.title === 'string' && input.title.trim()) {
      patch.title = input.title.trim()
    }
    if (typeof input.description === 'string') {
      patch.description = input.description.trim() || null
    }
    if (input.observationTypes !== undefined) {
      if (project.isArchived) {
        return { ok: false, error: 'Ce projet est archivé : la configuration est figée.' }
      }
      const cleaned = sanitizeObservationTypes(input.observationTypes)
      patch.observationTypes = cleaned
      if (Object.keys(patch).length === 1) {
        // Aucun autre champ : on sort par la voie dédiée pour préserver l'historique.
        return updateProjectObservationTypes(projectId, cleaned)
      }
    }

    if (Object.keys(patch).length === 0) {
      return { ok: true }
    }

    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: patch })
      if (patch.observationTypes) {
        await normalizeVideoTypeLabels(tx, projectId, patch.observationTypes)
      }
    })

    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la mise à jour du projet :', error)
    return { ok: false, error: 'Impossible d’enregistrer le projet. Réessayez.' }
  }
}

/**
 * Détache d'une vidéo un libellé de type qui ne fait plus partie de la
 * configuration (la vidéo redevient générique). Les observations historiques ne
 * sont JAMAIS réécrites : elles conservent le type saisi à la capture.
 */
async function normalizeVideoTypeLabels(
  tx: Prisma.TransactionClient,
  projectId: string,
  cleaned: string[],
): Promise<void> {
  const allowed = new Set(cleaned.map((t) => t.toLowerCase()))
  const videos = await tx.video.findMany({
    where: { projectId, typeLabel: { not: null } },
    select: { id: true, typeLabel: true },
  })
  const toDetach = videos
    .filter((video) => video.typeLabel !== null && !allowed.has(video.typeLabel.toLowerCase()))
    .map((video) => video.id)
  if (toDetach.length > 0) {
    await tx.video.updateMany({ where: { id: { in: toDetach } }, data: { typeLabel: null } })
  }
}

/**
 * Met à jour la liste des types d'observation proposés aux observateurs.
 *
 * NON destructif : les observations déjà enregistrées conservent leur type
 * historique même s'il a été retiré de la liste ; les vidéos dont le type est
 * retiré redeviennent génériques (l'association pourra être refaite explicitement).
 */
export async function updateProjectObservationTypes(
  projectId: string,
  observationTypes: string[],
): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const id = typeof projectId === 'string' ? projectId.trim() : ''
    if (!id) {
      return { ok: false, error: 'Identifiant de projet invalide.' }
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { isArchived: true },
    })
    if (!project) {
      return { ok: false, error: 'Projet introuvable.' }
    }
    if (project.isArchived) {
      return { ok: false, error: 'Ce projet est archivé : la configuration est figée.' }
    }

    const cleaned = sanitizeObservationTypes(observationTypes)

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { observationTypes: cleaned },
      })
      await normalizeVideoTypeLabels(tx, id, cleaned)
    })

    revalidateProject(id)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la mise à jour des types d’observation :', error)
    return { ok: false, error: 'Impossible d’enregistrer les types d’observation. Réessayez.' }
  }
}

/** Archive un projet ACTIF (les observations liées sont conservées). */
export async function archiveProject(projectId: string): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, error: 'Identifiant de projet invalide.' }
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { isArchived: true },
    })

    if (!project) {
      return { ok: false, error: 'Projet introuvable.' }
    }
    if (project.isArchived) {
      return { ok: true }
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { isArchived: true },
    })

    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’archivage du projet :', error)
    return { ok: false, error: 'Impossible d’archiver le projet. Réessayez.' }
  }
}

/** Restaure (réactive) un projet archivé : ARCHIVED → ACTIVE. */
export async function restoreProject(projectId: string): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, error: 'Identifiant de projet invalide.' }
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { isArchived: true },
    })
    if (!project) {
      return { ok: false, error: 'Projet introuvable.' }
    }
    if (!project.isArchived) {
      return { ok: true }
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { isArchived: false },
    })

    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la restauration du projet :', error)
    return { ok: false, error: 'Impossible de restaurer le projet. Réessayez.' }
  }
}

/**
 * Suppression définitive d'un projet — PROTÉGÉE CÔTÉ SERVEUR.
 *
 * Règle métier : un projet ACTIF ne peut jamais être supprimé (erreur 409) ;
 * seul un projet ARCHIVÉ peut l'être. La suppression cascade sur les vidéos,
 * fenêtres, observations et partages (relations Prisma `onDelete`).
 */
export async function deleteProject(projectId: string): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { ok: false, error: 'Identifiant de projet invalide.' }
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { isArchived: true },
    })
    if (!project) {
      return { ok: false, error: 'Projet introuvable.' }
    }
    if (!project.isArchived) {
      return {
        ok: false,
        error:
          'Impossible de supprimer définitivement un projet actif : archivez-le d’abord. Cette action n’a pas été effectuée.',
      }
    }

    await prisma.$transaction(async (tx) => {
      // On purge d'abord les observations pour une suppression prévisible, puis le projet
      // (les relations restantes — vidéos, fenêtres, partages — cascadent).
      await tx.observation.deleteMany({ where: { projectId } })
      await tx.project.delete({ where: { id: projectId } })
    })

    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la suppression du projet :', error)
    return { ok: false, error: 'Impossible de supprimer le projet. Réessayez.' }
  }
}

/** Résout le projet d'une vidéo et vérifie l'accès admin + état (non archivé). */
async function loadManageableVideoProject(videoId: string) {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      project: { select: { id: true, isArchived: true, observationTypes: true } },
    },
  })
  return video
}

/**
 * Associe une nouvelle passe vidéo à un projet (admin).
 * `typeLabel` doit appartenir à Project.observationTypes ou être null (vidéo générique).
 */
export async function addProjectVideo(input: {
  projectId: string
  source: string
  typeLabel?: string | null
  name?: string | null
}): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const projectId = (input?.projectId ?? '').trim()
    const source = (input?.source ?? '').trim()
    if (!projectId) return { ok: false, error: 'Identifiant de projet invalide.' }
    if (!source) return { ok: false, error: 'La source de la vidéo est obligatoire.' }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { isArchived: true, observationTypes: true },
    })
    if (!project) return { ok: false, error: 'Projet introuvable.' }
    if (project.isArchived) {
      return { ok: false, error: 'Ce projet est archivé : la configuration est figée.' }
    }

    const typeLabel = typeof input?.typeLabel === 'string' ? input.typeLabel.trim() : null
    const configured = new Set(project.observationTypes.map((t) => t.toLowerCase()))
    if (typeLabel && !configured.has(typeLabel.toLowerCase())) {
      return { ok: false, error: `Le type « ${typeLabel} » n’existe pas dans la configuration.` }
    }

    const name = (input?.name ?? '').trim() || deriveObservationNameFromVideo(source)

    const existing = await prisma.video.count({ where: { projectId } })
    const created = await prisma.video.create({
      data: { projectId, source, typeLabel, name, orderIndex: existing },
      select: { id: true },
    })

    revalidateProject(projectId)
    return { ok: true, id: created.id }
  } catch (error) {
    console.error('Erreur lors de l’association de la vidéo :', error)
    return { ok: false, error: 'Impossible d’associer la vidéo. Réessayez.' }
  }
}

/**
 * Modifie une passe vidéo (remplacement de la source, ré-association au type,
 * libellé, ordre). Non destructif : les observations passées conservent leur type.
 */
export async function updateProjectVideo(input: VideoPayload): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const videoId = (input?.videoId ?? '').trim()
    if (!videoId) return { ok: false, error: 'Identifiant de vidéo invalide.' }

    const video = await loadManageableVideoProject(videoId)
    if (!video) return { ok: false, error: 'Vidéo introuvable.' }
    if (video.project.isArchived) {
      return { ok: false, error: 'Ce projet est archivé : la configuration est figée.' }
    }

    const patch: { source?: string; typeLabel?: string | null; name?: string | null } = {}

    if (typeof input.source === 'string' && input.source.trim()) {
      patch.source = input.source.trim()
    }
    if (input.typeLabel !== undefined) {
      const typeLabel = input.typeLabel === null ? null : input.typeLabel.trim()
      if (typeLabel !== null) {
        const configured = new Set(video.project.observationTypes.map((t) => t.toLowerCase()))
        if (!configured.has(typeLabel.toLowerCase())) {
          return { ok: false, error: `Le type « ${typeLabel} » n’existe pas dans la configuration.` }
        }
      }
      patch.typeLabel = typeLabel
    }
    if (typeof input.name === 'string' && input.name.trim()) {
      patch.name = input.name.trim()
    }

    if (Object.keys(patch).length === 0) return { ok: true }

    await prisma.video.update({ where: { id: videoId }, data: patch })

    revalidateProject(video.project.id)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la vidéo :', error)
    return { ok: false, error: 'Impossible d’enregistrer la vidéo. Réessayez.' }
  }
}

/**
 * Supprime / détache une passe vidéo.
 *
 * PROTECTION DES DONNÉES SCIENTIFIQUES : si la vidéo (ou une de ses fenêtres)
 * porte des observations, la suppression est refusée — l'observateur conserverait
 * sinon un enregistrement orphelin. On préfère exiger une désassociation propre
 * (passer par l'archivage du projet) plutôt que de détruire silencieusement.
 */
export async function deleteProjectVideo(videoId: string): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof videoId !== 'string' || !videoId.trim()) {
      return { ok: false, error: 'Identifiant de vidéo invalide.' }
    }

    const video = await loadManageableVideoProject(videoId)
    if (!video) return { ok: false, error: 'Vidéo introuvable.' }

    const related = await prisma.$transaction(async (tx) => {
      const pointIds = (
        await tx.projectPoint.findMany({
          where: { videoId },
          select: { id: true },
        })
      ).map((p) => p.id)

      const [videoObservations, pointObservations] = await Promise.all([
        tx.observation.count({ where: { videoId } }),
        pointIds.length > 0
          ? tx.observation.count({ where: { pointId: { in: pointIds } } })
          : Promise.resolve(0),
      ])
      return { count: videoObservations + pointObservations }
    })

    if (related.count > 0) {
      return {
        ok: false,
        error: `Impossible de supprimer cette vidéo : ${related.count} observation(s) y sont rattachées. Archivez le projet pour la conserver.`,
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.video.delete({ where: { id: videoId } })
    })

    revalidateProject(video.project.id)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la suppression de la vidéo :', error)
    return { ok: false, error: 'Vidéo introuvable ou déjà supprimée.' }
  }
}

/**
 * Définit ou efface le benchmark (timestamp réel / vérité terrain) d'une passe
 * vidéo. CONFIDENTIEL : jamais transmis à l'observateur. La durée vidéo n'étant
 * pas persistée, on valide côté serveur `0 <= t < plafond` ; la cohérence avec la
 * durée réelle est vérifiée côté client quand elle est connue.
 */
export async function setProjectVideoBenchmark(input: {
  videoId: string
  benchmarkSeconds: number | null
}): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    const videoId = (input?.videoId ?? '').trim()
    if (!videoId) return { ok: false, error: 'Identifiant de vidéo invalide.' }

    const video = await loadManageableVideoProject(videoId)
    if (!video) return { ok: false, error: 'Vidéo introuvable.' }
    if (video.project.isArchived) {
      return { ok: false, error: 'Ce projet est archivé : la configuration est figée.' }
    }

    const seconds = input.benchmarkSeconds
    if (seconds !== null) {
      if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 0) {
        return {
          ok: false,
          error: 'Le benchmark doit être un nombre de secondes entier positif ou nul.',
        }
      }
      if (seconds > VIDEO_BENCHMARK_MAX_SECONDS) {
        return {
          ok: false,
          error: 'Le benchmark est incohérent (supérieur au plafond de durée vidéo).',
        }
      }
    }

    await prisma.video.update({
      where: { id: videoId },
      data: { benchmarkSeconds: seconds },
    })

    revalidateProject(video.project.id)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’enregistrement du benchmark :', error)
    return { ok: false, error: 'Impossible d’enregistrer le benchmark. Réessayez.' }
  }
}

/** Ajoute une fenêtre de validation temporelle (point réel) à un projet, éventuellement par vidéo. */
export async function addProjectPoint(input: AddProjectPointInput): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  const projectId = typeof input?.projectId === 'string' ? input.projectId.trim() : ''
  const pointName = (input?.pointName ?? '').trim()
  const trameDebut = parseSeconds(input?.trameDebut)
  const trameFin = parseSeconds(input?.trameFin)
  const videoId = input?.videoId ? String(input.videoId).trim() : null

  if (!projectId) {
    return { ok: false, error: 'Identifiant de projet invalide.' }
  }
  if (!pointName) {
    return { ok: false, error: 'Le nom du point est obligatoire (ex. « Point 1 »).' }
  }
  if (trameDebut === null || trameFin === null) {
    return { ok: false, error: 'Les bornes doivent être des secondes entières positives ou nulles.' }
  }
  if (trameFin < trameDebut) {
    return { ok: false, error: 'La fin de la fenêtre doit être supérieure ou égale à son début.' }
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { isArchived: true },
    })

    if (!project) {
      return { ok: false, error: 'Projet introuvable.' }
    }
    if (project.isArchived) {
      return { ok: false, error: 'Ce projet est archivé : ajoutez vos fenêtres avant archivage.' }
    }

    // La vidéo cible (si fournie) doit appartenir au projet.
    if (videoId) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { projectId: true },
      })
      if (!video || video.projectId !== projectId) {
        return { ok: false, error: 'La vidéo sélectionnée n’appartient pas à ce projet.' }
      }
    }

    // Des fenêtres disjointes (au sein du même contexte vidéo) garantissent une
    // attribution de point non ambiguë : deux vidéos différentes peuvent porter
    // des fenêtres identiques sans conflit.
    const existingWindows = await prisma.projectPoint.findMany({
      where: { projectId, ...(videoId ? { videoId } : { videoId: null }) },
      select: { trameDebut: true, trameFin: true },
    })

    const overlaps = existingWindows.some(
      (window) => window.trameDebut < trameFin && trameDebut < window.trameFin,
    )
    if (overlaps) {
      return { ok: false, error: 'Cette fenêtre chevauche un point déjà défini pour cette vidéo.' }
    }

    await prisma.projectPoint.create({
      data: { projectId, videoId, pointName, trameDebut, trameFin },
    })

    revalidateProject(projectId)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de l’ajout du point :', error)
    return { ok: false, error: 'Impossible d’ajouter le point. Réessayez.' }
  }
}

/** Supprime une fenêtre temporelle (les observations restent, sans point rattaché). */
export async function deleteProjectPoint(pointId: string): Promise<ActionResult> {
  if (!(await getCurrentAdmin())) {
    return { ok: false, error: 'Accès réservé aux administrateurs.' }
  }
  try {
    if (typeof pointId !== 'string' || !pointId.trim()) {
      return { ok: false, error: 'Identifiant de point invalide.' }
    }

    await prisma.projectPoint.delete({ where: { id: pointId } })

    revalidatePath('/admin/projects')
    revalidatePath('/observe')
    revalidatePath('/experience')
    updateTag(BLIND_PROJECTS_TAG)
    return { ok: true }
  } catch (error) {
    console.error('Erreur lors de la suppression du point :', error)
    return { ok: false, error: 'Point introuvable ou déjà supprimé.' }
  }
}
