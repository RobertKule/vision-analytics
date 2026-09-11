import ExcelJS from 'exceljs'
import type {
  GlobalExportSource,
  LedgerObservation,
} from '@/lib/globalExportModel'
import {
  LEDGER_HEADERS,
  buildDetectionProbabilityTable,
  buildGlobalObservations,
  buildObserverSynthesisRows,
  buildPointDetailRows,
  buildProjectSummary,
  buildTypeSheetRows,
  clockLabel,
  countAnalyticDetections,
  detectionProbability,
  listDatasetObservers,
  typeGroupLabel,
  type DetectionProbabilityRow,
} from '@/lib/globalExportModel'
import type { AnalyticsVersionMetrics } from '@/lib/analyticsVersioning'

/**
 * « Export Global (Excel) » — classeur `.xlsx` généré CÔTÉ SERVEUR (ExcelJS
 * n'entre jamais dans un bundle client ; n'importer que depuis des route
 * handlers `app/api/**`). Tout est calculé sur le sous-ensemble filtré transmis.
 *
 * Nouvelle structure (règle de la détection analytique « observateur + type +
 * trame », probabilité P = Détections / (points configurés × observateurs)) :
 *
 *   Synthèse                analyse des probabilités de détection par type/décalage
 *                           + détail par point + synthèse par observateur
 *   Méthodologie            procédure d'analyse (double aveugle) numérotée 1..7
 *   <Type/décalage>         une feuille par type/décalage : matrice points × observateurs
 *   Données_Brutes_Globales relevé complet (chaque capture certifiée, sans déduplication)
 *
 * Mise en forme : en-têtes en gras, pourcentage 0,00 %, largeurs ajustées, et
 * barres de données (mini-graphiques natifs Excel) sur les colonnes de comptage.
 */

const INK = 'FF121417'
const GOLD_FILL = 'FFF6ECD3'
const GOLD_DEEP = 'FF9C711B'
const MILK = 'FFFFFFFF'
const SHEET_BAND = 'FFFAF7F1'

function darkText(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: INK } }
  cell.alignment = { vertical: 'middle' }
}

function valueText(cell: ExcelJS.Cell, wrap = false): void {
  cell.alignment = { vertical: 'top', wrapText: wrap }
}

function centerText(cell: ExcelJS.Cell): void {
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
}

/** Crée un en-tête de tableau avec la signature visuelle des exports du projet. */
function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: INK } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_FILL } }
  row.alignment = { vertical: 'middle', wrapText: true }
  row.height = 22
}

/** Applique gel de la première ligne + autofiltre sur la plage utile. */
function freezeAndFilter(worksheet: ExcelJS.Worksheet, lastColumn: number, rowCount: number): void {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  if (rowCount > 1) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(2, rowCount), column: lastColumn },
    }
  }
}

/**
 * Largeur lisible des colonnes du relevé brut (indexées par en-tête). Les URL et
 * identifiants Drive sont volontairement plus larges que la largeur générique.
 */
const LEDGER_COLUMN_WIDTHS: Record<string, number> = {
  'Minuterie (MM:SS)': 16,
  "Type d'observation": 22,
  'Point trouvé ?': 16,
  'Fenêtre cible': 24,
  'Trame vidéo': 26,
  Observateur: 24,
  Email: 26,
  'Identifiant anonyme': 20,
  'Coordonnées (X, Y)': 18,
  Statut: 26,
  'Image (URL)': 50,
  'Drive File ID': 26,
  'Lien image': 54,
  'Date de Capture': 22,
}

function ledgerWidth(header: string): number {
  return LEDGER_COLUMN_WIDTHS[header] ?? Math.max(header.length + 6, 18)
}

/**
 * Valeurs d'une ligne de relevé brut, indexées par en-tête — un SEUL endroit qui
 * mappe une `LedgerObservation` vers les colonnes partagées (Parties R & V : la
 * colonne « Lien image » dérive du `driveFileId`, vide si absente). Utilisé par
 * le relevé global ET le relevé individuel (mêmes en-têtes, même source).
 */
