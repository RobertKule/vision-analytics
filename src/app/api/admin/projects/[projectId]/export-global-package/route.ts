import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { getCurrentSession } from '@/lib/auth'
import { brandFileName, sanitizeBaseName } from '@/lib/exportHelpers'
import { generateExcelWorkbook } from '@/lib/serverGlobalWorkbook'
import { resolveExportSource } from '@/lib/exportSource'
import { auditVersionViewed } from '@/lib/analyticsVersionStore'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PNG_PREFIX = 'data:image/png;base64,'
const MAX_PNG_BYTES = 15 * 1024 * 1024 // 15 Mo / graphique (garde-fou anti-abuse)

/** Identifiants de graphiques acceptés et leur emplacement dans l'archive. */
const CHART_FILES: Record<string, string> = {
  detections: 'Charts/detections.png',
  ventilation: 'Charts/validites_fantomes.png',
  fenetres: 'Charts/captures_par_fenetre.png',
}

type ExportContext = {
  params: Promise<{ projectId: string }>
}

type PackageChartInput = { id?: string; dataUrl?: string }

type PackageBody = {
  observationType?: string
  videoId?: string
  charts?: PackageChartInput[]
}

/**
 * « Export ZIP — Excel + graphiques » (POST) : assemble un paquet cohérent avec la
 * VUE FILTRÉE dont il provient (projet / type / vidéo) :
 *
 *   [Titre]_Export_Global_Graphiques/
 *   ├── Export_Global.xlsx      (3 feuilles — Synthèse · Matrice · Relevé filtré)
 *   ├── Charts/detections.png   (PNG « réellement visibles », transmis par le client)
 *   ├── Charts/validites_fantomes.png
 *   ├── Charts/captures_par_fenetre.png
 *   └── manifest.json           (métadonnées + filtre appliqué + protocole)
 *
 * Le classeur est généré CÔTÉ SERVEUR sur le sous-ensemble filtré (jamais une coupe
 * frontend). Les PNG viennent du navigateur (sérialisation SVG Recharts du graphique
 * visible) ; ils sont validés (identifiant connu, PNG base64, taille bornée) et ne
 * sont jamais persistés — aucune géométrie de capture n'est transmise.
 */
