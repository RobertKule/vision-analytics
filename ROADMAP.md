# 📑 Spécifications Techniques & Feuille de Route - Vision Analytics

## 🎯 Objectif du Projet
Développer une application web scientifique d'analyse de vidéo-observation en aveugle (Blind Testing).
L'application permet à un **Administrateur** de définir des projets vidéo avec des fenêtres temporelles de validation (*trames*), et à des **Observateurs** d'annoter en temps réel des vidéos locales sans biais, avec détection automatique des fausses alertes (*points fantômes*).

---

## 🛠️ Stack Technique
- **Framework** : Next.js 14+ (App Router, Server Actions)
- **Langage** : TypeScript, Tailwind CSS
- **Base de données** : PostgreSQL hébergé sur **Neon**
- **ORM** : Prisma v5
- **Stockage Médias** : 
  - *Vidéos* : Traitées localement via `URL.createObjectURL` (Blob URL) pour zéro coût/charge serveur.
  - *Captures d'écran annotées* : Téléversées en Base64 sur **Cloudinary** (seule l'URL est stockée en BDD).

---

## 🗄️ Structure du Modèle de Données (Prisma)
- **User** : Admin / Observateur (ID anonymisé `anonymousId` pour le blind test).
- **Project** : Titre, description, référence vidéo locale.
- **ProjectPoint** : Fenêtre scientifique définie par l'Admin (`pointName`, `trameDebut`, `trameFin` en secondes).
- **Observation** : Saisie par l'observateur (`timestampTotal`, `imageUrl` Cloudinary, `isGhostPoint` calculé automatiquement).

---

## 🗺️ Feuille de Route Détaillée (6 Étapes)

### ✅ Étape 1 : Fondations & Configuration des Services (TERMINÉE)
- [x] Initialisation du projet Next.js avec Tailwind CSS & TypeScript.
- [x] Définition du schéma Prisma dans `prisma/schema.prisma`.
- [x] Synchronisation avec la BDD Neon via `prisma db push`.
- [x] Configuration du client Prisma singleton (`src/lib/prisma.ts`).
- [x] Configuration du module Cloudinary (`src/lib/cloudinary.ts`).

---

### ⏳ Étape 2 : Lecteur Vidéo Local & Canevas d'Annotation
- [ ] Création du composant `VideoAnnotator.tsx`.
- [ ] Sélection de vidéo locale (`<input type="file">`) et génération d'une URL Blob.
- [ ] Mise en pause automatique de la vidéo pour activer la superposition `<canvas>`.
- [ ] Outil d'annotation interactive : dessin de cercle rouge sur la vidéo en pause.
- [ ] Capture de l'horodatage exact (`currentTime` en secondes) et de l'image au format Base64.

---

### ⏳ Étape 3 : Module Administrateur (Projets & Trames Temporal)
- [ ] Server Actions pour créer, lister et modifier un projet (`src/app/actions/projectActions.ts`).
- [ ] Interface d'administration pour ajouter des `ProjectPoint` avec leurs fenêtres (`trameDebut`, `trameFin`).
- [ ] Stockage en BDD des fenêtres d'acceptation scientifiques.

---

### ⏳ Étape 4 : Parcours Observateur & Stepper de Validation
- [ ] Interface de session d'observation sans affichage des trames Admin (Principe de l'aveugle).
- [ ] Panneau latéral récapitulatif des captures effectuées pendant la lecture.
- [ ] Stepper de soumission à 3 étapes :
  1. Validation / Suppression des captures.
  2. Vérification de l'anonymat de l'observateur.
  3. Envoi des images vers Cloudinary et enregistrement en BDD Neon.

---

### ⏳ Étape 5 : Moteur de Validation Automatique & Point Fantôme
- [ ] Algorithme serveur comparant `timestampTotal` de l'observation aux trames `[trameDebut, trameFin]`.
- [ ] Si l'horodatage est dans la fenêtre $\rightarrow$ Association au `ProjectPoint`.
- [ ] Si l'horodatage est hors fenêtre $\rightarrow$ Marquage automatique `isGhostPoint = true` (Fausse alerte).
- [ ] Garantie d'anonymat de l'observateur.

---

### ⏳ Étape 6 : Tableau de Bord & Exportation Statistiques
- [ ] Dashboard de restitution pour l'Administrateur.
- [ ] Graphiques et métriques : Taux de détection, nombre de points fantômes par observateur.
- [ ] Module d'exportation des données d'observation au format CSV / Excel.