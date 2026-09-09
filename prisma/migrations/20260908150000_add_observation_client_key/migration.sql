-- Ajout du support idempotence / reprise des brouillons d'observation.
--
-- `clientKey`    : clé de déduplication émise par le client (une capture locale =
--                  un `id`). Couple (projet, clé) unique ; NULL autorisé pour les
--                  lignes historiques — sous un index unique PostgreSQL, plusieurs
--                  NULL sont distincts, donc AUCUNE ligne existante n'entre en
--                  conflit. Une observation sans clé n'est simplement jamais
--                  dédupliquée (repli du serveur, comportement antérieur).
-- `sessionRunId` : jeton de « session » logique (une soumission, toutes passes
--                  confondues), utilisé pour le comptage de sessions par
--                  observateur et la traçabilité. Optionnel (lignes historiques).
--
-- Migration purement additive : aucune donnée existante n'est modifiée.

-- AlterTable
ALTER TABLE "Observation" ADD COLUMN     "clientKey" TEXT,
ADD COLUMN     "sessionRunId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Observation_projectId_clientKey_key" ON "Observation"("projectId", "clientKey");
