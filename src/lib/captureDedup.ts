/**
 * Garde anti-doublon de capture à l'instant vidéo — moteur PUR, sans effet de bord.
 *
 * Le protocole d'observation refuse de ré-accepter une capture pour un même temps
 * vidéo : deux déclenchements sur la même frame (double clic / double raccourci),
 * pour la même passe (`videoId`) et le même type d'observation, produiraient deux
 * enregistrements redondants que l'analyse scientifique finirait par dédupliquer.
 * La garde signale à l'observateur qu'il vient de capturer cet instant au lieu de
 * créer un second doublon.
 *
 * Comparaison (cohérente avec l'annotateur) :
 *  — passe : la capture doit appartenir à la MÊME passe vidéo (`null` = passe
 *    générique héritée ; une passe différente a sa propre timeline) ;
 *  — type  : même type d'observation (normalisation identique à l'annotateur :
 *    trim, espaces internes aplatis, casse indifférente) — une passe générique peut
 *    légitimement capturer deux types DIFFÉRENTS au même instant, ce n'est PAS un
 *    doublon ;
 *  — temps : |écart| ≤ tolérance (défaut 0,1 s) : deux pauses « au même endroit »
 *    (le lecteur peut renvoyer une valeur quasi identique après un léger seek).
 */

/** Tolérance temporelle (secondes) en deçà de laquelle deux captures sont « même temps ». */
export const DUPLICATE_CAPTURE_TOLERANCE_S = 0.1

/** Enregistrement minimal d'une capture pour la détection de doublon (n'importe quel id). */
export type CaptureDedupRecord = {
  id: string
  timestamp: number
  observationType: string | null
  /** Passe vidéo d'origine (`null` / absent = passe générique héritée). */
  videoId?: string | null
}

export type DuplicateCaptureSearch = {
  records: readonly CaptureDedupRecord[]
  /** Passe active du lecteur (`null` = passe générique héritée). */
  videoId: string | null
  /** Type résolu de la capture à venir (null = projet sans type imposé). */
  observationType: string | null
  /** Horodatage vidéo (s) de la capture à venir. */
  timestamp: number
  /** Tolérance optionnelle (défaut : `DUPLICATE_CAPTURE_TOLERANCE_S`). */
  toleranceS?: number
}

/** Normalisation du type, identique à celle de l'annotateur (`VideoAnnotator`). */
function normalizeTypeKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

/**
 * Renvoie la première capture déjà acceptée qui constituerait un doublon de la
 * capture à venir (même passe, même type, instant voisin), sinon `null`.
 */
export function findDuplicateCapture(
  search: DuplicateCaptureSearch,
): CaptureDedupRecord | null {
  const toleranceS = search.toleranceS ?? DUPLICATE_CAPTURE_TOLERANCE_S
  const scopeVideoId = search.videoId ?? null
  const wantedTypeKey = normalizeTypeKey(search.observationType)
  for (const record of search.records) {
    if ((record.videoId ?? null) !== scopeVideoId) continue
    if (normalizeTypeKey(record.observationType) !== wantedTypeKey) continue
    if (Math.abs(record.timestamp - search.timestamp) <= toleranceS) return record
  }
  return null
}
