-- État des demandes d'accès des comptes (approbation ADMIN des inscriptions publiques)
-- + liens d'accès observateur par projet (jetons aléatoires dont seul le hash est stocké).
--
-- Migration purement additive : aucune donnée existante n'est modifiée.
--   `User.accountStatus` par défaut `APPROVED` : les comptes déjà présents restent utilisables.
--   Le jeton brut d'observateur n'est JAMAIS persisté — uniquement son SHA-256 (`tokenHash`).

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "ObserverTokenStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'REVOKED', 'EXPIRED');

-- AlterTable : statut de la demande d'accès du compte
ALTER TABLE "User"
    ADD COLUMN     "accountStatus" "AccountStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN     "approvedById" TEXT,
    ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- CreateIndex : demande d'accès traitée par un ADMIN
CREATE INDEX "User_approvedById_idx" ON "User"("approvedById");

-- AddForeignKey : auto-référence d'approbation (ADMIN → comptes approuvés)
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable : lien d'accès observateur par projet
CREATE TABLE "ObserverAccessToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "observerId" TEXT,
    "status" "ObserverTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "sessionRunId" TEXT,
    CONSTRAINT "ObserverAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ObserverAccessToken_tokenHash_key" ON "ObserverAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ObserverAccessToken_projectId_idx" ON "ObserverAccessToken"("projectId");

-- CreateIndex
CREATE INDEX "ObserverAccessToken_observerId_idx" ON "ObserverAccessToken"("observerId");

-- CreateIndex
CREATE INDEX "ObserverAccessToken_status_idx" ON "ObserverAccessToken"("status");

-- AddForeignKey
ALTER TABLE "ObserverAccessToken" ADD CONSTRAINT "ObserverAccessToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObserverAccessToken" ADD CONSTRAINT "ObserverAccessToken_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
