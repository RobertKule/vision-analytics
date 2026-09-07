/**
 * Lightweight bilingual layer (English / French) for the public observer journey.
 *
 * `en` is the source of truth: `fr` is typed against it, so any key added on one
 * side MUST exist on the other (TypeScript guarantees parity). Only plain
 * serializable values live in here (no functions) because slices are passed from
 * Server Components down to client components as props.
 */

export const locales = ['en', 'fr'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'
export const LOCALE_COOKIE = 'va_locale'

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'fr'
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale
}

const en = {
  nav: {
    observe: 'Experiments',
    dashboard: 'Dashboard',
    login: 'Sign in',
    logout: 'Log out',
    logoutPending: 'Logging out…',
    mobileObserveAria: 'Open experiments',
    themeAria: 'Toggle theme (light / dark)',
    themeDarkToast: 'Dark mode enabled',
    themeLightToast: 'Light mode enabled',
    themeToastDesc: 'Your preference is saved for this session.',
  },
  home: {
    eyebrow: 'Scientific video observation',
    h1Lead: 'Turn every detection into',
    h1Accent: 'rigorous, blind data.',
    lead: 'Observers annotate and capture events on live video without ever seeing the exact '
      + 'time windows that count. On submission, concordance between observers is computed '
      + 'automatically — anonymous, private, ready for publication.',
    ctaParticipate: 'Participate in an Experiment',
    ctaParticipateHint: 'Join a live double-blind study',
    ctaSignIn: 'Sign In / Create Account',
    ctaSignInHint: 'Researchers & analysts',
    note: 'No account required to observe — a pseudonymous identifier stays in your browser.',
    featuresEyebrow: 'Why researchers trust it',
    featuresTitle: 'Blind by design, rigorous by default',
    features: [
      {
        title: 'Temporal blindness',
        desc: 'Validation windows stay secret: observers watch the video without knowing the exact seconds that make the verdict.',
      },
      {
        title: 'Double masking',
        desc: 'Pseudonymous observers and a strictly blind protocol — no crossed information can bias detection.',
      },
      {
        title: 'Inter-observer concordance',
        desc: 'The scientific engine computes agreement rates, reaction delays and each observer’s precision.',
      },
      {
        title: 'PDF & CSV exports',
        desc: 'A printable executive report and raw CSV export of every measure, ready to archive and publish.',
      },
    ],
    footerTagline: 'Vision Analytics — scientific video observation, double-blind.',
    footerCta: 'Explore the experiments',
  },
  observe: {
    eyebrow: 'Observer space',
    title: 'Scientific observation sessions',
    subtitle: 'Join an active double-blind study, or try the free annotation player below.',
    sectionHeading: 'Active experiments',
    blindTag: 'Blind',
    awaitingVideoTag: 'Awaiting video',
    noActiveTitle: 'No active experiments yet.',
    noActiveHint: 'Researchers can launch one from the',
    noActiveAdmin: 'Administration',
    noActiveSuffix: 'space, or try the free player below.',
    participate: 'Participate',
    createdLabel: 'Published',
    freeEyebrow: 'No project required',
    freeTitle: 'Free annotation player',
    freeSubtitle: 'Try the annotator on any local video file without attaching it to a study.',
  },
  session: {
    blindBadge: 'Double-blind protocol',
    activeLabel: 'Active observation session',
    changeProject: 'Change experiment',
    guidelinesTitle: 'Observer guidelines',
    guidelines:
      'Load the matching video file on your local machine. Watch the sequence at your own pace, '
      + 'pause to mark every anomaly or zone of interest, then capture. The reference time windows '
      + 'stay confidential and are validated automatically on the server when you submit.',
    targetVideoLabel: 'Target video for this study:',
    noVideoTitle: 'The owner of this experiment has not uploaded or shared the video file yet.',
    noVideoBody: 'Please check back once a video has been made available, or join one of the other active experiments.',
    noVideoAction: 'Browse experiments',
  },
  annotator: {
    chooseVideo: 'Choose a video…',
    recommendedVideo: 'Recommended for this project: {{name}}',
    localVideoHint: 'Local video — an MP4, WebM or MOV file from your computer.',
    fileTypeError: 'The selected file is not a video (MP4, WebM, MOV…).',
    loading: 'Loading video…',
    playingChip: 'Playing — pause to annotate',
    noVideoTitle: 'No video loaded.',
    noVideoHint: 'Select a file above to start your observation session.',
    play: 'Play',
    pause: 'Pause',
    seekAria: 'Video position',
    duration: 'Duration',
    capture: 'Capture observation',
    clearCircles: 'Clear circles',
    clearWithCount: 'Clear ({{n}})',
    hintLoad: 'Load a video, then pause it to begin.',
    hintPlaying: 'Pause the video to mark your zones of interest.',
    hintPaused: 'Drag on the video to draw a marker, or tap to drop one — then capture.',
    panelTitle: 'Captured observations',
    panelCount: '{{n}} in session',
    panelEmptyTitle: 'No observations yet',
    panelEmptyHint: 'Load the study video, pause, mark a zone of interest, then capture.',
    deleteCaptureAria: 'Delete observation #{{n}}',
    unitCircle: { one: 'circle', many: 'circles' },
    unitObservation: { one: 'observation', many: 'observations' },
    selKicker: 'Selected marker',
    selDelete: 'Delete marker',
    selDismiss: 'Dismiss',
    selMoveHint: 'Drag the marker to fine-tune its position.',
    submit: 'Complete Session ({{n}})',
    endTitle: 'You have reached the end of the video.',
    endBody: 'Submit your observations now to lock in this blind session.',
    endSubmit: 'Submit now',
    endLater: 'Review first',
    toastSuccessTitle: 'Session submitted',
    toastSuccessDesc: 'Your observations were transmitted and recorded securely.',
  },
  stepper: {
    kicker: 'Blind protocol',
    title: 'Submit session — {{title}}',
    closeAria: 'Close dialog',
    progressAria: 'Submission progress',
    step1: 'Review captures',
    step2: 'Observer identity',
    step3: 'Upload & validate',
    step1Title: 'Check your captures before submitting',
    step1Hint: 'Delete accidental or imprecise captures. Only kept images are analyzed.',
    step1Count: '{{n}} retained',
    step1Empty: 'All captures were deleted. Cancel, or mark new zones on the video.',
    step2Title: 'Scientific identification',
    step2Hint:
      'To keep results unbiased, your observations are indexed under a pseudonymous identifier.',
    recommendedTag: 'Recommended',
    alternativeTag: 'Alternative',
    anonTitle: 'Anonymous ID',
    anonDesc: 'A unique identifier kept locally, without any personal data.',
    emailTitle: 'Observer email',
    emailDesc: 'Links your submissions to your research address.',
    anonLabel: 'Your anonymous session ID',
    regen: 'Regenerate',
    anonHint: 'This ID is reused on your future sessions from this browser.',
    emailLabel: 'Observer email address',
    emailPlaceholder: 'researcher@institute.edu',
    step3Title: 'Ready for final upload',
    step3Hint:
      'Annotated captures are uploaded to secure storage, then compared against the study’s secret validation windows.',
    recProject: 'Target project',
    recCount: 'Observations',
    recIdentifier: 'Identifier',
    uploading: 'Uploading captures and validating…',
    successTitle: 'Submission recorded successfully',
    successBody: 'Stored securely and validated against the study’s scientific windows.',
    finish: 'Finish session',
    back: 'Back',
    cancel: 'Cancel',
    nextIdentification: 'Next: Identification',
    nextConfirmation: 'Next: Confirmation',
    confirmUpload: 'Confirm & Upload',
    uploadingBtn: 'Uploading…',
    deleteCapture: 'Delete this capture',
    errorCaptures: 'Keep at least one capture to submit this session.',
    errorIdentifier: 'Please provide or generate an anonymous identifier.',
    errorEmailInvalid: 'The email address entered is invalid.',
    errorEmailRequired: 'Please enter a valid email address.',
    unitCapture: { one: 'capture', many: 'captures' },
    unitZone: { one: 'zone', many: 'zones' },
    timePrefix: 'T+',
  },
  completion: {
    kicker: 'Blind session',
    title: 'Observation session complete',
    body:
      'Your annotated observations are now recorded in the secure scientific database. '
      + 'Thank you for contributing to this study.',
    statLabel: 'Observations submitted',
    back: 'Back to experiments',
    again: 'Start a new session',
  },
}

