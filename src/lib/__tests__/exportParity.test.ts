import { describe, expect, it } from 'vitest'
import {
  buildAnalyticsSnapshot,
  computeAnalyticsMetrics,
  rematchRowsToWindows,
  toExportSource,
  type AnalyticsObservationRow,
  type AnalyticsPerimeterConfig,
  type SnapshotPoint,
} from '@/lib/analyticsVersioning'
import {
  buildDetectionProbabilityTable,
  buildProjectSummary,
  computeTypeParticipation,
} from '@/lib/globalExportModel'
import { applyObserverExclusions } from '@/lib/observerExclusion'

/**
 * PARITÉ DES EXPORTS (K) — le tableau de bord, l'Excel global, le PDF et le ZIP
 * doivent afficher LES MÊMES NOMBRES pour une même version (§15).
 *
 * Tous passent par `resolveAnalyticsView` / `resolveExportSource` ; ce test vérifie
 * que les helpers de mise en forme utilisés par les classeurs et le rapport
 * (`buildProjectSummary`, `buildDetectionProbabilityTable`) reproduisent exactement
 * les métriques du moteur — et qu'aucun d'eux ne double-compte une capture.
 *
 * Le scénario est volontairement « difficile » : un point logique porté par deux
 * trames dont une INCLUSE dans l'autre (hiérarchie parent/enfant), un chevauchement,
 * une fausse alerte, deux observateurs dont un déclassé.
 */

const TYPE = 'Faune'

function windowOf(
  id: string,
  label: string,
  debut: number,
  fin: number,
  videoId: string | null = null,
): SnapshotPoint {
  return { id, label, trameDebut: debut, trameFin: fin, videoId, videoName: videoId ? 'Passe 1' : null, type: videoId ? TYPE : '' }
}

/**
 * Périmètre : « Lion » est porté par deux trames (large 100–160, précise 120–130,
 * INCLUSE dans la large) ; « Zèbre » par une trame (200–210) qui CHEVAUCHE la large
 * sur [100,160] ∩ [150,250] — l'attribution doit rester déterministe et unique.
 */
const CONFIG: AnalyticsPerimeterConfig = {
  projectId: 'p1',
  projectTitle: 'Étude',
  observationTypes: [TYPE],
  points: [
    windowOf('large', 'Lion', 100, 160, 'v1'),
    windowOf('precise', 'Lion', 120, 130, 'v1'),
    windowOf('chevauchante', 'Zèbre', 150, 250, 'v1'),
  ],
  videos: [{ id: 'v1', name: 'Passe 1', typeLabel: TYPE, orderIndex: 0 }],
}

function row(
  partial: Partial<AnalyticsObservationRow> & { userId: string; timestampTotal: number },
): AnalyticsObservationRow {
  return {
    id: `obs-${partial.userId}-${partial.timestampTotal}`,
    username: partial.userId,
    email: `${partial.userId}@example.test`,
    anonymousId: `anon-${partial.userId}`,
    observationType: TYPE,
    // Classification persistée VOLONTAIREMENT fausse : le moteur doit la redériver.
    isGhostPoint: true,
    pointId: null,
    pointLabel: null,
    imageUrl: '',
    videoId: 'v1',
    createdAt: '2026-09-10T10:00:00.000Z',
    ...partial,
  }
}

const RAW_ROWS: AnalyticsObservationRow[] = [
  row({ userId: 'A', timestampTotal: 125 }), // dans « précise » ET « large » ⇒ précise
  row({ userId: 'A', timestampTotal: 140 }), // dans « large » seule
  row({ userId: 'B', timestampTotal: 205 }), // dans « chevauchante » seule
  row({ userId: 'B', timestampTotal: 900 }), // hors de toute trame ⇒ fausse alerte
]

/** Relevé attribué par le moteur, comme le fait la source analytique en production. */
const ROWS = rematchRowsToWindows(RAW_ROWS, CONFIG)
const METRICS = computeAnalyticsMetrics(CONFIG, ROWS)

// ——————————————————————————————————————————————————————————————
// K1. Attribution unique et hiérarchie
// ——————————————————————————————————————————————————————————————

