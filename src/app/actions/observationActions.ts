'use server'

import { revalidatePath, unstable_cache, updateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'
import { deleteDriveFile, resolveCaptureTargetFolder, uploadCaptureImage } from '@/lib/drive'
import { driveFileIdFromReference } from '@/lib/driveRef'
import { buildCaptureFileBaseName, observerDisplayLabel } from '@/lib/driveLayout'
import { classifySaveError, saveErrorMessage, type SaveErrorCode } from '@/lib/saveErrors'
import { deriveObservationNameFromVideo } from '@/lib/videoName'
import { checkExpectedVideo, EXPECTED_VIDEO_REFUSAL } from '@/lib/expectedVideo'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'
import type { BlindProjectDto, BlindVideoDto, SubmitObservationsInput, SubmissionResultDto } from '@/lib/types'
import { defaultLocale, type Locale } from '@/lib/i18n'
import { completeObserverToken, resolveObserverGate } from '@/lib/observerAccess'

/**
 * Tag de cache partagé pour les lectures « observer » (liste + détail des
 * projets). Tout changement de projet ou nouvelle soumission invalide ces
 * lectures via `revalidateTag`.
 */
const BLIND_PROJECTS_TAG = 'blind-projects'

/** Identifiant de passe « vide » renvoyé pour la vidéo générique héritée (project.videoUrl). */
const LEGACY_GENERIC_VIDEO_ID = ''

/**
 * Concurrence maximale des téléversements Google Drive au sein d'un lot de
 * soumission. Bornée pour limiter la mémoire et la pression sur l'API, mais assez
 * élevée pour ne pas sérialiser les transferts (soumission « terrain » plus rapide).
 */
const SUBMISSION_UPLOAD_CONCURRENCY = 3

/** Exécute `worker(i)` pour i ∈ [0, count) avec au plus `limit` appels simultanés. */
async function mapIndexedWithConcurrency<T>(
  count: number,
  limit: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(count)
  let next = 0
  async function runSlot(): Promise<void> {
    while (true) {
      const index = next++
      if (index >= count) return
      results[index] = await worker(index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, count)) }, () => runSlot()),
  )
  return results
}

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
 * Résout AUTORISÉMENT l'identité de l'observateur qui enregistre pour `projectId`.
 *
 * La priorité est donnée à la session observateur (cookie `va_observer` délivré par
 * un lien `/share/<JETON>` et recoupé contre la base : jeton présent, rattaché à CE
 * projet, non révoqué, non expiré). Si elle existe, l'observateur est celui que le
 * serveur a rattaché au jeton — un identifiant envoyé par le client ne peut rien y
 * changer (impossibilité d'usurper un autre compte ou de déplacer un projet par URL).
 *
 * À défaut (aucune session observateur), un profil CONNECTÉ (espace /experience) peut
 * observer sous SON compte. Sans session observateur ni session connectée, l'action
 * est refusée : plus aucun parcours anonyme ne peut enregistrer d'observations.
 */
type ObserverWriteAccess =
  | {
      ok: true
      kind: 'token'
      /** Vrai si le jeton est COMPLETED → écritures refusées (projet en lecture seule). */
      completed: boolean
      tokenId: string
      runId: string
      user: { id: string }
      observerLabel: string
    }
  | {
      ok: true
      kind: 'session'
      user: { id: string }
      observerLabel: string
    }
  | { ok: false; error: string }

async function resolveObserverWriteAccess(
  projectId: string,
  getMessage: (en: string, fr: string) => string,
): Promise<ObserverWriteAccess> {
  // Session observateur par lien (/share) : la portée signée `va_observer` est recoupée
  // contre la base par `resolveObserverGate`. ACTIVE → écriture (`completed=false`) ;
  // COMPLETED → lecture seule (le jeton a déjà finalisé une session). Cookie absent /
  // jeton supprimé / autre projet / révoqué / expiré → refus `{ ok: false }`.
  const gate = await resolveObserverGate(projectId)
  if (gate.ok) {
    const completed = gate.completed
    const user = await prisma.user.findUnique({
      where: { id: gate.userId },
      select: { id: true, username: true, email: true, anonymousId: true },
    })
    if (user) {
      return {
        ok: true,
        kind: 'token',
        completed,
        tokenId: gate.tokenId,
        runId: gate.runId,
        user: { id: user.id },
        observerLabel: observerDisplayLabel(user),
      }
    }
    return {
      ok: false,
      error: getMessage(
        'This access link is no longer linked to an active observer.',
        'Ce lien d’accès n’est plus rattaché à un observateur actif.',
      ),
    }
  }

  const session = await getCurrentSession()
  if (session?.uid) {
    const user = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { id: true, username: true, email: true, anonymousId: true },
    })
    if (user) {
      return {
        ok: true,
        kind: 'session',
        user: { id: user.id },
        observerLabel: observerDisplayLabel(user),
      }
    }
  }

  return {
    ok: false,
    error: getMessage(
      'A valid observer access link is required to record observations on this project. Contact the project administrator.',
      'Un lien d’accès observateur valide est requis pour enregistrer des observations sur ce projet. Contactez l’administrateur du projet.',
    ),
  }
}

