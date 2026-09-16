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
- Participation **invitée par projet** via un lien de partage (`/share/<jeton>` → `/observe/<projet>`) ou **connectée** via `/experience`.
- Capture annotée à l'image : horodatage vidéo, type d'observation, image annotée **compressée en WebP** avant envoi.
- **Persistance immédiate par capture** : la capture confirmée est enregistrée aussitôt (image dans **Google Drive** +
  référence en base), avec des états honnêtes « Compression en cours… » → « Enregistrement en cours… » → « ✓ Capture enregistrée ».
- **Résilience hors-ligne** : états `PENDING` / `SYNCING` / `SYNCED` / `FAILED`, captures en attente conservées sur
  l'appareil, re-synchronisées à la reconnexion, **jamais renvoyées une fois synchronisées** (`clientKey`) ;
  reprise de session après rechargement ou coupure, **aucune donnée perdue**.
- Soumission finale **légère** : validation de la session, certification, passage au statut final — elle ne fait que
  finaliser des captures déjà persistées, sans re-téléversement global.
- Idempotence : `clientKey` + contrainte unique `(projectId, clientKey)` → aucune capture dupliquée après reprise.
- **Vidéo attendue stricte** : quand un type d'observation est lié à une vidéo configurée, l'observateur doit charger **exactement** cette vidéo (identifiant de passe, sinon nom de fichier exact — jamais un préfixe). Toute autre vidéo, y compris celle d'un autre type, est refusée côté serveur (« Vidéo non autorisée ») ; côté client, la relation `Type ↓ Vidéo attendue` est affichée et l'annotation reste **désactivée** tant que la vidéo chargée ne correspond pas.

**Pilotage (Admin / Analyste)**
- Projets : contexte & protocole, types d'observation, passes vidéo (association type ↔ passe).
- Passes vidéo : associer chaque type à sa **vidéo attendue exacte** ; **dupliquer** une passe (nouvelle entité : fenêtres copiées, jamais d'observations/captures/historique) ou la **modifier** (confirmation explicite si le type a déjà des observations — jamais de réécriture de l'historique).
- Fenêtres de validation confidentielles en `MM:SS`, benchmark vidéo optionnel.
- Filtre de consultation **par type** : observations, passes et fenêtres d'un projet peuvent être restreintes à un **seul** type à la fois, piloté par les types configurés (jamais codé en dur).
- Comptes (Admin) : création, **validation des demandes d'inscription des analystes** (approbation / rejet), activation / désactivation, suppression ; partage entre analystes.

**Analyse & statistiques**
- **Une détection analytique par (observateur + type/décalage + trame)** : plusieurs captures du même
  observateur dans la même trame (fenêtre/type) comptent pour **une seule** détection. La règle est
  identique partout — tableau de bord, analyses, Excel global, Excel par observateur, PDF.
- **Probabilité de détection** : `P(détection) = Σ Détections / Σ Possibles × 100`, où les **possibles** sont
  calculés **type par type** : `possibles(type) = points/trames configurés DU TYPE × observateurs ayant
  réellement participé à ce type`, puis **sommés**. Jamais `points totaux × observateurs totaux`, jamais le
  maximum d'observateurs pris comme base commune, jamais la moyenne des taux des types.
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
| **ANALYST**| Uniquement les projets qu'il possède ou qui lui sont partagés (`ProjectAccess`) + leurs analyses/exports. **Ses propres expériences** : modification, configuration, types, vidéos, duplication, partage, clés observateur. **Expérience partagée** : consultation / analyse / export par défaut ; la **modification** n'est accordée que si le partage donne un **droit d'édition explicite** (`ProjectAccess.canEdit`). La gestion des **utilisateurs** reste réservée à l'ADMIN. |
| **OBSERVER** | Les expériences ouvertes par son **lien de partage** (un jeton = un projet) et ses propres sessions. Une session connectée **écrase toujours** un identifiant d'observateur (anti-usurpation). |

L'accès est revérifié à **chaque** Server Action et à **chaque** route `/api` (les routes ne s'appuient
jamais sur le proxy). Les routes d'export vérifient `session + accès projet` avant de servir le moindre octet.
Modifier un `projectId`, une URL ou un paramètre ne donne jamais accès à une expérience non autorisée : la
décision est **toujours re-calculée côté serveur** sur le projet réel.

### Analystes autorisés sur un projet

