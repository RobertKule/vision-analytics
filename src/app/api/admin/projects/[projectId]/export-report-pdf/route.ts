import { NextResponse } from 'next/server'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
} from 'pdf-lib'
import { getCurrentSession } from '@/lib/auth'
import { canManage, getCurrentProjectAccess } from '@/lib/projectGuard'
import { prisma } from '@/lib/prisma'
import { brandFileName, sanitizeBaseName, videoDisplayName } from '@/lib/exportHelpers'
import type {
  GlobalExportPoint,
  GlobalExportRow,
  GlobalExportSource,
} from '@/lib/globalExportModel'
import {
  buildDetectionProbabilityTable,
  buildProjectSummary,
  computeDefinedPointsByType,
} from '@/lib/globalExportModel'
import { recordAudit, AUDIT_ACTIONS } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ExportContext = {
  params: Promise<{ projectId: string }>
}

// ——— Bornes & constantes de validation des PNG transmis par le client ———

const PNG_PREFIX = 'data:image/png;base64,'
const MAX_PNG_BYTES = 8 * 1024 * 1024 // 8 Mo / graphique (garde-fou anti-abuse)

/** Identifiants des graphiques du rapport acceptés (SVG statiques rasterisés). */
const REPORT_CHART_IDS = new Set(['detections', 'ventilation'])

type ReportChartId = 'detections' | 'ventilation'

/** Décodage strict d'un PNG : signature + en-tête IHDR → dimensions réelles. */
function pngInfo(buffer: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buffer.length < 24) return null
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) return null
  }
  // Après la signature : longueur (4) + « IHDR » (4) puis width/height big-endian.
  if (
    buffer[12] !== 0x49 ||
    buffer[13] !== 0x48 ||
    buffer[14] !== 0x44 ||
    buffer[15] !== 0x52
  ) {
    return null
  }
  const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19]
  const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23]
  if (!(width > 0 && height > 0) || width > 10000 || height > 10000) return null
  return { width, height }
}

// ——— Modèle de rapport (recalcul serveur, jamais la coupe frontend) ———
// Sémantique identique au moteur d'analyse (`analyticsActions` / `globalExportModel`) :
// règle produit « point unique » — un observateur qui capture N fois la MÊME fenêtre
// (`pointId`) ne « détecte » cette fenêtre qu'une fois. Les fausses alertes restent
// des événements (chaque capture hors trame = 1). Le total « déclarations » =
// points uniques validés + fausses alertes → dénominateur commun de la précision.

type ReportPointInput = {
  id: string
  pointName: string
  trameDebut: number
  trameFin: number
}

type ReportCapture = {
  timestampTotal: number
  delaySeconds: number
  observerAnonymousId: string
  observerEmail: string | null
  createdAt: string
}

type ReportPoint = {
  pointId: string
  pointName: string
  trameDebut: number
  trameFin: number
  targetDuration: number
  observerCount: number
  concordanceRate: number
  avgDelaySeconds: number | null
  captures: ReportCapture[]
}

type ReportObserver = {
  userId: string
  anonymousId: string
  email: string
  /** « Déclarations » = points uniques validés + fausses alertes. */
  totalObservations: number
  validObservationsCount: number
  ghostPointsCount: number
  pointsDetectedCount: number
  precisionRate: number
}

type ReportModel = {
  /** Total « déclarations » = points uniques validés + fausses alertes. */
  totalObservations: number
  /** Points uniques validés : couples distincts (observateur, pointId) non fantômes. */
  validObservationsCount: number
  /** Fausses alertes (événements). */
  ghostPointsCount: number
  /** Part des fausses alertes dans les « déclarations » (0-100). */
  ghostRate: number
  totalObservers: number
  overallConcordanceRate: number
  overallPrecisionRate: number
  averageDetectionDelay: number | null
  points: ReportPoint[]
  observers: ReportObserver[]
  ghostCaptures: ReportCapture[]
}

