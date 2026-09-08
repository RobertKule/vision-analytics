import ExcelJS from 'exceljs'
import type {
  GlobalExportSource,
  LedgerObservation,
  ObserverMatrix,
  ProjectSummary,
} from '@/lib/globalExportModel'
import {
  LEDGER_HEADERS,
  buildGlobalObservations,
  buildObserverMatrix,
  buildProjectSummary,
} from '@/lib/globalExportModel'

/**
 * « Export Global (Excel) » — classeur `.xlsx` UNIQUE à 3 feuilles, généré CÔTÉ
 * SERVEUR (ExcelJS n'entre jamais dans un bundle client ; n'importer que depuis
 * des route handlers `app/api/**`).
 *
 *   Synthèse_Projet         métadonnées + indicateurs + accord inter-observateurs
 *   Matrice_Observateurs    observateurs × types (colonnes dynamiques)
 *   Données_Brutes_Globales relevé complet (colonnes réellement persistées)
 *
 * Mise en forme : en-têtes en gras, gel de la 1re ligne, autofiltre, pourcentage
 * 0,00 %, largeurs ajustées, et barres de données (mini-graphiques natifs Excel)
 * sur les compteurs pour visualiser la répartition par type.
 */

const INK = 'FF121417'
const GOLD_FILL = 'FFF6ECD3'
const GOLD_DEEP = 'FF9C711B'
const MILK = 'FFFFFFFF'
const CLAY_FILL = 'FFF3DED6'
const SHEET_BAND = 'FFFAF7F1'

function darkText(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, color: { argb: INK } }
  cell.alignment = { vertical: 'middle' }
}

function valueText(cell: ExcelJS.Cell, wrap = false): void {
  cell.alignment = { vertical: 'top', wrapText: wrap }
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

/** Feuille 1 : métadonnées + indicateurs + accord inter-observateurs + répartition par type. */
function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  summary: ProjectSummary,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Synthèse_Projet', {
    views: [{ state: 'frozen', ySplit: 0 }],
  })
  sheet.columns = [{ width: 34 }, { width: 110 }]

  const { project, agreement } = summary
  const push = (label: string, value: string, wrap = false) => {
    const row = sheet.addRow([label, value])
    darkText(row.getCell(1))
    valueText(row.getCell(2), wrap)
    if (wrap) row.height = 30
    return row
  }

  // ——— Bandeau titre ———
  const titleRow = sheet.addRow(['Vision Analytics — Export Global du Projet', ''])
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: MILK } }
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  titleRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  titleRow.height = 26
  sheet.addRow([])

  // ——— Métadonnées ———
  push('Projet', project.title)
  push('Description', project.description?.trim() || '—', Boolean(project.description?.trim()))
  push('Vidéo cible', project.videoUrl?.trim() || '—', Boolean(project.videoUrl?.trim()))
  push('Créé le', new Date(project.createdAt).toLocaleString('fr-FR'))
  push('Fenêtres de validation définies', String(project.definedPoints))
  push(
    'Types d’observation configurés',
    project.observationTypes.length > 0 ? project.observationTypes.join(', ') : 'Aucun (types libres)',
  )
  sheet.addRow([])

  // ——— Indicateurs ———
  const kpi: Array<[string, string, boolean]> = [
    ['Observateurs (ayant envoyé)', String(summary.observerCount), false],
    ['Observations envoyées', String(summary.totalObservations), false],
    ['   Dont validées (point trouvé)', String(summary.validatedCount), false],
    ['   Dont hors trame / fausses alertes', String(summary.ghostCount), false],
    ['   Sans type d’observation', String(summary.untypedCount), false],
    ['Fenêtres cibles touchées', String(summary.windowsHit), false],
    ['Première soumission', summary.firstSubmittedAt ? new Date(summary.firstSubmittedAt).toLocaleString('fr-FR') : '—', false],
    ['Dernière soumission', summary.lastSubmittedAt ? new Date(summary.lastSubmittedAt).toLocaleString('fr-FR') : '—', false],
  ]
  for (const [label, value] of kpi) push(label, value)
  sheet.addRow([])

  // ——— Accord inter-observateurs (métrique réelle) ———
  const sectionTitle = (text: string) => {
    const row = sheet.addRow([text, ''])
    row.getCell(1).font = { bold: true, color: { argb: GOLD_DEEP } }
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SHEET_BAND } }
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SHEET_BAND } }
    row.height = 18
  }

  sectionTitle('ACCORD INTER-OBSERVATEURS (métrique réelle)')
  const rateLabel = agreement.rate === null
    ? '—'
    : `${(agreement.rate * 100).toFixed(2).replace('.', ',')} %`
  const rateRow = push('Taux d’accord moyen', rateLabel)
  if (agreement.rate !== null) {
    rateRow.getCell(2).numFmt = '0.00%'
    rateRow.getCell(2).value = agreement.rate
  } else {
    rateRow.getCell(2).value = rateLabel
  }
  push('Paires d’observateurs comparées', String(agreement.pairs))
  push('Méthode', agreement.method, true)
  if (agreement.rate === null) {
    const note = push(
      'Note',
      agreement.pairs === 0 && agreement.comparable
        ? 'Fenêtres cibles définies mais aucune détection mappée commune : taux non calculable.'
        : 'Calcul possible uniquement avec au moins deux observateurs et des fenêtres cibles définies.',
      true,
    )
    note.getCell(2).font = { italic: true, color: { argb: INK } }
  }
  sheet.addRow([])

  // ——— Répartition par type (mini-graphique en barres de données) ———
  if (summary.perType.length > 0) {
    sectionTitle('RÉPARTITION PAR TYPE D’OBSERVATION')
    const header = sheet.addRow(['Type', 'Captures'])
    styleHeaderRow(header)
    const firstDataRow = header.number + 1
    summary.perType.forEach(({ type, count }, index) => {
      const row = sheet.addRow([type, count])
      row.getCell(2).alignment = { horizontal: 'center' }
      row.getCell(1).fill = index % 2 === 0
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: SHEET_BAND } }
    })
    const lastDataRow = sheet.rowCount
    if (lastDataRow >= firstDataRow) {
      addDataBars(sheet, `B${firstDataRow}:B${lastDataRow}`)
    }
    sheet.addRow([])
  }

  // ——— Note de protocole ———
  const footer = sheet.addRow([
    'Note de protocole',
    'La géométrie de capture (coordonnées X/Y, tracés) n’est jamais enregistrée : ' +
      'les observateurs travaillent en aveugle sur leur propre copie de la vidéo et seules ' +
      'les captures annotées (image + horodatage + type + statut de validation) sont stockées. ' +
      'Les colonnes « Coordonnées (X, Y) » sont volontairement vides.',
  ])
  footer.getCell(1).font = { bold: true, color: { argb: INK } }
  valueText(footer.getCell(2), true)
  footer.height = 60

  return sheet
}