export async function POST(request: Request, ctx: ExportContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params

  let body: PackageBody
  try {
    body = (await request.json()) as PackageBody
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 })
  }

  const observationType =
    typeof body.observationType === 'string' && body.observationType.trim()
      ? body.observationType.trim()
      : undefined
  const videoIdRaw = typeof body.videoId === 'string' ? body.videoId.trim() : ''
  const videoFilterDefined = videoIdRaw !== ''
  // '' est le marqueur réservé de la passe générique héritée (videoId null).

  // ——— Autorisation + SOURCE ANALYTIQUE UNIQUE (même vue que le tableau de bord) ———
  // Le paquet ne recalcule rien : il reçoit la configuration (figée si une version
  // historique est demandée via `?versionId=` / `?before=`) et ses lignes.
  const resolution = await resolveExportSource({
    projectId,
    url: new URL(request.url),
    filter: {
      ...(observationType !== undefined ? { observationType } : {}),
      ...(videoFilterDefined ? { videoId: videoIdRaw } : {}),
    },
  })
  if (!resolution.ok) {
    return NextResponse.json(
      { error: resolution.refusal.error },
      { status: resolution.refusal.status },
    )
  }
  const { source, view, versionLabel, fileToken } = resolution.resolved
  const project = source.project

  if (source.rows.length === 0) {
    return NextResponse.json(
      { error: 'Aucune observation à exporter pour ce filtre.' },
      { status: 404 },
    )
  }

  if (view.version) {
    await auditVersionViewed({
      actorId: session.uid,
      projectId: project.id,
      version: view.version,
      surface: 'export-global-package',
    })
  }

  const workbookBuffer = await generateExcelWorkbook(source, { versionLabel })

  // ——— Validation des PNG fournis par le client (graphiques visibles) ———
  const chartBuffers = new Map<string, Buffer>()
  const chartInput = Array.isArray(body.charts) ? body.charts : []
  for (const item of chartInput) {
    const id = typeof item?.id === 'string' ? item.id : ''
    const dataUrl = typeof item?.dataUrl === 'string' ? item.dataUrl : ''
    if (!CHART_FILES[id]) {
      return NextResponse.json(
        { error: `Identifiant de graphique inconnu : « ${id} ».` },
        { status: 400 },
      )
    }
    if (chartBuffers.has(id)) continue // doublon ignoré
    if (!dataUrl.startsWith(PNG_PREFIX)) {
      return NextResponse.json(
        { error: `Le graphique « ${id} » n’est pas une image PNG valide.` },
        { status: 400 },
      )
    }
    const base64 = dataUrl.slice(PNG_PREFIX.length)
    let image: Buffer
    try {
      image = Buffer.from(base64, 'base64')
    } catch {
      return NextResponse.json(
        { error: `Impossible de décoder le graphique « ${id} ».` },
        { status: 400 },
      )
    }
    if (image.byteLength === 0 || image.byteLength > MAX_PNG_BYTES) {
      return NextResponse.json(
        { error: `Le graphique « ${id} » a une taille invalide.` },
        { status: 400 },
      )
    }
    chartBuffers.set(id, image)
  }

  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.exportPackage,
    entityType: 'export',
    entityId: project.id,
    metadata: {
      title: project.title,
      observations: source.rows.length,
      charts: chartBuffers.size,
      version: versionLabel,
      versionId: view.version?.id ?? null,
      ...(observationType ? { observationType } : {}),
      ...(videoIdRaw ? { videoId: videoIdRaw } : {}),
    },
  })

  // ——— Assemblage de l'archive ———
  const zip = new JSZip()
  const rootFolder = `${sanitizeBaseName(project.title)}_Export_Global_Graphiques${fileToken}`

  zip.file(`${rootFolder}/Export_Global.xlsx`, workbookBuffer)
  for (const [id, image] of chartBuffers) {
    zip.file(`${rootFolder}/${CHART_FILES[id]}`, image)
  }

  const appliedFilterContext =
    videoFilterDefined || observationType
      ? {
          observationType: observationType ?? null,
          videoId: videoIdRaw || null,
          note:
            'Filtre réellement appliqué au classeur ET aux graphiques (vue filtrée du tableau de bord).',
        }
      : null

  zip.file(
    `${rootFolder}/manifest.json`,
    JSON.stringify(
      {
        project: { id: project.id, title: project.title },
        exportedAt: new Date().toISOString(),
        // Version analytique exportée — identique à celle du tableau de bord et du PDF.
        analyticsVersion: {
          label: versionLabel,
          id: view.version?.id ?? null,
          versionNumber: view.version?.versionNumber ?? null,
          effectiveAt: view.version?.effectiveAt ?? null,
          frozen: view.frozen,
        },
        // Comptes au niveau des LIGNES exportées (chaque capture certifiée est une ligne
        // du relevé). Les statistiques agrégées (points uniques validés, revendications)
        // sont celles du classeur / rapport, calculées en déduplication — non reproduites
        // ici pour ne pas confondre les deux échelles.
        totalRows: source.rows.length,
        validRows: source.rows.filter((row) => !row.isGhostPoint).length,
        ghostRows: source.rows.filter((row) => row.isGhostPoint).length,
        appliedFilter: appliedFilterContext,
        files: {
          excel: `${rootFolder}/Export_Global.xlsx`,
          charts: Array.from(chartBuffers.keys()).map(
            (id) => `${rootFolder}/${CHART_FILES[id]}`,
          ),
        },
        protocolNote:
          'Les graphiques PNG sont générés depuis le graphique réellement visible ' +
          '(sérialisation SVG → canvas) avec la bannière de contexte (projet / type / vidéo). ' +
          'Aucune géométrie de capture n’est transmise ni persistée : la procédure d’observation ' +
          'indépendante n’enregistre que l’horodatage vidéo et la fenêtre cible de validation.',
      },
      null,
      2,
    ),
  )

  const nodeBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const filename = `${brandFileName(rootFolder)}.zip`

  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(nodeBuffer.byteLength),
  })

  return new NextResponse(new Uint8Array(nodeBuffer), { status: 200, headers })
}
