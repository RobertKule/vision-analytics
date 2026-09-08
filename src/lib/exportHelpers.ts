import type {
  AdminProjectDetailDto,
  ProjectAnalyticsDto,
  ProjectObservationRowDto,
} from '@/lib/types'

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Génère un fichier CSV scientifique complet avec métadonnées, cibles validées et points fantômes.
 * Formaté en UTF-8 avec BOM pour une compatibilité directe avec Excel et Numbers.
 */
export function generateScientificCsv(analytics: ProjectAnalyticsDto): string {
  const { project, summary, pointsAnalytics, ghostPointsAnalytics, observersMetrics } = analytics

  const lines: string[] = []

  // Métadonnées du projet
  lines.push('# RAPPORT SCIENTIFIQUE D’ANALYSE — VALIDATION CROISÉE — VISION ANALYTICS')
  lines.push(`# Projet: ${project.title}`)
  lines.push(`# Date d’export: ${new Date().toISOString()}`)
  lines.push(`# Observateurs participants: ${summary.totalObservers}`)
  lines.push(`# Taux de concordance globale: ${summary.overallConcordanceRate}%`)
  lines.push(`# Précision globale de détection: ${summary.overallPrecisionRate}%`)
  lines.push(`# Délai moyen de réaction: ${summary.averageDetectionDelay !== null ? `${summary.averageDetectionDelay}s` : 'N/A'}`)
  lines.push('')

  // Section 1 : Cibles & Taux de Concordance
  lines.push('--- SECTION 1 : SYNTHÈSE DES POINTS CIBLES ---')
  lines.push(
    [
      'ID_Cible',
      'Nom_Cible',
      'Trame_Debut_Sec',
      'Trame_Fin_Sec',
      'Duree_Fenetre_Sec',
      'Observateurs_Detecteurs',
      'Total_Observateurs',
      'Taux_Concordance_Pct',
      'Delai_Moyen_Reaction_Sec',
      'Horodatage_Premier_Sec',
      'Horodatage_Dernier_Sec',
    ].join(';'),
  )

  for (const point of pointsAnalytics) {
    lines.push(
      [
        `"${point.pointId}"`,
        `"${point.pointName}"`,
        point.trameDebut,
        point.trameFin,
        point.targetDuration,
        point.observerCount,
        summary.totalObservers,
        `${point.concordanceRate}%`,
        point.avgDelaySeconds !== null ? point.avgDelaySeconds : '',
        point.minTimestamp !== null ? formatSeconds(point.minTimestamp) : '',
        point.maxTimestamp !== null ? formatSeconds(point.maxTimestamp) : '',
      ].join(';'),
    )
  }

  lines.push('')

  // Section 2 : Détail de toutes les captures
  lines.push('--- SECTION 2 : RELEVÉ COMPLET DES OBSERVATIONS & CAPTURES ---')
  lines.push(
    [
      'Type_Observation',
      'ID_Cible',
      'Nom_Cible',
      'Horodatage_Sec',
      'Horodatage_Formate',
      'Delai_Reaction_Sec',
      'ID_Anonyme_Observateur',
      'Email_Observateur',
      'URL_Cloudinary',
      'Date_Heure_Soumission',
    ].join(';'),
  )

  // Captures valides
  for (const point of pointsAnalytics) {
    for (const cap of point.captures) {
      lines.push(
        [
          '"VALIDEE"',
          `"${point.pointId}"`,
          `"${point.pointName}"`,
          cap.timestampTotal,
          `"${formatSeconds(cap.timestampTotal)}"`,
          cap.delaySeconds !== null ? cap.delaySeconds : '',
          `"${cap.observerAnonymousId}"`,
          `"${cap.observerEmail || ''}"`,
          `"${cap.imageUrl}"`,
          `"${cap.createdAt}"`,
        ].join(';'),
      )
    }
  }

  // Captures fantômes (fausses alertes)
  for (const cap of ghostPointsAnalytics.captures) {
    lines.push(
      [
        '"POINT_FANTOME_FAUSSE_ALERTE"',
        '""',
        '"HORS_TRAME"',
        cap.timestampTotal,
        `"${formatSeconds(cap.timestampTotal)}"`,
        '',
        `"${cap.observerAnonymousId}"`,
        `"${cap.observerEmail || ''}"`,
        `"${cap.imageUrl}"`,
        `"${cap.createdAt}"`,
      ].join(';'),
    )
  }

  lines.push('')

  // Section 3 : Performance des observateurs
  lines.push('--- SECTION 3 : PERFORMANCE DES OBSERVATEURS ---')
  lines.push(
    [
      'ID_Anonyme',
      'Total_Observations',
      'Cibles_Validees',
      'Points_Fantomes',
      'Cibles_Distinctes_Trouvees',
      'Taux_Precision_Pct',
      'Premiere_Session',
      'Derniere_Session',
    ].join(';'),
  )

  for (const obs of observersMetrics) {
    lines.push(
      [
        `"${obs.anonymousId}"`,
        obs.totalObservations,
        obs.validObservationsCount,
        obs.ghostPointsCount,
        `${obs.pointsDetectedCount}/${project.totalDefinedPoints}`,
        `${obs.precisionRate}%`,
        `"${obs.firstSessionAt}"`,
        `"${obs.lastSessionAt}"`,
      ].join(';'),
    )
  }

  return '\uFEFF' + lines.join('\r\n')
}