/** Reconstruit les indicateurs du rapport exécutif depuis les lignes vérifiées. */
function buildReportModel(rows: GlobalExportRow[], points: ReportPointInput[]): ReportModel {
  const observerMap = new Map<string, { userId: string; anonymousId: string; email: string }>()
  for (const row of rows) {
    if (!observerMap.has(row.userId)) {
      observerMap.set(row.userId, {
        userId: row.userId,
        anonymousId: row.anonymousId,
        email: row.email ?? '',
      })
    }
  }
  const totalObservers = observerMap.size

  // ——— Règle produit « détection analytique » (observateur × type × trame) ———
  const validPointKeys = new Set<string>()
  for (const row of rows) {
    if (row.isGhostPoint) continue
    if (!row.pointId) continue
    validPointKeys.add(`${row.userId}|${row.observationType?.trim() || ''}|${row.pointId}`)
  }
  const validObservationsCount = validPointKeys.size
  const ghostPointsCount = rows.filter((row) => row.isGhostPoint).length
  const totalObservations = validObservationsCount + ghostPointsCount

  const reportPoints: ReportPoint[] = points.map((point) => {
    const matching = rows.filter((row) => row.pointId === point.id)
    const distinctObserversOnPoint = new Set(matching.map((row) => row.userId)).size
    const concordanceRate =
      totalObservers > 0 ? Math.round((distinctObserversOnPoint / totalObservers) * 100) : 0

    const delays = matching.map((row) => Math.max(0, row.timestampTotal - point.trameDebut))
    const avgDelaySeconds =
      delays.length > 0
        ? Math.round((delays.reduce((acc, d) => acc + d, 0) / delays.length) * 10) / 10
        : null

    const captures: ReportCapture[] = matching.map((row) => ({
      timestampTotal: row.timestampTotal,
      delaySeconds: row.timestampTotal - point.trameDebut,
      observerAnonymousId: row.anonymousId,
      observerEmail: row.email,
      createdAt: row.createdAt,
    }))

    return {
      pointId: point.id,
      pointName: point.pointName,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
      targetDuration: point.trameFin - point.trameDebut,
      observerCount: distinctObserversOnPoint,
      concordanceRate,
      avgDelaySeconds,
      captures,
    }
  })

  const overallConcordanceRate =
    reportPoints.length > 0
      ? Math.round(
          reportPoints.reduce((acc, point) => acc + point.concordanceRate, 0) /
            reportPoints.length,
        )
      : 0
  const overallPrecisionRate =
    totalObservations > 0 ? Math.round((validObservationsCount / totalObservations) * 100) : 0
  const ghostRate =
    totalObservations > 0 ? Math.round((ghostPointsCount / totalObservations) * 100) : 0

  // Délai moyen PAR ÉVÉNEMENT (chaque capture validée), pas par point unique.
  const allDelays = reportPoints.flatMap((point) =>
    point.captures.map((capture) => capture.delaySeconds),
  )
  const averageDetectionDelay =
    allDelays.length > 0
      ? Math.round((allDelays.reduce((acc, d) => acc + d, 0) / allDelays.length) * 10) / 10
      : null

  const ghostCaptures: ReportCapture[] = rows
    .filter((row) => row.isGhostPoint)
    .map((row) => ({
      timestampTotal: row.timestampTotal,
      delaySeconds: 0,
      observerAnonymousId: row.anonymousId,
      observerEmail: row.email,
      createdAt: row.createdAt,
    }))

  const observers: ReportObserver[] = Array.from(observerMap.values())
    .map((observer) => {
      const userRows = rows.filter((row) => row.userId === observer.userId)
      const uniquePointKeys = new Set<string>()
      for (const row of userRows) {
        if (row.isGhostPoint) continue
        if (row.pointId) {
          uniquePointKeys.add(`${row.userId}|${row.observationType?.trim() || ''}|${row.pointId}`)
        }
      }
      const uniquePointsDetected = uniquePointKeys.size
      const ghostEvents = userRows.filter((row) => row.isGhostPoint).length
      const totalDeclarations = uniquePointsDetected + ghostEvents
      return {
        userId: observer.userId,
        anonymousId: observer.anonymousId,
        email: observer.email,
        totalObservations: totalDeclarations,
        validObservationsCount: uniquePointsDetected,
        ghostPointsCount: ghostEvents,
        pointsDetectedCount: uniquePointsDetected,
        precisionRate:
          totalDeclarations > 0 ? Math.round((uniquePointsDetected / totalDeclarations) * 100) : 0,
      }
    })
    .sort((a, b) => b.totalObservations - a.totalObservations)

  return {
    totalObservations,
    validObservationsCount,
    ghostPointsCount,
    ghostRate,
    totalObservers,
    overallConcordanceRate,
    overallPrecisionRate,
    averageDetectionDelay,
    points: reportPoints,
    observers,
    ghostCaptures,
  }
}

