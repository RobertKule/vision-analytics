-- Versionnage des analyses (instantanés analytiques IMMUABLES par projet)
-- + droit d'édition explicite sur un partage d'expérience (RBAC analyste).
--
-- Migration purement ADDITIVE : aucune ligne existante n'est supprimée.
--
--  `AnalyticsVersion` : une ligne = un état analytique figé (configuration + métriques)
--  à un instant donné (`dataCutoffAt`). Ces lignes ne sont jamais mises à jour par
--  l'application : l'historique analytique reste exact.
--
--  `ProjectAccess.canEdit` : nouveau droit explicite. Par défaut FALSE (un nouveau
--  partage donne la consultation / l'analyse / l'export, jamais la modification).
--  Les partages DÉJÀ existants sont rétro-remplis à TRUE : ils avaient été créés sous
--  l'ancienne règle « invité = gestion complète », et aucune capacité déjà accordée
--  n'est retirée en silence par cette migration.

-- AlterTable : droit d'édition explicite du partage
ALTER TABLE "ProjectAccess"
    ADD COLUMN     "canEdit" BOOLEAN NOT NULL DEFAULT false;

-- Backfill : les partages antérieurs conservent le droit d'édition qu'ils avaient.
UPDATE "ProjectAccess" SET "canEdit" = true;

-- CreateTable : version analytique immuable
CREATE TABLE "AnalyticsVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataCutoffAt" TIMESTAMP(3) NOT NULL,
    "trigger" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "perimeterHash" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsVersion_projectId_versionNumber_key" ON "AnalyticsVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE INDEX "AnalyticsVersion_projectId_effectiveAt_idx" ON "AnalyticsVersion"("projectId", "effectiveAt");

-- CreateIndex
CREATE INDEX "AnalyticsVersion_projectId_idx" ON "AnalyticsVersion"("projectId");

-- AddForeignKey
ALTER TABLE "AnalyticsVersion" ADD CONSTRAINT "AnalyticsVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