describe('K1 — attribution déterministe sur un relevé hiérarchisé', () => {
  const byId = new Map(ROWS.map((item) => [item.id, item]))

  it('la capture au cœur de la trame incluse va à la trame la PLUS PROFONDE', () => {
    expect(byId.get('obs-A-125')?.pointId).toBe('precise')
  })

  it('les deux captures du même point logique restent sur des trames DISTINCTES', () => {
    expect(byId.get('obs-A-140')?.pointId).toBe('large')
    expect(byId.get('obs-A-125')?.pointId).not.toBe(byId.get('obs-A-140')?.pointId)
  })

  it('une capture hors trame est une fausse alerte (classification persistée ignorée)', () => {
    expect(byId.get('obs-B-900')?.isGhostPoint).toBe(true)
    expect(byId.get('obs-B-900')?.pointId).toBeNull()
    // Alors que la classification persistée annonçait « fantôme » pour TOUTES.
    expect(RAW_ROWS.every((item) => item.isGhostPoint)).toBe(true)
  })

  it('aucune capture n’est comptée deux fois', () => {
    const attributed = ROWS.filter((item) => item.pointId !== null)
    expect(new Set(attributed.map((item) => item.id)).size).toBe(attributed.length)
    // 3 captures rattachées + 1 fausse alerte = 4
    expect(attributed).toHaveLength(3)
    expect(METRICS.detections + METRICS.ghostEvents).toBe(4)
  })
})

// ——————————————————————————————————————————————————————————————
// K2. Excel / PDF / ZIP = moteur
// ——————————————————————————————————————————————————————————————

describe('K2 — les helpers d’export reproduisent EXACTEMENT le moteur', () => {
  const source = toExportSource(CONFIG, ROWS)
  const summary = buildProjectSummary(source)

  it('compteurs de tête identiques (Excel global et PDF)', () => {
    expect(summary.observerCount).toBe(METRICS.observerCount)
    expect(summary.validatedCount).toBe(METRICS.detections)
    expect(summary.ghostCount).toBe(METRICS.ghostEvents)
    expect(summary.windowsHit).toBe(METRICS.windowsHit)
  })

  it('le tableau par type du classeur est celui du moteur, ligne pour ligne', () => {
    expect(buildDetectionProbabilityTable(source)).toEqual(METRICS.perType)
  })

  it('le détail par fenêtre du PDF est celui du moteur (observateurs, concordance, délai)', () => {
    for (const metric of METRICS.perPoint) {
      const matching = ROWS.filter((item) => item.pointId === metric.pointId && !item.isGhostPoint)
      const detectors = new Set(matching.map((item) => item.userId))
      expect(metric.observersDetected).toBe(detectors.size)
      // Dénominateur = observateurs PARTICIPANTS au type de la fenêtre — jamais le
      // total des observateurs du projet (§4).
      const participants = computeTypeParticipation(source).get(metric.type)?.participants ?? 0
      expect(metric.concordanceRate).toBe(
        participants > 0 ? Math.round((detectors.size / participants) * 100) : 0,
      )
      const delays = matching.map((item) => Math.max(0, item.timestampTotal - metric.trameDebut))
      expect(metric.avgDelaySeconds).toBe(
        delays.length > 0
          ? Math.round((delays.reduce((acc, delay) => acc + delay, 0) / delays.length) * 10) / 10
          : null,
      )
    }
  })

  it('le bilan par observateur du PDF est celui du moteur', () => {
    for (const observer of METRICS.perObserver) {
      const own = ROWS.filter((item) => item.userId === observer.observerId)
      const claims = own.length
      expect(observer.totalClaims).toBe(claims)
      expect(observer.detections + observer.ghostEvents).toBe(claims)
      expect(observer.precision).toBe(claims > 0 ? observer.detections / claims : null)
    }
  })

  it('la précision globale est calculable depuis les mêmes compteurs (pas de 4ᵉ formule)', () => {
    expect(METRICS.precision).toBe(METRICS.detections / METRICS.totalClaims)
  })
})

// ——————————————————————————————————————————————————————————————
// K3. Le déclassement s’applique aussi aux exports
// ——————————————————————————————————————————————————————————————