function ledgerRowValues(observation: LedgerObservation): Record<string, string | number> {
  return {
    [LEDGER_HEADERS[0]]: observation.timecode,
    [LEDGER_HEADERS[1]]: observation.observationType ?? '',
    [LEDGER_HEADERS[2]]: observation.pointFound,
    [LEDGER_HEADERS[3]]: observation.pointLabel ?? '',
    [LEDGER_HEADERS[4]]: observation.videoName,
    [LEDGER_HEADERS[5]]: observation.observerName,
    [LEDGER_HEADERS[6]]: observation.email ?? '',
    [LEDGER_HEADERS[7]]: observation.anonymousId,
    [LEDGER_HEADERS[8]]: '', // Coordonnées (X, Y) — non persistées
    [LEDGER_HEADERS[9]]: observation.status,
    [LEDGER_HEADERS[10]]: observation.imageUrl,
    [LEDGER_HEADERS[11]]: observation.driveFileId,
    [LEDGER_HEADERS[12]]: observation.imageLink,
    [LEDGER_HEADERS[13]]: observation.capturedAt,
  }
}

function addDataBars(
  worksheet: ExcelJS.Worksheet,
  range: string,
  argb = 'FFBD8F2E',
): void {
  worksheet.addConditionalFormatting({
    ref: range,
    // Les typages exceljs omettent `color` pour dataBar alors que le writer le lit.
    rules: [
      {
        type: 'dataBar',
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: { argb },
      },
    ] as unknown as ExcelJS.ConditionalFormattingRule[],
  })
}

function sectionTitle(sheet: ExcelJS.Worksheet, text: string): void {
  const row = sheet.addRow([text])
  row.getCell(1).font = { bold: true, color: { argb: GOLD_DEEP } }
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SHEET_BAND } }
  row.height = 18
}

/** Nom de feuille Excel valide : caractères interdits retirés, ≤ 31 caractères. */
function sanitizeSheetToken(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fallback
}

/** Rend un nom de feuille unique (base déjà tronquée à 31 ; suffixes « -n »). */
function uniqueSheetName(base: string, used: Set<string>): string {
  const root = base.slice(0, 31)
  let name = root
  let i = 2
  while (used.has(name)) {
    const suffix = `-${i}`
    name = `${root.slice(0, 31 - suffix.length)}${suffix}`
    i += 1
  }
  used.add(name)
  return name
}

