/**
 * PERSISTANCE DES VERSIONS ANALYTIQUES (serveur uniquement).
 *
 * ─── CE QUI CRÉE UNE VERSION ────────────────────────────────────────────────
 * UNIQUEMENT une modification de configuration susceptible de changer le périmètre
 * analytique : ajout / suppression d'une fenêtre ou d'un point, modification des
 * types d'observation, ajout / modification / suppression / duplication d'une passe
 * vidéo. Chaque appelant encadre sa mutation ainsi :
 *
 *     const before = await captureAnalyticsSnapshot(projectId)   // avant
 *     ...mutation de configuration...
 *     await recordConfigChangeVersions({ projectId, before, trigger, actorId })
 *
 * Deux instantanés sont alors écrits : `previous` (l'état d'AVANT, qui devient
 * l'historique exact) puis `current` (l'état d'APRÈS, avec le nouveau dénominateur
 * et les MÊMES détections passées).
 *
 * ─── CE QUI NE CRÉE JAMAIS DE VERSION ───────────────────────────────────────
 * Consulter le tableau de bord, appliquer un filtre, consulter un type, consulter
 * l'historique, consulter/télécharger un export, enregistrer une capture, réaliser
 * une nouvelle observation. Ces actions n'appellent aucune fonction d'écriture ici.
 *
 * ─── IMMUABILITÉ ────────────────────────────────────────────────────────────
 * Aucune fonction de ce module ne met à jour `configuration` ni `metrics` d'une
 * ligne existante : il n'y a que des `create` et des lectures.
 */
import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import {
  buildAnalyticsSnapshot,
  computeAnalyticsMetrics,
  perimeterFingerprint,
  rematchRowsToWindows,
  sameAnalyticState,
  selectVersionAsOfDate,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type AnalyticsTrigger,
  type AnalyticsVersionMetrics,
  type AnalyticsVersionRecord,
  type AnalyticsVersionSnapshot,
  type AnalyticsVersionStage,
} from '@/lib/analyticsVersioning'
import {
  loadAnalyticsRows,
  loadPerimeterConfig,
  narrowPerimeterConfig,
  restrictRowsToConfig,
  type AnalyticsRowFilter,
} from '@/lib/analyticsSource'

/** Résumé d'une version pour les sélecteurs d'interface (sans les payloads lourds). */
export type AnalyticsVersionSummary = {
  id: string
  versionNumber: number
  effectiveAt: string
  trigger: string
  stage: AnalyticsVersionStage
  configuredPoints: number
  observerCount: number
  detections: number
  possibleObservations: number
  detectionProbability: number | null
}

function asStage(value: string): AnalyticsVersionStage {
  return value === 'previous' ? 'previous' : 'current'
}

type VersionRow = {
  id: string
  versionNumber: number
  effectiveAt: Date
  dataCutoffAt: Date
  trigger: string
  stage: string
  perimeterHash: string
  configuration: Prisma.JsonValue
  metrics: Prisma.JsonValue
}

function toRecord(row: VersionRow): AnalyticsVersionRecord {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    effectiveAt: row.effectiveAt.toISOString(),
    dataCutoffAt: row.dataCutoffAt.toISOString(),
    trigger: row.trigger,
    stage: asStage(row.stage),
    perimeterHash: row.perimeterHash,
    configuration: row.configuration as unknown as AnalyticsPerimeterConfig,
    metrics: row.metrics as unknown as AnalyticsVersionMetrics,
  }
}

const versionSelect = {
  id: true,
  versionNumber: true,
  effectiveAt: true,
  dataCutoffAt: true,
  trigger: true,
  stage: true,
  perimeterHash: true,
  configuration: true,
  metrics: true,
} as const

/** Historique complet des versions d'un projet (plus ancienne d'abord). */
export async function listAnalyticsVersions(
  projectId: string,
): Promise<AnalyticsVersionRecord[]> {
  const rows = await prisma.analyticsVersion.findMany({
    where: { projectId },
    orderBy: [{ effectiveAt: 'asc' }, { versionNumber: 'asc' }],
    select: versionSelect,
  })
  return rows.map(toRecord)
}

