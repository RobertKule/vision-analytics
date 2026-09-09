/**
 * Duplication d'une CONFIGURATION vidéo (Partie T) — choix du libellé et du type
 * de la copie. Fonctions pures : la création d'une NOUVELLE entité (nouvel
 * identifiant, nouveaux identifiants de fenêtres, aucune observation / capture /
 * driveFileId / clientKey / historique recopiés) est une règle serveur
 * transactionnelle (voir `duplicateProjectVideo` dans `projectActions.ts`) ;
 * ces helpers bornent et partagent ses décisions avec le formulaire admin
 * (`DuplicateVideoSheet`), pour un seul comportement testé.
 */

import { deriveObservationNameFromVideo } from '@/lib/videoName'

/** Repli du libellé d'une copie quand ni nom ni type ni source exploitable. */
const FALLBACK_LABEL = 'Passe vidéo'

/**
 * Libellé de base d'une configuration à dupliquer : nom lisible de la passe, sinon
 * son type verrouillé, sinon le nom dérivé de la source, sinon un repli stable.
 * Exemple attendu : type « 100 m » sans nom → « 100 m » → copie « 100 m — Copie ».
 */
export function duplicateBaseLabel(
  name: string | null | undefined,
  typeLabel: string | null | undefined,
  source: string | null | undefined,
): string {
  return (
    (name ?? '').trim() ||
    (typeLabel ?? '').trim() ||
    deriveObservationNameFromVideo(source) ||
    FALLBACK_LABEL
  )
}

/**
 * Libellé final de la copie : le nom demandé s'il est renseigné (jamais écrasé),
 * sinon « <libellé de base> — Copie ».
 */
export function resolveDuplicateName(
  requestedName: string | null | undefined,
  name: string | null | undefined,
  typeLabel: string | null | undefined,
  source: string | null | undefined,
): string {
  const requested = (requestedName ?? '').trim()
  if (requested) return requested
  return `${duplicateBaseLabel(name, typeLabel, source)} — Copie`
}

/**
 * Résout le type d'observation de la copie :
 *  — cible absente (`undefined`) → on conserve le type de la source ;
 *  — cible `null` → copie générique (aucun type verrouillé) ;
 *  — cible textuelle → doit appartenir à la configuration du projet
 *    (comparaison insensible à la casse et aux espaces) ; sinon erreur.
 */
export function resolveDuplicateTypeLabel(
  sourceTypeLabel: string | null,
  target: string | null | undefined,
  configuredTypes: string[],
): { ok: true; typeLabel: string | null } | { ok: false; error: string } {
  if (target === undefined) return { ok: true, typeLabel: sourceTypeLabel }
  if (target === null) return { ok: true, typeLabel: null }

  const wanted = target.trim()
  if (!wanted) return { ok: true, typeLabel: null }
  const wantedKey = wanted.toLocaleLowerCase()
  const configured = (configuredTypes ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  if (!configured.some((item) => item.toLocaleLowerCase() === wantedKey)) {
    return { ok: false, error: `Le type « ${wanted} » n’existe pas dans la configuration.` }
  }
  return { ok: true, typeLabel: wanted }
}