/**
 * Télécharge un fichier CSV dans le navigateur de l'utilisateur.
 */
export function triggerCsvDownload(filename: string, csvContent: string): void {
  triggerFileDownload(filename, csvContent, 'text/csv;charset=utf-8;')
}

/**
 * Télécharge un contenu texte (CSV, JSON…) dans le navigateur de l'utilisateur.
 */
export function triggerFileDownload(filename: string, content: BlobPart, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ——— Exports « Espace Projet » (relevé d'observations : CSV + JSON) ———

/** Nom de fichier sûr : minuscule accents supprimés, ASCII, sans espaces ni caractères hostiles. */
export function sanitizeBaseName(value: string): string {
  const ascii = value.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const cleaned = ascii
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return cleaned || 'projet'
}

/** Libellé lisible d'une passe vidéo (nom → type → « Passe N » → nom de fichier). */
export function videoDisplayName(
  video: {
    name?: string | null
    typeLabel?: string | null
    source?: string | null
    orderIndex?: number | null
  } | null | undefined,
): string {
  if (!video) return ''
  const named = video.name?.trim()
  if (named) return named
  const typed = video.typeLabel?.trim()
  if (typed) return typed
  if (typeof video.orderIndex === 'number') return `Passe ${video.orderIndex + 1}`
  const source = video.source?.trim() ?? ''
  if (source) {
    const leaf = source.split('/').pop() ?? source
    return leaf.length > 40 ? `${leaf.slice(0, 37)}…` : leaf
  }
  return 'Vidéo'
}

/** Libellé lisible d'un observateur (username → email → identifiant anonyme). */
export function observerLabelOf(row: Pick<
  ProjectObservationRowDto,
  'observerUsername' | 'observerEmail' | 'observerAnonymousId'
>): string {
  return row.observerUsername?.trim() || row.observerEmail?.trim() || row.observerAnonymousId || '—'
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

/** Libellé mm:ss d'un horodatage vidéo. */
function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Ligne d'export normalisée — ne transporte QUE des champs réellement persistés.
 * L'espèce, les coordonnées spatiales (X/Y) et la durée vidéo ne sont volontairement
 * pas enregistrées (procédure d'observation indépendante : aucune géométrie de capture en base).
 * Elles apparaissent donc vides / null dans les exports, ce qui est documenté ci-dessous.
 */
export type ExportObservationRow = {
  id: string
  observerUsername: string | null
  observerEmail: string | null
  observerAnonymousId: string
  timestampTotal: number
  /** Fenêtre cible rattachée (validée) ; null ⇒ fausse alerte / hors trame. */
  pointLabel: string | null
  isGhostPoint: boolean
  imageUrl: string
  createdAt: string
}

type ExportProjectMeta = {
  id: string
  title: string
  description: string | null
  videoUrl: string | null
  createdAt: string
  totalDefinedPoints: number
}

function exportNameOf(row: ExportObservationRow): string {
  return row.observerUsername?.trim() || row.observerEmail?.trim() || row.observerAnonymousId || '—'
}

/** Colonnes du CSV scientifique complet — spécification exacte (géométrie non persistée → vides). */
const SCIENTIFIC_CSV_HEADERS = [
  'ID Projet',
  'Nom du Projet',
  'ID Observateur',
  'Nom Observateur',
  'Horodatage (sec)',
  'Horodatage (MM:SS)',
  'Type/Label',
  'Coordonnées X',
  'Coordonnées Y',
  'Statut Validation',
  'Date de Capture',
]

function exportRowsFromDetail(detail: AdminProjectDetailDto): {
  meta: ExportProjectMeta
  rows: ExportObservationRow[]
} {
  const { project, rows } = detail
  return {
    meta: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      createdAt: project.createdAt,
      totalDefinedPoints: project.pointsCount,
    },
    rows: rows.map((row) => ({
      id: row.id,
      observerUsername: row.observerUsername,
      observerEmail: row.observerEmail,
      observerAnonymousId: row.observerAnonymousId,
      timestampTotal: row.timestampTotal,
      pointLabel: row.pointLabel,
      isGhostPoint: row.isGhostPoint,
      imageUrl: row.imageUrl,
      createdAt: row.createdAt,
    })),
  }
}

/** Reconstruit le relevé plat depuis le DTO analytique (validées rattachées à leur fenêtre). */
function exportRowsFromAnalytics(analytics: ProjectAnalyticsDto): {
  meta: ExportProjectMeta
  rows: ExportObservationRow[]
} {
  const { project } = analytics
  const rows: ExportObservationRow[] = []

  for (const point of analytics.pointsAnalytics) {
    for (const cap of point.captures) {
      rows.push({
        id: cap.id,
        observerUsername: null,
        observerEmail: cap.observerEmail ?? null,
        observerAnonymousId: cap.observerAnonymousId,
        timestampTotal: cap.timestampTotal,
        pointLabel: point.pointName,
        isGhostPoint: false,
        imageUrl: cap.imageUrl,
        createdAt: cap.createdAt,
      })
    }
  }
  for (const cap of analytics.ghostPointsAnalytics.captures) {
    rows.push({
      id: cap.id,
      observerUsername: null,
      observerEmail: cap.observerEmail ?? null,
      observerAnonymousId: cap.observerAnonymousId,
      timestampTotal: cap.timestampTotal,
      pointLabel: null,
      isGhostPoint: true,
      imageUrl: cap.imageUrl,
      createdAt: cap.createdAt,
    })
  }

  return {
    meta: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      createdAt: project.createdAt,
      totalDefinedPoints: project.totalDefinedPoints,
    },
    rows,
  }
}

/** Tri chronologique ascendant (les plus anciennes d'abord) pour la lisibilité des exports. */
function sortedExportRows(rows: ExportObservationRow[]): ExportObservationRow[] {
  return rows
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.timestampTotal - b.timestampTotal)
}

function statusLabelOf(row: ExportObservationRow): string {
  return row.isGhostPoint ? 'Fantôme (fausse alerte)' : 'Validée'
}

/**
 * CSV scientifique complet — UTF-8 avec BOM, séparateur « ; » (Excel FR).
 * 11 colonnes exactes. Les colonnes « Coordonnées X » / « Coordonnées Y » sont
 * volontairement vides : la géométrie de capture n'est jamais persistée (observation indépendante).
 */
export function buildObservationExportCsv(
  meta: ExportProjectMeta,
  rows: ExportObservationRow[],
): string {
  const lines: string[] = []
  lines.push(SCIENTIFIC_CSV_HEADERS.map((header) => csvCell(header)).join(';'))

  for (const row of sortedExportRows(rows)) {
    const cells: Array<string | number> = [
      csvCell(meta.id),
      csvCell(meta.title),
      csvCell(row.observerAnonymousId),
      csvCell(exportNameOf(row)),
      row.timestampTotal,
      csvCell(mmss(row.timestampTotal)),
      csvCell(row.pointLabel ?? 'Hors trame'),
      csvCell(''), // Coordonnées X — non persistées
      csvCell(''), // Coordonnées Y — non persistées
      csvCell(statusLabelOf(row)),
      csvCell(row.createdAt),
    ]
    lines.push(cells.map((cell) => (typeof cell === 'number' ? String(cell) : cell)).join(';'))
  }

  return '﻿' + lines.join('\r\n')
}

/** Synthèse par observateur (précision individuelle) pour le JSON hiérarchique. */
function buildObserversSummary(meta: ExportProjectMeta, rows: ExportObservationRow[]) {
  const byObserver = new Map<string, ExportObservationRow[]>()
  for (const row of rows) {
    const list = byObserver.get(row.observerAnonymousId) ?? []
    list.push(row)
    byObserver.set(row.observerAnonymousId, list)
  }

  return Array.from(byObserver.entries())
    .map(([anonymousId, observerRows]) => {
      const validated = observerRows.filter((row) => !row.isGhostPoint)
      const ghosts = observerRows.filter((row) => row.isGhostPoint)
      const total = observerRows.length
      const windowsDetected = new Set(validated.map((row) => row.pointLabel).filter(Boolean))
      const first = observerRows[0]
      const last = observerRows[observerRows.length - 1]
      return {
        observerAnonymousId: anonymousId,
        displayName: exportNameOf(first),
        username: first.observerUsername,
        email: first.observerEmail,
        totalObservations: total,
        validatedCount: validated.length,
        ghostCount: ghosts.length,
        windowsDetectedCount: windowsDetected.size,
        totalDefinedPoints: meta.totalDefinedPoints,
        precisionRate: total > 0 ? Math.round((validated.length / total) * 100) : null,
        firstCapturedAt: first.createdAt,
        lastCapturedAt: last.createdAt,
      }
    })
    .sort((a, b) => b.totalObservations - a.totalObservations)
}

/**
 * JSON hiérarchique scientifique — projectMetadata + observersSummary + observations.
 * Les champs non persistés (species, coordonnées, durée vidéo) sont exposés à null et
 * documentés : aucune géométrie de capture n'est transmise ni stockée (observation indépendante).
 */
export function buildObservationExportJson(
  meta: ExportProjectMeta,
  rows: ExportObservationRow[],
): string {
  const sorted = sortedExportRows(rows)

  const observations = sorted.map((row) => ({
    id: row.id,
    type: row.isGhostPoint ? 'ghost' : 'validated',
    windowLabel: row.pointLabel, // null ⇒ hors trame (fausse alerte)
    statusLabel: statusLabelOf(row),
    timestampSeconds: row.timestampTotal,
    timestampLabel: mmss(row.timestampTotal),
    coordinates: { x: null, y: null }, // non persistées — observation indépendante
    observer: {
      anonymousId: row.observerAnonymousId,
      displayName: exportNameOf(row),
      username: row.observerUsername,
      email: row.observerEmail,
    },
    imageUrl: row.imageUrl,
    capturedAt: row.createdAt,
  }))

  return JSON.stringify(
    {
      projectMetadata: {
        id: meta.id,
        title: meta.title,
        description: meta.description,
        species: null, // espèce non enregistrée lors des captures
        videoUrl: meta.videoUrl,
        createdAt: meta.createdAt,
        totalDefinedPoints: meta.totalDefinedPoints,
        totalObservations: sorted.length,
        exportedAt: new Date().toISOString(),
        documentation:
          "Coordonnées spatiales (X/Y), espèce et durée vidéo non persistées : la procédure " +
          'd’observation indépendante n’enregistre aucune géométrie de capture. Les captures ' +
          'restent identifiées par leur horodatage vidéo et leur fenêtre cible de validation.',
      },
      observersSummary: buildObserversSummary(meta, sorted),
      observations,
    },
    null,
    2,
  )
}

/**
 * Génère le CSV scientifique complet (11 colonnes, BOM UTF-8, « ; ») depuis le relevé admin.
 */
export function buildObservationCsv(detail: AdminProjectDetailDto): string {
  const { meta, rows } = exportRowsFromDetail(detail)
  return buildObservationExportCsv(meta, rows)
}

/**
 * Génère le JSON hiérarchique scientifique depuis le relevé admin.
 */
export function buildObservationJson(detail: AdminProjectDetailDto): string {
  const { meta, rows } = exportRowsFromDetail(detail)
  return buildObservationExportJson(meta, rows)
}

/**
 * Variantes « analytics » (espace analyste / scientifique) : les observateurs ne disposent
 * pas du relevé admin enrichi, mais le DTO analytique suffit à reconstruire les mêmes exports.
 */
export function buildAnalyticsObservationCsv(analytics: ProjectAnalyticsDto): string {
  const { meta, rows } = exportRowsFromAnalytics(analytics)
  return buildObservationExportCsv(meta, rows)
}

export function buildAnalyticsObservationJson(analytics: ProjectAnalyticsDto): string {
  const { meta, rows } = exportRowsFromAnalytics(analytics)
  return buildObservationExportJson(meta, rows)
}
