import ExcelJS from 'exceljs'
import type {
  GlobalExportSource,
  LedgerObservation,
  ObserverMatrix,
  ProjectSummary,
  TypeStatistic,
} from '@/lib/globalExportModel'
import {
  LEDGER_HEADERS,
  buildGlobalObservations,
  buildObserverMatrix,
  buildProjectSummary,
  buildTypeStatistics,
} from '@/lib/globalExportModel'

/**
 * « Export Global (Excel) » — classeur `.xlsx` généré CÔTÉ SERVEUR (ExcelJS
 * n'entre jamais dans un bundle client ; n'importer que depuis des route
 * handlers `app/api/**`). Tout est calculé sur le sous-ensemble filtré transmis.
 *
 *   Synthèse_Projet          métadonnées + indicateurs + accord inter-observateurs
 *   Statistiques_par_type    compteurs par type (total · validées · hors trame · observateurs · fenêtres)
 *   Matrice_Observateurs     observateurs × types (colonnes dynamiques)
 *   Données_Brutes_Globales  relevé complet (colonnes réellement persistées)
 *   <Observateur>_Global     statistiques globales de l'observateur
 *   <Observateur>_<Type>     horodatages/statuts de ses captures pour ce type
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
  const titleRow = sheet.addRow(['ONA Field — Export Global du Projet', ''])
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

/** Feuille « Statistiques_par_type » : compteurs agrégés par type d'observation. */
function writeTypeStatisticsSheet(
  workbook: ExcelJS.Workbook,
  stats: TypeStatistic[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Statistiques_par_type')
  const headers = [
    'Type d’observation',
    'Total',
    'Validées (point trouvé)',
    'Hors trame',
    'Observateurs',
    'Fenêtres touchées',
    'Précision',
  ]
  sheet.columns = headers.map((header, index) => ({
    header,
    key: header,
    width:
      index === 0 ? 36 : index === headers.length - 1 ? 12 : Math.max(header.length + 2, 14),
  }))
  styleHeaderRow(sheet.getRow(1))

  stats.forEach((entry, index) => {
    const row = sheet.addRow({
      [headers[0]]: entry.type,
      [headers[1]]: entry.total,
      [headers[2]]: entry.validated,
      [headers[3]]: entry.ghosts,
      [headers[4]]: entry.observers,
      [headers[5]]: entry.windowsHit,
      [headers[6]]: entry.precision,
    })
    row.getCell(headers[6]).numFmt = '0.00%'
    if (index % 2 === 1) {
      for (let col = 1; col <= headers.length; col += 1) {
        row.getCell(col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SHEET_BAND },
        }
      }
    }
  })

  const lastRow = sheet.rowCount
  if (lastRow > 1) {
    addDataBars(sheet, `B2:B${lastRow}`)
  }
  freezeAndFilter(sheet, headers.length, sheet.rowCount)
  return sheet
}

/**
 * Feuille « <Observateur>_Global » : statistiques individuelles d'un observateur
 * (compteurs + précision) puis répartition par type en mini-tableau.
 */
function writeObserverGlobalSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  observer: ObserverMatrix['observers'][number],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 0 }] })
  sheet.columns = [{ width: 36 }, { width: 60 }]

  const push = (label: string, value: string, bold = false) => {
    const row = sheet.addRow([label, value])
    darkText(row.getCell(1))
    valueText(row.getCell(2))
    if (bold) row.getCell(2).font = { bold: true }
    return row
  }

  const titleRow = sheet.addRow(['Observateur — ' + (observer.displayName || '—'), ''])
  titleRow.getCell(1).font = { bold: true, size: 13, color: { argb: MILK } }
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  titleRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  titleRow.height = 24
  sheet.addRow([])

  const precision = observer.precision === null ? '—' : observer.precision
  push('Email', observer.email || '—')
  push('Identifiant anonyme', observer.anonymousId)
  sheet.addRow([])
  push('Observations envoyées', String(observer.total), true)
  push('Validées (point trouvé)', String(observer.pointFound))
  push('Hors trame (fausses alertes)', String(observer.ghosts))
  push('Fenêtres cibles touchées', String(observer.windowsHit))
  const precisionRow = push('Précision', precision === '—' ? '—' : '', true)
  if (observer.precision !== null) {
    precisionRow.getCell(2).numFmt = '0.00%'
    precisionRow.getCell(2).value = observer.precision
  } else {
    precisionRow.getCell(2).value = '—'
  }
  sheet.addRow([])

  const header = sheet.addRow(['Répartition par type', 'Captures'])
  styleHeaderRow(header)
  const firstDataRow = header.number + 1
  for (const [type, count] of Object.entries(observer.perType)) {
    if (count <= 0) continue
    const row = sheet.addRow([type, count])
    row.getCell(2).alignment = { horizontal: 'center' }
  }
  const lastDataRow = sheet.rowCount
  if (lastDataRow >= firstDataRow) {
    addDataBars(sheet, `B${firstDataRow}:B${lastDataRow}`)
  }
  return sheet
}

