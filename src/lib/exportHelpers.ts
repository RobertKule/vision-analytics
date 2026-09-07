import type { ProjectAnalyticsDto } from '@/lib/types'

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
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
