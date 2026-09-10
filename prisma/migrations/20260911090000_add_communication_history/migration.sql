-- HISTORIQUE DES COMMUNICATIONS EMAIL (espace ADMIN).
--
-- Un envoi groupé = N emails individuels. On ne conserve que le RÉSUMÉ (auteur,
-- objet, template, compteurs) — jamais le contenu ni les adresses des destinataires.
--
-- Migration purement ADDITIVE : aucune donnée existante n'est supprimée ni modifiée.

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "subject" TEXT NOT NULL,
    "templateId" TEXT,
    "recipientCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "failureCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Communication_authorId_idx" ON "Communication"("authorId");

-- CreateIndex
CREATE INDEX "Communication_createdAt_idx" ON "Communication"("createdAt");

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