/** Message « session d'observation terminée » (écritures refusées, lecture seule). */
function readonlySessionMessage(getMessage: (en: string, fr: string) => string): string {
  return getMessage(
    'This observation session is finished. The project is now read-only.',
    'Cette session d’observation est terminée. Le projet est désormais en lecture seule.',
  )
}

/**
 * Server Action pour valider et persister un lot d'observations.
 * 1. Téléversement Google Drive sécurisé des images Base64 côté serveur (jamais exposé au client).
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
    const observations = input?.observations

    if (!projectId) {
      return { ok: false, error: msg('Missing project identifier.', 'Identifiant de projet manquant.') }
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
        title: true,
        isArchived: true,
        videoUrl: true,
        observationTypes: true,
        videos: { select: { id: true, typeLabel: true, source: true } },
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

    // ——— Attribution d'identité (anti-impersonation, côté serveur) ———
    // L'observateur n'est JAMAIS choisi par le client : soit une session observateur
    // valide existe (cookie `va_observer` issu d'un lien `/share`, projet vérifié,
    // jeton non révoqué ni expiré), soit un profil est connecté (espace /experience).
    // Sans l'un des deux, aucune soumission n'est acceptée — un identifiant client
    // arbitraire ne peut ni attribuer d'observations à autrui, ni contourner le lien.
    const access = await resolveObserverWriteAccess(projectId, msg)
    if (!access.ok) {
      return { ok: false, error: access.error }
    }
    const user = access.user
    const observerLabel = access.observerLabel

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

    // Validation des types AVANT tout téléversement Google Drive (échec rapide).
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

      // Vidéo attendue (Partie Q) : la capture doit citer une passe réelle du projet
      // et correspondre EXACTEMENT à la vidéo attendue de son type. Le serveur est la
      // seule autorité — un `videoId`/`videoSource` altéré est refusé ici.
      const rawDeclaredSource = observations[i]?.videoSource
      const videoCheck = checkExpectedVideo({
        videoId,
        observationType: type,
        declaredSource: typeof rawDeclaredSource === 'string' ? rawDeclaredSource : null,
        videoUrl: project.videoUrl,
        videos: project.videos,
      })
      if (!videoCheck.ok) {
        return {
          ok: false,
          error: msg(
            `Capture #${i + 1}: ${EXPECTED_VIDEO_REFUSAL.en}`,
            `La capture n°${i + 1} : ${EXPECTED_VIDEO_REFUSAL.fr}`,
          ),
        }
      }
    }

    // Déduplication par clé client (idempotence des brouillons relancés / reprise après
    // échec partiel) : une capture déjà persistée (même projet + même `clientKey`) n'est
    // NI retéléversée NI recréée. Les captures jamais envoyées partent telles quelles.
    const runId =
      access.kind === 'token'
        ? access.runId
        : typeof input?.runId === 'string' && input.runId.trim()
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

    type UploadedCaptureRecord = {
      timestampTotal: number
      imageUrl: string
      driveFileId: string | null
      pointId: string | null
      isGhostPoint: boolean
      observationType: string | null
      videoId: string | null
      clientKey: string | null
    }

    // Téléversement des images vers Google Drive, en parallèle borné (au plus
    // SUBMISSION_UPLOAD_CONCURRENCY simultanés) : un lot de 5 n'attend plus
    // 5 allers-retours séquentiels, mais ~2 vagues. L'ordre des résultats est
    // conservé par index (clientKey stable pour l'idempotence serveur).
    const buildRecord = async (index: number): Promise<UploadedCaptureRecord | null> => {
      const obs = observations[index]
      if (isDuplicate(index)) return null // déjà persisté : ni re-téléversé ni recréé
      const timestampTotal = Math.round(obs.timestamp)
      const observationType =
        configuredTypes.length > 0 && typeof obs.observationType === 'string'
          ? obs.observationType.trim()
          : null
      const videoId = normalizeVideoId(obs.videoId)

      // Dépôt en sous-dossiers {Projet}/{Type} (cohérent avec le flux par capture) : le
      // type retenu pour le dossier est le type imposé par la passe vidéo (le cas échéant)
      // sinon le type sélectionné. Seule la DESTINATION Google Drive change — ni le modèle
      // PostgreSQL, ni l'idempotence (`clientKey`), ni la structure du lot ne sont touchés.
      const typedLabel = videoId ? (videoTypeById.get(videoId) ?? null) : null
      const typeNameForFolder = typedLabel || observationType || null
      const uploaded = await uploadCaptureImage(obs.imageDataUrl, {
        fileName: buildCaptureFileBaseName(observerLabel, timestampTotal),
        parentFolderId: await resolveCaptureTargetFolder({
          projectTitle: project.title,
          typeName: typeNameForFolder,
        }),
      })
      const imageUrl = uploaded.imageUrl

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

      return {
        timestampTotal,
        imageUrl,
        driveFileId: uploaded.driveFileId,
        pointId: matchedPoint ? matchedPoint.id : null,
        isGhostPoint: !matchedPoint, // Si aucune fenêtre ne correspond => Point Fantôme (fausse alerte)
        observationType,
        videoId,
        clientKey: clientKeys[index],
      }
    }

    const builtRecords = await mapIndexedWithConcurrency(
      observations.length,
      SUBMISSION_UPLOAD_CONCURRENCY,
      buildRecord,
    )
    const uploadedRecords: UploadedCaptureRecord[] = builtRecords.filter(
      (record): record is UploadedCaptureRecord => record !== null,
    )

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
          driveFileId: record.driveFileId,
          observationType: record.observationType,
          isGhostPoint: record.isGhostPoint,
          isVerified: true,
          sessionRunId: runId,
          clientKey: record.clientKey,
        })),
        skipDuplicates: true,
      })
    }

    const submittedCount = uploadedRecords.length
    await recordAudit({
      userId: user.id,
      action: AUDIT_ACTIONS.observationSubmitted,
      entityType: 'observation',
      ...(runId ? { entityId: runId } : {}),
      metadata: { projectId, submittedCount },
    })

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
      error: msg(
        'An unexpected error occurred while submitting. Please retry.',
        'Une erreur inattendue est survenue lors de la soumission. Réessayez.',
      ),
    }
  }
}

// ————————————————————————————————————————————————————————————
// ENREGISTREMENT IMMÉDIAT PAR CAPTURE + FINALISATION LÉGÈRE
//
// Nouveau flux « terrain » :
//   capture confirmée → `saveObservationCapture` : UNE image uploadée puis UNE ligne
//                       créée (`isVerified=false` → invisible des statistiques tant que
//                       la session n'est pas finalisée). Petit payload, requête courte,
//                       pas de timeout. Idempotent via `@@unique([projectId, clientKey])`.
//   fin de session    → `finalizeObservationSession` : matching des fenêtres confidentielles
//                       + passage `isVerified=true` des lignes de la session. Opération
//                       légère en base, AUCUN re-téléversement d'image.
//   suppression       → `deleteSavedObservation` : suppression du fichier Google Drive PUIS
//                       de la ligne (aucune référence supprimée en silence si Drive échoue).
// ————————————————————————————————————————————————————————————

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  )
}

export type SaveObservationCaptureInput = {
  projectId: string
  observerIdentifier: string
  /** Jeton de session logique — stable pour toute la durée de la session observateur. */
  runId: string
  /** Clé de déduplication émise par le client (id local de la capture). */
  clientKey: string
  timestamp: number
  imageDataUrl: string
  observationType?: string | null
  videoId?: string | null
  /**
   * Identité de la vidéo réellement observée à la capture (nom de fichier local ou
   * URL distante). Partie Q : le serveur la compare à la vidéo attendue du type.
   */
  videoSource?: string | null
  locale?: Locale
}

