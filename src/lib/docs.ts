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
            'Open the experiment: signed in on the experiments page (/experience), or through your personal share link (`/share/<token>`) when an administrator invited you — each link opens exactly one project and is re-checked on every request.',
            'Start an observation session, then load the experiment video (your own copy — the platform never streams it).',
            'When the video pass is bound to an expected video for its observation type, the interface shows `Type ↓ Expected video`: load exactly that video. Any other file — even a similar name — is refused, and annotation stays disabled until the loaded video matches.',
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
            'No account yet? Register on the public page (/register): your Analyst account is created pending and becomes usable only after an Administrator approves it.',
            'Consult your projects in the analyst space; each one is yours or shared with you.',
            'Create an experiment: title, context & protocol, then a target video.',
            'Bind each observation type to the exact expected video (or keep a generic pass); duplicate a pass to build a new one or edit it when the protocol changes — a type that already has observations keeps its history, never rewritten.',
            'Define the confidential validation windows (time bounds, MM:SS) against which observer captures will be judged.',
            'Share the project with an analyst colleague by username when a review is needed.',
            'Open the analytics of a project to read precision, concordance and the ghost distribution.',
            'Restrict the consultation to a single observation type (driven by the configured types) or watch everything, then export the results.',
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
            'Validate pending sign-up requests: newly registered Analysts arrive as pending accounts — approve or reject them, and manage accounts (create Observers, Analysts and Administrators, activate, deactivate or delete). Only approved accounts can sign in.',
            'Create projects, configure their observation types and associate video passes; bind each type to its exact expected video or keep a generic pass.',
            'Duplicate a video pass to derive a new one (its windows are copied, its observation history is never) or edit an existing pass — editing a type that already has observations asks for an explicit confirmation and never rewrites history.',
            'Define target validation windows (they stay secret from observers) and the optional video benchmark.',
            'Restrict the project consultation to a single observation type, or browse everything.',
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
        {
          kind: 'p',
          text: 'The public invitation routes (`/share`, `/observe`) sit outside the proxy and outside every admin route: they self-gate on the signed observer token (`va_observer`), bound to one project and re-validated against the database on each request. `/observe` never enumerates experiments — without a valid link it only shows an invitation panel.',
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
          text: 'PostgreSQL (Neon) accessed through Prisma. Core models: User (role, isActive, accountStatus — PENDING / APPROVED / REJECTED), Project (owner, observationTypes, isArchived), Video (bound observation type + exact expected video source, confidential benchmark), ProjectPoint (confidential validation windows), Observation (clientKey + sessionRunId), AuditLog (append-only journal), ProjectAccess (sharing), ObserverAccessToken (per-project share token, stored hashed, linked to its observer).',
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
        {
          kind: 'p',
          text: 'Observers have no public sign-up: an OBSERVER identity is created when a per-project share token is opened (`/share/<token>`). The raw token is hashed before storage; opening a valid link creates (once) the linked OBSERVER account and sets a signed, project-scoped HttpOnly cookie (`va_observer`) that the database re-verifies on every request — revoked or expired tokens are refused. Analysts self-register on the public page: the account is created inactive (accountStatus PENDING, no session opened) and cannot sign in until an ADMIN approves or rejects it — login of a pending/rejected/inactive account always fails without opening a session.',
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
            'ANALYST: only projects they own or that are shared with them (ProjectAccess). On their own experiments they configure, edit types/videos, duplicate, share and create observer keys. On a shared experiment they view, analyse and export by default; modification is granted only when the share carries an explicit edit right (ProjectAccess.canEdit). User management is ADMIN-only.',
            'OBSERVER: their own sessions and the experiments opened by their share token (one token per project); a logged-in session always overrides an observer identifier (anti-impersonation).',
            'Audit log protection: ADMIN sees all logs, ANALYST and OBSERVER only their own — the server never accepts a target userId.',
            'Every permission is re-checked server-side before data reaches the frontend: editing a projectId, a URL, a parameter or an API request never grants access to an unauthorized experiment.',
            'AUTHORIZED ANALYSTS ON A PROJECT: ADMIN and the project owner explicitly grant or revoke an ANALYST access from the “Analysts” tab of the project page. Two permissions only — “View the data” (ProjectAccess.canEdit = false: see the project, its frames, its statistics, its analyses, its observations and the permitted exports — but no configuration, no sharing, no observer key, no deletion, no account administration) and “Edit the configuration” (canEdit = true: adds configuration, sharing and observer links, within that project only). Unchecking REVOKES the access: the server then refuses every read and every mutation, without deleting anything — not the account, not the project, not the observations already recorded; granting again restores exactly the same rights. The mechanism is the existing ProjectAccess share, decided by resolveProjectPermissions before any read or write: hiding a button never protects anything.',
            'An ANALYST who OWNS a project configures it without becoming an administrator: title, observation types, video passes and frames (canConfigure), sharing with colleagues, creating observer links and invitations (canCreateObserverTokens). Destructive deletions (project, video, frame) keep their strict guard, and ACCOUNT management stays ADMIN-only.',
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
        {
          kind: 'p',
          text: 'VideoAnnotator “Edit” mode: selecting an annotation then clicking Edit keeps the selection — the same circle stays visible and active, the player returns to the capture frame. The circle can be moved, or clicked elsewhere to relocate it (same id, same timestamp, same type, same video pass — only the coordinates change). Confirming rewrites the image of the SAME annotation (never a new one); Cancel restores the previous position. The Space key is reserved for play/pause only: it never captures, edits, deletes, validates or switches type/window; inside input/textarea/select/contenteditable it keeps its natural behavior, and it works fullscreen. Immediate capture stays on distinct keys (C / Enter).',
        },
      ],
    },
    {
      id: 'video-type',
      title: 'Videos & observation types',
      blocks: [
        {
          kind: 'p',
          text: 'A project offers a set of observation types. Each video pass (Video) can be bound to one type AND to the exact expected video source. Legacy single-video projects keep a generic pass (no video bound). The observer never sees a video duration or benchmark.',
        },
        {
          kind: 'ul',
          items: [
            'Strict expected-video validation (server, on every capture before it is stored): the pass must exist and belong to the submitted type; the declared video must be the expected one — matched by video/pass identifier, otherwise by the exact normalized file name (decoded last URL path segment; no prefix tolerance, no case folding). A video from another type, a forged videoId, an edited type or a missing source are all refused with one user-facing message and no technical detail leaked.',
            'Client gate coherent with the server: the annotator displays the relation `Type ↓ Expected video` and disables annotation/capture while the loaded video does not match, so the refusal never surprises the observer mid-protocol. The identity policy is a single pure module shared by server and client.',
            'Admin tooling: a video pass can be duplicated (a NEW entity — id, video and windows copied; observations, captures, drive file ids, clientKeys and audit history are never copied; targeting another configured type is allowed) or edited; editing a type that already has observations asks for an explicit confirmation and never rewrites historical data.',
            'Consultation filter: observations, passes and windows of a project can be restricted to ONE observation type at a time, from options derived from the project’s configured types (never hardcoded).',
          ],
        },
      ],
    },
    {
      id: 'analytics',
      title: 'Analytics',
      blocks: [
        {
          kind: 'p',
          text: 'Per-project analytics apply a single detection rule on every surface (dashboard, analytics, global Excel, per-observer Excel, PDF): for one observer, several captures inside the same frame/type-décalage window count as ONE analytical detection. The empirical probability of detection is P(detection) = detections ÷ possible observations × 100, where possible observations are computed TYPE BY TYPE as (configured points/frames of the type × observers who actually took part in that type) and then summed — every type keeps its own denominator, and the global rate is weighted by the real denominators, never an average of percentages. The dashboard’s “Global concordance” card and “Detection probability” card show the SAME number from that same ratio, as do the “Concordance” columns of the PDF, the workbooks and the executive report. A per-window concordance refers to the observers who took part in that window’s own TYPE — never to the project’s total observer count. Only certified sessions (isVerified=true) feed these counters, while raw exports (Données brutes) always keep every capture line. Charts (Recharts) render the time distribution of detections and the validated/ghost split.',
        },
        {
          kind: 'p',
          text: 'Comparisons: the “Comparisons” tab offers two readings fed by the SAME engine as the dashboard and the exports. “By type” puts several types of one project side by side (point × type matrix and per-type indicators, each with its own denominator). “By groups (A/B)” splits the project types into two groups — at least one type per group, no type in both, no duplicates — and aggregates nothing but their figures: possible(group) = Σ (points of the type × observers who took part in the type), detections(group) = Σ detections of the type, rate(group) = Σ detections ÷ Σ possible. A group rate is therefore WEIGHTED by its real denominators, never the average of its types’ rates; the group table and the TWO pie charts (detected / not detected) display exactly the same figures. Since a type belongs to one group only, possible observations are never counted twice.',
        },
        {
          kind: 'p',
          text: 'Analytics are versioned. An AnalyticsVersion is an immutable snapshot of the analytic state at one moment: the perimeter configuration (windows, types, video passes) and the metrics computed over the valid observations available at that time. A version is created ONLY when a configuration change may change the observation possibilities (add/remove a window or point, edit types, add/edit/remove/duplicate a video pass); consulting, filtering, exporting, or recording a capture never creates one. ADDING A WINDOW DOES NOT ERASE THE PAST: existing detections stay counted (the numerator never drops) while the denominator (possible observations, computed TYPE BY TYPE as configured windows of that type × observers who actually took part in that type, then summed) grows. Historical versions are never recomputed with later configuration or data. The dashboard can show the current analysis or “analysis before <date>” (a version filter), and dashboard = Excel = PDF for the same version.',
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
            'Global Excel export `ONA_Field_Export_Global_<Projet>_<Date>.xlsx`: a Synthèse sheet (table of Décalage / Nombre de points / Observations possibles / Détections / Probabilité empirique / Interprétation, with a DÉTAIL PAR POINT section and a SYNTHÈSE PAR OBSERVATEUR section), a Méthodologie sheet (PROCÉDURE D’ANALYSE 1–7 and the note that frames are the observation unit — several captures of the same observer inside the same frame count as one analytical detection), one sheet per type/décalage (grid of Point / Trame vidéo / Observer cells in 1/0, plus Détections and Probabilité), and a Données_Brutes_Globales sheet listing every capture (including its Drive file id and a public Image link when the file exists).',
            'Per-observer Excel export `ONA_Field_Observateur_<Nom>_<Date>.xlsx`: a Synthèse sheet (unique points detected over possible), one sheet per type/décalage and a Données_Brutes sheet (same Image link column).',
            'Scientific report as a real PDF file (title, metadata, KPIs and the report charts) — download button “Télécharger le rapport PDF”, filename ONA_Field_Rapport_<Projet>_<Date>.pdf.',
            'Chart PNG export (high resolution) from the analytics views.',
          ],
        },
        {
          kind: 'p',
          text: 'Every export is traced in the append-only audit log (EXPORT_GLOBAL, EXPORT_OBSERVER, EXPORT_PDF, EXPORT_CHART) with its author and project — never any secret. Access follows RBAC: ADMIN exports anything, ANALYST only the projects they own or that are shared with them, OBSERVER only their own exports.',
        },
        {
          kind: 'p',
          text: 'Exports share the exact analytic source as the dashboard: no export computes analytics on its own. Without parameters an export uses the current analysis; adding ?versionId=<id> or ?before=YYYY-MM-DD exports that immutable historical version — historical values are never replaced by the current configuration.',
        },
        {
          kind: 'p',
          text: 'Capture images are private in Google Drive. The application displays them through a secure server endpoint GET /api/captures/<captureId>/image which resolves the capture, checks session + authorization (ADMIN: all; ANALYST: their authorized projects; OBSERVER: their own captures), reads the bytes through the service account and returns the image with the right Content-Type and a private cache. Exports keep the Drive File ID and the Google Drive consultation link, but never make files public.',
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
          text: 'src/\n ├── app/\n │   ├── (public)/        # home, /docs, /share, /observe, /login, /register\n │   ├── (app)/            # authed areas\n │   │   ├── admin/        # projects, users, history\n │   │   ├── analyst/      # analyst projects + analytics\n │   │   ├── dashboard/    # overview, history, activity, settings\n │   │   └── experience/   # signed-in observation\n │   ├── actions/          # Server Actions (guarded per zone)\n │   └── api/              # route handlers (self-authenticated exports)\n ├── components/\n │   ├── app/              # shell, sidebar, user actions\n │   ├── public/           # public header / footer\n │   └── ui, admin, analyst, observe…\n ├── lib/                  # auth, observerAccess, prisma, i18n, audit, exports…\n ├── proxy.ts              # Next 16 middleware — RBAC redirects\nprisma/\n ├── schema.prisma\n └── migrations/',
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
            'Ouvrez l’expérience : connecté sur la page des expériences (/experience), ou via votre lien de partage personnel (`/share/<jeton>`) lorsqu’un administrateur vous a invité — chaque lien ouvre un seul projet et est re-vérifié à chaque requête.',
            'Démarrez une session d’observation, puis chargez la vidéo de l’expérience (votre propre copie — la plateforme ne la diffuse jamais).',
            'Lorsque la passe vidéo est liée à une vidéo attendue pour son type d’observation, l’interface affiche `Type ↓ Vidéo attendue` : chargez exactement cette vidéo. Tout autre fichier — même un nom proche — est refusé, et l’annotation reste désactivée tant que la vidéo chargée ne correspond pas.',
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
            'Pas encore de compte ? Inscrivez-vous sur la page publique (/register) : votre compte Analyste est créé en attente et ne devient utilisable qu’après approbation par un administrateur.',
            'Consultez vos projets dans l’espace analyste ; chacun vous appartient ou vous est partagé.',
            'Créez une expérience : titre, contexte & protocole, puis une vidéo cible.',
            'Associez chaque type d’observation à sa vidéo attendue exacte (ou gardez une passe générique) ; dupliquez une passe pour en dériver une nouvelle ou modifiez-la quand le protocole change — un type qui a déjà des observations conserve son historique, jamais réécrit.',
            'Définissez les fenêtres de validation confidentielles (bornes temporelles, MM:SS) contre lesquelles les captures des observateurs seront jugées.',
            'Partagez le projet avec un collègue analyste (par nom d’utilisateur) lorsqu’une relecture est nécessaire.',
            'Ouvrez les analyses d’un projet pour lire précision, concordance et répartition des fantômes.',
            'Restreignez la consultation à un seul type d’observation (piloté par les types configurés) ou parcourez tout, puis exportez les résultats.',
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
            'Validez les demandes d’inscription en attente : les analystes nouvellement inscrits arrivent en compte en attente — approuvez-les ou rejetez-les, et gérez les comptes (créez observateurs, analystes et administrateurs, activez, désactivez ou supprimez). Seuls les comptes approuvés peuvent se connecter.',
            'Créez les projets, configurez leurs types d’observation et associez les passes vidéo ; liez chaque type à sa vidéo attendue exacte ou gardez une passe générique.',
            'Dupliquez une passe vidéo pour en dériver une nouvelle (ses fenêtres sont copiées, jamais son historique d’observations) ou modifiez une passe existante — modifier un type qui possède déjà des observations demande une confirmation explicite et ne réécrit jamais l’historique.',
            'Définissez les fenêtres cibles de validation (confidentielles pour les observateurs) et le benchmark vidéo optionnel.',
            'Restreignez la consultation du projet à un seul type d’observation, ou parcourez tout.',
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
        {
          kind: 'p',
          text: 'Les routes publiques d’invitation (`/share`, `/observe`) sont hors du proxy et hors de toute route d’administration : elles s’autogardent sur le jeton observateur signé (`va_observer`), lié à un seul projet et re-validé en base à chaque requête. `/observe` n’énumère jamais d’expériences — sans lien valide, il n’affiche qu’un panneau « sur invitation ».',
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
          text: 'PostgreSQL (Neon) via Prisma. Modèles principaux : User (role, isActive, accountStatus — PENDING / APPROVED / REJECTED), Project (propriétaire, observationTypes, isArchived), Video (type associé + source vidéo attendue exacte, benchmark confidentiel), ProjectPoint (fenêtres de validation confidentielles), Observation (clientKey + sessionRunId), AuditLog (journal append-only), ProjectAccess (partage), ObserverAccessToken (jeton de partage par projet, stocké haché, lié à son observateur).',
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
        {
          kind: 'p',
          text: 'Les observateurs n’ont pas d’inscription publique : une identité OBSERVER est créée à l’ouverture d’un jeton de partage par projet (`/share/<jeton>`). Le jeton brut est haché avant stockage ; ouvrir un lien valide crée (une seule fois) le compte observateur lié et pose un cookie signé HttpOnly limité au projet (`va_observer`), re-vérifié en base à chaque requête — un jeton révoqué ou expiré est refusé. Les analystes s’inscrivent sur la page publique : le compte est créé inactif (accountStatus PENDING, aucune session ouverte) et ne peut se connecter qu’après approbation ou rejet par un ADMIN — la connexion d’un compte en attente, rejeté ou inactif échoue toujours sans ouvrir de session.',
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
            'ANALYST : uniquement ses projets ou ceux partagés avec lui (ProjectAccess). Sur ses propres expériences il configure, édite types/vidéos, duplique, partage et crée des clés observateur. Sur une expérience partagée il voit, analyse et exporte par défaut ; la modification n’est accordée que si le partage porte un droit d’édition explicite (ProjectAccess.canEdit). La gestion des utilisateurs reste réservée à l’ADMIN.',
            'OBSERVER : ses propres sessions et les expériences ouvertes par son jeton de partage (un jeton = un projet) ; une session connectée écrase toujours un identifiant d’observateur (anti-usurpation).',
            'Protection du journal : l’ADMIN voit tous les journaux, ANALYST et OBSERVER uniquement les leurs — le serveur n’accepte jamais un userId cible.',
            'Chaque permission est re-vérifiée côté serveur avant tout envoi de données au frontend : modifier un projectId, une URL, un paramètre ou une requête API ne donne jamais accès à une expérience non autorisée.',
            'ANALYSTES AUTORISÉS SUR UN PROJET : l’ADMIN et le propriétaire accordent ou retirent explicitement un accès ANALYSTE depuis l’onglet « Analystes » de la fiche projet. Deux permissions seulement — « Visualiser les données » (ProjectAccess.canEdit = false : voir le projet, ses fenêtres, ses statistiques, ses analyses, ses observations et les exports permis — mais ni configuration, ni partage, ni clé observateur, ni suppression, ni administration des comptes) et « Modifier la configuration » (canEdit = true : ajoute la configuration, le partage et les liens observateur, dans le périmètre du projet). Décocher RÉVOQUE l’accès : le serveur refuse alors toute lecture comme toute mutation, sans supprimer aucune donnée — ni le compte, ni le projet, ni les observations déjà réalisées ; réaccorder redonne exactement les mêmes droits. Le mécanisme est le partage ProjectAccess existant, décidé par resolveProjectPermissions avant toute lecture ou écriture : masquer un bouton ne protège jamais rien.',
            'L’analyste PROPRIÉTAIRE d’un projet configure celui-ci sans devenir administrateur : titre, types d’observation, passes vidéo et fenêtres (canConfigure), partage à des collègues, création des liens observateurs et invitations (canCreateObserverTokens). Les suppressions destructrices (projet, vidéo, fenêtre) conservent leur garde stricte, et la gestion des COMPTES reste réservée à l’ADMIN.',
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
        {
          kind: 'p',
          text: 'Mode « Modifier » du VideoAnnotator : sélectionner une annotation puis cliquer « Modifier » conserve la sélection — le même cercle reste visible et actif, le lecteur revient sur la frame de la capture. On peut déplacer le cercle ou cliquer ailleurs pour le repositionner (même identifiant, même horodatage, même type, même passe vidéo — seules les coordonnées changent). « Valider » réécrit l’image de la MÊME annotation (jamais une nouvelle) ; « Annuler » restaure la position précédente. La touche Espace est réservée à la lecture/pause uniquement : elle ne capture, ne modifie, ne supprime, ne valide ni ne change de type/fenêtre ; dans un champ de saisie (input/textarea/select/contenteditable) elle conserve son comportement naturel, et elle fonctionne en plein écran. La capture immédiate reste sur des touches distinctes (C / Entrée).',
        },
      ],
    },
    {
      id: 'video-type',
      title: 'Vidéos & types d’observation',
      blocks: [
        {
          kind: 'p',
          text: 'Un projet propose un ensemble de types d’observation. Chaque passe vidéo (Video) peut être liée à un type ET à la source vidéo attendue exacte. Les projets historiques à vidéo unique conservent une passe générique (aucune vidéo liée). L’observateur ne voit jamais la durée ni le benchmark d’une vidéo.',
        },
        {
          kind: 'ul',
          items: [
            'Validation stricte de la vidéo attendue (serveur, sur chaque capture avant tout stockage) : la passe doit exister et appartenir au type soumis ; la vidéo déclarée doit être celle attendue — égalité par identifiant de passe, sinon par nom de fichier normalisé exact (dernier segment d’URL décodé ; aucune tolérance de préfixe, aucune insensibilité à la casse). La vidéo d’un autre type, un videoId forgé, un type modifié ou une source absente sont refusés avec un seul message utilisateur, sans fuite de détail technique.',
            'Contrôle client cohérent avec le serveur : l’annotateur affiche la relation `Type ↓ Vidéo attendue` et désactive annotation/capture tant que la vidéo chargée ne correspond pas, si bien que le refus ne surprend jamais l’observateur en cours de protocole. La politique d’identité est un module pur unique partagé par le serveur et le client.',
            'Outillage admin : une passe vidéo peut être dupliquée (une NOUVELLE entité — identifiant, vidéo et fenêtres copiés ; observations, captures, identifiants Drive, clientKeys et historique d’audit jamais copiés ; viser un autre type configuré est permis) ou modifiée ; modifier un type qui possède déjà des observations demande une confirmation explicite et ne réécrit jamais l’historique.',
            'Filtre de consultation : observations, passes et fenêtres d’un projet peuvent être restreintes à UN seul type d’observation à la fois, à partir d’options dérivées des types configurés du projet (jamais codé en dur).',
          ],
        },
      ],
    },
    {
      id: 'analytics',
      title: 'Analyses',
      blocks: [
        {
          kind: 'p',
          text: 'Les analyses par projet appliquent une règle de détection unique partout (tableau de bord, analyses, Excel global, Excel par observateur, PDF) : pour un observateur, plusieurs captures dans la même fenêtre trame/type-décalage comptent pour UNE seule détection analytique. La probabilité empirique est calculée TYPE PAR TYPE : observations possibles du type = points/trames configurés DU TYPE × observateurs ayant RÉELLEMENT PARTICIPÉ à ce type ; le total est la SOMME de ces dénominateurs, jamais « points totaux × observateurs totaux » ni le maximum d’observateurs pris comme base commune. Le taux global est donc PONDÉRÉ : P = Σ Détections / Σ Possibles × 100 — jamais la moyenne des pourcentages des types. La carte « Concordance Globale » et la carte « Probabilité de détection » du tableau de bord affichent le MÊME nombre, issu de ce même rapport, comme les colonnes « Concordance » du PDF, des classeurs et du rapport exécutif. La concordance par fenêtre, elle, se rapporte aux observateurs ayant participé au TYPE de cette fenêtre — jamais au total des observateurs du projet. Un observateur déclassé sort du relevé en amont, donc du numérateur COMME du dénominateur ; le réinclure recalcule les deux. Seules les sessions certifiées (isVerified=true) alimentent ces compteurs ; les exports bruts (Données brutes) conservent toujours chaque ligne de capture. Les graphiques (Recharts) représentent la distribution temporelle des détections et la ventilation validées / fantômes.',
        },
        {
          kind: 'p',
          text: 'Comparaisons : l’onglet « Comparaisons » propose deux lectures alimentées par le MÊME moteur que le tableau de bord et les exports. « Par type » met en regard plusieurs types d’un même projet (matrice point × type et indicateurs par type, chacun avec son propre dénominateur). « Par groupes (A/B) » répartit les types du projet en deux groupes — au moins un type par groupe, aucun type dans les deux, aucun doublon — et n’agrège rien d’autre que leurs chiffres : possibles(groupe) = Σ (points du type × observateurs ayant participé au type), détections(groupe) = Σ détections du type, taux(groupe) = Σ détections / Σ possibles. Le taux d’un groupe est donc PONDÉRÉ par ses vrais dénominateurs, jamais la moyenne des taux de ses types ; le tableau des groupes et les DEUX graphiques circulaires (détectés / non détectés) affichent exactement les mêmes chiffres. Un type n’appartenant qu’à un seul groupe, les points possibles ne sont jamais comptés deux fois.',
        },
        {
          kind: 'p',
          text: 'Les analyses sont versionnées. Une AnalyticsVersion est un instantané immuable de l’état analytique à un instant donné : la configuration du périmètre (fenêtres, types, passes vidéo) et les métriques calculées sur les observations valides disponibles à cette date. Une version n’est créée QUE lorsqu’une modification de configuration peut changer les possibilités d’observation (ajout/suppression d’une fenêtre ou d’un point, édition des types, ajout/modification/suppression/duplication d’une passe vidéo) ; consulter, filtrer, exporter ou enregistrer une capture n’en crée jamais. AJOUTER UNE FENÊTRE NE SUPPRIME PAS LE PASSÉ : les détections existantes restent comptées (le numérateur ne baisse jamais) tandis que le dénominateur (observations possibles, calculées TYPE PAR TYPE — fenêtres du type × observateurs ayant réellement participé à ce type — puis sommées) augmente. Chaque type garde donc son propre dénominateur : le taux global est pondéré par les vrais dénominateurs, jamais une moyenne de pourcentages. Les versions historiques ne sont jamais recalculées avec une configuration ou des données postérieures. Le tableau de bord affiche l’analyse actuelle ou « l’analyse avant le <date> » (filtre de versions), et tableau de bord = Excel = PDF pour une même version.',
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
            'Export global Excel `ONA_Field_Export_Global_<Projet>_<Date>.xlsx` : une feuille Synthèse (tableau Décalage / Nombre de points / Observations possibles / Détections / Probabilité empirique / Interprétation, avec une section DÉTAIL PAR POINT et une section SYNTHÈSE PAR OBSERVATEUR), une feuille Méthodologie (PROCÉDURE D’ANALYSE 1–7 et la note « Les trames constituent l’unité d’observation. Plusieurs captures d’un même observateur dans une même trame constituent une seule détection analytique. »), une feuille par type/décalage (grille Point / Trame vidéo / Observateur en cellules 1/0, avec Détections et Probabilité), et une feuille Données_Brutes_Globales listant chaque capture (identifiant Drive inclus et lien public « Lien image » vers le fichier quand il existe).',
            'Export Excel par observateur `ONA_Field_Observateur_<Nom>_<Date>.xlsx` : une feuille Synthèse (points uniques détectés sur possibles), une feuille par type/décalage et une feuille Données_Brutes (même colonne Lien image).',
            'Rapport scientifique en vrai fichier PDF (titre, métadonnées, indicateurs et graphiques du rapport) — bouton « Télécharger le rapport PDF », fichier ONA_Field_Rapport_<Projet>_<Date>.pdf.',
            'Export PNG des graphiques (haute résolution) depuis les vues d’analyses.',
          ],
        },
        {
          kind: 'p',
          text: 'Chaque export est tracé dans le journal d’audit append-only (EXPORT_GLOBAL, EXPORT_OBSERVER, EXPORT_PDF, EXPORT_CHART) avec son auteur et son projet — jamais aucun secret. L’accès suit la RBAC : l’ADMIN exporte tout, l’ANALYST uniquement ses projets ou ceux partagés, l’OBSERVER uniquement ses propres exports.',
        },
        {
          kind: 'p',
          text: 'Les exports partagent exactement la même source analytique que le tableau de bord : aucun export ne calcule d’analyse de son côté. Sans paramètre, un export utilise l’analyse actuelle ; en ajoutant ?versionId=<id> ou ?before=AAAA-MM-JJ, il exporte cette version historique immuable — les valeurs historiques ne sont jamais remplacées par la configuration actuelle.',
        },
        {
          kind: 'p',
          text: 'Les images des captures sont privées dans Google Drive. L’application les affiche via un endpoint serveur sécurisé GET /api/captures/<captureId>/image qui résout la capture, vérifie la session et l’autorisation (ADMIN : tout ; ANALYSTE : ses projets autorisés ; OBSERVATEUR : ses propres captures), lit les octets via le compte de service puis renvoie l’image avec le bon Content-Type et un cache privé. Les exports conservent le Drive File ID et le lien de consultation Google Drive, sans jamais rendre les fichiers publics.',
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
          text: 'src/\n ├── app/\n │   ├── (public)/        # accueil, /docs, /share, /observe, /login, /register\n │   ├── (app)/            # zones connectées\n │   │   ├── admin/        # projets, utilisateurs, historique\n │   │   ├── analyst/      # projets analyste + analyses\n │   │   ├── dashboard/    # vue d’ensemble, historique, activité, réglages\n │   │   └── experience/   # observation connectée\n │   ├── actions/          # Server Actions (gardées par zone)\n │   └── api/              # gestionnaires de routes (exports auto-authentifiés)\n ├── components/\n │   ├── app/              # coquille, barre latérale, actions utilisateur\n │   ├── public/           # en-tête / pied de page publics\n │   └── ui, admin, analyst, observe…\n ├── lib/                  # auth, observerAccess, prisma, i18n, audit, exports…\n ├── proxy.ts              # middleware Next 16 — redirections RBAC\nprisma/\n ├── schema.prisma\n └── migrations/',
        },
      ],
    },
  ],
}

export function getDocs(locale: Locale): DocsLocale {
  return locale === 'en' ? en : fr
}