/** Court identifiant de feuille (base lisible, sans les caractères interdits). */
function shortToken(value: string, fallback: string, max = 24): string {
  const cleaned = value.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return fallback
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

/** Plage horaire lisible d'une fenêtre (MM:SS – MM:SS). */
function trameRange(start: number, end: number): string {
  return `${clockLabel(start)} – ${clockLabel(end)}`
}

// ——— Feuille « Synthèse » ———

/** Écrit une métadonnée « libellé / valeur » (colonne A/B). */
function writeMetaPair(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: string,
  wrap = false,
): void {
  const row = sheet.addRow([label, value])
  darkText(row.getCell(1))
  valueText(row.getCell(2), wrap)
  if (wrap) row.height = 30
}

/**
 * Options communes aux classeurs : identification de la VERSION ANALYTIQUE
 * exportée. Le libellé est fourni par la source d'export (`exportSource.ts`) —
 * jamais recalculé ici : dashboard, Excel et PDF nomment la même version.
 */
export type WorkbookOptions = {
  /** Ex. « Analyse actuelle » ou « Version 2 (20/04/2026) ». */
  versionLabel?: string
  /**
   * Métriques du MOTEUR pour la vue résolue (`ResolvedAnalyticsView.metrics`).
   *
   * Le classeur ne recalcule alors plus les compteurs de tête : il reprend ceux du
   * moteur partagé — donc exactement ceux du tableau de bord, du PDF et du ZIP.
   * Indispensable pour une version historique : c'est l'instantané IMMUABLE qui fait
   * foi, jamais un recomptage sur la configuration ou les données du jour.
   */
  metrics?: AnalyticsVersionMetrics
}

/**
 * Tableau « probabilités de détection par type » du classeur.
 *
 * Le moteur le porte déjà (`metrics.perType`) : c'est alors LUI qui est utilisé, tel
 * quel. À défaut (appel sans vue résolue), on retombe sur la fonction PURE PARTAGÉE
 * appliquée à la même source — jamais sur une règle propre au classeur.
 */
function perTypeRowsOf(
  source: GlobalExportSource,
  options?: WorkbookOptions,
): DetectionProbabilityRow[] {
  return options?.metrics?.perType ?? buildDetectionProbabilityTable(source)
}

function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  source: GlobalExportSource,
  options?: WorkbookOptions,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Synthèse', {
    views: [{ state: 'frozen', ySplit: 0 }],
  })
  sheet.columns = [
    { width: 34 },
    { width: 70 },
    { width: 20 },
    { width: 22 },
    { width: 22 },
    { width: 20 },
  ]

  const { project } = source
  const summary = buildProjectSummary(source)
  // Compteurs de tête : ceux du MOTEUR quand la vue résolue les fournit (recours à la
  // fonction pure partagée sinon) — l'Excel global affiche donc littéralement les
  // mêmes nombres que le tableau de bord et le PDF.
  const counters = options?.metrics
  const detectionTable = perTypeRowsOf(source, options)
  const pointDetails = buildPointDetailRows(source)
  const observerSynth = buildObserverSynthesisRows(source)

  // ——— Bandeau titre ———
  const titleRow = sheet.addRow(['ANALYSE DES PROBABILITÉS DE DÉTECTION', ''])
  titleRow.getCell(1).font = { bold: true, size: 15, color: { argb: MILK } }
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  titleRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  titleRow.height = 28
  const subtitle = sheet.addRow([`ONA Field — ${project.title}`, ''])
  subtitle.getCell(1).font = { bold: true, size: 11, color: { argb: GOLD_DEEP } }
  subtitle.height = 18
  sheet.addRow([])

  // ——— Métadonnées projet ———
  writeMetaPair(sheet, 'Projet', project.title)
  // Version analytique exportée : identique à celle affichée par le tableau de bord.
  writeMetaPair(sheet, 'Version analytique', options?.versionLabel?.trim() || 'Analyse actuelle')
  writeMetaPair(sheet, 'Description', project.description?.trim() || '—', Boolean(project.description?.trim()))
  writeMetaPair(sheet, 'Vidéo cible', project.videoUrl?.trim() || '—', Boolean(project.videoUrl?.trim()))
  writeMetaPair(sheet, 'Créé le', new Date(project.createdAt).toLocaleString('fr-FR'))
  writeMetaPair(sheet, 'Points / trames configurés', String(project.definedPoints))
  writeMetaPair(
    sheet,
    'Types d’observation configurés',
    project.observationTypes.length > 0 ? project.observationTypes.join(', ') : 'Aucun (types libres)',
  )
  writeMetaPair(sheet, 'Observateurs distincts', String(counters?.observerCount ?? summary.observerCount))
  writeMetaPair(
    sheet,
    'Détections analytiques (total)',
    String(counters?.detections ?? summary.validatedCount),
  )
  writeMetaPair(sheet, 'Fausses alertes (fantômes)', String(counters?.ghostEvents ?? summary.ghostCount))
  writeMetaPair(sheet, 'Fenêtres cibles touchées', String(counters?.windowsHit ?? summary.windowsHit))
  const agreementLabel =
    summary.agreement.rate === null
      ? 'Non calculable (moins de deux observateurs actifs)'
      : `${Math.round(summary.agreement.rate * 100)}% (${summary.agreement.pairs} paire${summary.agreement.pairs > 1 ? 's' : ''})`
  writeMetaPair(sheet, 'Accord inter-observateurs (Jaccard)', agreementLabel)
  sheet.addRow([])

  // ——— Tableau principal : probabilités par type / décalage ———
  sectionTitle(sheet, 'TABLEAU DES PROBABILITÉS DE DÉTECTION PAR TYPE / DÉCALAGE')
  const headers = [
    'Décalage',
    'Nombre de points',
    'Observations possibles',
    'Détections',
    'Probabilité empirique',
    'Interprétation',
  ]
  const header = sheet.addRow(headers)
  styleHeaderRow(header)
  const mainTableStart = header.number + 1

  for (const entry of detectionTable) {
    const row = sheet.addRow([
      entry.label,
      entry.pointCount,
      entry.possibleObservations,
      entry.detections,
      entry.probability,
      entry.interpretation,
    ])
    row.getCell(2).alignment = { horizontal: 'center' }
    row.getCell(3).alignment = { horizontal: 'center' }
    row.getCell(4).alignment = { horizontal: 'center' }
    const prob = row.getCell(5)
    centerText(prob)
    if (entry.probability !== null) prob.numFmt = '0.00%'
    else prob.value = '—'
  }
  const mainTableEnd = sheet.rowCount
  if (mainTableEnd >= mainTableStart) {
    addDataBars(sheet, `D${mainTableStart}:D${mainTableEnd}`)
  }
  sheet.addRow([])

  // ——— Détail par point ———
  sectionTitle(sheet, 'DÉTAIL PAR POINT')
  const pointHeader = sheet.addRow([
    'Point',
    'Trame vidéo',
    'Vidéo',
    'Observateurs ayant détecté',
    'Détections',
  ])
  styleHeaderRow(pointHeader)
  for (const point of pointDetails) {
    sheet.addRow([
      point.label,
      trameRange(point.trameDebut, point.trameFin),
      point.videoName || '—',
      point.observersDetected,
      point.detections,
    ])
  }
  sheet.addRow([])

  // ——— Synthèse par observateur ———
  sectionTitle(sheet, 'SYNTHÈSE PAR OBSERVATEUR')
  const obsHeader = sheet.addRow([
    'Observateur',
    'Email',
    'Points uniques détectés',
    'Points possibles',
    'Taux de couverture',
  ])
  styleHeaderRow(obsHeader)
  const obsFirstData = obsHeader.number + 1
  for (const obs of observerSynth) {
    const row = sheet.addRow([
      obs.displayName,
      obs.email ?? '',
      obs.uniqueDetections,
      obs.pointsPossible,
      obs.rate,
    ])
    const rate = row.getCell(5)
    if (obs.rate !== null) rate.numFmt = '0.00%'
    else rate.value = '—'
  }
  const obsLastData = sheet.rowCount
  if (obsLastData >= obsFirstData) {
    addDataBars(sheet, `C${obsFirstData}:C${obsLastData}`)
  }
  sheet.addRow([])

  // ——— Note de protocole ———
  const footer = sheet.addRow([
    'Note de protocole',
    'Détection analytique : UNE par (observateur, type d’observation, trame). Le relevé brut ' +
      'conserve chaque capture certifiée. La géométrie de capture (coordonnées X/Y) n’est jamais ' +
      'enregistrée : les observateurs travaillent en aveugle sur leur propre copie de la vidéo.',
  ])
  footer.getCell(1).font = { bold: true, color: { argb: INK } }
  valueText(footer.getCell(2), true)
  footer.height = 50

  return sheet
}