export type SaveObservationCaptureResult =
  | { ok: true; status: 'saved' | 'already-saved'; observationId: string }
  | {
      ok: false
      /** Message final localisé à afficher (vocabulaire fixe — jamais un détail interne). */
      error: string
      /** Code machine pour distinguer réseau / stockage / base (pas de détection par texte). */
      code: SaveErrorCode
      /** Vrai = re-tentable (réseau, transitoire) ; faux = définitif (config, permission, dossier). */
      retryable: boolean
    }

/**
 * Enregistre IMMÉDIATEMENT une capture confirmée : une image téléversée, une ligne
 * persistée. L'idempotence (projet + `clientKey`) garantit qu'un double envoi (retry,
 * reprise) ne crée jamais deux lignes et ne re-téléverse jamais l'image.
 *
 * ORDRE + AUCUN ORPHELIN : le fichier Google Drive n'est créé qu'après toutes les
 * validations ; s'il est créé mais que la ligne base ne peut pas l'être (échec,
 * course d'idempotence), le fichier de CET appel est supprimé best-effort — jamais
 * de fichier Drive sans ligne PostgreSQL. L'état `synced` n'est atteint que lorsque
 * les deux opérations ont abouti.
 */
export async function saveObservationCapture(
  input: SaveObservationCaptureInput,
): Promise<SaveObservationCaptureResult> {
  const locale: Locale = input?.locale === 'en' ? 'en' : defaultLocale
  const msg = (en: string, fr: string) => (locale === 'en' ? en : fr)
  /** Échec de validation métier — spécifique mais sûr, jamais re-tenté seul. */
  const failValidation = (error: string): SaveObservationCaptureResult => ({
    ok: false,
    code: 'VALIDATION',
    retryable: false,
    error,
  })

  try {
    const projectId = (input?.projectId ?? '').trim()
    const clientKey = (input?.clientKey ?? '').trim().slice(0, 200)
    let runId = (input?.runId ?? '').trim().slice(0, 120)
    const rawType = input?.observationType
    const observationType = typeof rawType === 'string' ? rawType.trim() : ''
    const rawVideoId = input?.videoId
    const videoId =
      typeof rawVideoId === 'string' &&
      rawVideoId.trim() !== '' &&
      rawVideoId.trim() !== LEGACY_GENERIC_VIDEO_ID
        ? rawVideoId.trim()
        : null
    const timestamp = input?.timestamp
    const imageDataUrl = input?.imageDataUrl

    if (!projectId) {
      return failValidation(msg('Missing project identifier.', 'Identifiant de projet manquant.'))
    }
    if (!runId) {
      return failValidation(msg('Missing session token.', 'Jeton de session manquant.'))
    }
    if (!clientKey) {
      return failValidation(msg('Missing capture key.', 'Clé de capture manquante.'))
    }
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0) {
      return failValidation(msg('Invalid timestamp.', 'Horodatage invalide.'))
    }
    if (!isValidBase64Image(imageDataUrl)) {
      return failValidation(msg('Invalid image format.', 'Format d’image invalide.'))
    }

    const access = await resolveObserverWriteAccess(projectId, msg)
    if (!access.ok) return failValidation(access.error)
    if (access.kind === 'token' && access.completed) {
      return failValidation(readonlySessionMessage(msg))
    }
    const identity = { user: access.user, observerLabel: access.observerLabel }
    if (access.kind === 'token') runId = access.runId

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        isArchived: true,
        videoUrl: true,
        observationTypes: true,
        videos: { select: { id: true, typeLabel: true, source: true } },
      },
    })
    if (!project) {
      return failValidation(msg('Project not found.', 'Projet introuvable.'))
    }
    if (project.isArchived) {
      return failValidation(
        msg(
          'This project is archived. Submissions are closed.',
          'Ce projet est archivé. Les soumissions sont clôturées.',
        ),
      )
    }

    // Idempotence immédiate : jamais de re-téléversement si la capture existe déjà.
    const existing = await prisma.observation.findFirst({
      where: { projectId, clientKey },
      select: { id: true },
    })
    if (existing) {
      return { ok: true, status: 'already-saved', observationId: existing.id }
    }

    // Validation du type d'observation AVANT tout téléversement (échec rapide).
    const configuredTypes = project.observationTypes ?? []
    const configuredTypeSet = new Set(configuredTypes.map((type) => type.trim()))
    const typedLabel = videoId
      ? (project.videos.find((video) => video.id === videoId)?.typeLabel ?? null)
      : null
    if (typedLabel) {
      if (!observationType || observationType.toLowerCase() !== typedLabel.toLowerCase()) {
        return failValidation(
          msg(
            `This capture must be typed "${typedLabel}".`,
            `Cette capture doit être typée « ${typedLabel} ».`,
          ),
        )
      }
    } else if (configuredTypes.length > 0) {
      if (!observationType) {
        return failValidation(
          msg(
            'Select an observation type for this capture.',
            'Sélectionnez un type d’observation pour cette capture.',
          ),
        )
      }
      if (!configuredTypeSet.has(observationType)) {
        return failValidation(
          msg(
            `Observation type "${observationType}" is not offered for this project.`,
            `Le type d’observation « ${observationType} » n’est pas proposé pour ce projet.`,
          ),
        )
      }
    }

    // ——— Validation vidéo attendue (Partie Q) ———
    // Le serveur contrôle que la vidéo réellement observée correspond EXACTEMENT à la
    // vidéo attendue pour ce type (source configurée, aucune tolérance de préfixe).
    // Tout refus part avant le téléversement : aucun fichier Google Drive n'est créé.
    const declaredSource = input?.videoSource
    const videoCheck = checkExpectedVideo({
      videoId,
      observationType,
      declaredSource: typeof declaredSource === 'string' ? declaredSource : null,
      videoUrl: project.videoUrl,
      videos: project.videos,
    })
    if (!videoCheck.ok) {
      return failValidation(
        msg(EXPECTED_VIDEO_REFUSAL.en, EXPECTED_VIDEO_REFUSAL.fr),
      )
    }

    // ——— Stockage Google Drive ———
    // Le fichier n'est créé qu'après TOUTES les validations : tout échec antérieur ne
    // laisse aucun orphelin. Un échec ici est classé (permission/dossier/transitoire…)
    // et traduit en message fixe — la capture reste locale côté client.
    //
    // Organisation en sous-dossiers : {Projet}/{Type} (nouvelle capture). Le dossier est
    // résolu (recherche puis création idempotente) avant l'upload ; un échec transitoire
    // ici est re-tentable, un échec définitif est signalé sans fichier créé.
    const typeNameForFolder = observationType || typedLabel || null
    const fileName = buildCaptureFileBaseName(identity.observerLabel, timestamp)
    let uploaded
    try {
      const parentFolderId = await resolveCaptureTargetFolder({
        projectTitle: project.title,
        typeName: typeNameForFolder,
      })
      uploaded = await uploadCaptureImage(imageDataUrl, { fileName, parentFolderId })
    } catch (error) {
      const { code, retryable } = classifySaveError(error)
      console.error(`[CaptureSync] UPLOAD_GOOGLE_DRIVE_ERROR code=${code} retryable=${retryable}`)
      return {
        ok: false,
        code,
        retryable,
        error: saveErrorMessage(code, locale),
      }
    }

    // ——— Persistance PostgreSQL ———
    console.log('[CaptureSync] DATABASE_SAVE_START')
    try {
      const created = await prisma.observation.create({
        data: {
          projectId,
          userId: identity.user.id,
          videoId,
          pointId: null, // rattachement fenêtre + fantôme calculés à la finalisation
          timestampTotal: Math.round(timestamp),
          imageUrl: uploaded.imageUrl,
          driveFileId: uploaded.driveFileId,
          observationType: observationType || null,
          isGhostPoint: false,
          isVerified: false, // capture « enregistrée » mais session non finalisée
          sessionRunId: runId,
          clientKey,
        },
        select: { id: true },
      })
      console.log('[CaptureSync] DATABASE_SAVE_SUCCESS')
      await recordAudit({
        userId: identity.user.id,
        action: AUDIT_ACTIONS.imageUploaded,
        entityType: 'observation',
        entityId: created.id,
        metadata: { projectId, runId, clientKey },
      })
      console.log(`[CaptureSync] CAPTURE_SYNC_SUCCESS observationId=${created.id}`)
      return { ok: true, status: 'saved', observationId: created.id }
    } catch (error) {
      // Échec base APRÈS un upload réussi : le fichier de CET appel ne doit pas survivre
      // sans ligne (aucun orphelin Google Drive). Nettoyage best-effort, puis classement.
      const isUnique = isPrismaUniqueViolation(error)
      try {
        await deleteDriveFile(uploaded.driveFileId)
      } catch (cleanupError) {
        console.error('[CaptureSync] CLEANUP_FAILED — fichier sans ligne base non supprimé :', cleanupError)
      }
      if (isUnique) {
        // Course d'idempotence : la ligne concurrente existe déjà (son fichier à elle est
        // conservé) — on renvoie la ligne existante, la capture est bien enregistrée.
        const raced = await prisma.observation.findFirst({
          where: { projectId, clientKey },
          select: { id: true },
        })
        if (raced) return { ok: true, status: 'already-saved', observationId: raced.id }
      }
      const { code, retryable } = classifySaveError(error)
      console.error(`[CaptureSync] DATABASE_ERROR code=${code} retryable=${retryable}`)
      return {
        ok: false,
        code,
        retryable,
        error: saveErrorMessage(code, locale),
      }
    }
  } catch (error) {
    // Erreur serveur imprévue (connexion à la base, etc.) — classée puis traduite, jamais
    // le message interne.
    const { code, retryable } = classifySaveError(error)
    console.error(`[CaptureSync] SERVER_ERROR code=${code} retryable=${retryable}`)
    return {
      ok: false,
      code,
      retryable,
      error: saveErrorMessage(code, locale),
    }
  }
}

