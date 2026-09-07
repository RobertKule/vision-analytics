import type { Metadata } from 'next'
import Link from 'next/link'
import { Activity, Eye, EyeOff, FileDown, LogIn, Timer, Users } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Vision Analytics — Observation vidéo scientifique en double aveugle',
  description:
    'Plateforme SaaS d’analyse vidéo scientifique : sessions d’observation en double aveugle, masquage des fenêtres temporelles, concordance inter-observateurs et exports PDF / CSV.',
}

const features = [
  {
    title: 'Incertitude Temporelle',
    description:
      'Les fenêtres de validation restent confidentielles : chaque observateur visionne la vidéo sans connaître les secondes exactes qui feront foi.',
    icon: Timer,
  },
  {
    title: 'Masquage Double Aveugle',
    description:
      'Observateurs pseudonymisés et protocole à l’aveugle : aucune information croisée ne peut biaiser la détection des zones d’intérêt.',
    icon: EyeOff,
  },
  {
    title: 'Concordance Inter-Observateurs',
    description:
      'Le moteur scientifique calcule automatiquement les taux de concordance, délais de réaction et précisions de chaque observateur.',
    icon: Users,
  },
  {
    title: 'Exports PDF & CSV',
    description:
      'Rapport exécutif imprimable et export CSV brut de toutes les mesures : de quoi archiver et publier vos résultats en toute rigueur.',
    icon: FileDown,
  },
]

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
      {/* ——— Héros ——— */}
      <section className="flex flex-1 flex-col justify-center py-16 sm:py-24">
        <p className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <Activity aria-hidden="true" className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
          Plateforme d’observation vidéo scientifique
        </p>

        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-zinc-50">
          Analysez vos vidéos scientifiques,{' '}
          <span className="text-red-600 dark:text-red-500">en double aveugle.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Vision Analytics orchestre vos sessions d’observation : les observateurs annotent et
          capturent des événements sur la vidéo, sans jamais connaître les fenêtres temporelles qui
          font foi. À la soumission, la concordance inter-observateurs est calculée automatiquement.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/observe"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
          >
            <Eye aria-hidden="true" className="h-5 w-5" />
            Lancer une Session d’Observation
          </Link>
          <Link
            href="/admin/projects"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 text-base font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <LogIn aria-hidden="true" className="h-4 w-4" />
            Espace Administrateur · Se connecter
          </Link>
        </div>

        <p className="mt-6 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Aucune création de compte requise pour observer : un identifiant anonyme et pseudonymisé
          est conservé localement dans votre navigateur.
        </p>
      </section>

      {/* ——— Fonctionnalités ——— */}
      <section aria-labelledby="features-title" className="pb-16 sm:pb-20">
        <div className="mb-6 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
            Pourquoi Vision Analytics
          </p>
          <h2 id="features-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Une rigueur méthodologique pensée pour la recherche
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <article
                key={feature.title}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {feature.description}
                </p>
              </article>
            )
          })}
        </div>
      </section>

      {/* ——— Pied de page minimal ——— */}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 py-8 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        <span>Vision Analytics — plateforme d’observation vidéo scientifique.</span>
        <Link href="/observe" className="font-medium text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-400 dark:hover:text-red-400">
          Accéder à l’espace observateur
        </Link>
      </footer>
    </main>
  )
}