// ——— Feuille « Méthodologie » ———

const METHODOLOGY_STEPS: ReadonlyArray<[string, string]> = [
  [
    '1. Copies vidéo indépendantes',
    'Chaque observateur travaille en aveugle sur SA propre copie de la vidéo, sans voir les ' +
      'annotations des autres ni les fenêtres de validation.',
  ],
  [
    '2. Fenêtres de validation masquées',
    'Les trames temporelles (début/fin) qui définissent les cibles scientifiques ne sont jamais ' +
      'communiquées à l’observateur pendant la session.',
  ],
  [
    '3. Capture & persistance immédiate',
    'À chaque détection, une capture annotée (image + horodatage + type d’observation) est ' +
      'enregistrée immédiatement, une par une.',
  ],
  [
    '4. Finalisation de la session',
    'La clôture (« finaliser ») certifie les observations de la session : seules les captures ' +
      'certifiées (`isVerified`) alimentent les statistiques et les exports.',
  ],
  [
    '5. Détection analytique (déduplication)',
    'Une détection analytique = UNE par (observateur + type d’observation + trame). Plusieurs ' +
      'captures du même observateur dans la même trame et sous le même type comptent pour une seule.',
  ],
  [
    '6. Probabilité de détection',
    'Pour chaque type/décalage : P = Détections analytiques / (points/trames configurés × ' +
      'observateurs distincts). Les bandes d’interprétation sont calées sur cette probabilité.',
  ],
  [
    '7. Données brutes intégrales',
    'Le relevé brut conserve TOUTES les captures certifiées, sans déduplication : c’est la donnée ' +
      'source de référence, distincte des compteurs analytiques.',
  ],
]

