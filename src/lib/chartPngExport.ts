import { brandFileName } from '@/lib/exportHelpers'

/**
 * Export PNG des graphiques Recharts par sérialisation SVG + canevas.
 *
 * Objectifs couverts (spécifications §32–§34) :
 *  - bouton « Télécharger le graphique (PNG) » exportant le graphique VISIBLE ;
 *  - qualité ≥ capture d'écran : facteur d'échelle 2× par défaut ;
 *  - contexte réel : bannière « Projet / Contexte de filtre / Titre » au-dessus du
 *    graphique, légende dessous (or = validées, ardoise = fantômes), puis axes et
 *    données du svg Recharts lui-même.
 *
 * Ce module n'utilise `document` que dans les fonctions d'export (jamais au
 * chargement) et n'est importé que par des composants client. Il ne touche ni aux
 * données ni à la base : aucune géométrie de capture n'est jamais transmise.
 */

export type ChartPngLegendItem = { color: string; label: string }

export type ChartPngOptions = {
  /** Valeur de l'attribut `data-chart-export` du conteneur renfermant le svg. */
  chartId: string
  /** Nom de fichier (sans extension), ex. `mon_projet_detections`. */
  fileName: string
  /** Nom du projet affiché dans la bannière de l'image. */
  projectTitle: string
  /** Titre réel du graphique (ex. « Détections dans le temps »). */
  chartTitle: string
  /** Contexte de filtre réellement appliqué (ex. « Type : 600m altitude · Vidéo A »). */
  context?: string
  /** Légende dessinée sous le graphique (or = validées, ardoise = fantômes). */
  legend?: ChartPngLegendItem[]
  /** Facteur de résolution (défaut 2 → impression / analyse raisonnables). */
  scale?: number
}

/** Propriétés de style copiées depuis le rendu calculé vers le clone (fond perdu de CSS). */
const STYLE_KEYS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'paint-order',
]

/** Élément possédant une feuille de style inline (HTML ou SVG). */
type StyledElement = HTMLElement | SVGElement

/** Copie les styles calculés réellement appliqués (sans écraser les styles inline). */
function inlineComputedStyles(root: Element): void {
  const walker = (element: Element) => {
    const computed =
      typeof window !== 'undefined' ? window.getComputedStyle(element) : null
    if (computed) {
      const styled = element as StyledElement
      for (const key of STYLE_KEYS) {
        if (!styled.style.getPropertyValue(key) && computed.getPropertyValue(key)) {
          styled.style.setProperty(key, computed.getPropertyValue(key))
        }
      }
    }
    for (const child of Array.from(element.children)) walker(child)
  }
  walker(root)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Impossible de charger l'image du graphique."))
    image.src = src
  })
}