/** Feuille 2 : matrice observateurs × types dynamiques. */
function writeObserverMatrixSheet(
  workbook: ExcelJS.Workbook,
  matrix: ObserverMatrix,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Matrice_Observateurs')

  const fixed = [
    'Observateur',
    'Email',
    'Identifiant anonyme',
  ]
  const tail = [
    'Total',
    'Point trouvé ?',
    'Hors trame',
    'Fenêtres touchées',
    'Précision',
  ]
  const columns = [
    ...fixed.map((header) => ({ header, key: header, width: 28 })),
    ...matrix.types.map((type) => ({ header: type, key: type, width: 16 })),
    ...tail.map((header) => ({ header, key: header, width: 15 })),
  ]
  sheet.columns = columns

  styleHeaderRow(sheet.getRow(1))

  matrix.observers.forEach((observer) => {
    const values: Record<string, string | number | null> = {
      Observateur: observer.displayName,
      Email: observer.email ?? '',
      'Identifiant anonyme': observer.anonymousId,
      ...Object.fromEntries(matrix.types.map((type) => [type, observer.perType[type] ?? 0])),
      Total: observer.total,
      'Point trouvé ?': observer.pointFound,
      'Hors trame': observer.ghosts,
      'Fenêtres touchées': observer.windowsHit,
      Précision: observer.precision,
    }
    const row = sheet.addRow(values)
    row.getCell('Précision').numFmt = '0.00%'
    const band = observer.precision !== null && observer.precision < 0.5
    if (band) {
      row.getCell('Précision').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLAY_FILL } }
    }
  })

  // Mini-graphiques en barres de données sur les colonnes « types ».
  const lastRow = sheet.rowCount
  if (lastRow > 1) {
    const colStart = fixed.length + 1
    const colEnd = fixed.length + matrix.types.length
    for (let col = colStart; col <= colEnd; col += 1) {
      addDataBars(sheet, `${sheet.getColumn(col).letter}2:${sheet.getColumn(col).letter}${lastRow}`)
    }
  }

  freezeAndFilter(sheet, columns.length, sheet.rowCount)
  return sheet
}

/** Feuille 3 : relevé global complet (colonnes réellement persistées). */
function writeLedgerSheet(
  workbook: ExcelJS.Workbook,
  ledger: LedgerObservation[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Données_Brutes_Globales')

  sheet.columns = LEDGER_HEADERS.map((header) => ({
    header,
    key: header,
    width: Math.max(header.length + 6, 18),
  }))

  styleHeaderRow(sheet.getRow(1))

  ledger.forEach((observation) => {
    sheet.addRow({
      [LEDGER_HEADERS[0]]: observation.timecode,
      [LEDGER_HEADERS[1]]: observation.observationType ?? '',
      [LEDGER_HEADERS[2]]: observation.pointFound,
      [LEDGER_HEADERS[3]]: observation.pointLabel ?? '',
      [LEDGER_HEADERS[4]]: observation.observerName,
      [LEDGER_HEADERS[5]]: observation.email ?? '',
      [LEDGER_HEADERS[6]]: observation.anonymousId,
      [LEDGER_HEADERS[7]]: '', // Coordonnées (X, Y) — non persistées
      [LEDGER_HEADERS[8]]: observation.status,
      [LEDGER_HEADERS[9]]: observation.imageUrl,
      [LEDGER_HEADERS[10]]: observation.capturedAt,
    })
  })

  freezeAndFilter(sheet, LEDGER_HEADERS.length, sheet.rowCount)
  return sheet
}

/**
 * Construit le classeur `.xlsx` global du projet (3 feuilles) et renvoie son buffer.
 */
export async function generateExcelWorkbook(source: GlobalExportSource): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Vision Analytics'
  workbook.created = new Date()

  const summary = buildProjectSummary(source)
  const matrix = buildObserverMatrix(source)
  const ledger = buildGlobalObservations(source)

  writeSummarySheet(workbook, summary)
  writeObserverMatrixSheet(workbook, matrix)
  writeLedgerSheet(workbook, ledger)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}