/** Feuille « Méthodologie » : procédure d'analyse numérotée + note mise en exergue. */
function writeMethodologySheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Méthodologie', {
    views: [{ state: 'frozen', ySplit: 0 }],
  })
  sheet.columns = [{ width: 46 }, { width: 120 }]

  const title = sheet.addRow(['PROCÉDURE D’ANALYSE', ''])
  title.getCell(1).font = { bold: true, size: 14, color: { argb: MILK } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  title.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  title.height = 26
  sheet.addRow([])

  for (const [step, detail] of METHODOLOGY_STEPS) {
    const row = sheet.addRow([step, detail])
    darkText(row.getCell(1))
    valueText(row.getCell(2), true)
    row.height = 42
  }
  sheet.addRow([])

  // Note verbatim mise en exergue (cellule surlignée).
  const note = sheet.addRow([
    'Règle de comptage',
    "Les trames constituent l'unité d'observation. Plusieurs captures d'un même observateur " +
      "dans une même trame constituent une seule détection analytique.",
  ])
  darkText(note.getCell(1))
  note.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_FILL } }
  note.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_FILL } }
  note.getCell(2).font = { bold: true, color: { argb: INK } }
  valueText(note.getCell(2), true)
  note.height = 45

  return sheet
}

// ——— Feuille « Données_Brutes_Globales » ———

