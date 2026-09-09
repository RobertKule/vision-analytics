/**
 * Contenu de la documentation publique (`/docs`) — niveau « Utilisateurs » et
 * niveau « Développeurs ». Bilinguisme EN/FR avec des structures identiques
 * (parité de clés), comme le dictionnaire i18n. Aucune variable d'environnement
 * réelle, aucun secret : seuls les NOMS des variables sont cités.
 *
 * Documentation « vivante » : reflète le comportement réel du code (rôles,
 * fenêtres de validation confidentielles, exports, audit append-only…).
 */

import type { Locale } from '@/lib/i18n'

export type DocsBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'code'; text: string }

export type DocsSection = {
  id: string
  title: string
  intro?: string
  blocks: DocsBlock[]
}

export type DocsLocale = {
  metaTitle: string
  heroEyebrow: string
  heroTitle: string
  heroIntro: string
  /** Libellé du bloc de navigation latérale (bouton mobile + aria). */
  navTitle: string
  tocUsers: string
  tocDevs: string
  usersIntro: string
  devsIntro: string
  users: DocsSection[]
  devs: DocsSection[]
}

const en: DocsLocale = {
  metaTitle: 'Documentation — ONA Field',
  heroEyebrow: 'Documentation',
  heroTitle: 'Guides & technical reference',
  heroIntro:
    'Two reading levels: how to use the platform as an Observer, Analyst or Administrator, then the technical documentation for developers and maintainers.',
  navTitle: 'Contents',
  tocUsers: 'User guides',
  tocDevs: 'Developer reference',
  usersIntro: 'Practical guides by profile.',
  devsIntro: 'Architecture, security and operations of the codebase.',
  users: [
    {
      id: 'about',
      title: 'About ONA Field',
      intro: 'A scientific video-observation platform.',
      blocks: [
        {
          kind: 'p',
          text: 'ONA Field lets researchers run independent video-observation studies. An observer watches an experiment video and records the exact moments (frames) that match the study — in full independence: validation windows are never shown to observers. The platform compares each observer’s captures with the study’s reference windows and computes precision, concordance and false-alert (ghost point) statistics.',
        },
        {
          kind: 'p',
          text: 'The application is bilingual (English / French) and works in light and dark themes. There are three profiles: Observer, Analyst and Administrator.',
        },
      ],
    },
    {
      id: 'observer',
      title: 'Observer guide',
      intro: 'Participate in an active experiment.',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Open the experiment page (/experience) signed in, or the public session page (/observe) as an anonymous participant.',
            'Choose an active experiment, then start an observation session.',
            'Load the experiment video (your own copy — the platform never streams it).',
            'Watch, and at each event to record, pause, click on the frame, then confirm the capture.',
            'Each confirmed capture is compressed to WebP on the device, then saved to the server immediately (upload + reference). Honest per-capture statuses — “Compression en cours…”, “Enregistrement en cours…”, then “✓ Capture enregistrée” — confirm each step; you can keep watching without waiting.',
            'Select the observation type if the study offers several, or let the video pass impose its bound type.',
            'Move to the next video pass (or type) when required by the protocol.',
            'Interrupt freely — offline, browser closed: captures waiting for the network stay on the device and synchronize automatically on reconnection. You resume the same session later.',
            'When the protocol is complete, submit the batch: the server validates the session and certifies its captures. Submitting is light — it never re-uploads the whole set.',
          ],
        },
        {
          kind: 'p',
          text: 'A capture keeps its video timestamp, its observation type and the annotated image. Certification happens when the session is submitted: the server then judges each capture against the confidential windows (validated or ghost point) without ever sending them to you. The position of your clicks is not recorded, and you never see the study’s reference windows or its benchmarks.',
        },
      ],
    },
    {
      id: 'analyst',
      title: 'Analyst guide',
      intro: 'Create studies and interpret the results.',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Consult your projects in the analyst space; each one is yours or shared with you.',
            'Create an experiment: title, context & protocol, then a target video.',
            'Define the confidential validation windows (time bounds, MM:SS) against which observer captures will be judged.',
            'Share the project with an analyst colleague by username when a review is needed.',
            'Open the analytics of a project to read precision, concordance and the ghost distribution.',
            'Filter by observation type, video or observer, then export the results.',
          ],
        },
        {
          kind: 'p',
          text: 'Exports available: the global Excel workbook `ONA_Field_Export_Global_<Projet>_<Date>.xlsx` (Synthèse + Méthodologie + one sheet per type/décalage + raw global data), the per-observer Excel workbook `ONA_Field_Observateur_<Nom>_<Date>.xlsx`, and a scientific report downloadable as a real PDF (`ONA_Field_Rapport_<Projet>_<Date>.pdf`). Analysts never see another analyst’s projects.',
        },
      ],
    },
    {
      id: 'admin',
      title: 'Administrator guide',
      intro: 'Run the platform.',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Create projects, configure their observation types and associate video passes.',
            'Define target validation windows (they stay secret from observers) and the optional video benchmark.',
            'Manage accounts: create Observers, Analysts and Administrators, activate, deactivate or delete them.',
            'Archive a finished project (data is kept) or restore it.',
            'Read the activity log (who did what, on which resource, when) with filters by user, action, resource type, project and date.',
            'Follow the real statistics on the dashboard: projects, users, videos, validation rate.',
          ],
        },
        {
          kind: 'p',
          text: 'Only Administrators access /admin. The audit log is append-only: users can never alter or delete their own entries.',
        },
      ],
    },
  ],
  devs: [
    {
      id: 'architecture',
      title: 'Architecture',
      intro: 'Next.js App Router + server-first data.',
      blocks: [
        {
          kind: 'p',
          text: 'ONA Field is a Next.js 16 App Router application (React 19, Turbopack). Pages render on the server; mutations go through Server Actions guarded on every call. A proxy (Next 16 middleware convention) redirects by role, and every /api route also authenticates itself. Tailwind v4 provides the milk / cream / ink / slate / gold editorial palette.',
        },
      ],
    },
    {
      id: 'frontend',
      title: 'Frontend',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Server components for data pages; isolated client components (annotator, sheets, charts) keep their state across SPA navigation.',
            'i18n EN/FR: one dictionary with mirrored keys (fr mirrors en by type).',
            'Light/dark themes via next-themes with Tailwind v4 custom dark variant.',
            'Charts are SSR-safe: rendered client-side only after mount.',
          ],
        },
      ],
    },
    {
      id: 'backend',
      title: 'Backend',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Server Actions grouped by zone (auth, user admin, projects, analyst, observations, dashboard). Each action re-checks the session and the role.',
            'Route handlers under /api are not covered by the proxy; they self-authenticate with the signed session cookie and the project-access guard.',
            'Capture images are stored in Google Drive by a server-only service-account layer (upload, delete, metadata, folder); the browser never talks to Drive nor sees credentials, and PostgreSQL keeps only `imageUrl` + `driveFileId`.',
            'Excel (exceljs) and ZIP (jszip) generation are server-only, never bundled client-side.',
          ],
        },
      ],
    },
    {
      id: 'prisma',
      title: 'Data model & migrations',
      blocks: [
        {
          kind: 'p',
          text: 'PostgreSQL (Neon) accessed through Prisma. Core models: User (role, isActive), Project (owner, observationTypes, isArchived), Video (bound observation type, confidential benchmark), ProjectPoint (confidential validation windows), Observation (clientKey + sessionRunId), AuditLog (append-only journal), ProjectAccess (sharing).',
        },
        {
          kind: 'p',
          text: 'Production rule: never run `prisma migrate dev`. Additive migrations are generated against the live database and applied with `npm run db:deploy` (`prisma migrate deploy`).',
        },
      ],
    },
    {
      id: 'authentication',
      title: 'Authentication',
      blocks: [
        {
          kind: 'p',
          text: 'Passwords are hashed; sessions are signed httpOnly cookies, parsed read-only by the proxy and trusted by Server Actions. Authentication events (login success/failure, logout) are written to the audit log.',
        },
      ],
    },
    {
      id: 'rbac',
      title: 'Access control (RBAC)',
      blocks: [
        {
          kind: 'ul',
          items: [
            'ADMIN: everything — all projects, users and the global audit log.',
            'ANALYST: only projects they own or that are shared with them (ProjectAccess).',
            'OBSERVER: their own sessions and authorized experiments; a logged-in session always overrides an observer identifier (anti-impersonation).',
            'Audit log protection: ADMIN sees all logs, ANALYST and OBSERVER only their own — the server never accepts a target userId.',
          ],
        },
      ],
    },
    {
      id: 'observation',
      title: 'Observation workflow',
      blocks: [
        {
          kind: 'p',
          text: 'Independent observation: each confirmed capture is persisted immediately as a “non-certified” observation (isVerified=false), invisible to statistics. At session finalize the server certifies the whole run (isVerified=true) and matches each capture timestamp against the confidential windows of its own video pass to tag it validated or ghost (false alert). Reference windows and benchmarks never reach the observer client. Spatial click positions are not persisted. Capture images are stored in Google Drive through a server-only service-account layer: the browser never talks to Drive nor sees its credentials, and PostgreSQL keeps only a public link (`imageUrl`) plus a server-internal Drive file id (`driveFileId`). Legacy rows from the former Cloudinary era stay readable through their stored URL but are no longer uploaded or deleted through any third-party SDK.',
        },
        {
          kind: 'ul',
          items: [
            'Idempotent submission: each capture carries a clientKey; the unique (projectId, clientKey) constraint and skipDuplicates prevent duplicates after a retry.',
            'Each stepper run emits a sessionRunId that powers the real “sessions” counters.',
          ],
        },
      ],
    },
    {
      id: 'video-type',
      title: 'Videos & observation types',
      blocks: [
        {
          kind: 'p',
          text: 'A project offers a set of observation types. Videos can be bound to a type: their pass then forces that type on the observer. Legacy single-video projects keep a generic pass. The observer never sees a video duration or benchmark.',
        },
      ],
    },
    {
      id: 'analytics',
      title: 'Analytics',
      blocks: [
        {
          kind: 'p',
          text: 'Per-project analytics apply a single detection rule on every surface (dashboard, analytics, global Excel, per-observer Excel, PDF): for one observer, several captures inside the same frame/type-décalage window count as ONE analytical detection. The empirical probability of detection is P(detection) = detections ÷ (configured points/frames × observers) × 100. Only certified sessions (isVerified=true) feed these counters, while raw exports (Données brutes) always keep every capture line. Charts (Recharts) render the time distribution of detections and the validated/ghost split.',
        },
      ],
    },
    {
      id: 'exports',
      title: 'Exports',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Global Excel export `ONA_Field_Export_Global_<Projet>_<Date>.xlsx`: a Synthèse sheet (table of Décalage / Nombre de points / Observations possibles / Détections / Probabilité empirique / Interprétation, with a DÉTAIL PAR POINT section and a SYNTHÈSE PAR OBSERVATEUR section), a Méthodologie sheet (PROCÉDURE D’ANALYSE 1–7 and the note that frames are the observation unit — several captures of the same observer inside the same frame count as one analytical detection), one sheet per type/décalage (grid of Point / Trame vidéo / Observer cells in 1/0, plus Détections and Probabilité), and a Données_Brutes_Globales sheet listing every capture (including its Drive file id).',
            'Per-observer Excel export `ONA_Field_Observateur_<Nom>_<Date>.xlsx`: a Synthèse sheet (unique points detected over possible), one sheet per type/décalage and a Données_Brutes sheet.',
            'Scientific report as a real PDF file (title, metadata, KPIs and the report charts) — download button “Télécharger le rapport PDF”, filename ONA_Field_Rapport_<Projet>_<Date>.pdf.',
            'Chart PNG export (high resolution) from the analytics views.',
          ],
        },
        {
          kind: 'p',
          text: 'Every export is traced in the append-only audit log (EXPORT_GLOBAL, EXPORT_OBSERVER, EXPORT_PDF, EXPORT_CHART) with its author and project — never any secret. Access follows RBAC: ADMIN exports anything, ANALYST only the projects they own or that are shared with them, OBSERVER only their own exports.',
        },
      ],
    },
    {
      id: 'audit',
      title: 'Audit logs',
      blocks: [
        {
          kind: 'p',
          text: 'Important actions are written to an append-only AuditLog: authentication, accounts, projects, videos, observation submissions, capture image events and exports (IMAGE_UPLOADED, IMAGE_DELETED, EXPORT_GLOBAL, EXPORT_OBSERVER, EXPORT_PDF, EXPORT_CHART). Metadata never contains passwords, tokens or secrets. The ADMIN history page filters by user, action, resource type, project and date; each other user only ever reads “My activity”.',
        },
      ],
    },
    {
      id: 'drafts',
      title: 'Local drafts',
      blocks: [
        {
          kind: 'p',
          text: 'Each confirmed capture is compressed to WebP on the device, then sent to the server and tracked locally until confirmed (states PENDING → SYNCING → SYNCED; FAILED while offline). The user sees honest statuses: “Compression en cours…”, “Enregistrement en cours…”, then “✓ Capture enregistrée”. Captures waiting for the network stay on the device (IndexedDB, keyed by owner + project) and are retried on reconnection; a synced capture is never re-sent (clientKey idempotency). A stable session runId lets the observer resume the same session after a reload or an offline interruption — nothing is lost. Finalizing the session clears the draft and only finalizes already-persisted captures.',
        },
      ],
    },
    {
      id: 'installation',
      title: 'Installation & environment',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Prerequisites: Node.js 20+ and npm.',
            'Install dependencies: `npm install` (postinstall runs `prisma generate`).',
            'Copy `.env.example` to `.env` and fill the placeholder values (DATABASE_URL, DIRECT_URL, the Google Drive storage variables GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY, optional GOOGLE_DRIVE_FOLDER_ID, AUTH_SECRET, optional SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).',
            'Apply the schema to the database: `npm run db:deploy`.',
            'Optional first administrator: `npm run db:seed`.',
            'Development: `npm run dev`.',
            'Checks: `npx tsc --noEmit`, `npx eslint src`, `npm test`.',
            'Production build: `npm run build` (generates the Prisma client, deploys migrations, then builds).',
          ],
        },
        {
          kind: 'code',
          text: 'DATABASE_URL               // PostgreSQL (Neon), application connection\nDIRECT_URL                 // direct connection for Prisma CLI / migrations\nGOOGLE_DRIVE_CLIENT_EMAIL  // service-account email for capture-image storage\nGOOGLE_DRIVE_PRIVATE_KEY   // service-account RSA private key (PEM, escaped line breaks ok)\nGOOGLE_DRIVE_FOLDER_ID     // optional — root Drive folder for capture images\nAUTH_SECRET                // session cookie signing (required in production)\nSEED_ADMIN_EMAIL           // optional, for `prisma db seed`\nSEED_ADMIN_PASSWORD        // optional, for `prisma db seed`',
        },
      ],
    },
    {
      id: 'structure',
      title: 'Repository structure',
      blocks: [
        {
          kind: 'code',
          text: 'src/\n ├── app/\n │   ├── (public)/        # home, /docs, /observe, /login, /register\n │   ├── (app)/            # authed areas\n │   │   ├── admin/        # projects, users, history\n │   │   ├── analyst/      # analyst projects + analytics\n │   │   ├── dashboard/    # overview, history, activity, settings\n │   │   └── experience/   # signed-in observation\n │   ├── actions/          # Server Actions (guarded per zone)\n │   └── api/              # route handlers (self-authenticated exports)\n ├── components/\n │   ├── app/              # shell, sidebar, user actions\n │   ├── public/           # public header / footer\n │   └── ui, admin, analyst, observe…\n ├── lib/                  # auth, prisma, i18n, audit, export helpers…\n ├── proxy.ts              # Next 16 middleware — RBAC redirects\nprisma/\n ├── schema.prisma\n └── migrations/',
        },
      ],
    },
  ],
}

