-- DEMANDE DE RÉACTIVATION d'un accès observateur.
--
-- L'observateur peut DEMANDER une réactivation (jamais la déclencher lui-même) ;
-- seul un ADMIN confirme (APPROVED → le jeton redevient ACTIVE) ou refuse (REJECTED).
-- Le statut de la demande (`ReactivationStatus`) est INDÉPENDANT du statut du jeton
-- (`ObserverTokenStatus`). Une réactivation ne supprime ni ne recrée aucune donnée.
--
-- Migration purement ADDITIVE : aucune donnée existante n'est supprimée ni modifiée.

-- CreateEnum
CREATE TYPE "ReactivationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ObserverReactivationRequest" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "status" "ReactivationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObserverReactivationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObserverReactivationRequest_tokenId_idx" ON "ObserverReactivationRequest"("tokenId");

-- CreateIndex
CREATE INDEX "ObserverReactivationRequest_status_idx" ON "ObserverReactivationRequest"("status");

-- AddForeignKey
ALTER TABLE "ObserverReactivationRequest" ADD CONSTRAINT "ObserverReactivationRequest_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ObserverAccessToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObserverReactivationRequest" ADD CONSTRAINT "ObserverReactivationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