L'ADMIN — et le propriétaire du projet — accordent ou retirent explicitement un accès ANALYSTE depuis l'onglet
**« Analystes »** de la fiche projet (`/admin/projects/[id]`). Le registre liste les analystes actifs avec, pour
chacun, la permission réellement accordée :

| Permission | Droit effectif |
|------------|----------------|
| **Visualiser les données** (`ProjectAccess.canEdit = false`) | Voir le projet, ses fenêtres, ses statistiques, ses analyses, ses observations et les exports permis. **Ni** configuration, **ni** partage, **ni** clés observateur, **ni** suppression, **ni** administration des comptes. |
| **Modifier la configuration** (`canEdit = true`) | Tout ce qui précède **+** configuration du projet, partage et création de liens observateur, dans le périmètre du projet uniquement. La gestion des **utilisateurs** reste ADMIN. |

Décocher **révoque** l'accès : le serveur refuse alors toute lecture comme toute mutation, sans qu'**aucune
donnée** ne soit supprimée (ni le compte, ni le projet, ni les observations). Réaccorder l'accès redonne
exactement les mêmes droits. Le mécanisme est **`ProjectAccess`** — il n'existe pas de second modèle d'accès — et
la décision est prise par `resolveProjectPermissions`, appelé par `getCurrentProjectPermissions` **avant** toute
lecture ou écriture.

Un analyste **propriétaire** configure son propre projet sans devenir ADMIN : titre, types d'observation,
passes vidéo, fenêtres (`canConfigure`), partage à des collègues et création des **liens observateurs /
invitations** (`canCreateObserverTokens`). Les suppressions destructrices (projet, vidéo, fenêtre) gardent leur
garde stricte.

### Comptes & validation

- Les **analystes s'inscrivent eux-mêmes** depuis `/register` (rôle `ANALYST` fixe, aucune sélection de rôle) ;
  le compte est créé **inactif** (`accountStatus` `PENDING`) et **aucune session n'est ouverte** à l'inscription.
- Un compte en attente ne peut pas se connecter : un **ADMIN doit l'approuver** (ou le rejeter) depuis `/admin`.
  L'ADMIN peut aussi désactiver / réactiver un compte ; la connexion d'un compte en attente, rejeté ou inactif
  est bloquée (jamais de session ouverte).
- Les **observateurs n'ont pas d'inscription publique** : leur accès provient d'un lien de partage (`/share`)
  ou d'un compte créé par un ADMIN.

---

## Flux d'observation

1. L'observateur ouvre une expérience : par **lien de partage** (`/share/<jeton>` → `/observe/<projet>`, accès restreint à ce seul projet, re-vérifié à chaque requête) ou **connecté** (`/experience`) — puis **démarre une session**.
2. Il charge sa propre copie de la vidéo (la plateforme ne diffuse jamais le média). Si la passe est liée à une **vidéo attendue**, sa copie doit être **exactement** cette vidéo : sinon l'annotation reste désactivée et la capture est refusée au serveur.
3. À chaque événement, il met en pause, clique sur l'image et **confirme la capture**.
4. **La capture est enregistrée immédiatement** : compression WebP puis petite requête par image (upload serveur →
   Google Drive + référence en base), marquée « non finalisée » — elle n'apparaît dans aucune statistique.
5. En cas de coupure réseau, la capture reste **en attente sur l'appareil** (état `pending`/`failed`) et est
   re-synchronisée automatiquement à la reconnexion. La session peut être reprise après rechargement.
6. Quand le protocole est terminé, l'observateur **soumet** : la session est validée, ses captures sont
   **certifiées** (visibles des analyses) et les fenêtres cibles leur sont affectées côté serveur.

La re-soumission est idempotente ; la confirmation ne re-téléverse pas l'ensemble des captures.
**Aucune position spatiale de clic n'est persistée** — seule l'image annotée l'est, avec son horodatage.

**Mode « Modifier » (VideoAnnotator).** Sélectionner une annotation puis cliquer **« Modifier »** **conserve la
sélection** : le même cercle reste visible et actif, le lecteur revient sur la frame de la capture. On peut
déplacer le cercle ou cliquer ailleurs pour **remplacer** son emplacement — même identifiant, même horodatage,
même type, même passe vidéo : seules les coordonnées changent. **Valider** réécrit l'image de la **même**
annotation (aucune nouvelle annotation) ; **Annuler** restaure la position précédente.