export type DeleteSavedObservationInput = {
  projectId: string
  observerIdentifier: string
  clientKey: string
  locale?: Locale
}

export type DeleteSavedObservationResult =
  | { ok: true; deleted: boolean }
  | { ok: false; error: string }

/**
 * Supprime une capture déjà enregistrée (session non finalisée uniquement).
 * Ordre sécurisé : le fichier Google Drive est supprimé AVANT la ligne en base — si
 * Drive échoue transitoirement, la référence est conservée (pas d'orphelin, pas de
 * suppression silencieuse) et l'appelant peut réessayer. Une capture de l'ancien
 * stockage (Cloudinary, `driveFileId` null) ne peut plus être purgée côté stockage
 * (SDK retiré) : la ligne est supprimée en base avec une trace explicite (rare capture
 * non finalisée antérieure au déploiement).
 */
export async function deleteSavedObservation(
  input: DeleteSavedObservationInput,
): Promise<DeleteSavedObservationResult> {
  const locale: Locale = input?.locale === 'en' ? 'en' : defaultLocale
  const msg = (en: string, fr: string) => (locale === 'en' ? en : fr)

  try {
    const projectId = (input?.projectId ?? '').trim()
    const clientKey = (input?.clientKey ?? '').trim().slice(0, 200)
    if (!projectId) {
      return { ok: false, error: msg('Missing project identifier.', 'Identifiant de projet manquant.') }
    }
    if (!clientKey) {
      return { ok: false, error: msg('Missing capture key.', 'Clé de capture manquante.') }
    }

    const access = await resolveObserverWriteAccess(projectId, msg)
    if (!access.ok) return { ok: false, error: access.error }
    if (access.kind === 'token' && access.completed) {
      return { ok: false, error: readonlySessionMessage(msg) }
    }
    const identity = { user: access.user }

    const row = await prisma.observation.findFirst({
      where: { projectId, clientKey, userId: identity.user.id },
      select: {
        id: true,
        isVerified: true,
        driveFileId: true,
        imageUrl: true,
      },
    })
    if (!row) return { ok: true, deleted: false }

    if (row.isVerified) {
      return {
        ok: false,
        error: msg(
          'This capture is already part of a finalized session and cannot be deleted.',
          'Cette capture fait déjà partie d’une session finalisée ; elle ne peut pas être supprimée.',
        ),
      }
    }

    // Suppression du stockage AVANT la ligne. `driveFileId` est la référence Drive fiable ;
    // on retombe sur l'URL publique si besoin (les deux dérivent du même `fileId`).
    const driveFileId =
      driveFileIdFromReference(row.driveFileId) ?? driveFileIdFromReference(row.imageUrl)
    const legacyStorage = !driveFileId
    if (driveFileId) {
      const deletion = await deleteDriveFile(driveFileId)
      if (!deletion.ok) return { ok: false, error: deletion.error }
    } else {
      console.warn(
        `[deleteSavedObservation] Capture de l'ancien stockage (Cloudinary) sans fichier Drive : ` +
          `l'asset historique ne peut plus être purgé (SDK retiré). Ligne ${row.id} supprimée en base.`,
      )
    }

    await prisma.observation.delete({ where: { id: row.id } })
    await recordAudit({
      userId: identity.user.id,
      action: AUDIT_ACTIONS.imageDeleted,
      entityType: 'observation',
      entityId: row.id,
      metadata: { projectId, clientKey, ...(legacyStorage ? { legacyStorage: true } : {}) },
    })
    return { ok: true, deleted: true }
  } catch (error) {
    console.error('Erreur lors de la suppression de la capture :', error)
    return {
      ok: false,
      error: msg(
        'The capture could not be deleted right now. Please retry.',
        'La capture n’a pas pu être supprimée pour le moment. Réessayez.',
      ),
    }
  }
}

