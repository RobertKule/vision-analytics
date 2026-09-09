-- Stockage des captures annotées : ajout de l'identifiant Google Drive (fileId).
-- Les lignes historiques (stockage Cloudinary) conservent imagePublicId (lecture seule) ;
-- les nouvelles captures sont stockées chez Google Drive et référencées par driveFileId.
ALTER TABLE "Observation" ADD COLUMN "driveFileId" TEXT;
