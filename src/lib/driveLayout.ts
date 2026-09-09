/**
 * Organisation des captures dans Google Drive — sous-dossiers `Projet` / `Type`.
 *
 * Mission : organiser les NOUVELLES captures à l'intérieur du dossier racine
 * (`GOOGLE_DRIVE_FOLDER_ID`) sans toucher ni à l'authentification, ni à la config,
 * ni au mécanisme d'upload, ni à PostgreSQL, ni au système hors-ligne/retry.
 *
 *   <racine Captures>/
 *     <Projet>/                    ← nom réel du projet (`Project.title`), lisible
 *       <Type d'observation>/      ← type réellement choisi (pas de type codé en dur)
 *         <Observateur>_<MMmSSs>.webp
 *
 * Règles :
 *   — Aucun dossier « observateur » : le fichier porte le nom de l'observateur.
 *   — Pas de doublon : recherche AVANT création (et dé-duplication en vol pour les
 *     créations concurrentes d'un même dossier).
 *   — Recherche / création par IDs Drive (`parents`), `supportsAllDrives=true`.
 *   — Nom de fichier = libellé observable + temps vidéo de la capture (arrondi à la
 *     seconde, identique à `timestampTotal` persisté), format `MMmSSs` (ex. 154 s → `02m34s`).
 *
 * Module PUR (aucun appel réseau, aucun import serveur) : toute I/O Drive est injectée
 * via `DriveChildFolderIo`, ce qui permet des tests unitaires déterministes.
 */

/** Type MIME d'un dossier Google Drive. */
export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

/** Caractères interdits dans un nom de dossier / fichier Drive (et multi-systèmes). */
const FORBIDDEN_DRIVE_CHARS = /[\\/:*?"<>|]/g

/** Longueur maximale d'un segment de dossier / de nom de fichier (Drive : 255 max). */
const MAX_FOLDER_SEGMENT = 120
const MAX_FILE_SEGMENT = 72

/** Remplace chaque caractère de contrôle (et DEL) par une espace. */
function neutralizeControlChars(value: string): string {
  let out = ''
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    out += code < 32 || code === 127 ? ' ' : ch
  }
  return out
}