/** Feuille du relevé brut global (chaque capture certifiée = une ligne). */
function writeLedgerSheet(
  workbook: ExcelJS.Workbook,
  ledger: LedgerObservation[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Données_Brutes_Globales')

  sheet.columns = LEDGER_HEADERS.map((header) => ({
    header,
    key: header,
    width: ledgerWidth(header),
  }))

  styleHeaderRow(sheet.getRow(1))

  ledger.forEach((observation) => {
    sheet.addRow(ledgerRowValues(observation))
  })

  freezeAndFilter(sheet, LEDGER_HEADERS.length, sheet.rowCount)
  return sheet
}

// ——— Feuilles par type / décalage ———

/**
 * Feuille « <Type/décalage> » : matrice points configurés du type × observateurs
 * (1 = l'observateur a ≥ 1 détection analytique sur le point), avec colonnes
 * « Détections » (points avec ≥ 1 observateur) et « Probabilité » par point.
 */
/** Jeton d'en-tête unique pour chaque observateur (nom seul si sans collision). */
function uniqueObserverHeaders(
  observers: ReadonlyArray<{ observerId: string; displayName: string }>,
): Array<{ token: string; observerId: string }> {
  const used = new Set<string>(['Point', 'Trame vidéo', 'Détections', 'Probabilité'])
  const tokens: Array<{ token: string; observerId: string }> = []
  const counts = new Map<string, number>()
  for (const observer of observers) {
    const base = observer.displayName || 'Observateur'
    const occurrence = (counts.get(base) ?? 0) + 1
    counts.set(base, occurrence)
    const candidate = occurrence === 1 ? base : `${base} (${occurrence})`
    const token = used.has(candidate) ? `${candidate} #${occurrence}` : candidate
    used.add(token)
    tokens.push({ token, observerId: observer.observerId })
  }
  return tokens
}

function writeTypeSheet(
  workbook: ExcelJS.Workbook,
  source: GlobalExportSource,
  typeKey: string,
  label: string,
  usedNames: Set<string>,
): ExcelJS.Worksheet | null {
  const observers = listDatasetObservers(source)
  const rowsData = buildTypeSheetRows(source, typeKey, observers)
  if (rowsData.length === 0) return null

  const name = uniqueSheetName(
    sanitizeSheetToken(shortToken(label, 'Type', 20), 'Type'),
    usedNames,
  )
  const sheet = workbook.addWorksheet(name)

  const observerColumns = uniqueObserverHeaders(observers)
  const headers = [
    'Point',
    'Trame vidéo',
    ...observerColumns.map((entry) => entry.token),
    'Détections',
    'Probabilité',
  ]
  sheet.columns = headers.map((header) => ({
    header,
    key: header,
    width: header === 'Point' || header === 'Trame vidéo' ? 24 : header === 'Probabilité' ? 12 : 14,
  }))
  styleHeaderRow(sheet.getRow(1))

  for (const point of rowsData) {
    const values: Record<string, string | number | null> = {
      Point: point.label,
      'Trame vidéo': point.videoName || trameRange(point.trameDebut, point.trameFin),
    }
    for (const entry of observerColumns) {
      values[entry.token] = point.detectionsByObserver[entry.observerId] ?? 0
    }
    values['Détections'] = point.detectorCount
    values['Probabilité'] = point.probability
    const row = sheet.addRow(values)
    row.getCell('Détections').alignment = { horizontal: 'center' }
    const prob = row.getCell('Probabilité')
    if (point.probability !== null) prob.numFmt = '0.00%'
    else prob.value = '—'
  }

  const lastRow = sheet.rowCount
  if (lastRow > 1) {
    const detectionCol = sheet.getColumn('Détections')
    if (detectionCol) {
      addDataBars(sheet, `${detectionCol.letter}2:${detectionCol.letter}${lastRow}`)
    }
  }
  freezeAndFilter(sheet, headers.length, sheet.rowCount)
  return sheet
}

/**
 * Construit le classeur `.xlsx` global du projet et renvoie son buffer.
 * Feuilles : Synthèse · Méthodologie · <une par type/décalage> · Données_Brutes_Globales.
 *
 * Les chiffres proviennent intégralement de la `source` transmise par
 * `exportSource.ts` : ce module ne choisit ni la version, ni le périmètre.
 */
export async function generateExcelWorkbook(
  source: GlobalExportSource,
  options?: WorkbookOptions,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ONA Field'
  workbook.created = new Date()

  const usedNames = new Set<string>(['Synthèse', 'Méthodologie', 'Données_Brutes_Globales'])

  writeSummarySheet(workbook, source, options)
  writeMethodologySheet(workbook)

  const table = perTypeRowsOf(source, options)
  // Une feuille par type/décalage ayant au moins un point configuré, ordre du tableau.
  for (const entry of table) {
    if (entry.pointCount <= 0) continue
    writeTypeSheet(workbook, source, entry.type, typeGroupLabel(entry.type), usedNames)
  }

  const ledger = buildGlobalObservations(source)
  writeLedgerSheet(workbook, ledger)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}

// ——— Classeur INDIVIDUEL d'un observateur ———

/**
 * Feuille « Synthèse » du classeur individuel : identité, points détectés uniques
 * (règle analytique), points possibles, probabilité, puis mini-tableau par type.
 */
function writeObserverSummarySheet(
  workbook: ExcelJS.Workbook,
  source: GlobalExportSource,
  observerLabel: string,
  options?: WorkbookOptions,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Synthèse', {
    views: [{ state: 'frozen', ySplit: 0 }],
  })
  sheet.columns = [{ width: 42 }, { width: 52 }, { width: 24 }, { width: 20 }]

  const { project, rows } = source
  const detections = countAnalyticDetections(rows)
  const pointsPossible = project.definedPoints
  const probability = detectionProbability(detections, pointsPossible, 1)

  const title = sheet.addRow([`Observateur — ${observerLabel}`, ''])
  title.getCell(1).font = { bold: true, size: 13, color: { argb: MILK } }
  title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  title.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  title.height = 24
  sheet.addRow([])
  writeMetaPair(sheet, 'Projet', project.title)
  // Même version analytique que le tableau de bord et l'Excel global.
  writeMetaPair(sheet, 'Version analytique', options?.versionLabel?.trim() || 'Analyse actuelle')
  writeMetaPair(sheet, 'Points / trames configurés', String(pointsPossible))
  sheet.addRow([])
  writeMetaPair(sheet, 'Points uniques détectés (analytique)', String(detections))
  writeMetaPair(sheet, 'Points possibles', String(pointsPossible))
  const probRow = sheet.addRow(['Probabilité de détection', probability])
  darkText(probRow.getCell(1))
  if (probability !== null) {
    probRow.getCell(2).numFmt = '0.00%'
  } else {
    probRow.getCell(2).value = '—'
  }
  sheet.addRow([])

  // Mini-tableau par type utilisé.
  const header = sheet.addRow(['Type / décalage', 'Points uniques détectés', 'Points possibles', 'Probabilité'])
  styleHeaderRow(header)
  const types = new Set<string>()
  for (const row of rows) {
    const trimmed = row.observationType?.trim()
    if (trimmed) types.add(trimmed)
  }
  for (const type of Array.from(types).sort((a, b) => a.localeCompare(b))) {
    const typeRows = rows.filter((row) => (row.observationType?.trim() || '') === type)
    const typeDetections = countAnalyticDetections(typeRows)
    const typePoints = project.definedPointsByType[type] ?? 0
    const typeProbability = detectionProbability(typeDetections, typePoints, 1)
    const row = sheet.addRow([type, typeDetections, typePoints, typeProbability])
    if (typeProbability !== null) row.getCell(4).numFmt = '0.00%'
    else row.getCell(4).value = '—'
  }
  // Types observés hors liste configurée (projet à types libres) : clé générique.
  const hasUntyped = rows.some((row) => !(row.observationType?.trim() || ''))
  if (hasUntyped) {
    const genericDetections = countAnalyticDetections(
      rows.filter((row) => !(row.observationType?.trim() || '')),
    )
    const genericPoints = project.definedPointsByType[''] ?? 0
    const genericProbability = detectionProbability(genericDetections, genericPoints, 1)
    const row = sheet.addRow([
      'Sans type (passe générique)',
      genericDetections,
      genericPoints,
      genericProbability,
    ])
    if (genericProbability !== null) row.getCell(4).numFmt = '0.00%'
    else row.getCell(4).value = '—'
  }
  sheet.addRow([])

  const note = sheet.addRow([
    'Règle de comptage',
    'Plusieurs captures d’une même trame comptent pour une seule détection analytique ' +
      '(une par observateur + type + trame).',
  ])
  note.getCell(1).font = { bold: true, color: { argb: INK } }
  valueText(note.getCell(2), true)
  note.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_FILL } }
  note.height = 42

  return sheet
}

