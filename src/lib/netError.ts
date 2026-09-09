/**
 * Détection d'une panne de transport — pur, sans navigateur, SANS dépendance serveur.
 *
 * Isolé dans son propre module pour être importable aussi bien par le serveur
 * (`saveErrors.ts`) que par les composants client (`VideoAnnotator`) : quand un appel
 * de Server Action échoue par exception, le client doit distinguer une coupure réseau
 * (message « Connexion interrompue… ») d'une erreur serveur imprévue, sans jamais
 * importer de module serveur (clé privée, Drive, Prisma).
 */
export function isNetworkLikeError(error: unknown): boolean {
  if (error instanceof TypeError) return true // fetch en échec réseau = TypeError
  if (error instanceof Error) {
    const name = error.name.toLowerCase()
    if (name === 'aborterror') return true
    const message = error.message.toLowerCase()
    return /fetch failed|networkerror|load failed|econnreset|econnrefused|enotfound|socket hang up|timed out|timeout|net::/i.test(
      message,
    )
  }
  return false
}