/** Résumés des versions (sélecteur d'interface). */
export function summarizeVersions(
  versions: readonly AnalyticsVersionRecord[],
): AnalyticsVersionSummary[] {
  return versions.map((version) => ({
    id: version.id,
    versionNumber: version.versionNumber,
    effectiveAt: version.effectiveAt,
    trigger: version.trigger,
    stage: version.stage,
    configuredPoints: version.metrics.configuredPoints,
    observerCount: version.metrics.observerCount,
    detections: version.metrics.detections,
    possibleObservations: version.metrics.possibleObservations,
    detectionProbability: version.metrics.detectionProbability,
  }))
}

/**
 * Instantané de l'état analytique COURANT d'un projet (configuration complète +
 * toutes les observations valides). Lecture pure : n'écrit rien.
 */
export async function captureAnalyticsSnapshot(
  projectId: string,
  cutoffAt?: Date,
): Promise<AnalyticsVersionSnapshot | null> {
  const config = await loadPerimeterConfig(projectId)
  if (!config) return null
  const at = cutoffAt ?? new Date()
  const rows = await loadAnalyticsRows(projectId, { cutoffAt: at })
  return buildAnalyticsSnapshot({
    config,
    // RECALCUL DYNAMIQUE : les captures RAW sont réévaluées contre les fenêtres de
    // CETTE configuration (avant/après), jamais sur le `pointId`/`isGhostPoint`
    // persisté. L'instantané « avant » et « après » reflète donc exactement l'état
    // analytique au moment de la modification.
    rows: rematchRowsToWindows(rows, config),
    dataCutoffAt: at.toISOString(),
  })
}

async function insertVersion(input: {
  projectId: string
  snapshot: AnalyticsVersionSnapshot
  trigger: AnalyticsTrigger
  stage: AnalyticsVersionStage
  effectiveAt: Date
  actorId: string | null
}): Promise<{ id: string; versionNumber: number } | null> {
  // Le numéro est attribué à l'écriture ; la contrainte unique (projet, numéro)
  // protège contre deux modifications concurrentes (on retente une fois).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await prisma.analyticsVersion.findFirst({
      where: { projectId: input.projectId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    })
    const versionNumber = (last?.versionNumber ?? 0) + 1
    try {
      const created = await prisma.analyticsVersion.create({
        data: {
          projectId: input.projectId,
          versionNumber,
          effectiveAt: input.effectiveAt,
          dataCutoffAt: new Date(input.snapshot.dataCutoffAt),
          trigger: input.trigger,
          stage: input.stage,
          perimeterHash: input.snapshot.perimeterHash,
          configuration: input.snapshot.configuration as unknown as Prisma.InputJsonObject,
          metrics: input.snapshot.metrics as unknown as Prisma.InputJsonObject,
          createdById: input.actorId,
        },
        select: { id: true, versionNumber: true },
      })
      return created
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') continue
      console.error('[analytics] Écriture d’une version analytique impossible :', error)
      return null
    }
  }
  return null
}

export type RecordConfigChangeInput = {
  projectId: string
  /** Instantané pris AVANT la mutation (via `captureAnalyticsSnapshot`). */
  before: AnalyticsVersionSnapshot | null
  trigger: AnalyticsTrigger
  actorId: string | null
}

export type RecordConfigChangeResult = {
  /** Nombre de versions réellement écrites (0 si le périmètre n'a pas changé). */
  created: number
  previousVersionNumber: number | null
  currentVersionNumber: number | null
}

/**
 * Écrit les versions analytiques d'une modification de configuration.
 *
 * — Si le périmètre analytique n'a pas changé (même empreinte), AUCUNE version
 *   n'est écrite : une modification cosmétique ne pollue pas l'historique.
 * — Sinon : l'état d'AVANT est figé (`previous`) puis l'état d'APRÈS (`current`).
 *   Les détections déjà réalisées sont conservées dans les deux ; seul le
 *   dénominateur (observations possibles) suit la nouvelle configuration.
 */
