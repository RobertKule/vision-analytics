'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Ban,
  CheckCircle2,
  ClipboardCopy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import type { ObserverTokenRowDto } from '@/app/actions/observerTokenActions'
import {
  createObserverToken,
  listObserverTokens,
  reissueObserverToken,
  revokeObserverToken,
} from '@/app/actions/observerTokenActions'
import type { ReactivationRequestRow } from '@/app/actions/observerReactivationActions'
import {
  approveObserverReactivation,
  listObserverReactivationRequests,
  rejectObserverReactivation,
} from '@/app/actions/observerReactivationActions'
import { copyToClipboard, formatDateTime, inputClass, labelClass } from '@/components/admin/projects/projectFormat'
import { friendlyActionError } from '@/lib/actionError'

/** Statut effectif d'un lien : un ACTIVE dont la date d'expiration est dépassée est expiré. */
function effectiveStatus(token: ObserverTokenRowDto): ObserverTokenRowDto['status'] {
  if (token.status === 'ACTIVE' && token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return 'EXPIRED'
  }
  return token.status
}

const STATUS_UI: Record<
  ObserverTokenRowDto['status'],
  { label: string; className: string; dot: string }
> = {
  ACTIVE: {
    label: 'Actif',
    className: 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200',
    dot: 'bg-gold-500',
  },
  COMPLETED: {
    label: 'Session terminée',
    className: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300',
    dot: 'bg-zinc-400',
  },
  REVOKED: {
    label: 'Révoqué',
    className: 'bg-clay-50 text-clay-700 ring-1 ring-clay-200/70 dark:bg-clay-500/10 dark:text-clay-300 dark:ring-clay-500/20',
    dot: 'bg-clay-500',
  },
  EXPIRED: {
    label: 'Expiré',
    className: 'bg-zinc-200/70 text-zinc-600 dark:bg-white/5 dark:text-zinc-400',
    dot: 'bg-zinc-400',
  },
}

type ValidDays = number | null
const VALIDITY_OPTIONS: Array<{ value: ValidDays; label: string }> = [
  { value: null, label: 'Sans expiration' },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 60, label: '60 jours' },
  { value: 90, label: '90 jours' },
  { value: 180, label: '180 jours' },
  { value: 365, label: '1 an' },
]

/** Lien d'accès complet d'un jeton brut (`/share/<JETON>`). */
function shareUrl(rawToken: string): string {
  return `${window.location.origin}/share/${rawToken}`
}

type ObserverTokensTabProps = {
  projectId: string
  projectTitle: string
}

/**
 * Onglet « Partager » de l'espace projet admin — gestion des liens d'accès observateur.
 *
 * Un lien = un jeton aléatoire (dont seul le hash est stocké) ouvrant UNE session sur
 * CE projet. Le jeton brut n'est montré qu'à sa création / à son remplacement : il est
 * à transmettre hors-ligne à l'observateur, qui l'ouvre via `/share/<JETON>`.
 */
