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
  lines.push('# RAPPORT SCIENTIFIQUE D’ANALYSE EN AVEUGLE — VISION ANALYTICS')
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

/**
 * Génère un CSV « relevé d'observations » compatible Excel (BOM UTF-8, séparateur « ; »).
 * Colonnes = champs réellement persistés (aucune coordonnée ni annotation saisie en base).
 */
export function buildObservationCsv(detail: AdminProjectDetailDto): string {
  const { project, rows } = detail
  const lines: string[] = []

  lines.push(
    [
      'Projet',
      'Observateur',
      'Horodatage_Sec',
      'Point_Cible',
      'URL_Capture',
      'Date_Capture',
    ].join(';'),
  )

  for (const row of rows) {
    lines.push(
      [
        csvCell(project.title),
        csvCell(observerLabelOf(row)),
        row.timestampTotal,
        csvCell(row.pointLabel ?? 'GHOST'),
        csvCell(row.imageUrl),
        csvCell(row.createdAt),
      ].join(';'),
    )
  }

  return '﻿' + lines.join('\r\n')
}

/**
 * Génère un JSON hiérarchique par observateur, prêt pour des pipelines d'analyse.
 */
export function buildObservationJson(detail: AdminProjectDetailDto): string {
  const { project, rows } = detail

  const byObserver = new Map<
    string,
    {
      observerId: string
      label: string
      email: string | null
      anonymousId: string
      observations: ProjectObservationRowDto[]
    }
  >()
  for (const row of rows) {
    if (!row.observerId) continue
    const group = byObserver.get(row.observerId) ?? {
      observerId: row.observerId,
      label: observerLabelOf(row),
      email: row.observerEmail,
      anonymousId: row.observerAnonymousId,
      observations: [],
    }
    group.observations.push(row)
    byObserver.set(row.observerId, group)
  }

  const observers = Array.from(byObserver.values())
    .map((group) => {
      const timestamps = group.observations.map((row) => new Date(row.createdAt).getTime())
      return {
        observerId: group.observerId,
        label: group.label,
        email: group.email,
        anonymousId: group.anonymousId,
        count: group.observations.length,
        firstCapturedAt:
          timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
        lastCapturedAt:
          timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
        observations: group.observations,
      }
    })
    .sort((a, b) => b.count - a.count)

  return JSON.stringify(
    {
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        exportedAt: new Date().toISOString(),
      },
      observers,
    },
    null,
    2,
  )
}