**Raccourci clavier.** La touche **`Espace`** sert **uniquement** à basculer **lecture ↔ pause**. Elle ne capture
pas, ne modifie pas, ne supprime pas, ne valide pas, ne change ni de type ni de fenêtre. Dans un champ de saisie
(`input`, `textarea`, `select`, `contenteditable`) ou sur un bouton/lien focalisé, elle conserve son comportement
naturel. Le raccourci fonctionne aussi en **plein écran**. La capture immédiate reste sur des touches distinctes
(`C` / `Entrée`).

**Vidéo attendue (Type ↓ Vidéo).** Quand un type d'observation est associé à une passe vidéo, le serveur
**refuse toute capture** qui n'a pas été produite sur la vidéo exactement configurée : comparaison par
identifiant de passe, sinon par **nom de fichier normalisé exact** (dernier segment d'URL décodé ; aucune
tolérance de préfixe ni de casse), et jamais la vidéo d'un autre type. L'interface montre la relation
`Type ↓ Vidéo attendue` ; tant que la vidéo chargée ne correspond pas, l'annotation est désactivée et le
message suivant s'affiche : « Cette vidéo ne correspond pas à la vidéo configurée pour ce type
d'observation. Veuillez utiliser la vidéo fournie par l'administrateur. » Aucun contournement n'est possible
en altérant la requête (`videoId` ou type inconnus, source absente ou différente → refus).

---

## Validation & analyses

- Les fenêtres cibles (`ProjectPoint`) restent **confidentielles** ; l'affectation capture → fenêtre est
  calculée **serveur** au moment de la certification de la session.
- Seules les sessions **certifiées** (`isVerified`) alimentent les statistiques, le tableau de bord et les exports.
- Règle « détection analytique » : pour un observateur, plusieurs captures dans la même trame (fenêtre) du même
  type/décalage comptent pour **une seule** détection — appliquée à l'identique au tableau de bord, aux analyses,
  à l'Excel global, à l'Excel par observateur et au PDF. Les exports bruts (Données brutes) conservent toutes les
  captures.