const fr: DocsLocale = {
  metaTitle: 'Documentation — ONA Field',
  heroEyebrow: 'Documentation',
  heroTitle: 'Guides & référence technique',
  heroIntro:
    'Deux niveaux de lecture : utiliser la plateforme en tant qu’observateur, analyste ou administrateur, puis la documentation technique pour développeurs et mainteneurs.',
  navTitle: 'Table des matières',
  tocUsers: 'Guides utilisateurs',
  tocDevs: 'Référence développeur',
  usersIntro: 'Guides pratiques par profil.',
  devsIntro: 'Architecture, sécurité et exploitation du code.',
  users: [
    {
      id: 'about',
      title: 'À propos d’ONA Field',
      intro: 'Une plateforme scientifique d’observation vidéo.',
      blocks: [
        {
          kind: 'p',
          text: 'ONA Field permet aux chercheurs de mener des études d’observation vidéo indépendantes. Un observateur regarde la vidéo d’une expérience et enregistre les instants précis (images) qui correspondent à l’étude — en toute indépendance : les fenêtres de validation ne sont jamais montrées à l’observateur. La plateforme compare les captures de chaque observateur aux fenêtres de référence et calcule précision, concordance et statistiques de fausses alertes (points fantômes).',
        },
        {
          kind: 'p',
          text: 'L’application est bilingue (anglais / français) et disponible en thème clair et sombre. Trois profils existent : observateur, analyste et administrateur.',
        },
      ],
    },
    {
      id: 'observer',
      title: 'Guide Observateur',
      intro: 'Participer à une expérience active.',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Ouvrez la page des expériences (/experience) connecté, ou la session publique (/observe) en participant anonyme.',
            'Choisissez une expérience active, puis démarrez une session d’observation.',
            'Chargez la vidéo de l’expérience (votre propre copie — la plateforme ne la diffuse jamais).',
            'Regardez, puis à chaque événement à relever, mettez en pause, cliquez sur l’image puis confirmez la capture.',
            'Chaque capture confirmée est compressée en WebP sur l’appareil puis enregistrée sur le serveur immédiatement (téléversement + référence). Des états honnêtes par capture — « Compression en cours… », « Enregistrement en cours… », puis « ✓ Capture enregistrée » — le confirment ; vous pouvez continuer à regarder sans attendre.',
            'Sélectionnez le type d’observation si l’étude en propose plusieurs, ou laissez la passe vidéo imposer son type associé.',
            'Passez à la passe vidéo (ou au type) suivante si le protocole l’exige.',
            'Interrompez librement — hors-ligne, navigateur fermé : les captures en attente du réseau restent sur l’appareil et se synchronisent automatiquement à la reconnexion. Vous reprenez la même session plus tard.',
            'Quand le protocole est terminé, soumettez le lot : le serveur valide la session et certifie ses captures. La soumission est légère — elle ne re-téléverse jamais l’ensemble.',
          ],
        },
        {
          kind: 'p',
          text: 'Une capture conserve son horodatage vidéo, son type d’observation et l’image annotée. La certification a lieu à la soumission de la session : le serveur juge alors chaque capture contre les fenêtres confidentielles (validée ou point fantôme) sans jamais vous les transmettre. La position de vos clics n’est pas enregistrée, et vous ne voyez jamais les fenêtres de référence ni les benchmarks de l’étude.',
        },
      ],
    },
    {
      id: 'analyst',
      title: 'Guide Analyste',
      intro: 'Créer des études et interpréter les résultats.',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Consultez vos projets dans l’espace analyste ; chacun vous appartient ou vous est partagé.',
            'Créez une expérience : titre, contexte & protocole, puis une vidéo cible.',
            'Définissez les fenêtres de validation confidentielles (bornes temporelles, MM:SS) contre lesquelles les captures des observateurs seront jugées.',
            'Partagez le projet avec un collègue analyste (par nom d’utilisateur) lorsqu’une relecture est nécessaire.',
            'Ouvrez les analyses d’un projet pour lire précision, concordance et répartition des fantômes.',
            'Filtrez par type d’observation, vidéo ou observateur, puis exportez les résultats.',
          ],
        },
        {
          kind: 'p',
          text: 'Exports disponibles : classeur Excel global `ONA_Field_Export_Global_<Projet>_<Date>.xlsx` (Synthèse + Méthodologie + une feuille par type/décalage + données brutes globales), classeur Excel par observateur `ONA_Field_Observateur_<Nom>_<Date>.xlsx`, et rapport scientifique téléchargeable en vrai PDF (`ONA_Field_Rapport_<Projet>_<Date>.pdf`). Un analyste ne voit jamais les projets d’un autre analyste.',
        },
      ],
    },
    {
      id: 'admin',
      title: 'Guide Administrateur',
      intro: 'Exploiter la plateforme.',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Créez les projets, configurez leurs types d’observation et associez les passes vidéo.',
            'Définissez les fenêtres cibles de validation (confidentielles pour les observateurs) et le benchmark vidéo optionnel.',
            'Gérez les comptes : créez observateurs, analystes et administrateurs, activez, désactivez ou supprimez.',
            'Archivez un projet terminé (les données sont conservées) ou restaurez-le.',
            'Consultez le journal d’activité (qui a fait quoi, sur quelle ressource, quand) avec des filtres par utilisateur, action, type de ressource, projet et date.',
            'Suivez les statistiques réelles du tableau de bord : projets, utilisateurs, vidéos, taux de validation.',
          ],
        },
        {
          kind: 'p',
          text: 'Seuls les administrateurs accèdent à /admin. Le journal d’audit est en écriture seule : les utilisateurs ne peuvent jamais modifier ni supprimer leurs propres entrées.',
        },
      ],
    },
  ],
  devs: [
    {
      id: 'architecture',
      title: 'Architecture',
      intro: 'Next.js App Router + données côté serveur.',
      blocks: [
        {
          kind: 'p',
          text: 'ONA Field est une application Next.js 16 App Router (React 19, Turbopack). Les pages sont rendues côté serveur ; les mutations passent par des Server Actions gardées à chaque appel. Un proxy (convention middleware Next 16) redirige selon le rôle, et chaque route /api s’authentifie également elle-même. Tailwind v4 fournit la palette éditoriale lait / crème / encre / ardoise / or.',
        },
      ],
    },
    {
      id: 'frontend',
      title: 'Frontend',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Composants serveur pour les pages de données ; composants clients isolés (annotateur, tiroirs, graphiques) qui conservent leur état entre navigations SPA.',
            'i18n EN/FR : un dictionnaire aux clés miroirs (fr reflète en par typage).',
            'Thème clair/sombre via next-themes avec variante sombre Tailwind v4.',
            'Graphiques sûrs pour le SSR : rendus côté client uniquement après montage.',
          ],
        },
      ],
    },
    {
      id: 'backend',
      title: 'Backend',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Server Actions regroupées par zone (auth, admin utilisateurs, projets, analyste, observations, tableau de bord). Chaque action re-vérifie session et rôle.',
            'Les gestionnaires de routes /api ne sont pas couverts par le proxy ; ils s’authentifient eux-mêmes avec le cookie de session signé et la garde d’accès projet.',
            'Les images des captures sont stockées dans Google Drive par une couche serveur dédiée (compte de service : téléversement, suppression, métadonnées, dossier) ; le navigateur ne dialogue jamais avec Drive ni n’en voit les identifiants, et PostgreSQL ne conserve que `imageUrl` + `driveFileId`.',
            'Génération Excel (exceljs) et ZIP (jszip) exclusivement côté serveur, jamais dans le bundle client.',
          ],
        },
      ],
    },
    {
      id: 'prisma',
      title: 'Modèle de données & migrations',
      blocks: [
        {
          kind: 'p',
          text: 'PostgreSQL (Neon) via Prisma. Modèles principaux : User (role, isActive), Project (propriétaire, observationTypes, isArchived), Video (type associé, benchmark confidentiel), ProjectPoint (fenêtres de validation confidentielles), Observation (clientKey + sessionRunId), AuditLog (journal append-only), ProjectAccess (partage).',
        },
        {
          kind: 'p',
          text: 'Règle de production : ne jamais exécuter `prisma migrate dev`. Les migrations additives sont générées contre la base vivante puis appliquées avec `npm run db:deploy` (`prisma migrate deploy`).',
        },
      ],
    },
    {
      id: 'authentication',
      title: 'Authentification',
      blocks: [
        {
          kind: 'p',
          text: 'Les mots de passe sont hachés ; les sessions sont des cookies signés httpOnly, lus en lecture seule par le proxy et fiabilisés par les Server Actions. Les événements d’authentification (succès/échec de connexion, déconnexion) sont écrits dans le journal d’audit.',
        },
      ],
    },
    {
      id: 'rbac',
      title: 'Contrôle d’accès (RBAC)',
      blocks: [
        {
          kind: 'ul',
          items: [
            'ADMIN : tout — tous les projets, utilisateurs et le journal d’audit global.',
            'ANALYST : uniquement ses projets ou ceux partagés avec lui (ProjectAccess).',
            'OBSERVER : ses propres sessions et expériences autorisées ; une session connectée écrase toujours un identifiant d’observateur (anti-usurpation).',
            'Protection du journal : l’ADMIN voit tous les journaux, ANALYST et OBSERVER uniquement les leurs — le serveur n’accepte jamais un userId cible.',
          ],
        },
      ],
    },
    {
      id: 'observation',
      title: 'Workflow d’observation',
      blocks: [
        {
          kind: 'p',
          text: 'Observation indépendante : chaque capture confirmée est persistée immédiatement en observation « non certifiée » (isVerified=false), invisible des statistiques. À la finalisation de la session, le serveur certifie l’ensemble (isVerified=true) et compare chaque horodatage aux fenêtres confidentielles de sa propre passe vidéo pour qualifier la capture de validée ou fantôme (fausse alerte). Fenêtres de référence et benchmarks n’atteignent jamais le client observateur. Les positions spatiales des clics ne sont pas persistées. Les images des captures sont stockées dans Google Drive via une couche serveur dédiée (compte de service) : le navigateur ne dialogue jamais avec Drive et n’en voit jamais les identifiants, et PostgreSQL ne conserve qu’un lien public (`imageUrl`) plus un identifiant Drive interne au serveur (`driveFileId`). Les lignes historiques de l’ère Cloudinary restent lisibles par leur URL stockée, mais ne sont plus téléversées ni supprimées via le moindre SDK tiers.',
        },
        {
          kind: 'ul',
          items: [
            'Soumission idempotente : chaque capture porte une clientKey ; la contrainte unique (projectId, clientKey) et skipDuplicates évitent les doublons après une reprise.',
            'Chaque passage du stepper émet un sessionRunId qui alimente les compteurs réels de « sessions ».',
          ],
        },
      ],
    },
    {
      id: 'video-type',
      title: 'Vidéos & types d’observation',
      blocks: [
        {
          kind: 'p',
          text: 'Un projet propose un ensemble de types d’observation. Les vidéos peuvent être associées à un type : leur passe impose alors ce type à l’observateur. Les projets historiques à vidéo unique conservent une passe générique. L’observateur ne voit jamais la durée ni le benchmark d’une vidéo.',
        },
      ],
    },
    {
      id: 'analytics',
      title: 'Analyses',
      blocks: [
        {
          kind: 'p',
          text: 'Les analyses par projet appliquent une règle de détection unique partout (tableau de bord, analyses, Excel global, Excel par observateur, PDF) : pour un observateur, plusieurs captures dans la même fenêtre trame/type-décalage comptent pour UNE seule détection analytique. La probabilité empirique de détection est P(détection) = Détections / (Nombre de points/trames configurés × Nombre d’observateurs) × 100. Seules les sessions certifiées (isVerified=true) alimentent ces compteurs ; les exports bruts (Données brutes) conservent toujours chaque ligne de capture. Les graphiques (Recharts) représentent la distribution temporelle des détections et la ventilation validées / fantômes.',
        },
      ],
    },
    {
      id: 'exports',
      title: 'Exports',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Export global Excel `ONA_Field_Export_Global_<Projet>_<Date>.xlsx` : une feuille Synthèse (tableau Décalage / Nombre de points / Observations possibles / Détections / Probabilité empirique / Interprétation, avec une section DÉTAIL PAR POINT et une section SYNTHÈSE PAR OBSERVATEUR), une feuille Méthodologie (PROCÉDURE D’ANALYSE 1–7 et la note « Les trames constituent l’unité d’observation. Plusieurs captures d’un même observateur dans une même trame constituent une seule détection analytique. »), une feuille par type/décalage (grille Point / Trame vidéo / Observateur en cellules 1/0, avec Détections et Probabilité), et une feuille Données_Brutes_Globales listant chaque capture (identifiant Drive inclus).',
            'Export Excel par observateur `ONA_Field_Observateur_<Nom>_<Date>.xlsx` : une feuille Synthèse (points uniques détectés sur possibles), une feuille par type/décalage et une feuille Données_Brutes.',
            'Rapport scientifique en vrai fichier PDF (titre, métadonnées, indicateurs et graphiques du rapport) — bouton « Télécharger le rapport PDF », fichier ONA_Field_Rapport_<Projet>_<Date>.pdf.',
            'Export PNG des graphiques (haute résolution) depuis les vues d’analyses.',
          ],
        },
        {
          kind: 'p',
          text: 'Chaque export est tracé dans le journal d’audit append-only (EXPORT_GLOBAL, EXPORT_OBSERVER, EXPORT_PDF, EXPORT_CHART) avec son auteur et son projet — jamais aucun secret. L’accès suit la RBAC : l’ADMIN exporte tout, l’ANALYST uniquement ses projets ou ceux partagés, l’OBSERVER uniquement ses propres exports.',
        },
      ],
    },
    {
      id: 'audit',
      title: 'Journal d’audit',
      blocks: [
        {
          kind: 'p',
          text: 'Les actions importantes sont écrites dans un AuditLog en écriture seule : authentification, comptes, projets, vidéos, soumissions d’observations, événements d’images de capture et exports (IMAGE_UPLOADED, IMAGE_DELETED, EXPORT_GLOBAL, EXPORT_OBSERVER, EXPORT_PDF, EXPORT_CHART). Les métadonnées ne contiennent jamais de mots de passe, jetons ou secrets. La page d’historique ADMIN filtre par utilisateur, action, type de ressource, projet et date ; chaque autre utilisateur ne lit que « Mon activité ».',
        },
      ],
    },
    {
      id: 'drafts',
      title: 'Brouillons locaux',
      blocks: [
        {
          kind: 'p',
          text: 'Chaque capture confirmée est compressée en WebP sur l’appareil, puis envoyée au serveur et suivie localement jusqu’à sa confirmation (états PENDING → SYNCING → SYNCED ; FAILED hors-ligne). L’utilisateur voit des états honnêtes : « Compression en cours… », « Enregistrement en cours… », puis « ✓ Capture enregistrée ». Les captures en attente du réseau restent sur l’appareil (IndexedDB, clé propriétaire + projet) et sont réessayées à la reconnexion ; une capture synchronisée n’est jamais renvoyée (idempotence via la clientKey). Un sessionRunId stable permet à l’observateur de reprendre la même session après rechargement ou coupure hors-ligne — rien n’est perdu. Finaliser la session vide le brouillon et ne fait que finaliser des captures déjà persistées.',
        },
      ],
    },
    {
      id: 'installation',
      title: 'Installation & environnement',
      blocks: [
        {
          kind: 'ol',
          items: [
            'Prérequis : Node.js 20+ et npm.',
            'Installez les dépendances : `npm install` (postinstall exécute `prisma generate`).',
            'Copiez `.env.example` vers `.env` et renseignez les valeurs (DATABASE_URL, DIRECT_URL, les variables de stockage Google Drive GOOGLE_DRIVE_CLIENT_EMAIL et GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID optionnel, AUTH_SECRET, SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD optionnels).',
            'Appliquez le schéma à la base : `npm run db:deploy`.',
            'Premier administrateur optionnel : `npm run db:seed`.',
            'Développement : `npm run dev`.',
            'Vérifications : `npx tsc --noEmit`, `npx eslint src`, `npm test`.',
            'Build de production : `npm run build` (génère le client Prisma, déploie les migrations, puis compile).',
          ],
        },
        {
          kind: 'code',
          text: 'DATABASE_URL               // PostgreSQL (Neon), connexion application\nDIRECT_URL                 // connexion directe pour Prisma CLI / migrations\nGOOGLE_DRIVE_CLIENT_EMAIL  // email du compte de service (stockage des captures)\nGOOGLE_DRIVE_PRIVATE_KEY   // clé privée RSA du compte de service (PEM, retours à la ligne échappés ok)\nGOOGLE_DRIVE_FOLDER_ID     // optionnel — dossier Drive racine des captures\nAUTH_SECRET                // signature du cookie de session (obligatoire en production)\nSEED_ADMIN_EMAIL           // optionnel, pour `prisma db seed`\nSEED_ADMIN_PASSWORD        // optionnel, pour `prisma db seed`',
        },
      ],
    },
    {
      id: 'structure',
      title: 'Structure du dépôt',
      blocks: [
        {
          kind: 'code',
          text: 'src/\n ├── app/\n │   ├── (public)/        # accueil, /docs, /observe, /login, /register\n │   ├── (app)/            # zones connectées\n │   │   ├── admin/        # projets, utilisateurs, historique\n │   │   ├── analyst/      # projets analyste + analyses\n │   │   ├── dashboard/    # vue d’ensemble, historique, activité, réglages\n │   │   └── experience/   # observation connectée\n │   ├── actions/          # Server Actions (gardées par zone)\n │   └── api/              # gestionnaires de routes (exports auto-authentifiés)\n ├── components/\n │   ├── app/              # coquille, barre latérale, actions utilisateur\n │   ├── public/           # en-tête / pied de page publics\n │   └── ui, admin, analyst, observe…\n ├── lib/                  # auth, prisma, i18n, audit, exports…\n ├── proxy.ts              # middleware Next 16 — redirections RBAC\nprisma/\n ├── schema.prisma\n └── migrations/',
        },
      ],
    },
  ],
}

export function getDocs(locale: Locale): DocsLocale {
  return locale === 'en' ? en : fr
}