const fr: typeof en = {
  nav: {
    observe: 'Expériences',
    dashboard: 'Tableau de bord',
    login: 'Connexion',
    logout: 'Déconnexion',
    logoutPending: 'Déconnexion…',
    mobileObserveAria: 'Ouvrir les expériences',
    themeAria: 'Changer de thème (clair / sombre)',
    themeDarkToast: 'Mode sombre activé',
    themeLightToast: 'Mode clair activé',
    themeToastDesc: 'Votre préférence est enregistrée pour cette session.',
  },
  home: {
    eyebrow: 'Observation scientifique de vidéos',
    h1Lead: 'Transformez chaque détection en',
    h1Accent: 'donnée fiable, en aveugle.',
    lead:
      'Les observateurs annotent et capturent des événements sur la vidéo sans jamais connaître les '
      + 'fenêtres temporelles qui feront foi. À la soumission, la concordance inter-observateurs est '
      + 'calculée automatiquement — anonyme, confidentielle et prête pour la publication.',
    ctaParticipate: 'Participer à une expérience',
    ctaParticipateHint: 'Rejoindre une étude en double aveugle',
    ctaSignIn: 'Se connecter / Créer un compte',
    ctaSignInHint: 'Chercheurs & analystes',
    note: 'Aucun compte requis pour observer — un identifiant pseudonymisé est conservé dans votre navigateur.',
    featuresEyebrow: 'Pourquoi la recherche lui fait confiance',
    featuresTitle: 'En aveugle par conception, rigoureux par défaut',
    features: [
      {
        title: 'Incertitude temporelle',
        desc: 'Les fenêtres de validation restent confidentielles : les observateurs visionnent sans connaître les secondes qui feront foi.',
      },
      {
        title: 'Masquage double aveugle',
        desc: 'Observateurs pseudonymisés et protocole strictement aveugle — aucune information croisée ne peut biaiser la détection.',
      },
      {
        title: 'Concordance inter-observateurs',
        desc: 'Le moteur scientifique calcule taux d’accord, délais de réaction et précision de chaque observateur.',
      },
      {
        title: 'Exports PDF & CSV',
        desc: 'Un rapport exécutif imprimable et un export CSV brut de toutes les mesures, prêts à archiver et publier.',
      },
    ],
    footerTagline: 'Vision Analytics — observation vidéo scientifique, en double aveugle.',
    footerCta: 'Explorer les expériences',
  },
  observe: {
    eyebrow: 'Espace observateur',
    title: 'Sessions d’observation scientifique',
    subtitle: 'Rejoignez une étude active en double aveugle ou testez le lecteur d’annotation libre ci-dessous.',
    sectionHeading: 'Expériences actives',
    blindTag: 'En aveugle',
    awaitingVideoTag: 'Vidéo en attente',
    noActiveTitle: 'Aucune expérience active pour le moment.',
    noActiveHint: 'Les chercheurs peuvent en lancer une depuis l’espace',
    noActiveAdmin: 'Administration',
    noActiveSuffix: ', ou tester le lecteur libre ci-dessous.',
    participate: 'Participer',
    createdLabel: 'Publié le',
    freeEyebrow: 'Aucun projet requis',
    freeTitle: 'Lecteur d’annotation libre',
    freeSubtitle: 'Testez l’annotateur sur n’importe quel fichier vidéo local, sans l’attacher à une étude.',
  },
  session: {
    blindBadge: 'Protocole en double aveugle',
    activeLabel: 'Session d’observation active',
    changeProject: 'Changer d’expérience',
    guidelinesTitle: 'Directives de l’observateur',
    guidelines:
      'Chargez le fichier vidéo correspondant sur votre poste local. Visionnez la séquence à votre '
      + 'rythme, mettez en pause pour marquer chaque anomalie ou zone d’intérêt, puis capturez. Les '
      + 'fenêtres de référence restent confidentielles et sont validées automatiquement à la soumission.',
    targetVideoLabel: 'Vidéo cible de cette étude :',
    noVideoTitle: 'Le propriétaire de cette expérience n’a pas encore partagé le fichier vidéo.',
    noVideoBody: 'Revenez plus tard une fois la vidéo disponible, ou rejoignez l’une des autres expériences actives.',
    noVideoAction: 'Voir les expériences',
  },
  annotator: {
    chooseVideo: 'Choisir une vidéo…',
    recommendedVideo: 'Recommandée pour ce projet : {{name}}',
    localVideoHint: 'Vidéo locale — un fichier MP4, WebM ou MOV de votre ordinateur.',
    fileTypeError: 'Le fichier sélectionné n’est pas une vidéo (MP4, WebM, MOV…).',
    loading: 'Chargement de la vidéo…',
    playingChip: 'Lecture — mettez sur pause pour annoter',
    noVideoTitle: 'Aucune vidéo chargée.',
    noVideoHint: 'Sélectionnez un fichier ci-dessus pour démarrer votre session d’observation.',
    play: 'Lecture',
    pause: 'Pause',
    seekAria: 'Position dans la vidéo',
    duration: 'Durée',
    capture: 'Capturer l’observation',
    clearCircles: 'Effacer les cercles',
    clearWithCount: 'Effacer ({{n}})',
    hintLoad: 'Chargez une vidéo puis mettez-la sur pause pour commencer.',
    hintPlaying: 'Mettez la vidéo sur pause pour marquer vos zones d’intérêt.',
    hintPaused: 'Glissez sur la vidéo pour tracer un marqueur — ou cliquez pour en poser un — puis capturez.',
    panelTitle: 'Observations capturées',
    panelCount: 'En session : {{n}}',
    panelEmptyTitle: 'Aucune observation pour le moment',
    panelEmptyHint: 'Chargez la vidéo de l’étude, mettez sur pause, marquez une zone d’intérêt puis capturez.',
    deleteCaptureAria: 'Supprimer l’observation n°{{n}}',
    unitCircle: { one: 'cercle', many: 'cercles' },
    unitObservation: { one: 'observation', many: 'observations' },
    selKicker: 'Marqueur sélectionné',
    selDelete: 'Supprimer le marqueur',
    selDismiss: 'Fermer',
    selMoveHint: 'Glissez le marqueur pour affiner sa position.',
    submit: 'Terminer la session ({{n}})',
    endTitle: 'Vous êtes arrivé(e) à la fin de la vidéo.',
    endBody: 'Soumettez vos observations maintenant pour valider cette session en aveugle.',
    endSubmit: 'Soumettre maintenant',
    endLater: 'Revue d’abord',
    toastSuccessTitle: 'Session soumise avec succès',
    toastSuccessDesc: 'Vos observations ont été transmises et enregistrées en toute sécurité.',
  },
  stepper: {
    kicker: 'Protocole en aveugle',
    title: 'Soumission de la session — {{title}}',
    closeAria: 'Fermer la boîte de dialogue',
    progressAria: 'Progression de la soumission',
    step1: 'Revue des captures',
    step2: 'Identité observateur',
    step3: 'Envoi & validation',
    step1Title: 'Vérifiez vos captures avant soumission',
    step1Hint: 'Supprimez les captures involontaires ou imprécises. Seules les images retenues seront analysées.',
    step1Count: '{{n}} conservée(s)',
    step1Empty: 'Toutes les captures ont été supprimées. Annulez, ou marquez de nouvelles zones sur la vidéo.',
    step2Title: 'Identification scientifique',
    step2Hint:
      'Pour garantir l’impartialité des résultats, vos observations sont indexées sous un identifiant pseudonymisé.',
    recommendedTag: 'Recommandé',
    alternativeTag: 'Alternative',
    anonTitle: 'ID anonyme',
    anonDesc: 'Un identifiant unique conservé localement, sans aucune donnée personnelle.',
    emailTitle: 'Email observateur',
    emailDesc: 'Associe vos soumissions à votre adresse de recherche.',
    anonLabel: 'Votre identifiant anonyme de session',
    regen: 'Régénérer',
    anonHint: 'Cet identifiant est réutilisé sur vos futures sessions depuis ce navigateur.',
    emailLabel: 'Adresse email de l’observateur',
    emailPlaceholder: 'observateur.scientifique@institut.fr',
    step3Title: 'Prêt pour la transmission finale',
    step3Hint:
      'Les captures annotées seront téléversées vers un stockage sécurisé, puis comparées aux fenêtres de validation secrètes de l’étude.',
    recProject: 'Projet cible',
    recCount: 'Observations',
    recIdentifier: 'Identifiant',
    uploading: 'Téléversement des captures et validation en cours…',
    successTitle: 'Soumission enregistrée avec succès',
    successBody: 'Stockée en toute sécurité et validée contre les fenêtres scientifiques de l’étude.',
    finish: 'Terminer la session',
    back: 'Précédent',
    cancel: 'Annuler',
    nextIdentification: 'Suivant : Identification',
    nextConfirmation: 'Suivant : Confirmation',
    confirmUpload: 'Confirmer et téléverser',
    uploadingBtn: 'Envoi en cours…',
    deleteCapture: 'Supprimer cette capture',
    errorCaptures: 'Conservez au moins une capture pour soumettre cette session.',
    errorIdentifier: 'Veuillez renseigner ou générer un identifiant anonyme.',
    errorEmailInvalid: 'L’adresse email saisie est invalide.',
    errorEmailRequired: 'Veuillez renseigner une adresse email valide.',
    unitCapture: { one: 'capture', many: 'captures' },
    unitZone: { one: 'zone', many: 'zones' },
    timePrefix: 'T+',
  },
  completion: {
    kicker: 'Session en aveugle',
    title: 'Session d’observation terminée',
    body:
      'Vos observations annotées sont désormais enregistrées dans la base scientifique sécurisée. '
      + 'Merci d’avoir contribué à cette étude.',
    statLabel: 'Observations soumises',
    back: 'Retour aux expériences',
    again: 'Commencer une nouvelle session',
  },
}

export const dictionaries: Record<Locale, typeof en> = { en, fr }

export type Dictionary = typeof en
export type NavText = Dictionary['nav']
export type HomeText = Dictionary['home']
export type ObserveListText = Dictionary['observe']
export type SessionText = Dictionary['session']
export type AnnotatorText = Dictionary['annotator']
export type StepperText = Dictionary['stepper']
export type CompletionText = Dictionary['completion']

/** Remplit un gabarit `{{cle}}` avec les valeurs fournies. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

/** Renvoie le libellé adapté selon le nombre (pluriel simple). */
export function plural(unit: { one: string; many: string }, count: number): string {
  return count === 1 ? unit.one : unit.many
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}
