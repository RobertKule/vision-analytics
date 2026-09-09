'use client'

import { useState } from 'react'
import { Film, Play } from 'lucide-react'
import { extractYoutubeVideoId, youtubeEmbedUrl } from '@/lib/youtube'

/**
 * Emplacement de la « vidéo de démonstration » (landing publique) — Partie AJOUT
 * YouTube. Aucun backend vidéo, aucun stockage : le composant accepte une URL
 * YouTube (`youtubeUrl`) et ne fait que l'intégrer quand elle est fournie.
 *
 * — URL ABSENTE → placeholder visuel élégant (format 16:9, aucune requête).
 * — URL PRÉSENTE → vignette poster avec bouton « ▶ Voir la démonstration » ;
 *   l'iframe YouTube (sans cookies, `youtube-nocookie`) n'est montée qu'après
 *   un clic — le chargement initial de la landing reste léger.
 * — Ratio 16:9 fixe, responsive (pleine largeur du conteneur), adapté
 *   desktop / mobile. Le texte est transmis depuis la couche serveur (i18n).
 */
export default function DemoVideo({
  youtubeUrl = null,
  playLabel,
  frameLabel,
  placeholderTitle,
  placeholderHint,
  className = '',
}: {
  youtubeUrl?: string | null
  /** Libellé du bouton lecture (ex. « Voir la démonstration »). */
  playLabel: string
  /** Nom accessible du cadre vidéo. */
  frameLabel: string
  /** Titre affiché quand aucune vidéo n'est fournie. */
  placeholderTitle: string
  /** Indication secondaire du placeholder (facultatif). */
  placeholderHint?: string
  /** Classes supplémentaires sur le cadre (largeur max, marges…). */
  className?: string
}) {
  const videoId = youtubeUrl ? extractYoutubeVideoId(youtubeUrl) : null
  const [playing, setPlaying] = useState(false)

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0D1117] ring-1 ring-white/10 ${className}`}
    >
      {videoId === null ? (
        /* ——— Aucune vidéo : emplacement réservé, élégant, sans requête ——— */
        <div
          role="img"
          aria-label={frameLabel}
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#D4A359]">
            <Film aria-hidden="true" className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-[#FBF9F5]">{placeholderTitle}</p>
          {placeholderHint ? (
            <p className="max-w-sm text-xs leading-relaxed text-[#FBF9F5]/50">
              {placeholderHint}
            </p>
          ) : null}
        </div>
      ) : playing ? (
        /* ——— Vidéo lancée : lecteur YouTube intégré (iframe, no-cookie) ——— */
        <iframe
          className="absolute inset-0 h-full w-full"
          src={youtubeEmbedUrl(videoId, true)}
          title={frameLabel}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        /* ——— Vignette poster + bouton lecture (l'iframe n'est pas montée) ——— */
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={playLabel}
          className="group absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-black/40 via-transparent to-black/60 px-6 text-center transition-colors hover:bg-black/10"
        >
          <span className="pointer-events-none flex items-center gap-2.5 rounded-full bg-[#FBF9F5] px-5 py-3 text-sm font-semibold text-[#121417] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-105">
            <Play aria-hidden="true" className="h-4 w-4 fill-current" />
            {playLabel}
          </span>
        </button>
      )}
    </div>
  )
}