export type FinalizeObservationSessionInput = {
  projectId: string
  observerIdentifier: string
  runId: string
  locale?: Locale
}

export type FinalizeObservationSessionResult =
  | { ok: true; finalizedCount: number; alreadyFinalized: boolean }
  | { ok: false; error: string }

/**
 * Finalisation LÉGÈRE d'une session : rattache chaque capture enregistrée à sa fenêtre
 * de validation (détermination du point réel / point fantôme) puis certifie la session
 * (`isVerified=true`). Aucune image n'est re-téléversée, aucune capture recréée.
 */
export async function finalizeObservationSession(
  input: FinalizeObservationSessionInput,
): Promise<FinalizeObservationSessionResult> {
  const locale: Locale = input?.locale === 'en' ? 'en' : defaultLocale
  const msg = (en: string, fr: string) => (locale === 'en' ? en : fr)

  try {
    const projectId = (input?.projectId ?? '').trim()
    if (!projectId) {
      return { ok: false, error: msg('Missing project identifier.', 'Identifiant de projet manquant.') }
    }

    // Identité autorisée : session observateur (lien /share) ou profil connecté.
    const access = await resolveObserverWriteAccess(projectId, msg)
    if (!access.ok) return { ok: false, error: access.error }
    const identity = { user: access.user }
    // La session logique d'un observateur à jeton est IMPOSÉE par le serveur
    // (anti-tampering : impossible de finaliser un autre runId que le sien).
    const runId =
      access.kind === 'token' ? access.runId : (input?.runId ?? '').trim().slice(0, 120)
    if (!runId) {
      return { ok: false, error: msg('Missing session token.', 'Jeton de session manquant.') }
    }

    // Marque le jeton COMPLETED une seule fois, quand la session vient d'aboutir
    // (le lien repasse alors en lecture seule pour cet observateur). La clôture
    // bascule aussi le cookie de portée en lecture seule ; l'audit n'est émis que
    // si c'est bien CET appel qui a clôturé le jeton.
    const markTokenCompleted = async (): Promise<void> => {
      if (access.kind !== 'token' || access.completed) return
      const newlyCompleted = await completeObserverToken(access.tokenId)
      if (newlyCompleted) {
        await recordAudit({
          userId: identity.user.id,
          action: AUDIT_ACTIONS.observerSessionCompleted,
          entityType: 'share',
          entityId: access.tokenId,
          metadata: { projectId, runId },
        })
      }
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, isArchived: true },
    })
    if (!project) {
      return { ok: false, error: msg('Project not found.', 'Projet introuvable.') }
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

    const pending = await prisma.observation.findMany({
      where: {
        projectId,
        userId: identity.user.id,
        sessionRunId: runId,
        isVerified: false,
      },
      select: { id: true, videoId: true, timestampTotal: true },
    })

    if (pending.length === 0) {
      // Session déjà finalisée (idempotence) ou inexistante.
      const finalized = await prisma.observation.findFirst({
        where: { projectId, userId: identity.user.id, sessionRunId: runId, isVerified: true },
        select: { id: true },
      })
      if (finalized) {
        await markTokenCompleted()
        return { ok: true, finalizedCount: 0, alreadyFinalized: true }
      }
      return {
        ok: false,
        error: msg('Nothing to finalize for this session.', 'Rien à finaliser pour cette session.'),
      }
    }

    // Fenêtres de validation confidentielles (jamais transmises à l'observateur).
    const validationPoints = await prisma.projectPoint.findMany({
      where: { projectId },
      select: { id: true, videoId: true, trameDebut: true, trameFin: true },
    })

    // Regroupe les écritures par cible (pointId + statut fantôme) pour limiter le
    // nombre de requêtes : opération légère, même pour une session chargée.
    const groups = new Map<
      string,
      { pointId: string | null; isGhostPoint: boolean; ids: string[] }
    >()
    for (const row of pending) {
      const scopedPoints =
        row.videoId === null
          ? validationPoints.filter((point) => point.videoId === null)
          : validationPoints.filter((point) => point.videoId === row.videoId)
      const matchedPoint = scopedPoints.find(
        (point) => row.timestampTotal >= point.trameDebut && row.timestampTotal <= point.trameFin,
      )
      const pointId = matchedPoint ? matchedPoint.id : null
      const isGhostPoint = !matchedPoint
      const key = `${pointId ?? '__none__'}|${isGhostPoint ? 'g' : 'v'}`
      const group = groups.get(key) ?? { pointId, isGhostPoint, ids: [] }
      group.ids.push(row.id)
      groups.set(key, group)
    }

    for (const group of groups.values()) {
      await prisma.observation.updateMany({
        where: { id: { in: group.ids } },
        data: {
          pointId: group.pointId,
          isGhostPoint: group.isGhostPoint,
          isVerified: true,
        },
      })
    }

    await recordAudit({
      userId: identity.user.id,
      action: AUDIT_ACTIONS.sessionFinalized,
      entityType: 'observation',
      entityId: runId,
      metadata: { projectId, finalizedCount: pending.length },
    })
    await markTokenCompleted()

    updateTag(BLIND_PROJECTS_TAG)
    revalidatePath(`/observe/${projectId}`)
    revalidatePath(`/experience/${projectId}`)
    revalidatePath('/experience')
    revalidatePath('/admin/projects')

    return { ok: true, finalizedCount: pending.length, alreadyFinalized: false }
  } catch (error) {
    console.error('Erreur lors de la finalisation de la session :', error)
    return {
      ok: false,
      error: msg(
        'The session could not be finalized right now. Please retry.',
        'La session n’a pas pu être finalisée pour le moment. Réessayez.',
      ),
    }
  }
}