describe('K3 — un observateur déclassé disparaît de TOUTES les surfaces', () => {
  const source = toExportSource(CONFIG, ROWS)
  const withoutB = computeAnalyticsMetrics(CONFIG, applyObserverExclusions(ROWS, new Set(['B'])))
  const summaryWithoutB = buildProjectSummary(
    toExportSource(CONFIG, applyObserverExclusions(ROWS, new Set(['B']))),
  )

  it('Excel et PDF comptent le même nombre d’observateurs que le moteur', () => {
    expect(summaryWithoutB.observerCount).toBe(withoutB.observerCount)
    expect(summaryWithoutB.observerCount).toBe(1)
  })

  it('le numérateur ET le dénominateur suivent (§13)', () => {
    expect(withoutB.detections).toBe(2) // les 2 captures de A
    expect(withoutB.ghostEvents).toBe(0) // la fausse alerte de B disparaît
    expect(withoutB.perPoint.find((item) => item.pointId === 'precise')?.concordanceRate).toBe(100)
  })

  it('la concordance du PDF est calculée sur 1 observateur, jamais sur 2 amputés', () => {
    // Les trames touchées par A (« precise », « large ») sont à 100 %, pas à 50 % ;
    // la trame « chevauchante » que personne ne couvre reste à 0 %.
    expect(withoutB.perPoint.find((item) => item.pointId === 'precise')?.concordanceRate).toBe(100)
    expect(withoutB.perPoint.find((item) => item.pointId === 'large')?.concordanceRate).toBe(100)
    // Taux global = PONDÉRÉ Σ détections / Σ possibles : après déclassement,
    // 2 détections / (3 fenêtres × 1 participant) = 66,7 % ⇒ 67 — le numérateur ET
    // le dénominateur suivent le relevé filtré.
    // (Ici la moyenne des fenêtres donnerait le même entier, parce que tous les
    // observateurs restants participent au seul type du périmètre. Le cas où les
    // deux formules divergent — participations hétérogènes — est couvert par
    // `possibleObservations.test.ts`, bloc H.)
    expect(withoutB.concordanceRate).toBe(67)
    expect(withoutB.concordanceRate).toBe(Math.round((withoutB.detectionProbability ?? 0) * 100))
    // Contre-preuve : sur un dénominateur de 2 (observateur écarté encore compté),
    // ces mêmes trames ne vaudraient que 50 %.
    expect(METRICS.perPoint.find((item) => item.pointId === 'precise')?.concordanceRate).toBe(50)
    // Le tableau par type suit le même relevé filtré.
    expect(buildDetectionProbabilityTable(toExportSource(CONFIG, applyObserverExclusions(ROWS, new Set(['B']))))).toEqual(
      withoutB.perType,
    )
  })

  it('le relevé NON filtré conserve intégralement les captures de B', () => {
    expect(source.rows.filter((item) => item.userId === 'B')).toHaveLength(2)
  })
})

// ——————————————————————————————————————————————————————————————
// K4. Une version exportée plus tard porte les chiffres de SON époque
// ——————————————————————————————————————————————————————————————

describe('K4 — un export historique ne suit jamais la configuration du jour', () => {
  const snapshot = buildAnalyticsSnapshot({
    config: CONFIG,
    rows: ROWS,
    dataCutoffAt: '2026-09-10T23:59:59.000Z',
  })

  it('l’instantané figé égale le calcul de son époque (donc l’export de cette version)', () => {
    expect(snapshot.metrics).toEqual(METRICS)
  })

  it('après l’ajout d’une trame, l’analyse COURANTE change mais l’instantané reste intact', () => {
    const extended: AnalyticsPerimeterConfig = {
      ...CONFIG,
      points: CONFIG.points.concat([windowOf('nouvelle', 'Zèbre', 500, 520, 'v1')]),
    }
    const currentRows = rematchRowsToWindows(RAW_ROWS, extended)
    const currentMetrics = computeAnalyticsMetrics(extended, currentRows)

    expect(currentMetrics.configuredPoints).toBe(4)
    expect(currentMetrics.detections).toBe(METRICS.detections) // le passé est conservé
    // La version figée, elle, est STRICTEMENT inchangée.
    expect(snapshot.metrics).toEqual(METRICS)
    expect(snapshot.metrics.configuredPoints).toBe(3)
  })

  it('une nouvelle capture couverte par la trame ajoutée devient une détection', () => {
    const extended: AnalyticsPerimeterConfig = {
      ...CONFIG,
      points: CONFIG.points.concat([windowOf('nouvelle', 'Zèbre', 500, 520, 'v1')]),
    }
    const withNewCapture = RAW_ROWS.concat([row({ userId: 'B', timestampTotal: 505 })])
    const metrics = computeAnalyticsMetrics(extended, rematchRowsToWindows(withNewCapture, extended))
    expect(metrics.detections).toBe(METRICS.detections + 1)
    expect(metrics.configuredPoints).toBe(4)
  })
})
