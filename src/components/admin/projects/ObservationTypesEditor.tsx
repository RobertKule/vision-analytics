'use client'

import { useState } from 'react'
import { CirclePlus, X } from 'lucide-react'

const MAX_TYPES = 40
const MAX_LENGTH = 80

type ObservationTypesEditorProps = {
  /** Types d'observation actuellement sélectionnés (liste propre, sans doublons). */
  value: string[]
  onChange: (next: string[]) => void
  /** Préfixe des identifiants DOM (évite les collisions entre deux éditeurs sur une page). */
  idPrefix: string
  /** Petit intitulé au-dessus du champ (texte français de la surface admin). */
  label?: string
}

/**
 * Éditeur de liste de types d'observation configurables. Chaque libellé est ajouté
 * via « Entrée », virgule ou bouton « Ajouter » ; retiré via la croix de sa pastille.
 * La liste est dédupliquée (insensible à la casse) et bornée (40 entrées × 80 caractères).
 */
export default function ObservationTypesEditor({
  value,
  onChange,
  idPrefix,
  label = 'Types d’observation',
}: ObservationTypesEditorProps) {
  const [draft, setDraft] = useState('')

  const addType = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.length > MAX_LENGTH) return
    const key = trimmed.toLowerCase()
    if (value.some((existing) => existing.toLowerCase() === key)) {
      setDraft('')
      return
    }
    if (value.length >= MAX_TYPES) return
    onChange([...value, trimmed])
    setDraft('')
  }

  const removeType = (labelToRemove: string) => {
    onChange(value.filter((item) => item !== labelToRemove))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addType(draft)
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${idPrefix}-obs-type-input`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </label>
        <span className="mb-1 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
          {value.length}/{MAX_TYPES}
        </span>
      </div>

      {value.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Types enregistrés">
          {value.map((item) => (
            <li
              key={item}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-gold-500/15 py-1 pl-3 pr-1 text-xs font-medium text-gold-800 dark:bg-gold-400/10 dark:text-gold-200"
            >
              <span className="truncate">{item}</span>
              <button
                type="button"
                onClick={() => removeType(item)}
                aria-label={`Retirer « ${item} »`}
                title="Retirer"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gold-800 transition-colors hover:bg-gold-500/20 dark:text-gold-200 dark:hover:bg-white/10"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
          Aucun type défini — les observateurs captureront sans catégorie.
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          id={`${idPrefix}-obs-type-input`}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          placeholder="Ex. 100m oblique, Faune détectée…"
          aria-label="Ajouter un type d’observation"
          className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-milk dark:focus:ring-milk/15"
        />
        <button
          type="button"
          onClick={() => addType(draft)}
          disabled={!draft.trim() || value.length >= MAX_TYPES}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <CirclePlus aria-hidden="true" className="h-4 w-4" />
          Ajouter
        </button>
      </div>
      <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
        L’observateur choisit un type dans cette liste au moment de chaque capture. Entrée pour valider le libellé.
      </p>
    </div>
  )
}