/**
 * Feuille de détail par type du classeur individuel : conserve les captures
 * BRUTES, avec un rappel de la règle analytique en note.
 */
function writeObserverTypeDetailSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  typeLabel: string,
  ledger: LedgerObservation[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name)

  const headers = [
    'Minuterie (MM:SS)',
    'Point trouvé ?',
    'Fenêtre cible',
    'Trame vidéo',
    'Statut',
    'Image (URL)',
    'Drive File ID',
    'Lien image',
    'Date de Capture',
  ]
  sheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width: [18, 16, 24, 24, 26, 50, 26, 54, 24][index] ?? 20,
  }))
  styleHeaderRow(sheet.getRow(1))

  // Note de rappel de la règle analytique (ligne mise en évidence sous l'en-tête).
  const note = sheet.addRow([
    'Règle analytique : plusieurs captures d’une même trame comptent pour une seule détection analytique.',
  ])
  note.getCell(1).font = { italic: true, color: { argb: INK } }
  note.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_FILL } }
  note.height = 20

  const emptyRow = sheet.addRow([''])
  emptyRow.height = 2

  ledger.forEach((observation) => {
    sheet.addRow({
      [headers[0]]: observation.timecode,
      [headers[1]]: observation.pointFound,
      [headers[2]]: observation.pointLabel ?? '',
      [headers[3]]: observation.videoName,
      [headers[4]]: observation.status,
      [headers[5]]: observation.imageUrl,
      [headers[6]]: observation.driveFileId,
      [headers[7]]: observation.imageLink,
      [headers[8]]: observation.capturedAt,
    })
  })

  void typeLabel
  return sheet
}

