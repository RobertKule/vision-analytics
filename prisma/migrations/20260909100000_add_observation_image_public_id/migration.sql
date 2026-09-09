-- Récupération de l'identifiant Cloudinary (public_id) de chaque capture annotée.
-- Colonne additionnelle nullable : les lignes historiques restent inchangées.
ALTER TABLE "Observation" ADD COLUMN "imagePublicId" TEXT;
