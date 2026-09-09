import type { DetectionPoint } from '@/components/charts/chartData'

/**
 * Graphiques vectoriels STATIQUES pour le rapport imprimable.
 *
 * Contrairement à Recharts (ResponsiveContainer / ResizeObserver), ces SVG sont
 * rendus de façon synchrone et n'ont aucune dépendance à `window` : ils servent à
 * l'aperçu du rapport et sont rasterisés en PNG haute résolution pour le PDF réel
 * (jamais rognés ni flous). Palette éditoriale : or = validé, ardoise = fantôme.
 */

const COLOR_VALID = '#9C711B' // gold-700 (lisible sur blanc à l'impression)
const COLOR_GHOST = '#4A4E57' // slate
const COLOR_INK = '#121417'
const COLOR_AXIS = '#8C8275'
const COLOR_GRID = '#E5E0D8'

/**
 * Aire temporelle « Détections dans le temps » — courbes validées (or) & fantômes (ardoise)
 * agrégées par tranche de 10 s (séries déjà construites par `buildDetectionSeries`).
 */
export function ReportDetectionChart({ points }: { points: DetectionPoint[] }) {
  const width = 760
  const height = 200
  const padL = 34
  const padR = 8
  const padT = 10
  const padB = 22
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const n = Math.max(2, points.length)
  const maxValue = points.reduce((max, point) => Math.max(max, point.valid, point.ghost), 0)
  const yTop = Math.max(4, Math.ceil(maxValue / 4) * 4)

  const xAt = (index: number): number => padL + (index + 0.5) * (plotW / n)
  const yAt = (value: number): number => padT + plotH - (value / yTop) * plotH
  const bottom = yAt(0)

  const buildArea = (key: 'valid' | 'ghost'): string => {
    const first = `M ${xAt(0)},${bottom}`
    const top = points
      .map((point, index) => `${index === 0 ? 'L' : 'L'} ${xAt(index)},${yAt(point[key])}`)
      .join(' ')
    return `${first} ${top} L ${xAt(n - 1)},${bottom} Z`
  }
  const buildLine = (key: 'valid' | 'ghost'): string =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)},${yAt(point[key])}`).join(' ')

  const tickEvery = Math.max(1, Math.ceil(n / 8))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Répartition des détections validées et des points fantômes dans le temps"
      className="h-auto w-full"
      data-report-chart="detections"
    >
      {/* Grille horizontale */}
      {[0, 1, 2, 3, 4].map((division) => {
        const value = (yTop / 4) * division
        const y = yAt(value)
        return (
          <g key={division}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke={COLOR_GRID} strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill={COLOR_AXIS}>
              {division === 0 ? '0' : String(value)}
            </text>
          </g>
        )
      })}

      {/* Aires & courbes */}
      <path d={buildArea('ghost')} fill={COLOR_GHOST} fillOpacity={0.16} stroke="none" />
      <path d={buildLine('ghost')} fill="none" stroke={COLOR_GHOST} strokeWidth={1.6} />
      <path d={buildArea('valid')} fill={COLOR_VALID} fillOpacity={0.18} stroke="none" />
      <path d={buildLine('valid')} fill="none" stroke={COLOR_VALID} strokeWidth={2} />

      {/* Abscisses */}
      {points.map((point, index) =>
        index % tickEvery === 0 ? (
          <text
            key={index}
            x={xAt(index)}
            y={height - 6}
            textAnchor={index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle'}
            fontSize={9}
            fill={COLOR_AXIS}
          >
            {point.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/**
 * Anneau « Validées vs Fantômes » (tranches éditoriales or / ardoise). Le pourcentage
 * central affiche la part de captures validées ; vide → anneau neutre « — ».
 */
export function ReportSplitRing({ valid, ghost }: { valid: number; ghost: number }) {
  const size = 200
  const radius = 72
  const strokeWidth = 30
  const center = size / 2
  const total = valid + ghost
  const circumference = 2 * Math.PI * radius
  const fraction = total > 0 ? valid / total : 0
  const validArc = Math.max(0, fraction * circumference - 4)

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Part des observations validées par rapport aux points fantômes"
      className="mx-auto h-48 w-48"
      data-report-chart="ventilation"
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={COLOR_GHOST}
        strokeWidth={strokeWidth}
        opacity={0.18}
      />
      {total > 0 && validArc > 0 && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={COLOR_VALID}
          strokeWidth={strokeWidth}
          strokeDasharray={`${validArc} ${circumference - validArc}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
      <text
        x={center}
        y={center - 2}
        textAnchor="middle"
        fontSize={30}
        fontWeight={800}
        fill={COLOR_INK}
      >
        {total > 0 ? `${Math.round(fraction * 100)}%` : '—'}
      </text>
      <text x={center} y={center + 18} textAnchor="middle" fontSize={11} fill={COLOR_AXIS}>
        validées
      </text>
    </svg>
  )
}