/** En-têtes du relevé brut individuel (réutilise le relevé global, observateur unique). */
function writeObserverLedgerSheet(
  workbook: ExcelJS.Workbook,
  ledger: LedgerObservation[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Données_Brutes')
  sheet.columns = LEDGER_HEADERS.map((header) => ({
    header,
    key: header,
    width: ledgerWidth(header),
  }))
  styleHeaderRow(sheet.getRow(1))

  ledger.forEach((observation) => {
    sheet.addRow(ledgerRowValues(observation))
  })

  freezeAndFilter(sheet, LEDGER_HEADERS.length, sheet.rowCount)
  return sheet
}

/**
 * Construit le classeur `.xlsx` INDIVIDUEL d'un observateur (source = lignes
 * certifiées de cet observateur, projet = métadonnées complètes du projet).
 * Feuilles : Synthèse · <une par type utilisé> · Données_Brutes.
 */
export async function generateObserverWorkbook(
  source: GlobalExportSource,
  observerLabel: string,
  options?: WorkbookOptions,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ONA Field'
  workbook.created = new Date()

  const usedNames = new Set<string>(['Synthèse', 'Données_Brutes'])

  writeObserverSummarySheet(workbook, source, observerLabel, options)

  // Une feuille par type utilisé par l'observateur (détail des captures + note).
  const ledger = buildGlobalObservations(source)
  const types = new Set<string>()
  for (const row of source.rows) {
    const trimmed = row.observationType?.trim()
    types.add(trimmed || '')
  }
  for (const type of Array.from(types).sort((a, b) => a.localeCompare(b))) {
    const typeLedger = ledger.filter(
      (entry) => (entry.observationType?.trim() || '') === type,
    )
    const base = shortToken(type ? type : 'Sans type', 'Type', 18)
    const name = uniqueSheetName(sanitizeSheetToken(base, 'Type'), usedNames)
    writeObserverTypeDetailSheet(workbook, name, type, typeLedger)
  }

  writeObserverLedgerSheet(workbook, ledger)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}
