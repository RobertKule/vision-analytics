import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { CheckCircle2, EyeOff, Film, Hourglass, ShieldCheck } from 'lucide-react'
import {
  getBlindProject,
  getObserverPartStates,
  getObserverSessionCaptures,
  getObserverSessionRecap,
  type ObserverSessionRecapResult,
} from '@/app/actions/observationActions'
import { getObserverReactivationState } from '@/app/actions/observerReactivationActions'
import AccessGate, { type AccessGateReactivation } from '@/components/observer/AccessGate'
import ReactivationRequestButton from '@/components/observer/ReactivationRequestButton'
import VideoAnnotator from '@/components/VideoAnnotator'
import { getCurrentSession } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import { readObserverScopeFromCookies, resolveObserverGate } from '@/lib/observerAccess'
import { secondsToTimecode } from '@/lib/timecode'

type PageProps = {
  params: Promise<{ projectId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params
  const locale = await getLocale()
  const project = await getBlindProject(projectId)

  if (!project) {
    return {
      title: locale === 'en' ? 'Experiment not found' : 'Expérience introuvable',
    }
  }

  return {
    title:
      locale === 'en'
        ? `Observe: ${project.title}`
        : `Observation : ${project.title}`,
    description:
      locale === 'en'
        ? `Independent scientific observation session for the experiment “${project.title}”.`
        : `Session d’observation scientifique indépendante pour l’expérience « ${project.title} ».`,
  }
}

/**
 * Page d'observation d'un projet (parcours observateur). Contrairement au parcours
 * historique (sélection publique), l'entrée est désormais STRICTEMENT liée à un lien
 * d'accès : sans jeton valide posé dans le cookie `va_observer`, aucune session ne
 * s'affiche — le serveur reste l'unique source de vérité du statut du jeton.
 *
 *   session connectée        → redirection vers la coquille applicative `/experience/[id]`.
 *   jeton ACTIVE (en cours)  → annotateur ; le `runId` est IMPOSÉ par le serveur.
 *   jeton COMPLETED (fini)   → consultation en LECTURE SEULE des captures certifiées.
 *   pas de jeton / autre projet / révoqué → panneau « accès par invitation ».
 */
export default async function ObserveProjectPage({ params }: PageProps) {
  const { projectId } = await params

  // Les sessions connectées observent depuis la coquille applicative `/experience/[id]`.
  if (await getCurrentSession()) {
    redirect(`/experience/${projectId}`)
  }

  const locale = await getLocale()
  const d = getDictionary(locale)
  const share = d.shareAccess

  // ——— Porte d'accès : le cookie de portée doit correspondre à CE projet (base à l'appui).
  const gate = await resolveObserverGate(projectId)
  if (!gate.ok) {
    // Un lien d'accès EST présent mais révoqué/expiré : on propose la demande de
    // réactivation au lieu d'un simple refus définitif.
    const scope = await readObserverScopeFromCookies()
    const canRequest = scope !== null && scope.projectId === projectId
    const reactivationState = canRequest ? await getObserverReactivationState(projectId) : { ok: false as const }
    const reactivation: AccessGateReactivation | undefined =
      canRequest
        ? {
            projectId,
            locale,
            initiallyPending: reactivationState.ok ? reactivationState.pending : false,
            text: {
              inactiveTitle: share.reactivationTitle,
              inactiveHint: share.reactivationHint,
              cta: share.reactivationCta,
              alreadyPending: share.reactivationAlreadyPending,
              sent: share.reactivationSent,
              sentHint: share.reactivationSentHint,
              error: share.reactivationError,
            },
          }
        : undefined
    return (
      <AccessGate
        text={{
          title: share.inactiveTitle,
          body: share.inactiveBody,
          contactHint: share.contactHint,
          ctaHome: share.ctaHome,
          ctaDocs: share.ctaDocs,
        }}
        reactivation={reactivation}
      />
    )
  }

  const project = await getBlindProject(projectId)
  if (!project) {
    notFound()
  }

  // ——— Jeton clôturé : consultation en lecture seule de la session de l'observateur.
  if (gate.completed) {
    const recap = await getObserverSessionRecap(projectId)
    const reactivationState = await getObserverReactivationState(projectId)
    const reactivationText = {
      inactiveTitle: share.reactivationTitle,
      inactiveHint: share.reactivationHint,
      cta: share.reactivationCta,
      alreadyPending: share.reactivationAlreadyPending,
      sent: share.reactivationSent,
      sentHint: share.reactivationSentHint,
      error: share.reactivationError,
    }
    return (
      <ReadOnlySession
        project={project}
        recap={recap.ok ? recap : null}
        shareText={share}
        reactivation={{
          projectId,
          locale,
          initiallyPending: reactivationState.ok ? reactivationState.pending : false,
          text: reactivationText,
        }}
      />
    )
  }

  // ——— Session en cours : annotateur plein, `runId` imposé par le serveur.
  const t = d.session
  // État par partie (parties déjà envoyées → verrouillées) pour la reprise.
  const partStates = await getObserverPartStates(projectId)
  const submittedPartKeys = partStates.ok
    ? partStates.parts.filter((part) => part.submitted).map((part) => part.key)
    : []
  // Captures déjà persistées de la session (reprise / réactivation) : l'observateur
  // retrouve exactement où il s'était arrêté au lieu de repartir de zéro.
  const sessionCaptures = await getObserverSessionCaptures(projectId)
  const initialSessionCaptures = sessionCaptures.ok ? sessionCaptures.captures : []
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
            <EyeOff aria-hidden="true" className="h-3 w-3" />
            {t.blindBadge}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">•</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
            </span>
            {t.activeLabel}
          </span>
        </div>

        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {project.title}
        </h1>

        {project.description && (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {project.description}
          </p>
        )}
      </header>

      {/* Bannière de rigueur scientifique */}
      <div className="mb-6 rounded-xl border border-gold-500/20 bg-gradient-to-r from-gold-500/[0.07] to-transparent p-4 text-xs leading-relaxed text-zinc-600 dark:border-gold-500/15 dark:from-gold-500/10 dark:to-transparent dark:text-zinc-400">
        <p className="inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
          {t.guidelinesTitle}
        </p>
        <p className="mt-1.5">{t.guidelines}</p>
      </div>

      {project.videoUrl && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-white/10 dark:bg-[#161b22] dark:text-zinc-300">
          <Film aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
          <span>{t.targetVideoLabel}</span>
          <code className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{project.videoUrl}</code>
        </div>
      )}

      {/* Le VideoAnnotator gère aussi le cas « pas encore de vidéo » :
          repli interactif — coller une URL ou charger un fichier local (.mp4/.webm). */}
      <VideoAnnotator
        projectId={project.id}
        projectTitle={project.title}
        expectedVideoUrl={project.videoUrl}
        videos={project.videos}
        observationTypes={project.observationTypes}
        locale={locale}
        initialRunId={gate.runId}
        singleShot
        submittedPartKeys={submittedPartKeys}
        initialSessionCaptures={initialSessionCaptures}
        backHref={`/observe/${project.id}`}
        t={{
          annotator: d.annotator,
          stepper: d.stepper,
          completion: d.completion,
        }}
      />
    </div>
  )
}