/** En-têtes du relevé par type d'un observateur (feuille de détail). */
const TYPE_LEDGER_HEADERS = [
  'Minuterie (MM:SS)',
  'Point trouvé ?',
  'Fenêtre cible',
  'Statut',
  'Image (URL)',
  'Date de Capture',
] as const

/** Feuille « <Observateur>_<Type> » : horodatages et statuts des captures d'un type. */
function writeObserverTypeSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: LedgerObservation[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name)
  const widths = [18, 16, 24, 26, 58, 24]
  sheet.columns = TYPE_LEDGER_HEADERS.map((header, index) => ({
    header,
    key: header,
    width: widths[index] ?? 20,
  }))
  styleHeaderRow(sheet.getRow(1))

  rows.forEach((observation) => {
    sheet.addRow({
      [TYPE_LEDGER_HEADERS[0]]: observation.timecode,
      [TYPE_LEDGER_HEADERS[1]]: observation.pointFound,
      [TYPE_LEDGER_HEADERS[2]]: observation.pointLabel ?? '',
      [TYPE_LEDGER_HEADERS[3]]: observation.status,
      [TYPE_LEDGER_HEADERS[4]]: observation.imageUrl,
      [TYPE_LEDGER_HEADERS[5]]: observation.capturedAt,
    })
  })

  freezeAndFilter(sheet, TYPE_LEDGER_HEADERS.length, sheet.rowCount)
  return sheet
}

/** Court identifiant de feuille (base lisible, sans les caractères interdits). */
function shortToken(value: string, fallback: string, max = 22): string {
  const cleaned = value.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return fallback
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

/**
 * Construit le classeur `.xlsx` global du projet et renvoie son buffer.
 * Feuilles : Synthèse, Statistiques par type, Matrice, Relevé brut, puis pour
 * chaque observateur une feuille globale + une feuille de détail par type utilisé.
 */
export async function generateExcelWorkbook(source: GlobalExportSource): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ONA Field'
  workbook.created = new Date()

  const summary = buildProjectSummary(source)
  const typeStats = buildTypeStatistics(source)
  const matrix = buildObserverMatrix(source)
  const ledger = buildGlobalObservations(source)

  writeSummarySheet(workbook, summary)
  if (typeStats.length > 0) writeTypeStatisticsSheet(workbook, typeStats)
  writeObserverMatrixSheet(workbook, matrix)
  writeLedgerSheet(workbook, ledger)

  // ——— Feuilles par observateur (global + une par type utilisé) ———
  const usedNames = new Set<string>([
    'Synthèse_Projet',
    'Statistiques_par_type',
    'Matrice_Observateurs',
    'Données_Brutes_Globales',
  ])

  for (const observer of matrix.observers) {
    const observerLedger = ledger.filter(
      (row) => row.anonymousId === observer.anonymousId,
    )
    const base = shortToken(observer.displayName, 'Observateur')
    const globalName = uniqueSheetName(
      sanitizeSheetToken(`${base}_Global`, 'Observateur_Global'),
      usedNames,
    )
    writeObserverGlobalSheet(workbook, globalName, observer)

    for (const type of matrix.types) {
      const count = observer.perType[type] ?? 0
      if (count <= 0) continue
      const rows = observerLedger.filter((row) => row.observationType === type)
      if (rows.length === 0) continue
      const typeName = uniqueSheetName(
        sanitizeSheetToken(
          `${shortToken(base, 'Observateur', 14)}_${shortToken(type, 'Type', 14)}`,
          'Observateur_Type',
        ),
        usedNames,
      )
      writeObserverTypeSheet(workbook, typeName, rows)
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
}
