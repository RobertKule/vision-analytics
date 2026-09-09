# ONA Field

**Plateforme scientifique d'observation vidéo en double insu** — terrain, stats, exports.

ONA Field permet à des chercheurs de mener des **études d'observation vidéo indépendantes** :
un observateur regarde la vidéo d'une expérience et enregistre, à l'image près, les instants qui
correspondent à l'étude — **en toute indépendance**. Les fenêtres de validation et les benchmarks
de l'étude sont **confidentiels** : ils ne sont jamais transmis au client observateur. La
plateforme compare ensuite chaque capture aux fenêtres de référence côté serveur et calcule
**précision, concordance, délai de détection et fausses alertes (points fantômes)**.

Application **bilingue (anglais / français)**, thèmes clair / sombre, pensée pour le **terrain** :
chaque capture confirmée est persistée immédiatement, l'enregistrement survit aux coupures réseau
et reprend où il s'était arrêté.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Rôles & permissions](#rôles--permissions)
- [Flux d'observation](#flux-dobservation)
- [Validation & analyses](#validation--analyses)
- [Exports](#exports)
- [Journal d'audit](#journal-daudit)
- [Architecture](#architecture)
- [Technologies](#technologies)
- [Installation](#installation)
- [Variables d'environnement](#variables-denvironnement)
- [Base de données & migrations](#base-de-données--migrations)
- [Scripts](#scripts)
- [Tests](#tests)
- [Build & déploiement](#build--déploiement)
- [Structure du dépôt](#structure-du-dépôt)
- [Modèle de sécurité](#modèle-de-sécurité)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## Fonctionnalités

**Observation**
- Double insu : l'observateur ne voit jamais les fenêtres cibles, les benchmarks ni les autres observateurs.
- Participation **anonyme** via `/observe` ou **connectée** via `/experience`.
- Capture annotée à l'image : horodatage vidéo, type d'observation, image annotée **compressée en WebP** avant envoi.
- **Persistance immédiate par capture** : la capture confirmée est enregistrée aussitôt (image dans **Google Drive** +
  référence en base), avec des états honnêtes « Compression en cours… » → « Enregistrement en cours… » → « ✓ Capture enregistrée ».
- **Résilience hors-ligne** : états `PENDING` / `SYNCING` / `SYNCED` / `FAILED`, captures en attente conservées sur
  l'appareil, re-synchronisées à la reconnexion, **jamais renvoyées une fois synchronisées** (`clientKey`) ;
  reprise de session après rechargement ou coupure, **aucune donnée perdue**.
- Soumission finale **légère** : validation de la session, certification, passage au statut final — elle ne fait que
  finaliser des captures déjà persistées, sans re-téléversement global.
- Idempotence : `clientKey` + contrainte unique `(projectId, clientKey)` → aucune capture dupliquée après reprise.

**Pilotage (Admin / Analyste)**
- Projets : contexte & protocole, types d'observation, passes vidéo (association type ↔ passe).
- Fenêtres de validation confidentielles en `MM:SS`, benchmark vidéo optionnel.
- Comptes (Admin) : création, activation / désactivation, suppression ; partage entre analystes.

**Analyse & statistiques**
- **Une détection analytique par (observateur + type/décalage + trame)** : plusieurs captures du même
  observateur dans la même trame (fenêtre/type) comptent pour **une seule** détection. La règle est
  identique partout — tableau de bord, analyses, Excel global, Excel par observateur, PDF.
- **Probabilité de détection** : `P(détection) = Détections / (Nombre de points/trames configurés × Nombre
  d'observateurs) × 100`.
- **Relevés bruts** (Données brutes) : conservent **toujours** chaque capture individuelle.
- Précision, concordance inter-observateurs, délai moyen de détection, répartition des fantômes —
  par fenêtre cible, par type/décalage, par observateur.
- Graphiques (Recharts) : distribution temporelle des détections, ventilation valides / fantômes.

**Exports & rapports**
- **Excel global** `ONA_Field_Export_Global_<Projet>_<Date>.xlsx` : feuille Synthèse (Décalage / Nombre de points /
  Observations possibles / Détections / Probabilité empirique / Interprétation, + DÉTAIL PAR POINT +
  SYNTHÈSE PAR OBSERVATEUR), feuille Méthodologie (procédure d'analyse 1-7), une feuille par type/décalage
  (grille Point / Trame vidéo / Observateur en 1/0, Détections, Probabilité) et Données_Brutes_Globales.
- **Excel par observateur** `ONA_Field_Observateur_<Nom>_<Date>.xlsx` : Synthèse (points uniques détectés /
  possibles), une feuille par type/décalage, Données brutes.
- **Rapport PDF** `ONA_Field_Rapport_<Projet>_<Date>.pdf` : vrai fichier PDF téléchargeable via « Télécharger le
  rapport PDF » (pas `window.print`), graphiques réels incorporés.
- **Export PNG des graphiques** en haute résolution.
- RBAC : l'ADMIN exporte tout ; l'ANALYST uniquement ses projets ; l'OBSERVER uniquement ses exports.
- Chaque export est **traçé dans le journal d'audit** et **ré-authentifié côté serveur** (projet + rôle).

**Plateforme**
- Documentation publique `/docs` (guides utilisateurs + référence développeur).
- UI éditoriale (palette lait / crème / encre / or), composants côté serveur + îlots clients.

---

## Rôles & permissions

| Rôle       | Périmètre |
|------------|-----------|
| **ADMIN**  | Tout : projets, utilisateurs, journal d'audit global, statistiques plateforme. Accès `/admin`. |
| **ANALYST**| Uniquement les projets qu'il possède ou qui lui sont partagés (`ProjectAccess`) + leurs analyses/exports. |
| **OBSERVER** | Ses propres sessions d'observation et les expériences actives. Une session connectée **écrase toujours** un identifiant d'observateur (anti-usurpation). |

L'accès est revérifié à **chaque** Server Action et à **chaque** route `/api` (les routes ne s'appuient
jamais sur le proxy). Les routes d'export vérifient `session + accès projet` avant de servir le moindre octet.

---

## Flux d'observation

1. L'observateur ouvre une expérience active (anonyme `/observe` ou connecté `/experience`) et **démarre une session**.
2. Il charge sa propre copie de la vidéo (la plateforme ne diffuse jamais le média).
3. À chaque événement, il met en pause, clique sur l'image et **confirme la capture**.
4. **La capture est enregistrée immédiatement** : compression WebP puis petite requête par image (upload serveur →
   Google Drive + référence en base), marquée « non finalisée » — elle n'apparaît dans aucune statistique.
5. En cas de coupure réseau, la capture reste **en attente sur l'appareil** (état `pending`/`failed`) et est
   re-synchronisée automatiquement à la reconnexion. La session peut être reprise après rechargement.
6. Quand le protocole est terminé, l'observateur **soumet** : la session est validée, ses captures sont
   **certifiées** (visibles des analyses) et les fenêtres cibles leur sont affectées côté serveur.

La re-soumission est idempotente ; la confirmation ne re-téléverse pas l'ensemble des captures.
**Aucune position spatiale de clic n'est persistée** — seule l'image annotée l'est, avec son horodatage.

---

## Validation & analyses

- Les fenêtres cibles (`ProjectPoint`) restent **confidentielles** ; l'affectation capture → fenêtre est
  calculée **serveur** au moment de la certification de la session.
- Seules les sessions **certifiées** (`isVerified`) alimentent les statistiques, le tableau de bord et les exports.
- Règle « détection analytique » : pour un observateur, plusieurs captures dans la même trame (fenêtre) du même
  type/décalage comptent pour **une seule** détection — appliquée à l'identique au tableau de bord, aux analyses,
  à l'Excel global, à l'Excel par observateur et au PDF. Les exports bruts (Données brutes) conservent toutes les
  captures.
- **Probabilité empirique de détection** : `P(détection) = Détections / (Nombre de points/trames configurés × Nombre
  d'observateurs) × 100`.
- Métriques : précision (détections uniques valides / total), concordance (partage d'une fenêtre entre
  observateurs), délai moyen de détection (par événement), répartition des fantômes.

---

## Exports

| Format | Contenu | Fichier |
|--------|---------|---------|
| Excel global | Synthèse (Décalage / Nombre de points / Observations possibles / Détections / Probabilité empirique / Interprétation + DÉTAIL PAR POINT + SYNTHÈSE PAR OBSERVATEUR), Méthodologie (procédure 1-7), une feuille par type/décalage, Données brutes globales (chaque capture, Drive File ID inclus) | `ONA_Field_Export_Global_<Projet>_<Date>.xlsx` |
| Excel observateur | Synthèse (points uniques détectés / possibles), une feuille par type/décalage, Données brutes | `ONA_Field_Observateur_<Nom>_<Date>.xlsx` |
| Rapport PDF | titre, métadonnées, KPI, graphiques réels | `ONA_Field_Rapport_<Projet>_<Date>.pdf` |
| Graphique PNG | graphique en haute résolution | selon export |

La génération Excel/PDF est **exclusivement serveur** ; les graphiques du PDF sont rastérisés côté
client puis ré-embarqués et **validés** avant montage. Chaque export est journalisé (`EXPORT_GLOBAL`,
`EXPORT_OBSERVER`, `EXPORT_PDF`, `EXPORT_CHART`) avec utilisateur + projet — append-only, sans secret.

---

## Journal d'audit

Toutes les actions importantes sont écrites dans un journal **append-only** (`AuditLog`) : authentification,
comptes, projets, vidéos, observations, téléversement/suppression d'images de capture et exports
(`IMAGE_UPLOADED`, `IMAGE_DELETED`, `EXPORT_GLOBAL`, `EXPORT_OBSERVER`, `EXPORT_PDF`, `EXPORT_CHART`).
Les métadonnées ne contiennent **jamais** de mot de passe, jeton ou secret. L'Admin lit le journal global et le
filtre ; chaque autre utilisateur ne lit que sa propre activité.

---

## Architecture

```
                  ┌────────────────────────────────────────────────┐
                  │                 Navigateur                     │
                  │  /observe · /experience · /admin · /analyst    │
                  │  (annotation, brouillons IndexedDB, sync)      │
                  └───────────────────────┬────────────────────────┘
                                          │ HTTPS
                    ┌─────────────────────▼─────────────────────┐
                    │  src/proxy.ts  (middleware Next 16)       │
                    │  redirections RBAC — NE protège pas /api  │
                    └─────────────────────┬─────────────────────┘
                                          │
        ┌─────────────────────────────────┼──────────────────────────────────┐
        ▼                                 ▼                                   ▼
┌──────────────┐              ┌───────────────────┐             ┌───────────────────┐
│ Server Pages │              │ Server Actions     │             │ Route handlers    │
│  (RSC)       │              │  actions/*  →      │             │  /api/admin/...   │
│              │              │  re-vérif session  │             │  self-auth        │
└──────┬───────┘              │  + rôle + projet   │             │  + garde projet   │
       │                      └─────────┬─────────┘             └─────────┬─────────┘
       │              (Prisma ORM)       │                     (Prisma ORM) │
       └───────────────┬─────────────────┴──────────────────────────┬───────┘
                       ▼                                             ▼
              ┌─────────────────────────┐                  ┌────────────────────────┐
              │  PostgreSQL (Neon)      │                  │  Google Drive           │
              │  User · Project · Video │  (serveur)      │  images des captures    │
              │  ProjectPoint ·        │  upload/delete   │  (compte de service —   │
              │  Observation · AuditLog│ ───────────────► │   jamais le navigateur) │
              │  ProjectAccess         │                  └─────────────────────────┘
              └─────────────────────────┘
```

Points clés :
- Les pages rendent côté serveur ; les mutations passent par des **Server Actions gardées**.
- Le proxy ne couvre pas `/api/*` : chaque route **s'authentifie elle-même** (cookie de session signé + garde d'accès projet).
- Les nouvelles images des captures vivent dans **Google Drive** via une couche serveur dédiée (compte de service) ;
  la base ne conserve que `imageUrl` (lien public) + `driveFileId` (interne serveur). Le navigateur ne dialogue
  jamais avec Drive ni n'en voit les identifiants. Les anciennes lignes de l'ère Cloudinary restent lisibles par URL,
  sans téléversement ni suppression via un SDK tiers. Toute suppression d'une capture supprime son fichier Drive
  **avant** la ligne en base (jamais d'orphelin silencieux).
- Le client **anonyme** `/observe` reste hors du proxy et hors des routes d'administration.

---

## Technologies

- **Next.js 16** (App Router, Turbopack) · **React 19** · TypeScript strict
- **Prisma 5** + **PostgreSQL (Neon)**
- **Google Drive API** (stockage des captures annotées — compte de service, serveur uniquement)
- **Tailwind CSS v4** (palette éditoriale) + **next-themes**
- **Recharts** (graphiques), **exceljs** / **jszip** (serveur), **pdf-lib** (rapport PDF), **sonner** (toasts)
- **Vitest** (tests unitaires purs), **ESLint 9**

---

## Installation

Prérequis : **Node.js 20+** et npm.

```bash
npm install            # postinstall exécute `prisma generate`
cp .env.example .env   # renseigner les valeurs — voir Variables d'environnement
npm run db:deploy      # applique les migrations (prisma migrate deploy)
npm run db:seed        # optionnel : premier administrateur
npm run dev            # http://localhost:3000
```

> Production : ne **jamais** exécuter `prisma migrate dev` contre la base vivante — uniquement des migrations
> additives appliquées par `npm run db:deploy`.

---

## Variables d'environnement

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Connexion application PostgreSQL (pooler) |
| `DIRECT_URL` | Connexion directe pour Prisma CLI / migrations |
| `GOOGLE_DRIVE_CLIENT_EMAIL` / `GOOGLE_DRIVE_PRIVATE_KEY` | Stockage des captures annotées (compte de service Google Drive — clé PEM, retours à la ligne échappés acceptés) |
| `GOOGLE_DRIVE_FOLDER_ID` | Optionnel mais **recommandé** — dossier Drive racine des captures. **Le dossier doit appartenir à un Google Shared Drive dont le compte de service est membre** (« Contributeur » au minimum) : un compte de service n'a pas de quota de stockage personnel, et ne peut écrire des fichiers que dans un Shared Drive. S'il est omis, le code cible la racine du compte de service, laquelle refuse les écritures (HTTP 403 « no storage quota »). |
| `AUTH_SECRET` | Signature du cookie de session (obligatoire en production) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Optionnel — bootstrap du premier administrateur (`db:seed`) |

Seuls les **noms** sont listés ici ; aucune valeur réelle n'est jamais versionnée. Les comptes sont gérés en
base de données — l'application ne lit aucune variable d'administrateur au moment de la connexion.

---

## Base de données & migrations

Modèles principaux (`prisma/schema.prisma`) :

| Modèle | Rôle |
|--------|------|
| `User` | Compte (`role` : OBSERVER / ANALYST / ADMIN, `isActive`) |
| `Project` | Étude (`ownerId`, `observationTypes`, `isArchived`) |
| `Video` | Passe vidéo (`projectId`, type associé, benchmark confidentiel optionnel) |
| `ProjectPoint` | Fenêtre cible de validation (`videoId`, `trameDebut`, `trameFin`, `pointType`) |
| `Observation` | Capture (`clientKey`, `sessionRunId`, `isGhostPoint`, `isVerified`, `imageUrl` lien public, `driveFileId` interne serveur ; `imagePublicId` historique conservé en lecture seule), contrainte unique `(projectId, clientKey)` |
| `AuditLog` | Journal append-only (`action`, `actorId`, `targetUserId`, `projectId`, `metadata`) |
| `ProjectAccess` | Partage projet ↔ analyste |

Règle de production : **migrations additives uniquement**, appliquées avec `npm run db:deploy`.

---

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement (Turbopack) |
| `npm run build` | `prisma generate` → `db:deploy` → `next build` |
| `npm start` | Serveur de production |
| `npm run lint` | ESLint (`eslint`) |
| `npm test` | Vitest (`vitest run`) |
| `npm run db:deploy` | Applique les migrations |
| `npm run db:seed` | Seed idempotent (premier administrateur) |

---

## Tests

Tests unitaires **purs** (aucune base, aucun navigateur) sous `src/lib/__tests__/` : extraction des références
Google Drive (URL publiques) et authentification du compte de service, règle de comptage des détections
analytiques, gestionnaires de capture, exports, etc.

```bash
npm test                    # suite complète
npx vitest run src/lib/__tests__/driveRef.test.ts   # un fichier
```

Gates de qualité : `npx tsc --noEmit` · `npx eslint src` · `npm test` · `npm run build`.

---

## Build & déploiement

```bash
npm run build
```

Le build génère le client Prisma, **applique les migrations** puis compile l'application. Puis :

```bash
npm start
```

Conseils de déploiement : fournir toutes les variables de l'[environnement](#variables-denvironnement),
notamment `AUTH_SECRET` (obligatoire en production), et appliquer les migrations avant la première montée de version.

---

## Structure du dépôt

```
src/
 ├── app/
 │   ├── (public)/            # accueil, /docs, /observe, /login, /register
 │   ├── (app)/               # zones connectées
 │   │   ├── admin/           # projets, utilisateurs, historique, analyses
 │   │   ├── analyst/         # projets analyste + analyses
 │   │   ├── dashboard/       # vue d'ensemble, historique, activité, réglages
 │   │   └── experience/      # observation connectée
 │   ├── actions/             # Server Actions (gardées par zone)
 │   └── api/                 # routes /api (exports auto-authentifiés)
 ├── components/
 │   ├── app/                 # coquille, barre latérale, actions utilisateur
 │   ├── public/              # en-tête / pied de page publics
 │   ├── ui/                  # Sheet, StepperRail, VideoUrlPicker…
 │   ├── admin/  analyst/  observe/
 │   └── charts/              # ClientChart (Recharts, sûr pour le SSR)
 ├── lib/                     # auth, session, prisma, i18n, audit, exports, docs…
 ├── proxy.ts                 # middleware Next 16 — redirections RBAC
prisma/
 ├── schema.prisma
 ├── seed.ts
 └── migrations/
```

---

## Modèle de sécurité

- Mots de passe **hachés** ; sessions en cookies **signés httpOnly** ; secret via `AUTH_SECRET`.
- Chaque Server Action et chaque route `/api` **re-vérifie** session, rôle et accès projet.
- `/observe` reste **anonyme** et n'est pas couvert par les routes d'administration.
- Anti-usurpation : une session connectée prime sur tout identifiant d'observateur fourni.
- Confidentialité : les fenêtres cibles et benchmarks n'atteignent jamais le client observateur.
- Journal d'audit **append-only**, sans secret ; les exports sont tracés avec projet et format.

---

## Contribuer

1. Travailler sur une branche de fonctionnalité, pas sur `main`.
2. Conserver les **gates** verts : `npx tsc --noEmit`, `npx eslint src`, `npm test`, `npm run build`.
3. Ne pas versionner `.env*` ni les secrets ; n'écrire que des **noms** de variables dans la documentation.
4. Parité i18n : `fr` reflète `en` (typé `typeof en`) — toute clé ajoutée l'est dans les deux langues.
5. Migrations **additives** uniquement, jamais `prisma migrate dev` en production.
6. Ne pas exporter d'image dupliquée en masse et respecter le protocole d'insu (aucune fuite de fenêtres côté observateur).

---

## Licence

Propriétaire — usage interne. Voir l'équipe projet pour toute question de diffusion.
