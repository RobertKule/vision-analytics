-- MIGRATION STRICTEMENT ADDITIVE — déclassement analytique d'un observateur.
--
-- Cette migration CRÉE uniquement : un type énuméré, une table, ses index et ses
-- clés étrangères. Elle ne contient :
--   * AUCUN `DROP`            (aucune table, colonne, index ou contrainte détruit) ;
--   * AUCUN `DELETE`          (aucune ligne supprimée) ;
--   * AUCUN `TRUNCATE`        (aucune table vidée) ;
--   * AUCUN `UPDATE`/`ALTER COLUMN` sur une table existante.
--
-- Les captures RAW, observations, sessions, projets, types et trames/fenêtres
-- existants restent donc strictement inchangés.
--
-- AUCUN BACKFILL N'EST NÉCESSAIRE : l'absence de ligne vaut INCLUDED. Les projets
-- et observateurs existants sont donc réputés inclus sans qu'aucune ligne ne soit
-- écrite — les dénominateurs analytiques actuels ne bougent pas d'un iota.

-- CreateEnum
CREATE TYPE "ObserverAnalysisStatus" AS ENUM ('INCLUDED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "ProjectObserverInclusion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ObserverAnalysisStatus" NOT NULL DEFAULT 'INCLUDED',
    "excludedAt" TIMESTAMP(3),
    "excludedById" TEXT,
    "exclusionReason" TEXT,
    "includedAt" TIMESTAMP(3),
    "includedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectObserverInclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectObserverInclusion_projectId_userId_key" ON "ProjectObserverInclusion"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectObserverInclusion_projectId_status_idx" ON "ProjectObserverInclusion"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectObserverInclusion_userId_idx" ON "ProjectObserverInclusion"("userId");

-- AddForeignKey
ALTER TABLE "ProjectObserverInclusion" ADD CONSTRAINT "ProjectObserverInclusion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectObserverInclusion" ADD CONSTRAINT "ProjectObserverInclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectObserverInclusion" ADD CONSTRAINT "ProjectObserverInclusion_excludedById_fkey" FOREIGN KEY ("excludedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectObserverInclusion" ADD CONSTRAINT "ProjectObserverInclusion_includedById_fkey" FOREIGN KEY ("includedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