type ShareText = ReturnType<typeof getDictionary>['shareAccess']

type ReactivationRequest = {
  projectId: string
  locale: 'fr' | 'en'
  initiallyPending: boolean
  text: {
    inactiveTitle: string
    inactiveHint: string
    cta: string
    alreadyPending: string
    sent: string
    sentHint: string
    error: string
  }
}

/** Consultation en lecture seule d'une session d'observation terminée. */
function ReadOnlySession({
  project,
  recap,
  shareText,
  reactivation,
}: {
  project: { id: string; title: string; description?: string | null }
  recap: (NonNullable<ObserverSessionRecapResult & { ok: true }>) | null
  shareText: ShareText
  reactivation?: ReactivationRequest
}) {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold-800 dark:bg-gold-400/10 dark:text-gold-200">
            <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
            {shareText.readonlyTitle}
          </span>
        </div>

        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          {project.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {shareText.readonlyBody}
        </p>
      </header>

      {/* ——— Demande de réactivation (l'observateur demande, l'ADMIN décide) ——— */}
      {reactivation ? (
        <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-[#161b22]">
          <ReactivationRequestButton
            projectId={reactivation.projectId}
            locale={reactivation.locale}
            initiallyPending={reactivation.initiallyPending}
            text={reactivation.text}
          />
        </div>
      ) : null}

      {recap === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{shareText.emptyCaption}</p>
      ) : (
        <>
          {/* Seul le décompte NEUTRE des captures de l'observateur s'affiche — ni
              « fenêtres de validation détectées », ni « fausses alertes » : la vérité
              de validation reste aveugle pour l'observateur, y compris après sa session. */}
          {recap.rows.length > 0 ? (
            <div className="mb-8 flex flex-wrap gap-3">
              <div className="inline-flex min-w-[11rem] items-center gap-3 rounded-xl border border-gold-500/25 bg-white p-4 dark:border-gold-500/20 dark:bg-[#161b22]">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-gold-700 dark:text-gold-400" />
                <div>
                  <p className="font-mono text-2xl font-black tabular-nums text-zinc-900 dark:text-zinc-50">
                    {recap.rows.length}
                  </p>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {shareText.statCaptures}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {recap.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-white/10 dark:bg-[#161b22]">
              <Hourglass aria-hidden="true" className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">{shareText.emptyCaption}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recap.rows.map((row) => (
                <li
                  key={row.id}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#161b22]"
                >
                  <a href={row.imageEndpoint} target="_blank" rel="noreferrer noopener" className="group block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.imageEndpoint}
                      alt={`${shareText.captureChip.replace('{{t}}', secondsToTimecode(row.timestampTotal))}`}
                      loading="lazy"
                      className="aspect-video w-full bg-black object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </a>
                  <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-white/5">
                    <span className="font-mono text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      T+ {secondsToTimecode(row.timestampTotal)}
                    </span>
                    {row.observationType && (
                      <span className="truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        {row.observationType}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
