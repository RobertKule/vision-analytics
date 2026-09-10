/**
 * SOURCE DES EXPORTS — pont entre la source analytique unique et les classeurs.
 *
 * RÈGLE ABSOLUE (Partie B) : les exports ne contiennent AUCUNE logique analytique
 * propre. Ils demandent ici la même vue que le tableau de bord (`resolveAnalyticsView`)
 * et se contentent de la mettre en forme. Pour une même version :
 *
 *     Dashboard = Excel global = Excel observateur = PDF
 *
 * Sélection de version (paramètres de requête communs à toutes les routes d'export) :
 *  — `?versionId=<id>`   : cette version historique exactement ;
 *  — `?before=YYYY-MM-DD`: la dernière version disponible à cette date ;
 *  — aucun paramètre     : l'analyse ACTUELLE (dernière configuration + toutes les
 *    données valides), qui est aussi ce que le dashboard affiche par défaut.
 *
 * Les valeurs historiques ne sont jamais remplacées par la configuration actuelle :
 * une version fournit sa configuration FIGÉE et ses données bornées.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { getCurrentProjectPermissions } from '@/lib/projectGuard'
import { computeDefinedPointsByType, type GlobalExportSource } from '@/lib/globalExportModel'
import { resolveAnalyticsView, type ResolvedAnalyticsView } from '@/lib/analyticsVersionStore'
import type { AnalyticsRowFilter } from '@/lib/analyticsSource'

export type ResolvedExportSource = {
  /** Source prête pour les générateurs (Excel / PDF / ZIP). */
  source: GlobalExportSource
  /** Vue analytique complète (métriques figées incluses). */
  view: ResolvedAnalyticsView
  /** Libellé humain de la version exportée. */
  versionLabel: string
  /** Jeton de nom de fichier (`_V2`…) ; vide pour l'analyse actuelle. */
  fileToken: string
  /** Vrai si les métriques proviennent d'un instantané immuable. */
  frozen: boolean
}

export type ExportSourceRefusal = { status: 401 | 403 | 404; error: string }

/** Lit `versionId` / `before` depuis l'URL d'une route d'export. */
export function readVersionSelector(url: URL): { versionId: string | null; asOfDate: string | null } {
  const versionId = (url.searchParams.get('versionId') ?? '').trim()
  const asOfDate = (url.searchParams.get('before') ?? '').trim()
  return { versionId: versionId || null, asOfDate: asOfDate || null }
}

function labelOf(view: ResolvedAnalyticsView): string {
  if (!view.version) return 'Analyse actuelle'
  const date = new Date(view.version.effectiveAt)
  const formatted = Number.isNaN(date.getTime())
    ? view.version.effectiveAt
    : date.toLocaleDateString('fr-FR')
  return `Version ${view.version.versionNumber} (${formatted})`
}

/**
 * Résout la source d'export d'un projet : autorisation, version, configuration et
 * lignes. `filter` restreint le périmètre exactement comme le tableau de bord.
 *
 * Renvoie un refus explicite (401/403/404) plutôt que des données partielles :
 * rien ne part vers le client avant validation des permissions.
 */
export async function resolveExportSource(input: {
  projectId: string
  url: URL
  filter?: AnalyticsRowFilter | null
}): Promise<{ ok: true; resolved: ResolvedExportSource } | { ok: false; refusal: ExportSourceRefusal }> {
  const projectId = (input.projectId ?? '').trim()
  if (!projectId) {
    return { ok: false, refusal: { status: 404, error: 'Projet introuvable.' } }
  }

  const permissions = await getCurrentProjectPermissions(projectId)
  if (!permissions.canExport) {
    return {
      ok: false,
      refusal: {
        status: permissions.level === 'none' ? 403 : 403,
        error: 'Accès de gestion requis sur ce projet.',
      },
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      observationTypes: true,
      createdAt: true,
    },
  })
  if (!project) {
    return { ok: false, refusal: { status: 404, error: 'Projet introuvable.' } }
  }

  const view = await resolveAnalyticsView(projectId, readVersionSelector(input.url), input.filter)
  if (!view) {
    return { ok: false, refusal: { status: 404, error: 'Projet introuvable.' } }
  }

  // Configuration FIGÉE de la version (ou courante), mise en forme pour les classeurs.
  const points = view.config.points.map((point) => ({
    id: point.id,
    label: point.label,
    trameDebut: point.trameDebut,
    trameFin: point.trameFin,
    videoName: point.videoName,
    type: point.type,
  }))

  const source: GlobalExportSource = {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      // Les types du périmètre suivent la version (figés pour un export historique).
      observationTypes: view.config.observationTypes,
      createdAt: project.createdAt.toISOString(),
      definedPoints: points.length,
      points,
      definedPointsByType: computeDefinedPointsByType(points),
    },
    rows: view.rows,
  }

  return {
    ok: true,
    resolved: {
      source,
      view,
      versionLabel: labelOf(view),
      fileToken: view.version ? `_V${view.version.versionNumber}` : '',
      frozen: view.frozen,
    },
  }
}
