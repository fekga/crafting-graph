import { useEffect, useState } from 'react'

/**
 * The art tree's filenames are internal codenames, not display names —
 * prettifying "InjectorBelt" gets you "Injector Belt", but the item is
 * actually called "Mageblood". Same problem in the other direction: a
 * currency's real name (e.g. "Silver Coin") doesn't always match its art
 * filename either, and hand-typing that mapping (which is how this used
 * to work) is exactly how a few currencies ended up pointing at the wrong
 * — or no — icon.
 *
 * repoe-fork publishes two catalogs that tie art-tree paths to real
 * names, in both directions:
 *  - uniques.min.json, hand-maintained by the Path of Building team
 *    (this mapping isn't derivable from the game files for uniques), and
 *  - base_items.min.json, generated straight from the game files, which
 *    covers every base item type (including currencies, gems and flasks)
 *    with its real name and icon.
 * This module fetches both once, caches them, and exposes lookups in
 * both directions (uniques take priority when a path or name somehow
 * matches both).
 */

const UNIQUES_URL = 'https://repoe-fork.github.io/uniques.min.json'
const BASE_ITEMS_URL = 'https://repoe-fork.github.io/base_items.min.json'
const UNIQUES_CACHE_KEY = 'poe-unique-names:v2'
const BASE_ITEMS_CACHE_KEY = 'poe-base-item-names:v2'

type UniqueRow = {
  name?: string
  visual_identity?: { dds_file?: string }
  renamed_version?: { name?: string }
}

type BaseItemRow = {
  name?: string
  visual_identity?: { dds_file?: string }
}

type Indexes = { pathToName: Map<string, string>; nameToPath: Map<string, string> }

let uniqueIndexes: Indexes | null = null
let baseItemIndexes: Indexes | null = null
let inflight: Promise<void> | null = null

function pathFromDdsFile(ddsFile: string): string | null {
  const m = /^Art\/2DItems\/(.+)\.dds$/i.exec(ddsFile)
  return m ? m[1] : null
}

function buildUniqueIndexes(raw: Record<string, UniqueRow>): Indexes {
  const pathToName = new Map<string, string>()
  const nameToPath = new Map<string, string>()
  for (const row of Object.values(raw)) {
    const ddsFile = row.visual_identity?.dds_file
    if (!ddsFile) continue
    const path = pathFromDdsFile(ddsFile)
    if (!path) continue
    // A `renamed_version` means this row is an old/deprecated name for an
    // item that was later renamed — prefer the current name it points to.
    const name = row.renamed_version?.name ?? row.name
    if (!name) continue
    const pathKey = path.toLowerCase()
    if (!pathToName.has(pathKey) || !row.renamed_version) pathToName.set(pathKey, name)
    const nameKey = name.toLowerCase()
    if (!nameToPath.has(nameKey)) nameToPath.set(nameKey, path)
  }
  return { pathToName, nameToPath }
}

function buildBaseItemIndexes(raw: Record<string, BaseItemRow>): Indexes {
  const pathToName = new Map<string, string>()
  const nameToPath = new Map<string, string>()
  for (const row of Object.values(raw)) {
    const ddsFile = row.visual_identity?.dds_file
    if (!ddsFile || !row.name) continue
    const path = pathFromDdsFile(ddsFile)
    if (!path) continue
    const pathKey = path.toLowerCase()
    if (!pathToName.has(pathKey)) pathToName.set(pathKey, row.name)
    const nameKey = row.name.toLowerCase()
    if (!nameToPath.has(nameKey)) nameToPath.set(nameKey, path)
  }
  return { pathToName, nameToPath }
}

function serialize(indexes: Indexes): string {
  return JSON.stringify({
    p: Array.from(indexes.pathToName.entries()),
    n: Array.from(indexes.nameToPath.entries()),
  })
}

function deserialize(raw: string): Indexes {
  const parsed = JSON.parse(raw) as { p: [string, string][]; n: [string, string][] }
  return { pathToName: new Map(parsed.p), nameToPath: new Map(parsed.n) }
}

async function fetchIndexes<T>(
  cacheKey: string,
  url: string,
  build: (raw: Record<string, T>) => Indexes,
): Promise<Indexes> {
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) return deserialize(cached)
  } catch {
    // corrupt or unavailable cache — fall through to a fresh fetch
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't load item names from ${url} (${res.status}).`)
  const raw = (await res.json()) as Record<string, T>
  const indexes = build(raw)
  try {
    localStorage.setItem(cacheKey, serialize(indexes))
  } catch {
    // storage full/unavailable — caching is an optimization, not required
  }
  return indexes
}

function isLoaded(): boolean {
  return uniqueIndexes !== null && baseItemIndexes !== null
}

/** Kicks off (or reuses) the background load of both name catalogs and
 * calls `onReady` once they're available, so callers can re-render with
 * accurate names/icons in place of guesses. Safe to call from multiple
 * components — the fetches themselves only happen once. Fails silently
 * (browsing/icon resolution still work on a best-effort basis) if a
 * catalog can't be loaded. */
export function ensureItemNamesLoaded(onReady: () => void): void {
  if (isLoaded()) {
    onReady()
    return
  }
  if (!inflight) {
    inflight = Promise.all([
      fetchIndexes<UniqueRow>(UNIQUES_CACHE_KEY, UNIQUES_URL, buildUniqueIndexes).then(i => (uniqueIndexes = i)),
      fetchIndexes<BaseItemRow>(BASE_ITEMS_CACHE_KEY, BASE_ITEMS_URL, buildBaseItemIndexes).then(
        i => (baseItemIndexes = i),
      ),
    ]).then(() => {})
  }
  inflight.then(onReady).catch(() => {})
}

/** React hook version of ensureItemNamesLoaded — triggers the load (once,
 * shared across every caller) and re-renders the calling component when
 * it's ready. The returned boolean is rarely needed directly; usually
 * it's enough to just call this so the component re-renders and picks up
 * fresh results from resolveUniqueName/resolveIconPathByName. */
export function useItemNamesLoaded(): boolean {
  const [ready, setReady] = useState(isLoaded)
  useEffect(() => {
    if (ready) return
    ensureItemNamesLoaded(() => setReady(true))
  }, [ready])
  return ready
}

/** Resolves an art-tree path (e.g. "Belts/InjectorBelt") to the item's
 * real in-game name (e.g. "Mageblood") if either catalog has loaded and
 * knows about it — uniques take priority, then base item types (which
 * also covers currencies, gems and flasks); otherwise returns `fallback`
 * (typically the prettified codename). */
export function resolveUniqueName(path: string, fallback: string): string {
  const key = path.toLowerCase()
  return uniqueIndexes?.pathToName.get(key) ?? baseItemIndexes?.pathToName.get(key) ?? fallback
}

/** Resolves a real in-game name (e.g. "Silver Coin") to its art-tree path
 * (e.g. "Currency/SilverObol") if either catalog has loaded and knows
 * about it — the reverse of resolveUniqueName. Returns undefined if
 * nothing matches (including while the catalogs are still loading). */
export function resolveIconPathByName(name: string): string | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  return uniqueIndexes?.nameToPath.get(key) ?? baseItemIndexes?.nameToPath.get(key)
}