/** Nettoie un libellé (interdits + contrôles + blancs répétés + bornes de longueur). */
function cleanLabel(raw: string | null | undefined): string {
  return neutralizeControlChars(String(raw ?? ''))
    .normalize('NFC')
    .replace(FORBIDDEN_DRIVE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Nettoie un libellé pour en faire un NOM DE DOSSIER lisible et sûr. On conserve les
 * espaces (lisibilité), on retire les caractères interdits par Drive et les contrôles,
 * on réduit les blancs répétés, on borne la longueur. Vide / réservé ⇒ `fallback`.
 */
export function sanitizeFolderSegment(raw: string | null | undefined, fallback = 'Projet'): string {
  const cleaned = cleanLabel(raw).slice(0, MAX_FOLDER_SEGMENT)
  const reserved = cleaned === '.' || cleaned === '..' || /^\.+$/.test(cleaned)
  return reserved || !cleaned ? fallback : cleaned
}

/**
 * Nettoie un libellé pour un NOM DE FICHIER (segment, sans extension) : les blancs
 * deviennent `_`, jamais deux `_` consécutifs. Vide ⇒ `fallback`.
 */
export function sanitizeFileSegment(raw: string | null | undefined, fallback = 'observateur'): string {
  const cleaned = cleanLabel(raw)
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_FILE_SEGMENT)
  return cleaned || fallback
}

/**
 * Libellé d'affichage d'un observateur (username → email → identifiant anonyme), aligné
 * sur `serverExport.observerDisplayLabel` : le même nom apparaît dans les exports.
 */
export function observerDisplayLabel(user: {
  username: string | null
  email: string | null
  anonymousId: string | null
}): string {
  return user.username?.trim() || user.email?.trim() || user.anonymousId || 'observateur'
}

/**
 * Segment temporel `MMmSSs` d'une capture (arrondie à la seconde, comme `timestampTotal`).
 * Ex. 154 → `02m34s`, 7 → `00m07s`, 3600 → `60m00s`.
 */
export function captureTimecodeSegment(totalSeconds: number): string {
  const secs = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(secs / 60)
  const seconds = secs % 60
  return `${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`
}

/**
 * Nom de base (sans extension) d'une capture : `<Observateur>_<MMmSSs>`. L'extension
 * réelle (`webp`, etc.) est ajoutée par la couche d'upload selon le MIME.
 */
export function buildCaptureFileBaseName(observerLabel: string, totalSeconds: number): string {
  return `${sanitizeFileSegment(observerLabel)}_${captureTimecodeSegment(totalSeconds)}`
}

/**
 * I/O minimale Google Drive nécessaire à la résolution des dossiers. Séparée du code
 * réel (qui vit dans `drive.ts`) pour rester testable avec un faux répertoire.
 */
export type DriveChildFolderIo = {
  /** Renvoie l'id du dossier enfant `name` sous `parentId`, ou null s'il n'existe pas. */
  findChildFolderId(parentId: string, name: string): Promise<string | null>
  /** Crée (et renvoie l'id du) dossier `name` sous `parentId`. */
  createChildFolder(parentId: string, name: string): Promise<string>
}

/** Cible résolue pour l'upload d'une capture. */
export type CaptureFolderTarget = {
  projectFolderId: string
  /** Dossier du type d'observation (null quand la capture n'a pas de type → dossier projet). */
  typeFolderId: string | null
  /** Dossier final de dépôt : `typeFolderId` si présent, sinon `projectFolderId`. */
  finalFolderId: string
}

/**
 * Résolveur de dossiers `Projet`/`Type` reposant sur une I/O injectée.
 *
 * Recherche AVANT création (pas de doublon) + dé-duplication en vol : si deux uploads
 * concurrents demandent le même dossier simultanément, une seule recherche/création
 * réseau est émise, l'autre attend le même résultat.
 */
export function createCaptureFolderResolver(io: DriveChildFolderIo) {
  const inflight = new Map<string, Promise<string>>()

  // Séparateur sûr : « | » est interdit dans les noms nettoyés (FORBIDDEN_DRIVE_CHARS),
  // il ne peut donc pas apparaître dans une clé et provoquer une collision.
  const ensureFolder = (parentId: string, name: string): Promise<string> => {
    const key = `${parentId}||${name}`
    const pending = inflight.get(key)
    if (pending) return pending

    const task = (async () => {
      const existingId = await io.findChildFolderId(parentId, name)
      if (existingId) return existingId
      return io.createChildFolder(parentId, name)
    })().finally(() => {
      inflight.delete(key)
    })

    inflight.set(key, task)
    return task
  }

  return {
    /**
     * Résout la cible d'upload d'une capture : dossier `Projet` (sous `rootFolderId`),
     * puis dossier `Type` si un type est fourni. Renvoie null si aucune racine n'est
     * configurée (le dossier projet n'a alors aucun parent → comportement hérité).
     */
    async resolveCaptureFolder(options: {
      rootFolderId: string | null
      projectTitle: string
      typeName: string | null
    }): Promise<CaptureFolderTarget | null> {
      if (!options.rootFolderId) return null
      const projectFolderId = await ensureFolder(
        options.rootFolderId,
        sanitizeFolderSegment(options.projectTitle),
      )
      const typeName = options.typeName?.trim() ?? ''
      if (!typeName) {
        return { projectFolderId, typeFolderId: null, finalFolderId: projectFolderId }
      }
      const typeFolderId = await ensureFolder(projectFolderId, sanitizeFolderSegment(typeName))
      return { projectFolderId, typeFolderId, finalFolderId: typeFolderId }
    },
  }
}

export type CaptureFolderResolver = ReturnType<typeof createCaptureFolderResolver>
