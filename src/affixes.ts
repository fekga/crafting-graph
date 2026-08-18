import type { Affix } from './types'

let cache: Promise<Affix[]> | null = null

/** Fetches (and caches) the real affix dataset, derived from the game's own
 * data files, so modifiers offered in the picker are ones that can actually
 * appear on an item. */
export function loadAffixes(): Promise<Affix[]> {
  if (!cache) {
    const base = import.meta.env.BASE_URL
    cache = fetch(`${base}data/affixes.json`).then(r => {
      if (!r.ok) throw new Error('Failed to load affix data')
      return r.json() as Promise<Affix[]>
    })
  }
  return cache
}