// ——— Formatage lisible (mm:ss / dates) ———

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDateFr(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatDateTimeFr(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${formatDateFr(iso)} à ${date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** Probabilité empirique lisible (« 42 % ») ou « — » quand non calculable. */
function formatProbabilityValue(probability: number | null): string {
  if (probability === null) return '—'
  return `${Math.round(probability * 100)} %`
}

// ——— Palette & utilitaires de couleurs PDF ———

function hexRgb(hex: string): ReturnType<typeof rgb> {
  const cleaned = hex.replace('#', '')
  const value = Number.parseInt(cleaned, 16)
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

const COLOR_INK = hexRgb('#121417')
const COLOR_GOLD = hexRgb('#9C711B')
const COLOR_SLATE = hexRgb('#4A4E57')
const COLOR_MUTED = hexRgb('#6B6255')
const COLOR_LIGHT = hexRgb('#E5E0D8')

/** Nom du rapport : `ONA_Field_Rapport_<Projet>_<Date>.pdf` (caractères assainis). */
function reportFileName(projectTitle: string): string {
  const dateToken = new Date().toISOString().slice(0, 10)
  return `${brandFileName(`Rapport_${sanitizeBaseName(projectTitle)}_${dateToken}`)}.pdf`
}

/**
 * « Rapport Scientifique PDF » — génère un VRAI fichier .pdf (pdf-lib) qui se
 * télécharge (jamais la boîte de dialogue d'impression du navigateur).
 *
 * Architecture : le client rasterise les SVG STATIQUES du rapport (ReportCharts.tsx)
 * en PNG haute résolution et les POSTe ici. La route s'autorise elle-même (session +
 * accès de gestion), RECALCULE tous les nombres depuis la base (observations
 * isVerified=true uniquement) via des fonctions pures partageant la sémantique du
 * moteur d'analyse, valide chaque image (PNG réel, taille bornée, dimensions
 * décodées), puis assemble le PDF : en-tête institutionnel, métadonnées projet,
 * indicateurs clés, graphiques embarqués, tableaux par fenêtre et bilan
 * observateurs, bloc signature. Aucun chiffre client n'est utilisé.
 */
export async function POST(request: Request, ctx: ExportContext): Promise<NextResponse> {
  const session = await getCurrentSession()
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  const { projectId } = await ctx.params

  // ——— Corps JSON (uniquement les images de graphiques, jamais de chiffres) ———
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 })
  }
  const chartsRaw = (payload as { charts?: unknown }).charts
  const chartInput = Array.isArray(chartsRaw) ? chartsRaw : []

  // ——— Autorisation (même garde que les routes d'export existantes) ———
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      description: true,
      videoUrl: true,
      observationTypes: true,
      createdAt: true,
      points: {
        orderBy: { trameDebut: 'asc' },
        select: {
          id: true,
          pointName: true,
          trameDebut: true,
          trameFin: true,
          video: { select: { id: true, name: true, typeLabel: true, orderIndex: true } },
        },
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 })
  }

  const level = await getCurrentProjectAccess(projectId)
  if (!canManage(level)) {
    return NextResponse.json(
      { error: 'Accès de gestion requis sur ce projet.' },
      { status: 403 },
    )
  }

  // ——— Recalcul SERVEUR des observations (isVerified=true uniquement) ———
  const observations = await prisma.observation.findMany({
    where: { projectId, isVerified: true },
    include: {
      user: { select: { username: true, email: true, anonymousId: true } },
      point: { select: { id: true, pointName: true } },
      video: { select: { id: true, name: true, typeLabel: true, orderIndex: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const points: GlobalExportPoint[] = project.points.map((point) => ({
    id: point.id,
    label: point.pointName,
    trameDebut: point.trameDebut,
    trameFin: point.trameFin,
    videoName: point.video ? videoDisplayName(point.video) : null,
    type: point.video?.typeLabel?.trim() ?? '',
  }))

  const rows: GlobalExportRow[] = observations.map((observation) => ({
    userId: observation.userId,
    username: observation.user?.username ?? null,
    email: observation.user?.email ?? null,
    anonymousId: observation.user?.anonymousId ?? '—',
    timestampTotal: observation.timestampTotal,
    observationType: observation.observationType,
    isGhostPoint: observation.isGhostPoint,
    pointId: observation.pointId,
    pointLabel: observation.point?.pointName ?? null,
    imageUrl: observation.imageUrl,
    driveFileId: observation.driveFileId,
    videoName: observation.video ? videoDisplayName(observation.video) : null,
    createdAt: observation.createdAt.toISOString(),
  }))

  const source: GlobalExportSource = {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      videoUrl: project.videoUrl,
      observationTypes: project.observationTypes,
      createdAt: project.createdAt.toISOString(),
      definedPoints: points.length,
      points,
      definedPointsByType: computeDefinedPointsByType(points),
    },
    rows,
  }

  const report = buildReportModel(
    rows,
    points.map((point) => ({
      id: point.id,
      pointName: point.label,
      trameDebut: point.trameDebut,
      trameFin: point.trameFin,
    })),
  )
  // Probabilités empiriques de détection par type/décalage (règle analytique).
  const probabilityTable = buildDetectionProbabilityTable(source)
  // Accord inter-observateurs (Jaccard) — note méthodologique du rapport.
  const agreement = buildProjectSummary(source).agreement
  const agreementLabel =
    agreement.rate !== null
      ? `Accord inter-observateurs (similarité de Jaccard) : ${Math.round(agreement.rate * 100)}% · ${agreement.pairs} paire${agreement.pairs > 1 ? 's' : ''} comparée${agreement.pairs > 1 ? 's' : ''}.`
      : 'Accord inter-observateurs (Jaccard) : non calculable (moins de deux observateurs actifs).'

  // ——— Validation STRICTE des PNG fournis par le client (graphiques visibles) ———
  const validatedPngs: Array<{ id: ReportChartId; buffer: Buffer }> = []
  const seen = new Set<ReportChartId>()
  for (const item of chartInput) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : ''
    const dataUrl = typeof record.dataUrl === 'string' ? record.dataUrl : ''
    if (!REPORT_CHART_IDS.has(id) || seen.has(id as ReportChartId)) continue
    if (!dataUrl.startsWith(PNG_PREFIX)) continue
    const base64 = dataUrl.slice(PNG_PREFIX.length)
    let buffer: Buffer
    try {
      buffer = Buffer.from(base64, 'base64')
    } catch {
      continue
    }
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_PNG_BYTES) continue
    if (!pngInfo(buffer)) continue
    seen.add(id as ReportChartId)
    validatedPngs.push({ id: id as ReportChartId, buffer })
  }

  // ——— Assemblage du PDF ———
  const pdfDoc = await PDFDocument.create()
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const PAGE_WIDTH = 595.28
  const PAGE_HEIGHT = 841.89
  const MARGIN_X = 40
  const MARGIN_TOP = 44
  const MARGIN_BOTTOM = 40
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let currentY = PAGE_HEIGHT - MARGIN_TOP

  const newPage = (): void => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    currentY = PAGE_HEIGHT - MARGIN_TOP
  }
  const ensureSpace = (space: number): void => {
    if (currentY - space < MARGIN_BOTTOM) newPage()
  }

  const wrap = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
    if (!text) return ['']
    const words = text.split(/\s+/)
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
      } else {
        if (line) lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    return lines.length > 0 ? lines : ['']
  }

  type TextOptions = {
    size?: number
    bold?: boolean
    color?: ReturnType<typeof rgb>
    x?: number
    maxWidth?: number
    align?: 'left' | 'right' | 'center'
    lineHeight?: number
    font?: PDFFont
  }

  const drawTextLine = (text: string, options: TextOptions = {}): void => {
    const size = options.size ?? 10
    const font = options.font ?? (options.bold ? boldFont : regularFont)
    const color = options.color ?? COLOR_INK
    const x = options.x ?? MARGIN_X
    const maxWidth = options.maxWidth ?? CONTENT_WIDTH
    const align = options.align ?? 'left'
    const lh = options.lineHeight ?? Math.round(size * 1.4)
    const lines = wrap(text, font, size, maxWidth)
    for (const line of lines) {
      ensureSpace(lh)
      let lineX = x
      if (align === 'right' || align === 'center') {
        const lineWidth = font.widthOfTextAtSize(line, size)
        if (align === 'right') lineX = x + maxWidth - lineWidth
        else lineX = x + (maxWidth - lineWidth) / 2
      }
      page.drawText(line, {
        x: lineX,
        y: currentY - size * 0.8,
        size,
        font,
        color,
      })
      currentY -= lh
    }
  }

  const gap = (amount: number): void => {
    ensureSpace(amount)
    currentY -= amount
  }

  const drawHLine = (
    color: ReturnType<typeof rgb> = COLOR_LIGHT,
    thickness = 0.8,
    insetX = 0,
  ): void => {
    ensureSpace(6)
    currentY -= 3
    page.drawLine({
      start: { x: MARGIN_X + insetX, y: currentY },
      end: { x: MARGIN_X + CONTENT_WIDTH - insetX, y: currentY },
      thickness,
      color,
    })
    currentY -= 3
  }

  const sectionTitle = (title: string, number: string): void => {
    ensureSpace(30)
    currentY -= 12
    page.drawRectangle({
      x: MARGIN_X,
      y: currentY,
      width: 3.2,
      height: 14,
      color: COLOR_GOLD,
    })
    drawTextLine(`${number}. ${title}`, {
      size: 12,
      bold: true,
      color: COLOR_INK,
      x: MARGIN_X + 10,
      lineHeight: 17,
    })
    gap(2)
    drawHLine(COLOR_LIGHT, 0.8)
    gap(6)
  }

  /** Ligne « métadonnée » : libellé (gras) puis valeur, alignés sur la même ligne. */
  const drawMetaRow = (label: string, value: string): void => {
    const labelWidth = 140
    const valueMaxWidth = CONTENT_WIDTH - labelWidth - 6
    const lh = 13
    const labelLines = wrap(label, boldFont, 8.5, labelWidth)
    const valueLines = wrap(value, regularFont, 9, valueMaxWidth)
    const lineCount = Math.max(labelLines.length, valueLines.length)
    ensureSpace(lineCount * lh + 4)
    const rowTop = currentY
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const labelLine = labelLines[lineIndex] ?? ''
      const valueLine = valueLines[lineIndex] ?? ''
      if (labelLine) {
        page.drawText(labelLine, {
          x: MARGIN_X,
          y: rowTop - lineIndex * lh - 6.8,
          size: 8.5,
          font: boldFont,
          color: COLOR_MUTED,
        })
      }
      if (valueLine) {
        page.drawText(valueLine, {
          x: MARGIN_X + labelWidth + 6,
          y: rowTop - lineIndex * lh - 7.2,
          size: 9,
          font: regularFont,
          color: COLOR_INK,
        })
      }
    }
    currentY -= lineCount * lh + 4
  }

  // ——— En-tête institutionnel ———
  drawTextLine('ONA FIELD · PROCÉDURE D’OBSERVATION INDÉPENDANTE', {
    size: 9,
    bold: true,
    color: COLOR_GOLD,
  })
  drawTextLine('Rapport Exécutif de Concordance', {
    size: 21,
    bold: true,
    color: COLOR_INK,
    lineHeight: 26,
  })
  const author = session.username?.trim() || session.email || 'Non renseigné'
  const reference = `Réf. Étude : VA-${project.id.slice(0, 8).toUpperCase()} · Rédigé par ${author} · Généré le ${formatDateTimeFr(new Date().toISOString())}`
  drawTextLine(reference, { size: 8.5, color: COLOR_MUTED, lineHeight: 12 })
  gap(4)
  drawTextLine('CONFIDENTIEL', {
    size: 8,
    bold: true,
    color: COLOR_GOLD,
    align: 'right',
    lineHeight: 10,
  })
  drawHLine(hexRgb('#C9A24B'), 1.4)
  gap(10)

  // ——— Métadonnées projet ———
  const metadataCells: Array<[string, string]> = [
    ['Projet analysé', project.title],
    ['Vidéo source', project.videoUrl || 'Non spécifiée'],
    ['Cibles scientifiques', `${project.points.length} point(s)`],
    ['Étude créée le', formatDateFr(project.createdAt.toISOString()) || '—'],
  ]
  for (const [label, value] of metadataCells) drawMetaRow(label, value)
  drawHLine(COLOR_LIGHT, 0.8)
  gap(8)

  // ——— 1. Synthèse des indicateurs ———
  sectionTitle('Synthèse des Résultats d’Observation', '1')

  const statRows: Array<Array<[string, string, string]>> = [
    [
      ['Concordance inter-observateurs', `${report.overallConcordanceRate}%`, 'Cohérence entre observateurs'],
      ['Précision de détection', `${report.overallPrecisionRate}%`, `${report.validObservationsCount} / ${report.totalObservations} captures valides`],
      ['Captures totales', String(report.totalObservations), 'Observations enregistrées'],
      ['Observateurs actifs', String(report.totalObservers), 'Participant(s) au protocole'],
    ],
    [
      ['Fausses alertes (fantômes)', String(report.ghostPointsCount), `Taux d’erreur ${report.ghostRate}%`],
      ['Délai moyen de réaction', report.averageDetectionDelay !== null ? `+${report.averageDetectionDelay}s` : '—', 'Latence moyenne de saisie'],
      ['Durée de la vidéo', 'N/A', 'Non enregistrée en base'],
      ['Identification de l’espèce', 'N/A', 'Non saisie lors des captures'],
    ],
  ]

  const statLabelSize = 7.2
  const statLineHeight = 9.5
  const colCount = 4
  const statPad = 6
  const statCellWidth = CONTENT_WIDTH / colCount
  const statCellHeight = statLineHeight * 3 + statPad * 2 + 4

  for (const rowCells of statRows) {
    ensureSpace(statCellHeight + 6)
    const rowTop = currentY
    for (let col = 0; col < colCount; col += 1) {
      const cellX = MARGIN_X + col * statCellWidth
      page.drawRectangle({
        x: cellX,
        y: rowTop - statCellHeight,
        width: statCellWidth,
        height: statCellHeight,
        borderColor: COLOR_LIGHT,
        borderWidth: 0.6,
      })
    }
    rowCells.forEach(([label, value, caption], col) => {
      if (col >= colCount) return
      const cellX = MARGIN_X + col * statCellWidth + 7
      const baselineLabel = rowTop - statPad - statLabelSize * 0.8
      page.drawText(label, {
        x: cellX,
        y: baselineLabel,
        size: statLabelSize,
        font: boldFont,
        color: COLOR_MUTED,
      })
      page.drawText(value, {
        x: cellX,
        y: baselineLabel - statLineHeight,
        size: 13,
        font: boldFont,
        color: COLOR_GOLD,
      })
      page.drawText(caption, {
        x: cellX,
        y: baselineLabel - statLineHeight * 2 - 2,
        size: 6.4,
        font: regularFont,
        color: COLOR_MUTED,
      })
    })
    currentY -= statCellHeight + 6
  }
  gap(4)
  drawTextLine(`Note méthodologique — ${agreementLabel}`, {
    size: 7,
    color: COLOR_MUTED,
    lineHeight: 9,
  })
  gap(6)

  // ——— 2. Distribution des détections (graphiques rasterisés) ———
  sectionTitle('Distribution des Détections', '2')
  if (report.totalObservations === 0 && validatedPngs.length === 0) {
    drawTextLine('Aucune observation n’a encore été enregistrée pour ce projet.', {
      size: 10,
      color: COLOR_MUTED,
    })
    gap(6)
  }

  // Intègre les PNG réellement validés (jamais d'image vide ni de placeholder).
  const embeddedCharts: Array<{ id: ReportChartId; image: PDFImage }> = []
  for (const png of validatedPngs) {
    try {
      const image = await pdfDoc.embedPng(png.buffer)
      embeddedCharts.push({ id: png.id, image })
    } catch {
      // Image illisible à l'incorporation → PDF généré sans elle.
    }
  }

  for (const chart of embeddedCharts) {
    const maxWidth = Math.min(CONTENT_WIDTH, chart.id === 'ventilation' ? 260 : CONTENT_WIDTH)
    const fit = chart.image.scaleToFit(maxWidth, 340)
    ensureSpace(fit.height + 22)
    const x = MARGIN_X + (CONTENT_WIDTH - fit.width) / 2
    page.drawImage(chart.image, {
      x,
      y: currentY - fit.height,
      width: fit.width,
      height: fit.height,
    })
    currentY -= fit.height + 8
    drawTextLine(
      chart.id === 'ventilation'
        ? 'Observations validées vs fantômes'
        : 'Détections dans le temps — captures validées et points fantômes',
      { size: 8, color: COLOR_MUTED, align: 'center' },
    )
    gap(8)
  }

  // ——— 3. Évaluation des points cibles ———
  sectionTitle('Évaluation des Points Cibles', '3')

  type TableColumn = { header: string; width: number }
  const drawTable = (
    columns: TableColumn[],
    rowsData: string[][],
    options: { fontSize?: number } = {},
  ): void => {
    const fontSize = options.fontSize ?? 8
    const headers = columns.map((column) => column.header)
    const lineHeight = Math.round(fontSize * 1.35)
    const padY = 3

    const wrapCell = (text: string, width: number, font: PDFFont): string[] =>
      wrap(text, font, fontSize, Math.max(12, width - 6))
    const cellLines = (cells: string[], fonts: PDFFont[]): number =>
      Math.max(
        1,
        ...cells.map((cell, i) =>
          wrapCell(cell, columns[i]?.width ?? 40, fonts[i] ?? regularFont).length,
        ),
      )
    const rowHeight = (lineCount: number): number => lineCount * lineHeight + padY * 2

    const columnX = (index: number): number =>
      MARGIN_X + columns.slice(0, index).reduce((acc, column) => acc + column.width, 0)

    const drawRow = (
      cells: string[],
      fonts: PDFFont[],
      colors: Array<ReturnType<typeof rgb>>,
      blockHeight: number,
    ): void => {
      const lineCount = cellLines(cells, fonts)
      const rowTop = currentY
      for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        const baseline = rowTop - padY - fontSize * 0.8 - lineIndex * lineHeight
        for (let col = 0; col < cells.length; col += 1) {
          const width = columns[col]?.width ?? 40
          const text = wrapCell(cells[col] ?? '', width, fonts[col] ?? regularFont)[lineIndex]
          if (text === undefined) continue
          page.drawText(text, {
            x: columnX(col) + 3,
            y: baseline,
            size: fontSize,
            font: fonts[col] ?? regularFont,
            color: colors[col] ?? COLOR_INK,
            maxWidth: width - 6,
          })
        }
      }
      currentY -= blockHeight
    }

    // Ligne d'en-tête (gras).
    const headerFonts = columns.map(() => boldFont)
    const headerColors = columns.map(() => COLOR_SLATE)
    ensureSpace(rowHeight(cellLines(headers, headerFonts)) + 4)
    drawHLine(COLOR_GOLD, 1.1)
    gap(1)
    const headerBlock = rowHeight(cellLines(headers, headerFonts))
    drawRow(headers, headerFonts, headerColors, headerBlock)
    drawHLine(COLOR_LIGHT, 0.6)
    gap(1)

    for (const dataRow of rowsData) {
      const cells = columns.map((_, i) => dataRow[i] ?? '')
      const fonts = columns.map(() => regularFont)
      const colors = columns.map(() => COLOR_INK)
      const blockHeight = rowHeight(cellLines(cells, fonts))
      ensureSpace(blockHeight)
      drawRow(cells, fonts, colors, blockHeight)
      drawHLine(COLOR_LIGHT, 0.4)
      gap(1)
    }
    gap(4)
  }

  const windowColumns: TableColumn[] = [
    { header: 'Cible', width: 96 },
    { header: 'Fenêtre Temporelle', width: 96 },
    { header: 'Durée', width: 40 },
    { header: 'Observateurs', width: 70 },
    { header: 'Concordance', width: 64 },
    { header: 'Délai Moyen', width: 64 },
  ]

  if (report.points.length === 0) {
    drawTextLine('Aucune fenêtre cible définie.', { size: 9, color: COLOR_MUTED })
    gap(6)
  } else {
    const windowRows = report.points.map((point) => [
      point.pointName,
      `${formatSeconds(point.trameDebut)} – ${formatSeconds(point.trameFin)}`,
      `${point.targetDuration}s`,
      `${point.observerCount} / ${report.totalObservers}`,
      `${point.concordanceRate}%`,
      point.avgDelaySeconds !== null ? `+${point.avgDelaySeconds}s` : '—',
    ])
    drawTable(windowColumns, windowRows, { fontSize: 8 })
  }

  // ——— Probabilités de détection par type/décalage (mêmes nombres analytiques) ———
  drawTextLine('Probabilités de Détection par Type/Décalage', {
    size: 9.5,
    bold: true,
    color: COLOR_INK,
  })
  gap(3)
  if (probabilityTable.length === 0) {
    drawTextLine('Aucun type/décalage configuré ni observé.', {
      size: 9,
      color: COLOR_MUTED,
    })
    gap(6)
  } else {
    const probabilityColumns: TableColumn[] = [
      { header: 'Type / Décalage', width: 120 },
      { header: 'Points', width: 48 },
      { header: 'Observations possibles', width: 100 },
      { header: 'Détections', width: 62 },
      { header: 'Probabilité', width: 84 },
      { header: 'Interprétation', width: 101 },
    ]
    const probabilityRows = probabilityTable.map((entry) => [
      entry.label,
      String(entry.pointCount),
      String(entry.possibleObservations),
      String(entry.detections),
      formatProbabilityValue(entry.probability),
      entry.interpretation,
    ])
    drawTable(probabilityColumns, probabilityRows, { fontSize: 7.6 })
  }
  drawTextLine(
    'Note — Les trames constituent l’unité d’observation : plusieurs captures d’un même observateur ' +
      'dans une même trame et sous le même type comptent pour une seule détection analytique. ' +
      'Probabilité empirique = détections / (points configurés × observateurs).',
    { size: 7, color: COLOR_MUTED, lineHeight: 9 },
  )
  gap(6)

  // ——— 4. Relevé détaillé groupé par fenêtre cible ———
  sectionTitle('Relevé des Observations par Fenêtre Cible', '4')
  if (report.totalObservations === 0) {
    drawTextLine('Aucune observation à lister.', { size: 9, color: COLOR_MUTED })
    gap(6)
  } else {
    const captureColumns: TableColumn[] = [
      { header: 'Horodatage', width: 74 },
      { header: 'Sec', width: 48 },
      { header: 'Observateur', width: 150 },
      { header: 'Délai', width: 52 },
      { header: 'Soumission', width: 126 },
    ]
    const ghostColumns: TableColumn[] = [
      { header: 'Horodatage', width: 74 },
      { header: 'Sec', width: 48 },
      { header: 'Observateur', width: 180 },
      { header: 'Soumission', width: 168 },
    ]
    const pointsWithCaptures = report.points.filter((point) => point.captures.length > 0)
    for (const point of pointsWithCaptures) {
      ensureSpace(20)
      drawTextLine(
        `${point.pointName} — ${formatSeconds(point.trameDebut)} – ${formatSeconds(point.trameFin)} · ${point.captures.length} capture${point.captures.length > 1 ? 's' : ''}`,
        { size: 9.5, bold: true, color: COLOR_INK },
      )
      gap(3)
      const rowsData = point.captures.map((capture) => [
        formatSeconds(capture.timestampTotal),
        String(capture.timestampTotal),
        capture.observerAnonymousId,
        `+${capture.delaySeconds}s`,
        formatDateTimeFr(capture.createdAt),
      ])
      drawTable(captureColumns, rowsData, { fontSize: 7.4 })
      gap(4)
    }

    if (report.ghostCaptures.length > 0) {
      drawTextLine('Points fantômes (hors trame)', {
        size: 9.5,
        bold: true,
        color: COLOR_SLATE,
      })
      gap(3)
      const ghostRows = report.ghostCaptures.map((capture) => [
        formatSeconds(capture.timestampTotal),
        String(capture.timestampTotal),
        capture.observerAnonymousId,
        formatDateTimeFr(capture.createdAt),
      ])
      drawTable(ghostColumns, ghostRows, { fontSize: 7.4 })
    }
  }

  // ——— 5. Bilan individuel des observateurs ———
  sectionTitle('Bilan Individuel des Observateurs', '5')
  const observerColumns: TableColumn[] = [
    { header: 'ID Anonyme Observateur', width: 130 },
    { header: 'Total Captures', width: 66 },
    { header: 'Cibles Détectées', width: 130 },
    { header: 'Points Fantômes', width: 66 },
    { header: 'Taux de Précision', width: 66 },
  ]
  if (report.observers.length === 0) {
    drawTextLine('Aucun observateur pour le moment.', { size: 9, color: COLOR_MUTED })
    gap(6)
  } else {
    const observerRows = report.observers.map((observer) => [
      observer.anonymousId,
      String(observer.totalObservations),
      `${observer.validObservationsCount} (${observer.pointsDetectedCount}/${project.points.length} cibles)`,
      String(observer.ghostPointsCount),
      `${observer.precisionRate}%`,
    ])
    drawTable(observerColumns, observerRows, { fontSize: 8 })
  }

  // ——— Signature & validation ———
  sectionTitle('Validation', '6')
  const signatureColWidth = CONTENT_WIDTH / 2
  ensureSpace(110)
  const blockTop = currentY
  drawTextLine('Responsable de l’Étude Scientifique :', {
    size: 9,
    bold: true,
    color: COLOR_INK,
    x: MARGIN_X,
    maxWidth: signatureColWidth,
  })
  drawTextLine(author, { size: 9, color: COLOR_SLATE, x: MARGIN_X, maxWidth: signatureColWidth })
  gap(22)
  drawTextLine('Nom & Signature : _________________________', {
    size: 8.5,
    color: COLOR_MUTED,
    x: MARGIN_X,
    maxWidth: signatureColWidth,
  })
  currentY = blockTop
  drawTextLine('Visa & Date :', {
    size: 9,
    bold: true,
    color: COLOR_INK,
    x: MARGIN_X + signatureColWidth,
    maxWidth: signatureColWidth,
  })
  drawTextLine(formatDateTimeFr(new Date().toISOString()), {
    size: 9,
    color: COLOR_SLATE,
    x: MARGIN_X + signatureColWidth,
    maxWidth: signatureColWidth,
  })
  gap(22)
  drawTextLine('Cachet du laboratoire : ___________________', {
    size: 8.5,
    color: COLOR_MUTED,
    x: MARGIN_X + signatureColWidth,
    maxWidth: signatureColWidth,
  })
  gap(20)
  drawHLine(COLOR_LIGHT, 0.8)
  gap(4)
  drawTextLine(
    'Rapport généré par le moteur analytique ONA Field · Conforme aux exigences de la procédure ' +
      'd’observation indépendante à validation scientifique croisée. Coordonnées spatiales (X/Y), ' +
      'espèce et durée vidéo non enregistrées par le protocole.',
    { size: 7.2, color: COLOR_MUTED, lineHeight: 9.5 },
  )

  // ——— Journal d'audit ———
  await recordAudit({
    userId: session.uid,
    action: AUDIT_ACTIONS.exportPdf,
    entityType: 'export',
    entityId: project.id,
    metadata: {
      title: project.title,
      totalDeclarations: report.totalObservations,
      charts: embeddedCharts.length,
      format: 'pdf',
    },
  })

  const pdfBytes = await pdfDoc.save()
  const filename = reportFileName(project.title)
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Content-Length': String(pdfBytes.byteLength),
  })
  // Buffer (Uint8Array<ArrayBuffer>) est requis par BodyInit sous la typage strict des
  // TypedArrays de TypeScript ; pdf-lib renvoie un Uint8Array<ArrayBufferLike>.
  return new NextResponse(Buffer.from(pdfBytes), { status: 200, headers })
}
