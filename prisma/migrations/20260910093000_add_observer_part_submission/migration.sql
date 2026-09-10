-- ENVOI PAR PARTIE + ENVOI FINAL DE LA SESSION.
--
-- Une « partie » = une passe vidéo (`videoId`) ou la passe générique héritée
-- (`videoId = null`). Chaque partie a son propre statut au sein d'une session :
--   NOT_STARTED / IN_PROGRESS / SUBMITTED.
--
--   « Envoyer cette partie »  → finalise UNIQUEMENT la partie visée (ses captures
--                               deviennent certifiées) ; la session reste ACTIVE.
--   « Envoyer tout »           → finalise les parties restantes puis clôture la
--                               session (le jeton passe COMPLETED → lecture seule).
--
-- Migration purement ADDITIVE : aucune donnée existante n'est supprimée ni modifiée.

-- CreateEnum
CREATE TYPE "ObserverPartStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED');

-- CreateTable
CREATE TABLE "ObserverPartSubmission" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "videoId" TEXT,
    "status" "ObserverPartStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObserverPartSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObserverPartSubmission_tokenId_idx" ON "ObserverPartSubmission"("tokenId");

-- CreateIndex
CREATE INDEX "ObserverPartSubmission_tokenId_videoId_idx" ON "ObserverPartSubmission"("tokenId", "videoId");

-- AddForeignKey
ALTER TABLE "ObserverPartSubmission" ADD CONSTRAINT "ObserverPartSubmission_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "ObserverAccessToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObserverPartSubmission" ADD CONSTRAINT "ObserverPartSubmission_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
