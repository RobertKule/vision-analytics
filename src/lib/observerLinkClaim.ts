/**
 * Classification de l'ouverture d'un lien d'accès observateur — moteur PUR, sans I/O.
 *
 * Un lien n'ouvre QU'UNE session pour UN observateur. Dès que le jeton est rattaché à
 * un observateur (premier passage du lien, qui le lie au navigateur de cet observateur
 * via le cookie de portée signé), le lien est « pris » : seul le navigateur d'origine —
 * celui qui porte le cookie correspondant — peut le rouvrir. Tout autre navigateur est
 * refusé :
 *  — session encore EN COURS : une autre personne ne doit pas rejoindre/poursuivre la
 *    session du premier observateur ;
 *  — session déjà SOUMISE (COMPLETED) : une autre personne ne doit pas voir les
 *    captures du premier observateur (le jeton est devenu invalide à la soumission,
 *    il n'ouvre plus que la consultation pour SON observateur, dans SON navigateur).
 */

export type ObserverLinkClaim = {
  /** Jeton `ObserverAccessToken` visé par l'ouverture du lien. */
  tokenId: string
  /** Observateur déjà rattaché au jeton (`null` = lien jamais ouvert). */
  claimedObserverId: string | null
  /** `tokenId` du cookie de portée courant (`null` = aucun cookie posé). */
  cookieTokenId: string | null
  /** `uid` du cookie de portée courant (`null` = aucun cookie posé). */
  cookieUid: string | null
}

export type ObserverLinkOutcome =
  | { kind: 'claim' } // premier passage : le lien peut être rattaché à ce navigateur
  | { kind: 'owner' } // le navigateur d'origine (cookie correspondant) rouvre son lien
  | { kind: 'used' } // autre navigateur sur un lien déjà rattaché → refus « déjà utilisé »

/** Classe l'ouverture : rattachement, retour du propriétaire, ou lien « déjà utilisé ». */
export function classifyObserverLink(claim: ObserverLinkClaim): ObserverLinkOutcome {
  if (claim.claimedObserverId == null) return { kind: 'claim' }
  const ownerCookie =
    claim.cookieTokenId != null &&
    claim.cookieUid != null &&
    claim.cookieTokenId === claim.tokenId &&
    claim.cookieUid === claim.claimedObserverId
  return ownerCookie ? { kind: 'owner' } : { kind: 'used' }
}