// ————————————————————————————————————————————————————————————
// CONSULTATION « LECTURE SEULE » D'UNE SESSION CLÔTURÉE
//
// Quand le jeton d'un observateur est COMPLETED, le lien rouvre son projet en
// lecture seule : l'observateur revoit SES captures certifiées (jamais celles des
// autres, JAMAIS la vérité de validation). L'aveugle porte sur les fenêtres valides
// pendant TOUTE la vie de la session — y compris à l'issue : aucun nom de point,
// aucun statut « détecté / fausse alerte », aucun compteur valide/fantôme ne doit
// sortir du serveur vers un observateur. La garde `resolveObserverGate` garantit
// qu'on ne lit que ce que le porteur du cookie est autorisé à lire.
// ————————————————————————————————————————————————————————————

export type ObserverSessionRecapRow = {
  id: string
  imageUrl: string
  timestampTotal: number
  observationType: string | null
  createdAt: string
}

export type ObserverSessionRecapResult =
  | {
      ok: true
      completed: boolean
      rows: ObserverSessionRecapRow[]
    }
  | { ok: false }

export async function getObserverSessionRecap(
  projectId: string,
): Promise<ObserverSessionRecapResult> {
  const gate = await resolveObserverGate(projectId)
  if (!gate.ok) return { ok: false }

  // Sélection VOLONTAIREMENT limitée : ni `isGhostPoint`, ni relation `point`. Ces
  // champs encodent la vérité de validation et ne doivent jamais transiter côté
  // observateur (l'écran de lecture seule n'affiche que ce qu'il a fait).
  const captures = await prisma.observation.findMany({
    where: { projectId, userId: gate.userId, isVerified: true },
    select: {
      id: true,
      imageUrl: true,
      timestampTotal: true,
      observationType: true,
      createdAt: true,
    },
    orderBy: { timestampTotal: 'asc' },
  })

  const rows: ObserverSessionRecapRow[] = captures.map((capture) => ({
    id: capture.id,
    imageUrl: capture.imageUrl,
    timestampTotal: capture.timestampTotal,
    observationType: capture.observationType,
    createdAt: capture.createdAt.toISOString(),
  }))

  return {
    ok: true,
    completed: gate.completed,
    rows,
  }
}