export default function ObserverTokensTab({ projectId, projectTitle }: ObserverTokensTabProps) {
  const [tokens, setTokens] = useState<ObserverTokenRowDto[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // ——— Demandes de réactivation (Partie A4) ———
  const [reactivationRequests, setReactivationRequests] = useState<ReactivationRequestRow[] | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  // ——— Création ———
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [validDays, setValidDays] = useState<ValidDays>(null)
  const [busy, setBusy] = useState(false)

  // ——— Affichage « lien unique » (création ou remplacement) ———
  const [revealed, setRevealed] = useState<{ title: string; link: string } | null>(null)
  const [copying, setCopying] = useState(false)

  type TokenListResult = Awaited<ReturnType<typeof listObserverTokens>>
  const applyResult = useCallback((result: TokenListResult) => {
    if (!result.ok) {
      setLoadError(result.error)
      setTokens([])
    } else {
      setLoadError(null)
      setTokens(result.tokens)
    }
    setLoading(false)
  }, [])

  const load = useCallback(async () => {
    applyResult(await listObserverTokens(projectId))
  }, [projectId, applyResult])

  /** Rechargement manuel (bouton « Réessayer ») : bascule l'état de chargement. */
  const reload = useCallback(async () => {
    setLoading(true)
    await load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void listObserverTokens(projectId).then((result) => {
      if (!cancelled) applyResult(result)
    })
    void listObserverReactivationRequests(projectId).then((result) => {
      if (!cancelled) setReactivationRequests(result.ok ? result.requests : [])
    })
    return () => {
      cancelled = true
    }
  }, [projectId, applyResult])

  const reloadReactivation = async () => {
    const result = await listObserverReactivationRequests(projectId).catch(() => ({ ok: false as const, error: '' }))
    setReactivationRequests(result.ok ? result.requests : [])
  }

  const handleDecideReactivation = async (requestId: string, approve: boolean) => {
    setDecidingId(requestId)
    const result = approve
      ? await approveObserverReactivation(requestId).catch((error: unknown) => ({
          ok: false as const,
          error: friendlyActionError(error, 'fr'),
        }))
      : await rejectObserverReactivation(requestId).catch((error: unknown) => ({
          ok: false as const,
          error: friendlyActionError(error, 'fr'),
        }))
    setDecidingId(null)
    if (!result.ok) {
      toast.error(approve ? 'Confirmation impossible' : 'Refus impossible', { description: result.error })
      return
    }
    toast.success(approve ? 'Accès réactivé' : 'Demande refusée', {
      description: approve
        ? 'L’observateur peut reprendre sa session.'
        : 'L’accès reste désactivé ; aucune donnée n’a été supprimée.',
    })
    await reloadReactivation()
    await load()
  }

  const handleCreate = async () => {
    setBusy(true)
    const result = await createObserverToken({ projectId, validDays }).catch((error: unknown) => ({
      ok: false as const,
      error: friendlyActionError(error, 'fr'),
    }))
    setBusy(false)
    if (!result.ok) {
      toast.error('Création impossible', { description: result.error })
      return
    }
    setIsCreateOpen(false)
    setValidDays(null)
    await load()
    setRevealed({ title: 'Nouveau lien d’accès', link: shareUrl(result.rawToken) })
  }

  const handleRevoke = (token: ObserverTokenRowDto) => {
    const label = STATUS_UI[effectiveStatus(token)].label
    toast.warning(`Révoquer ce lien ${label.toLowerCase()} ?`, {
      description:
        'Il deviendra inutilisable immédiatement, même si l’observateur l’a déjà ouvert. Cette action est irréversible.',
      action: {
        label: 'Révoquer',
        onClick: async () => {
          const result = await revokeObserverToken(token.id).catch((error: unknown) => ({
            ok: false as const,
            error: friendlyActionError(error, 'fr'),
          }))
          if (!result.ok) {
            toast.error('Révocation impossible', { description: result.error })
            return
          }
          toast.success('Lien révoqué', { description: 'L’observateur ne peut plus accéder à la session.' })
          await load()
        },
      },
      cancel: { label: 'Annuler', onClick: () => {} },
    })
  }

  const handleReissue = (token: ObserverTokenRowDto) => {
    toast.warning('Remplacer ce lien ?', {
      description:
        'Le lien actuel sera révoqué et un nouveau lien sera généré pour ce projet. Vous ne pourrez afficher le nouveau lien qu’une seule fois.',
      action: {
        label: 'Remplacer',
        onClick: async () => {
          const result = await reissueObserverToken({ tokenId: token.id }).catch((error: unknown) => ({
            ok: false as const,
            error: friendlyActionError(error, 'fr'),
          }))
          if (!result.ok) {
            toast.error('Remplacement impossible', { description: result.error })
            return
          }
          toast.success('Lien remplacé', { description: 'L’ancien lien est révoqué.' })
          await load()
          setRevealed({ title: 'Lien remplacé', link: shareUrl(result.rawToken) })
        },
      },
      cancel: { label: 'Annuler', onClick: () => {} },
    })
  }

  const handleCopyRevealed = async () => {
    if (!revealed) return
    setCopying(true)
    const ok = await copyToClipboard(revealed.link)
    setCopying(false)
    if (ok) {
      toast.success('Lien copié', {
        description: 'Transmettez-le à l’observateur (il ne sera plus jamais affiché ici).',
      })
    } else {
      toast.error('Copie impossible', { description: revealed.link })
    }
  }

  const activeCount = tokens?.filter((t) => effectiveStatus(t) === 'ACTIVE').length ?? 0

  return (
    <div className="flex flex-col gap-5">
      {/* ——— En-tête & actions ——— */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Chaque lien d’accès ouvre <span className="font-semibold text-zinc-900 dark:text-zinc-100">une session
            d’observation</span> sur «&nbsp;{projectTitle}&nbsp;». Transmettez le lien généré à un observateur de votre
            protocole&nbsp;: il l’ouvre, enregistre ses observations, puis son lien passe en consultation (lecture
            seule).
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Le jeton secret n’est jamais stocké sur nos serveurs — il n’apparaît qu’une seule fois, à la création.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-semibold text-milk shadow-sm transition-colors hover:bg-ink-soft dark:bg-milk dark:text-ink dark:hover:bg-white/90"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Nouveau lien d’accès
        </button>
      </div>

      {/* ——— Erreur / vide / liste ——— */}
      {loadError ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-clay-200 bg-clay-50 p-4 dark:border-clay-900 dark:bg-clay-950/40">
          <p className="text-sm font-medium text-clay-700 dark:text-clay-300">{loadError}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-clay-300 px-3 text-xs font-semibold text-clay-700 transition-colors hover:bg-clay-100 dark:border-clay-700 dark:text-clay-300 dark:hover:bg-clay-900"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Réessayer
          </button>
        </div>
      ) : tokens === null || loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-sm text-zinc-500 dark:border-white/10 dark:bg-[#161b22] dark:text-zinc-400">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Chargement des liens…
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-white/10 dark:bg-[#161b22]">
          <KeyRound aria-hidden="true" className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-200">Aucun lien d’accès pour l’instant</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Créez un lien pour inviter un observateur à rejoindre cette session.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-[#161b22]">
          {tokens.map((token) => {
            const status = effectiveStatus(token)
            const ui = STATUS_UI[status]
            const canRevoke = status === 'ACTIVE' || status === 'COMPLETED' || status === 'EXPIRED'
            return (
              <li key={token.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ui.className}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${ui.dot}`} />
                  {ui.label}
                </span>

                <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Créé le
                    </dt>
                    <dd className="text-xs text-zinc-700 dark:text-zinc-300">{formatDateTime(token.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Expiration
                    </dt>
                    <dd className="text-xs text-zinc-700 dark:text-zinc-300">
                      {token.expiresAt ? formatDateTime(token.expiresAt) : 'Sans expiration'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Dernier accès
                    </dt>
                    <dd className="text-xs text-zinc-700 dark:text-zinc-300">
                      {token.lastAccessedAt ? formatDateTime(token.lastAccessedAt) : 'Jamais ouvert'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      Fin de session
                    </dt>
                    <dd className="text-xs text-zinc-700 dark:text-zinc-300">
                      {token.completedAt ? formatDateTime(token.completedAt) : '—'}
                    </dd>
                  </div>
                </dl>

                <div className="flex shrink-0 items-center gap-2">
                  {canRevoke ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(token)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-clay-300 px-2.5 text-xs font-semibold text-clay-700 transition-colors hover:bg-clay-50 dark:border-clay-700 dark:text-clay-300 dark:hover:bg-clay-900"
                    >
                      <Ban aria-hidden="true" className="h-3.5 w-3.5" />
                      Révoquer
                    </button>
                  ) : null}
                  {status === 'REVOKED' || status === 'COMPLETED' || status === 'EXPIRED' ? (
                    <button
                      type="button"
                      onClick={() => handleReissue(token)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
                    >
                      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                      Remplacer
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* ——— Demandes de réactivation (Partie A4–A6) ——— */}
      {reactivationRequests !== null && reactivationRequests.length > 0 ? (
        <section aria-label="Demandes de réactivation" className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Demandes de réactivation</h3>
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-white/5 dark:border-white/10 dark:bg-[#161b22]">
            {reactivationRequests.map((request) => {
              const pending = request.status === 'PENDING'
              return (
                <li key={request.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      pending
                        ? 'bg-gold-500/15 text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
                        : request.status === 'APPROVED'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                    }`}
                  >
                    {pending ? 'En attente' : request.status === 'APPROVED' ? 'Approuvée' : 'Refusée'}
                  </span>

                  <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Observateur
                      </dt>
                      <dd className="text-xs text-zinc-700 dark:text-zinc-300">{request.observerLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Projet
                      </dt>
                      <dd className="text-xs text-zinc-700 dark:text-zinc-300">{request.projectTitle}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                        Demandé le
                      </dt>
                      <dd className="text-xs text-zinc-700 dark:text-zinc-300">{formatDateTime(request.requestedAt)}</dd>
                    </div>
                  </dl>

                  {pending ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDecideReactivation(request.id, true)}
                        disabled={decidingId === request.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-2.5 text-xs font-semibold text-milk transition-colors hover:bg-ink-soft disabled:opacity-50 dark:bg-milk dark:text-ink"
                      >
                        {decidingId === request.id ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDecideReactivation(request.id, false)}
                        disabled={decidingId === request.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-clay-300 px-2.5 text-xs font-semibold text-clay-700 transition-colors hover:bg-clay-50 disabled:opacity-50 dark:border-clay-700 dark:text-clay-300 dark:hover:bg-clay-900"
                      >
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                        Refuser
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {reactivationRequests.some((request) => request.status !== 'PENDING') ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Seules les demandes en attente sont décidables.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ——— Note de bonnes pratiques ——— */}
      {activeCount > 0 ? (
        <p className="inline-flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-500 dark:border-white/10 dark:bg-[#161b22] dark:text-zinc-400">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gold-700 dark:text-gold-400" />
          <span>
            {activeCount} lien{activeCount > 1 ? 'x' : ''} actif{activeCount > 1 ? 's' : ''} sur ce projet. Pour
            empêcher un observateur d’accéder à une session, révoquez son lien — la révocation est immédiate.
          </span>
        </p>
      ) : null}

      {/* ——— Panneau « Nouveau lien » (durée de validité) ——— */}
      {isCreateOpen ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="token-create-title">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setIsCreateOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-hidden border-l border-line bg-milk shadow-2xl dark:border-white/10 dark:bg-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-white/10">
              <h2 id="token-create-title" className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                Nouveau lien d’accès
              </h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Un lien unique sera généré pour «&nbsp;<span className="font-semibold">{projectTitle}</span>&nbsp;».
                Vous ne pourrez le voir qu’une fois&nbsp;: copiez-le immédiatement pour l’envoyer à l’observateur.
              </p>

              <div>
                <label htmlFor="token-validity" className={labelClass}>
                  Durée de validité
                </label>
                <select
                  id="token-validity"
                  value={validDays === null ? '' : String(validDays)}
                  onChange={(event) =>
                    setValidDays(event.target.value === '' ? null : Number(event.target.value))
                  }
                  className={inputClass}
                >
                  {VALIDITY_OPTIONS.map((option) => (
                    <option key={String(option.value)} value={option.value === null ? '' : option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Au-delà de cette durée, le lien devient inutilisable (expiration automatique).
                </p>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-4 dark:border-white/10">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="inline-flex h-9 items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={busy}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
              >
                {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                Générer le lien
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* ——— Révélation unique du lien (création / remplacement) ——— */}
      {revealed ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="token-reveal-title">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setRevealed(null)}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gold-500/30 bg-milk shadow-2xl dark:border-gold-500/20 dark:bg-card">
            <div className="border-b border-line px-5 py-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <h2 id="token-reveal-title" className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-50">
                  <Share2 aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
                  {revealed.title}
                </h2>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setRevealed(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p className="inline-flex items-start gap-2 rounded-lg border border-clay-200 bg-clay-50 p-3 text-xs font-medium leading-relaxed text-clay-700 dark:border-clay-900 dark:bg-clay-950/40 dark:text-clay-300">
                <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Ce lien ne sera plus jamais affiché&nbsp;: copiez-le maintenant et transmettez-le à l’observateur par
                  un canal sûr. Quiconque détient ce lien peut ouvrir une session d’observation sur ce projet.
                </span>
              </p>

              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-zinc-950">
                    <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-gold-700 dark:text-gold-400" />
                    <code className="truncate font-mono text-xs text-zinc-800 dark:text-zinc-200">{revealed.link}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyRevealed()}
                    disabled={copying}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:opacity-60 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
                  >
                    {copying ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ClipboardCopy aria-hidden="true" className="h-4 w-4" />}
                    Copier
                  </button>
                </div>
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                L’observateur ouvre ce lien dans son navigateur (mobile ou bureau). S’il interrompt sa session, il peut
                la reprendre plus tard avec le même lien.
              </p>
            </div>

            <footer className="flex items-center justify-end border-t border-line px-5 py-4 dark:border-white/10">
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
                J’ai copié le lien
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
