import { describe, expect, it } from 'vitest'
import {
  buildCaptureFileBaseName,
  captureTimecodeSegment,
  createCaptureFolderResolver,
  observerDisplayLabel,
  sanitizeFileSegment,
  sanitizeFolderSegment,
  type DriveChildFolderIo,
} from '@/lib/driveLayout'

/**
 * Faux répertoire Google Drive en mémoire (aucun réseau) : chaque dossier est identifié
 * par `id` et adressé par son parent. Compte les recherches et créations pour vérifier
 * qu'on ne crée jamais un dossier déjà présent (dé-duplication).
 */
function createFakeIo() {
  const nodes = new Map<string, { name: string; parentId: string | null }>()
  const dirByParentName = new Map<string, string>() // `${parentId}::${name}` → id
  let counter = 0
  const calls = { find: 0, create: 0 }

  const io: DriveChildFolderIo = {
    async findChildFolderId(parentId, name) {
      calls.find += 1
      return dirByParentName.get(`${parentId}::${name}`) ?? null
    },
    async createChildFolder(parentId, name) {
      calls.create += 1
      const id = `folder-${++counter}`
      dirByParentName.set(`${parentId}::${name}`, id)
      nodes.set(id, { name, parentId })
      return id
    },
  }

  return { io, nodes, calls, folderIdOf: (parentId: string, name: string) => dirByParentName.get(`${parentId}::${name}`) ?? null }
}

const ROOT = 'root-ona-field'
const resolverOf = (io: DriveChildFolderIo) => createCaptureFolderResolver(io)

describe('captureTimecodeSegment (format MMmSSs)', () => {
  it('formate le temps vidéo comme minutes + secondes', () => {
    expect(captureTimecodeSegment(154)).toBe('02m34s')
    expect(captureTimecodeSegment(7)).toBe('00m07s')
    expect(captureTimecodeSegment(0)).toBe('00m00s')
    expect(captureTimecodeSegment(3600)).toBe('60m00s')
  })
  it('arrondit à la seconde comme timestampTotal persisté', () => {
    expect(captureTimecodeSegment(154.4)).toBe('02m34s')
    expect(captureTimecodeSegment(154.6)).toBe('02m35s')
  })
  it('borne les valeurs invalides (négatif → 0)', () => {
    expect(captureTimecodeSegment(-5)).toBe('00m00s')
  })
})

describe('buildCaptureFileBaseName ({Observateur}_{MMmSSs})', () => {
  it('assemble nom d’observateur + minute vidéo, sans extension', () => {
    expect(buildCaptureFileBaseName('Robert K', 154)).toBe('Robert_K_02m34s')
    expect(buildCaptureFileBaseName('  Marie   Curie ', 9)).toBe('Marie_Curie_00m09s')
  })
  it('assainit le nom (interdits Drive retirés, pas de `_` doublés)', () => {
    // '/' est interdit → espace → '_' ; les `_` en excès sont réduits.
    expect(buildCaptureFileBaseName('Robert/K', 154)).toBe('Robert_K_02m34s')
    expect(buildCaptureFileBaseName('Robert K.', 154).startsWith('Robert_K')).toBe(true)
  })
  it('ne crée jamais un libellé vide', () => {
    expect(buildCaptureFileBaseName('', 154).startsWith('observateur_02m34s')).toBe(true)
  })
})

describe('observerDisplayLabel (même nom que dans les exports)', () => {
  it('préfère username puis email puis identifiant anonyme', () => {
    expect(
      observerDisplayLabel({ username: 'R. Kule', email: 'r@x.fr', anonymousId: 'anon-1' }),
    ).toBe('R. Kule')
    expect(observerDisplayLabel({ username: '  ', email: ' r@x.fr ', anonymousId: 'anon-1' })).toBe(
      'r@x.fr',
    )
    expect(observerDisplayLabel({ username: null, email: null, anonymousId: 'anon-1' })).toBe('anon-1')
  })
  it('retombe sur une valeur neutre si tout est vide', () => {
    expect(observerDisplayLabel({ username: null, email: null, anonymousId: null })).toBe('observateur')
  })
})

describe('sanitizeFolderSegment / sanitizeFileSegment', () => {
  it('garde un titre lisible tout en retirant les caractères interdits par Drive', () => {
    expect(sanitizeFolderSegment('Étude 1 / Phase B')).toBe('Étude 1 Phase B')
    expect(sanitizeFolderSegment('Projet : « lions » ?')).toBe('Projet « lions »') // : ? retirés, guillemets conservés
    expect(sanitizeFolderSegment('  Espaces  Autour  ')).toBe('Espaces Autour')
  })
  it('neutralise les caractères de contrôle (saut de ligne → espace)', () => {
    expect(sanitizeFolderSegment('Projet\nBis')).toBe('Projet Bis')
    expect(sanitizeFileSegment('A\tB')).toBe('A_B')
  })
  it('n’utilise jamais de nom vide ou réservé pour un dossier', () => {
    expect(sanitizeFolderSegment('')).toBe('Projet')
    expect(sanitizeFolderSegment('   ')).toBe('Projet')
    expect(sanitizeFolderSegment('...')).toBe('Projet')
    expect(sanitizeFolderSegment('.')).toBe('Projet')
  })
  it('retombe sur un libellé sûr pour un nom de fichier vide', () => {
    expect(sanitizeFileSegment(null)).toBe('observateur')
    expect(sanitizeFileSegment(' ')).toBe('observateur')
  })
  it('borne la longueur des segments (Drive : 255 max)', () => {
    expect(sanitizeFolderSegment('x'.repeat(300)).length).toBe(120)
    expect(sanitizeFileSegment('y'.repeat(200)).length).toBe(72)
  })
})

