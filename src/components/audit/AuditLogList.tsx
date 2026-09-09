import {
  Activity,
  Clapperboard,
  Download,
  Eye,
  FolderKanban,
  Lock,
  MapPin,
  Share2,
  User,
} from 'lucide-react'

export type AuditRowProps = {
  id: string
  dateLabel: string
  actionLabel: string
  kindKey: string
  kindLabel: string
  resourceLabel: string | null
  actorName: string | null
  actorRole: string | null
  isSelf: boolean
  selfLabel: string
  chips: string[]
  destructive: boolean
}

const KIND_ICON: Record<string, typeof Activity> = {
  auth: Lock,
  user: User,
  project: FolderKanban,
  video: Clapperboard,
  point: MapPin,
  observation: Eye,
  share: Share2,
  export: Download,
}

/** Liste visuelle d'entrées du journal d'audit (rendu serveur, sans état). */
export default function AuditLogList({
  rows,
  emptyLabel,
}: {
  rows: AuditRowProps[]
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-white/60 px-6 py-14 text-center dark:bg-white/5">
        <Activity aria-hidden="true" className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const Icon = KIND_ICON[row.kindKey] ?? Activity
        return (
          <li
            key={row.id}
            className="rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#161b22]"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <time
                dateTime={row.id}
                className="min-w-[7.5rem] text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400"
              >
                {row.dateLabel}
              </time>

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                {row.actorName ? (
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-[10px] font-bold text-milk dark:bg-milk dark:text-ink"
                    >
                      {(row.actorName[0] ?? '?').toUpperCase()}
                    </span>
                    <span className="truncate">{row.actorName}</span>
                    {row.isSelf ? (
                      <span className="rounded-full border border-gold-500/50 px-1.5 py-0.5 text-[10px] font-bold text-gold-700 dark:text-gold-300">
                        {row.selfLabel}
                      </span>
                    ) : null}
                    {row.actorRole ? (
                      <span className="hidden rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-white/10 dark:text-zinc-400 sm:inline">
                        {row.actorRole}
                      </span>
                    ) : null}
                  </span>
                ) : null}

                <span
                  className={
                    row.destructive
                      ? 'rounded-full bg-clay-50 px-2 py-0.5 text-[11px] font-bold text-clay-700 dark:bg-clay-500/10 dark:text-clay-300'
                      : 'rounded-full bg-gold-500/15 px-2 py-0.5 text-[11px] font-bold text-gold-800 dark:bg-gold-400/10 dark:text-gold-200'
                  }
                >
                  {row.actionLabel}
                </span>
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2 py-1 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                <Icon aria-hidden="true" className="h-3.5 w-3.5 text-gold-700 dark:text-gold-400" />
                <span className="font-medium">{row.kindLabel}</span>
                {row.resourceLabel ? (
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                    : {row.resourceLabel}
                  </span>
                ) : null}
              </span>
            </div>

            {row.chips.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-2 dark:border-white/5">
                {row.chips.map((chip) => (
                  <code
                    key={chip}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
                  >
                    {chip}
                  </code>
                ))}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