export async function recordConfigChangeVersions(
  input: RecordConfigChangeInput,
): Promise<RecordConfigChangeResult> {
  const empty: RecordConfigChangeResult = {
    created: 0,
    previousVersionNumber: null,
    currentVersionNumber: null,
  }
  try {
    const after = await captureAnalyticsSnapshot(input.projectId)
    if (!after) return empty
    const before = input.before
    if (before && before.perimeterHash === after.perimeterHash) {
      // Le périmètre analytique est inchangé : rien à versionner.
      return empty
    }

    const effectiveAt = new Date()
    let previousVersionNumber: number | null = null
    let created = 0

    if (before) {
      // On ne réécrit pas un état déjà figé à l'identique (dernière version connue).
      const latest = await prisma.analyticsVersion.findFirst({
        where: { projectId: input.projectId },
        orderBy: [{ effectiveAt: 'desc' }, { versionNumber: 'desc' }],
        select: versionSelect,
      })
      const latestSnapshot = latest ? toRecord(latest) : null
      const duplicate = latestSnapshot !== null && sameAnalyticState(latestSnapshot, before)
      if (!duplicate) {
        const row = await insertVersion({
          projectId: input.projectId,
          snapshot: before,
          trigger: input.trigger,
          stage: 'previous',
          effectiveAt,
          actorId: input.actorId,
        })
        if (row) {
          previousVersionNumber = row.versionNumber
          created += 1
        }
      } else {
        previousVersionNumber = latestSnapshot.versionNumber
      }
    }

    const currentRow = await insertVersion({
      projectId: input.projectId,
      snapshot: after,
      trigger: input.trigger,
      stage: 'current',
      effectiveAt,
      actorId: input.actorId,
    })
    if (currentRow) created += 1

    if (created > 0) {
      await recordAudit({
        userId: input.actorId,
        action: AUDIT_ACTIONS.analyticsVersionCreated,
        entityType: 'analytics',
        entityId: input.projectId,
        metadata: {
          trigger: input.trigger,
          previousVersion: previousVersionNumber,
          currentVersion: currentRow?.versionNumber ?? null,
          configuredPointsBefore: before?.metrics.configuredPoints ?? null,
          configuredPointsAfter: after.metrics.configuredPoints,
          detections: after.metrics.detections,
          possibleObservations: after.metrics.possibleObservations,
        },
      })
      await recordAudit({
        userId: input.actorId,
        action: AUDIT_ACTIONS.analyticsRecalculated,
        entityType: 'analytics',
        entityId: input.projectId,
        metadata: {
          trigger: input.trigger,
          detections: after.metrics.detections,
          possibleObservations: after.metrics.possibleObservations,
        },
      })
    }

    return {
      created,
      previousVersionNumber,
      currentVersionNumber: currentRow?.versionNumber ?? null,
    }
  } catch (error) {
    // Le versionnage est une trace analytique : son échec ne doit jamais faire
    // échouer la modification de configuration déjà appliquée.
    console.error('[analytics] Versionnage de la modification impossible :', error)
    return empty
  }
}

/**
 * Enveloppe pratique : exécute une mutation de configuration en encadrant
 * automatiquement le versionnage (avant / après).
 */
export async function withAnalyticsVersioning<T>(
  input: { projectId: string; trigger: AnalyticsTrigger; actorId: string | null },
  mutate: () => Promise<T>,
): Promise<T> {
  const before = await captureAnalyticsSnapshot(input.projectId)
  const result = await mutate()
  await recordConfigChangeVersions({ ...input, before })
  return result
}

// ——— Résolution d'une analyse (actuelle ou historique) ———

/** Sélecteur de version transmis par l'interface / les exports. */
export type AnalyticsVersionSelector = {
  /** Identifiant exact d'une version historique. */
  versionId?: string | null
  /** Filtre par date `YYYY-MM-DD` : « afficher l'analyse avant le … ». */
  asOfDate?: string | null
}

export type ResolvedAnalyticsView = {
  mode: 'current' | 'version'
  /** Version sélectionnée (null en analyse actuelle). */
  version: AnalyticsVersionRecord | null
  /** Configuration effective (figée si version, courante sinon), restreinte au filtre. */
  config: AnalyticsPerimeterConfig
  /** Lignes valides du périmètre (bornées à `dataCutoffAt` si version). */
  rows: AnalyticsObservationRow[]
  /** Métriques exposées — FIGÉES telles quelles quand elles proviennent d'une version. */
  metrics: AnalyticsVersionMetrics
  /** Vrai si `metrics` sort d'un instantané immuable (jamais recalculé). */
  frozen: boolean
  /** Historique disponible (sélecteur d'interface). */
  versions: AnalyticsVersionSummary[]
  /** Filtre réellement appliqué. */
  appliedFilter: AnalyticsRowFilter
}