/** Tronque un texte pour tenir dans la largeur du canevas (avec « … »). */
function fitLabel(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let shortened = text
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened}…`
}

function triggerPngDownload(dataUrl: string, fileName: string): void {
  const brandedName = brandFileName(fileName)
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = brandedName.endsWith('.png') ? brandedName : `${brandedName}.png`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

/** Télécharge un Blob sous un nom de fichier donné. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const brandedName = brandFileName(fileName)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = brandedName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Révocation différée : le téléchargement doit d'abord lire l'objet.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

const BASE_FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const INK = '#121417'

/**
 * Sérialise le svg Recharts « réellement visible », le dessine sur un canevas à
 * fond blanc (2× par défaut) avec bannière de contexte et légende, puis renvoie le
 * data URL PNG. Lance une erreur (message français) si le graphique n'est pas prêt.
 */
export async function renderChartPngDataUrl(options: ChartPngOptions): Promise<string> {
  const container = document.querySelector(`[data-chart-export="${options.chartId}"]`)
  if (!container) throw new Error('Conteneur du graphique introuvable.')
  const svg = container.querySelector('svg.recharts-surface') as SVGSVGElement | null
  if (!svg) throw new Error('Le graphique n’est pas encore rendu. Réessayez dans un instant.')

  const rect = svg.getBoundingClientRect()
  const chartWidth = Math.round(rect.width)
  const chartHeight = Math.round(rect.height)
  if (chartWidth < 32 || chartHeight < 32) {
    throw new Error('Le graphique est trop petit pour être exporté.')
  }

  const scale = Math.max(1, Math.round(options.scale ?? 2))

  // ——— Clone stylé et autonome du svg ———
  const clone = svg.cloneNode(true) as SVGSVGElement
  inlineComputedStyles(clone)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(chartWidth))
  clone.setAttribute('height', String(chartHeight))
  clone.removeAttribute('style')

  const serialized = new XMLSerializer().serializeToString(clone)
  const svgUrl = URL.createObjectURL(
    new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }),
  )

  const image = await loadImage(svgUrl)
  URL.revokeObjectURL(svgUrl)

  // ——— Mise en page verticale du canevas ———
  const padX = Math.round(18 * scale)
  const textWidth = chartWidth * scale - padX * 2
  const gap = Math.round(6 * scale)

  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Canvas indisponible dans ce navigateur.')
  const surface = context.canvas
  surface.width = chartWidth * scale

  // Dimensions des lignes de bannière.
  const projectSize = Math.round(15 * scale)
  const contextSize = Math.round(11 * scale)
  const titleSize = Math.round(12 * scale)
  const lineHeight = (size: number) => Math.round(size * 1.25)

  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, surface.width, surface.height)

  let y = Math.round(16 * scale)
  const drawLine = (text: string, size: number, bold: boolean, color: string): void => {
    context.font = `${bold ? 700 : 400} ${size}px ${BASE_FONT}`
    context.fillStyle = color
    context.textBaseline = 'top'
    context.fillText(fitLabel(context, text, textWidth), padX, y)
    y += lineHeight(size) + gap
  }

  drawLine(options.projectTitle, projectSize, true, INK)
  if (options.context && options.context.trim()) {
    drawLine(`Contexte : ${options.context.trim()}`, contextSize, false, '#7C5813')
  }
  drawLine(options.chartTitle, titleSize, true, INK)
  y += Math.round(6 * scale)

  // ——— Graphique (image vectorielle rasterisée) ———
  const chartTop = y
  const scaledChartHeight = Math.round(chartHeight * scale)
  context.drawImage(image, 0, chartTop, chartWidth * scale, scaledChartHeight)

  // ——— Légende (sous le graphique) ———
  if (options.legend && options.legend.length > 0) {
    y = chartTop + scaledChartHeight + Math.round(12 * scale)
    const swatch = Math.round(10 * scale)
    let x = padX
    for (const item of options.legend) {
      context.fillStyle = item.color
      context.fillRect(x, y, swatch, swatch)
      x += swatch + Math.round(6 * scale)
      context.font = `400 ${Math.round(11 * scale)}px ${BASE_FONT}`
      context.fillStyle = INK
      context.textBaseline = 'middle'
      context.fillText(item.label, x, y + swatch / 2)
      x += Math.round(context.measureText(item.label).width) + Math.round(18 * scale)
    }
    y += swatch + Math.round(4 * scale)
  } else {
    y = chartTop + scaledChartHeight
  }

  // Copie finale à la hauteur exacte (bannière + graphique + légende + marge).
  const totalHeight = y + Math.round(16 * scale)
  const rendered = document.createElement('canvas')
  rendered.width = surface.width
  rendered.height = totalHeight
  const renderedContext = rendered.getContext('2d')
  if (!renderedContext) throw new Error('Canvas indisponible dans ce navigateur.')
  renderedContext.fillStyle = '#FFFFFF'
  renderedContext.fillRect(0, 0, rendered.width, rendered.height)
  renderedContext.drawImage(surface, 0, 0)

  return rendered.toDataURL('image/png')
}

/** Télécharge directement un PNG du graphique visible. */
export async function downloadChartPng(options: ChartPngOptions): Promise<void> {
  const dataUrl = await renderChartPngDataUrl(options)
  triggerPngDownload(dataUrl, options.fileName)
}

/**
 * Soumet les graphiques capturés (PNG) à la route d'export qui assemble le ZIP
 * (classeur Excel 3 feuilles + dossier Charts/ + manifest), et télécharge le ZIP.
 * Les images proviennent du navigateur (svgs Recharts réellement visibles) ; le
 * serveur les valide et ne les persiste jamais.
 */
export type PackageChartInput = {
  id: string
  dataUrl: string
}

export type PackageExportPayload = {
  /** Filtres réellement appliqués aux graphiques et au classeur. */
  observationType?: string
  videoId?: string
  charts: PackageChartInput[]
}

export async function downloadChartPackage(
  url: string,
  payload: PackageExportPayload,
  fileName: string,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    let message = 'Le serveur a refusé l’export.'
    try {
      const parsed = (await response.json()) as { error?: string }
      if (parsed?.error) message = parsed.error
    } catch {
      // corps non JSON : on garde le message générique
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  downloadBlob(blob, fileName)
}
