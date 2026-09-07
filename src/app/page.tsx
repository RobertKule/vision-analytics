import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Plateforme d’observation vidéo scientifique',
  description:
    'Plateforme d’analyse de vidéos scientifiques : lecture image par image, annotation par zones d’intérêt et capture horodatée d’observations.',
}

const features = [
  {
    title: 'Lecture vidéo locale',
    description:
      'Importez une vidéo depuis votre ordinateur et parcourez-la précisément, image par image, sans upload préalable.',
    icon: '🎞️',
  },
  {
    title: 'Annotation par zones d’intérêt',
    description:
      'Mettez en pause, puis tracez des cercles rouges directement sur la frame pour signaler les régions à observer.',
    icon: '⭕',
  },
  {
    title: 'Captures horodatées',
    description:
      'Chaque observation associe un horodatage vidéo précis à une capture PNG annotée, consultable en liste latérale.',
    icon: '📸',
  },
]

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12 sm:py-16">
      <header className="mb-10 flex items-center justify-between">
        <p className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-red-600" />
          Vision Analytics
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/projects"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Administration
          </Link>
          <Link
            href="/observe"
            className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Démarrer
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">
            Plateforme d’observation scientifique
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Analysez vos vidéos scientifiques, frame par frame.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Vision Analytics permet aux observateurs de charger un enregistrement local, de
            marquer des zones d’intérêt sur l’image et de consigner des observations précises,
            horodatées à la seconde.
          </p>
          <div className="mt-8">
            <Link
              href="/observe"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-red-600 px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
            >
              Démarrer une session d’observation
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section
          aria-label="Fonctionnalités"
          className="mt-14 grid gap-4 sm:grid-cols-3"
        >
          {features.map((feature) => (
            <article
              key={feature.title}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span aria-hidden="true" className="text-2xl">
                {feature.icon}
              </span>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {feature.title}
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {feature.description}
              </p>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