describe('createCaptureFolderResolver — résolution {Projet}/{Type}', () => {
  it('crée le dossier projet (1) puis le dossier type (3), jamais de doublon (2,4,8)', async () => {
    const { io, calls, folderIdOf } = createFakeIo()
    const resolver = resolverOf(io)

    const first = await resolver.resolveCaptureFolder({
      rootFolderId: ROOT,
      projectTitle: 'Parc National',
      typeName: 'Déplacement',
    })

    // Dossier projet créé sous la racine, dossier type sous le projet.
    expect(first).not.toBeNull()
    expect(calls.create).toBe(2)
    const projectId = folderIdOf(ROOT, 'Parc National')
    const typeId = folderIdOf(projectId as string, 'Déplacement')
    expect(first?.projectFolderId).toBe(projectId)
    expect(first?.typeFolderId).toBe(typeId)
    expect(first?.finalFolderId).toBe(typeId) // la capture va dans le dossier du type

    // Deuxième résolution (même projet + type) : réutilisation, aucune création.
    const second = await resolver.resolveCaptureFolder({
      rootFolderId: ROOT,
      projectTitle: 'Parc National',
      typeName: 'Déplacement',
    })
    expect(calls.create).toBe(2)
    expect(second?.projectFolderId).toBe(projectId)
    expect(second?.typeFolderId).toBe(typeId)
    expect(second?.finalFolderId).toBe(first?.finalFolderId)
  })

  it('une capture sans type est déposée directement dans le dossier projet (pas de dossier type)', async () => {
    const { io, calls, nodes } = createFakeIo()
    const resolver = resolverOf(io)

    const target = await resolver.resolveCaptureFolder({
      rootFolderId: ROOT,
      projectTitle: 'Projet Vidéo',
      typeName: '',
    })

    expect(target?.typeFolderId).toBeNull()
    expect(target?.finalFolderId).toBe(target?.projectFolderId)
    expect(calls.create).toBe(1) // seul le dossier projet a été créé
    expect(nodes.size).toBe(1)
  })

  it('recherche AVANT création pour un projet déjà existant sur le Drive', async () => {
    const { io, calls } = createFakeIo()
    // On pré-crée le dossier projet et le dossier type « comme s’ils existaient déjà ».
    await io.createChildFolder(ROOT, 'Déjà sur Drive')
    await io.createChildFolder('folder-1', 'Comportement')
    calls.create = 0

    const resolver = resolverOf(io)
    const target = await resolver.resolveCaptureFolder({
      rootFolderId: ROOT,
      projectTitle: 'Déjà sur Drive',
      typeName: 'Comportement',
    })

    expect(target?.finalFolderId).toBe('folder-2') // type existant réutilisé
    expect(calls.create).toBe(0) // aucun dossier créé : tout était présent
  })

  it('dé-duplique les résolutions concurrentes du même dossier (une seule création)', async () => {
    const { io, calls } = createFakeIo()
    const resolver = resolverOf(io)

    const [a, b] = await Promise.all([
      resolver.resolveCaptureFolder({ rootFolderId: ROOT, projectTitle: 'Concurrent', typeName: 'Vol' }),
      resolver.resolveCaptureFolder({ rootFolderId: ROOT, projectTitle: 'Concurrent', typeName: 'Vol' }),
    ])

    expect(a?.finalFolderId).toBe(b?.finalFolderId)
    expect(calls.create).toBe(2) // projet + type, chacun créé une seule fois
  })

  it('aucun dossier « observateur » n’est créé — seuls projet puis type (7)', async () => {
    const { io, nodes, calls } = createFakeIo()
    const resolver = resolverOf(io)

    await resolver.resolveCaptureFolder({ rootFolderId: ROOT, projectTitle: 'Projet A', typeName: 'Type A' })
    await resolver.resolveCaptureFolder({ rootFolderId: ROOT, projectTitle: 'Projet B', typeName: null })
    await resolver.resolveCaptureFolder({ rootFolderId: ROOT, projectTitle: 'Projet A', typeName: 'Type B' })

    const names = [...nodes.values()].map((node) => node.name)
    expect(names).toEqual(['Projet A', 'Type A', 'Projet B', 'Type B'])
    expect(names.some((name) => name.toLowerCase().includes('robert'))).toBe(false)
    expect(calls.create).toBe(4) // 3 projets/types, pas une ligne par capture ni par observateur
  })

  it('sans dossier racine configuré, aucune création (comportement hérité préservé)', async () => {
    const { io, calls } = createFakeIo()
    const resolver = resolverOf(io)
    const target = await resolver.resolveCaptureFolder({
      rootFolderId: null,
      projectTitle: 'Projet',
      typeName: 'Type',
    })
    expect(target).toBeNull()
    expect(calls.create).toBe(0)
    expect(calls.find).toBe(0)
  })
})