- **Probabilité empirique de détection** : `P(détection) = Σ Détections / Σ Possibles × 100`, chaque type portant
  SON dénominateur (`points du type × observateurs participants du type`) — voir
  [Versionnage des analyses](#versionnage-des-analyses).
- Métriques : précision (détections uniques valides / total), concordance (partage d'une fenêtre entre
  observateurs), délai moyen de détection (par événement), répartition des fantômes.

### Versionnage des analyses

L'analyse d'un projet est **versionnée**. Une **version analytique** (`AnalyticsVersion`) est un **instantané
immuable** de l'état analytique à un instant donné : la configuration (fenêtres, types, passes vidéo) **et** les
métriques calculées sur les observations valides disponibles à cette date.

- Une version est créée **uniquement** quand une modification de configuration peut changer le périmètre
  analytique : **ajout / suppression d'une fenêtre ou d'un point**, modification des **types**, ajout /
  modification / suppression / duplication d'une **passe vidéo**. Consulter le dashboard, filtrer, consulter un
  type, l'historique, un export, enregistrer une capture ou une observation **ne crée jamais** de version.
- **AJOUTER UNE FENÊTRE NE SUPPRIME PAS LE PASSÉ.** Les détections déjà réalisées restent comptabilisées
  (le **numérateur** ne baisse jamais) ; seul le **dénominateur** augmente. Le dénominateur est calculé
  **type par type** : `observations possibles = Σ (fenêtres du type × observateurs ayant réellement participé
  à ce type)`. Chaque type garde son propre dénominateur — jamais `points totaux × observateurs totaux`,
  jamais le maximum d'observateurs pris comme base commune — et le taux global est **pondéré** par ces vrais
  dénominateurs (`Σ détections / Σ possibles`), jamais une moyenne de pourcentages. L'analyse actuelle combine **anciennes données valides + nouvelles données valides**.
- Chaque version historique est **immuable** : elle n'est jamais recalculée avec la configuration ou les données
  apparues après elle. Exemple : `V1` = 10 fenêtres / 8 détections / 10 possibles ; `V2` (ajout fenêtre 11) =
  11 fenêtres / 8 détections / 11 possibles ; `V3` (détection sur la fenêtre 11) = 11 / 9 / 11.
- Dans le tableau de bord, on peut afficher **« l'analyse actuelle »** ou **« l'analyse avant le : »** une date
  (filtre de **versions**, pas de captures) — qui sélectionne la dernière version disponible à cette date.
- **Dashboard = Excel = PDF.** Tous les exports partent de la **même source analytique** ; un export sans paramètre
  utilise l'**analyse actuelle**, `?versionId=` / `?before=YYYY-MM-DD` exportent la version historique figée.

### Comparaisons (onglet « Comparaisons »)

Deux lectures, **un seul moteur** : chaque type comparé est résolu par `resolveAnalyticsView` — le point d'entrée
du tableau de bord et de tous les exports — et la comparaison se contente de **mettre en regard** les résultats.

- **Par type** : matrice `point × type` (taux de détection, observateurs détecteurs, détections, délai moyen) et
  tableau des indicateurs par type, avec le dénominateur de chaque type (`points du type × observateurs participants`).
- **Par groupes (A/B)** : on répartit les types du projet en **Groupe A** et **Groupe B** (au moins un type par
  groupe, **aucun type dans les deux**, aucun doublon). Les groupes ne sont qu'une **agrégation** :

  ```
  possibles(groupe) = Σ (points du type × observateurs ayant participé à ce type)
  détections(groupe) = Σ détections du type
  taux(groupe) = Σ détections / Σ possibles        ← pondéré, jamais une moyenne de taux
  ```

  Résultat : un tableau (points possibles, détections, non détectés, taux pondéré, fausses alertes) et **un
  graphique circulaire par groupe** (détectés / non détectés), alimentés par **les mêmes chiffres** que le tableau.
  Un type ne pouvant appartenir qu'à un groupe, les points possibles ne sont jamais comptés deux fois.

---

## Exports

| Format | Contenu | Fichier |
|--------|---------|---------|
| Excel global | Synthèse (Décalage / Nombre de points / Observations possibles / Détections / Probabilité empirique / Interprétation + DÉTAIL PAR POINT + SYNTHÈSE PAR OBSERVATEUR), Méthodologie (procédure 1-7), une feuille par type/décalage, Données brutes globales (chaque capture avec son **Lien image** Drive + Drive File ID) | `ONA_Field_Export_Global_<Projet>_<Date>.xlsx` |
| Excel observateur | Synthèse (points uniques détectés / possibles), une feuille par type/décalage, Données brutes (Lien image par capture le cas échéant) | `ONA_Field_Observateur_<Nom>_<Date>.xlsx` |
| Rapport PDF | titre, métadonnées, KPI, graphiques réels | `ONA_Field_Rapport_<Projet>_<Date>.pdf` |
| Graphique PNG | graphique en haute résolution | selon export |

Chaque ligne brute d'un export inclut une colonne **« Lien image »** : le lien
`https://drive.google.com/file/d/<id>/view` de la capture quand son fichier Drive existe, **vide sinon** — un
même format partout (exports globaux, par observateur et données brutes). Ce lien sert à la **consultation** de
l'export (un profil autorisé ouvre le fichier sur Drive) : **les fichiers ne sont jamais rendus publics**.

**Affichage dans l'application.** Les captures Google Drive restent **privées** ; un lien Drive privé ne s'affiche
pas dans une balise `<img>`. L'application les affiche donc via un **endpoint serveur sécurisé**
`GET /api/captures/<captureId>/image` qui : récupère la capture, résout son `driveFileId`, **vérifie la session et
l'autorisation** (ADMIN → tout ; ANALYSTE → ses projets ; OBSERVATEUR → ses propres captures), lit les octets via
le compte de service, puis renvoie l'image avec le bon `Content-Type` et un cache **privé**. Un `captureId`
falsifié ne donne jamais accès à la capture d'un autre projet ; en cas d'échec, l'interface affiche
**« Image indisponible »** (aucun détail technique).

La génération Excel/PDF est **exclusivement serveur** ; les graphiques du PDF sont rastérisés côté
client puis ré-embarqués et **validés** avant montage. Chaque export est journalisé (`EXPORT_GLOBAL`,
`EXPORT_OBSERVER`, `EXPORT_PDF`, `EXPORT_CHART`) avec utilisateur + projet — append-only, sans secret.

---

## Notifications & emails

- **Notifications in-app** (`Notification`) : un utilisateur ne consulte QUE ses notifications (lecture /
  marquage re-vérifiés côté serveur). Événements : compte approuvé/refusé, expérience partagée, demande de
  réactivation, partie envoyée, session terminée, etc.
- **Emails transactionnels (Resend)** : service centralisé `src/lib/email.ts` — expéditeur **« ONA Field »**,
  objets clairs et explicites, contenu professionnel lisible sur mobile. `RESEND_API_KEY` reste **côté serveur**
  (jamais dans le frontend, jamais versionnée).
- **Invitations observateurs multiples** : un ou plusieurs emails → **un email = un token = une session**. Chaque
  destinataire reçoit SON lien `/share/<token>`, sa session et ses observations totalement isolées. Le jeton brut
  n'apparaît que dans le lien de l'email (jamais en base, jamais dans les logs).
- **Canal futur** : l'orchestrateur `notify()` (in-app + email) est le point d'insertion d'un futur canal WhatsApp
  sans modifier les actions métier.
- Variables : `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `APP_URL` (voir `.env.example`).

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
                  │  /share·/observe · /experience · /admin…       │
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
- `/observe` (client observateur) reste **hors du proxy** et hors des routes d'administration.
- L'accès observateur est **par invitation** (`/share/<jeton>` → `/observe/<projet>`) : le jeton est stocké
  **haché**, un compte observateur lié est créé une seule fois, et un cookie signé `va_observer` (portée =
  **un seul projet**) est re-vérifié en base à **chaque** requête — jeton révoqué ou expiré → refus.
  `/observe` n'énumère aucune expérience : hors lien valide, il affiche un panneau « sur invitation ».

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
| `RESEND_API_KEY` | Emails transactionnels (Resend) — **serveur uniquement** |
| `EMAIL_FROM` | Adresse réelle d'envoi (expéditeur affiché : « ONA Field ») |
| `EMAIL_REPLY_TO` | Optionnel — adresse de réponse |
| `APP_URL` | Base publique pour les liens des emails (ex. `https://onafield.example.com`) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Optionnel — bootstrap du premier administrateur (`db:seed`) |

Seuls les **noms** sont listés ici ; aucune valeur réelle n'est jamais versionnée. Les comptes sont gérés en
base de données — l'application ne lit aucune variable d'administrateur au moment de la connexion.

---

## Base de données & migrations

Modèles principaux (`prisma/schema.prisma`) :

| Modèle | Rôle |
|--------|------|
| `User` | Compte (`role` : OBSERVER / ANALYST / ADMIN, `isActive`, `accountStatus` : PENDING / APPROVED / REJECTED) |
| `Project` | Étude (`ownerId`, `observationTypes`, `isArchived`) |
| `Video` | Passe vidéo (`projectId`, type associé, **source vidéo attendue exacte**, benchmark confidentiel optionnel) |
| `ProjectPoint` | Fenêtre cible de validation (`videoId`, `trameDebut`, `trameFin`, `pointType`) |
| `Observation` | Capture (`clientKey`, `sessionRunId`, `isGhostPoint`, `isVerified`, `imageUrl` lien public, `driveFileId` interne serveur ; `imagePublicId` historique conservé en lecture seule), contrainte unique `(projectId, clientKey)` |
| `AuditLog` | Journal append-only (`action`, `actorId`, `targetUserId`, `projectId`, `metadata`) |
| `ProjectAccess` | Partage projet ↔ analyste |
| `ObserverAccessToken` | Jeton de partage observateur par projet (stocké **haché**, statut, lien vers l'observateur créé) |

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
analytiques, validation de la vidéo attendue (parties Q/U), décisions de duplication des passes vidéo (partie T),
filtre de consultation par type (partie S), gestionnaires de capture, exports, etc.

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
 │   ├── (public)/            # accueil, /docs, /share, /observe, /login, /register
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
 ├── lib/                     # auth, session, observerAccess, prisma, i18n, audit, exports, docs…
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
- Accès observateur **par invitation** : `/share/<jeton>` ouvre un projet précis via un jeton **haché** (cookie
  signé `va_observer`, portée = un projet, re-vérifié en base) ; `/share` et `/observe` ne relèvent d'aucune
  route d'administration.
- **Intégrité vidéo** : une passe typée exige sa vidéo exacte — comparaison serveur par identifiant de passe
  puis nom de fichier normalisé (aucun préfixe) ; un `videoId`, un type ou une source altérés à la main sont
  refusés **avant tout stockage**.
- **Inscriptions encadrées** : les analystes s'inscrivent en `PENDING` (inactifs, aucune session) ; les
  observateurs n'ont pas d'inscription publique (jeton de partage ou compte ADMIN) ; seul un ADMIN approuve ou rejette.
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