function hasFilter(filter: AnalyticsRowFilter): boolean {
  return (
    filter.observationType !== undefined ||
    filter.videoId !== undefined ||
    filter.observerId !== undefined
  )
}

/**
 * Résout l'analyse demandée — c'est le point d'entrée COMMUN du tableau de bord et
 * de TOUS les exports (Excel global, Excel observateur, PDF, paquet ZIP).
 *
 *  — Sans sélecteur : analyse actuelle (dernière configuration + toutes les données).
 *  — `versionId` : cette version exactement.
 *  — `asOfDate`  : la dernière version disponible à cette date (filtre de VERSIONS).
 *
 * Quand une version est retenue sans filtre, `metrics` est l'instantané figé : les
 * valeurs historiques ne sont JAMAIS remplacées par la configuration actuelle.
 * Avec un filtre, les métriques sont recalculées sur le sous-ensemble — à partir de
 * la configuration FIGÉE de la version et de ses données bornées.
 */
export async function resolveAnalyticsView(
  projectId: string,
  selector?: AnalyticsVersionSelector | null,
  filter?: AnalyticsRowFilter | null,
): Promise<ResolvedAnalyticsView | null> {
  const currentConfig = await loadPerimeterConfig(projectId)
  if (!currentConfig) return null

  const history = await listAnalyticsVersions(projectId)
  const versions = summarizeVersions(history)
  const appliedFilter: AnalyticsRowFilter = { ...(filter ?? {}) }

  const wantedId = selector?.versionId?.trim() || ''
  const wantedDate = selector?.asOfDate?.trim() || ''
  let version: AnalyticsVersionRecord | null = null
  if (wantedId) {
    version = history.find((item) => item.id === wantedId) ?? null
  } else if (wantedDate) {
    version = selectVersionAsOfDate(history, wantedDate)
  }

  if (!version) {
    const config = narrowPerimeterConfig(currentConfig, appliedFilter)
    // ——— ANALYSE COURANTE : recalcul DYNAMIQUE ———
    // Chaque capture RAW est réévaluée contre les fenêtres COURANTES (horodatage +
    // passe vidéo) : le `pointId`/`isGhostPoint` persisté n'est PAS utilisé. Une
    // capture ancienne devient donc une détection valide dès qu'une fenêtre la couvre.
    const rows = rematchRowsToWindows(
      await loadAnalyticsRows(projectId, { filter: appliedFilter }),
      config,
    )
    return {
      mode: 'current',
      version: null,
      config,
      rows,
      metrics: computeAnalyticsMetrics(config, rows),
      frozen: false,
      versions,
      appliedFilter,
    }
  }

  // ——— Version historique : configuration FIGÉE + données bornées ———
  const frozenConfig = version.configuration
  const config = narrowPerimeterConfig(frozenConfig, appliedFilter)
  const rows = restrictRowsToConfig(
    await loadAnalyticsRows(projectId, {
      cutoffAt: new Date(version.dataCutoffAt),
      filter: appliedFilter,
    }),
    config,
  )
  const filtered = hasFilter(appliedFilter)
  return {
    mode: 'version',
    version,
    config,
    rows,
    // Sans filtre : l'instantané est renvoyé tel quel (immuable). Avec filtre : le
    // sous-ensemble est recalculé sur la configuration figée et ses données bornées.
    metrics: filtered ? computeAnalyticsMetrics(config, rows) : version.metrics,
    frozen: !filtered,
    versions,
    appliedFilter,
  }
}

/** Trace la consultation d'une version historique (Partie I). */
export async function auditVersionViewed(input: {
  actorId: string | null
  projectId: string
  version: AnalyticsVersionRecord
  surface: string
}): Promise<void> {
  await recordAudit({
    userId: input.actorId,
    action: AUDIT_ACTIONS.analyticsVersionViewed,
    entityType: 'analytics',
    entityId: input.projectId,
    metadata: {
      versionId: input.version.id,
      versionNumber: input.version.versionNumber,
      surface: input.surface,
    },
  })
}

/** Empreinte du périmètre courant (diagnostic / tests d'intégration légers). */
export async function currentPerimeterHash(projectId: string): Promise<string | null> {
  const config = await loadPerimeterConfig(projectId)
  return config ? perimeterFingerprint(config) : null
}
