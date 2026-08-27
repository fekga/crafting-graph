// A searchable index of real Path of Exile modifiers, sourced from RePoE's
// `mods.min.json` (the same repoe-fork.github.io host src/data/itemNames.ts
// already fetches base_items.min.json/uniques.min.json from, with no CORS
// proxy needed).
//
// Deliberately fetched live rather than baked into a static file at build
// time: the whole point of this tool is to stay league-independent, so
// this shouldn't need a maintainer to notice a game patch happened and
// manually regenerate/redeploy anything to keep affix tiers accurate.
//
// The one real cost of that: the raw files are ~26 MB combined (mods.min.json
// is ~23 MB by itself, covering every domain -- monsters, maps, delve, etc,
// not just gear; base_items.min.json adds another ~3 MB, fetched solely to
// tell a genuine base-item implicit apart from a unique item's own fixed
// mod -- see classifySource). That's handled by only ever fetching on an
// explicit user action (see ModifierSearchModal's load gate) and
// immediately filtering + trimming down to the ~3.5 MB actually useful for
// planning a craft before caching -- the full ~26 MB only ever exists
// transiently in memory during that one load, never written to storage.
// The cache then gets a long (7-day) TTL, since real game-data changes only
// land with patches, unlike currency prices.

const MODS_URL = 'https://repoe-fork.github.io/mods.min.json'
// Only fetched to find out which mod keys are genuine base-item implicits
// (see classifySource) -- not indexed for its own sake.
const BASE_ITEMS_URL = 'https://repoe-fork.github.io/base_items.min.json'
const CACHE_KEY = 'poe-modifier-index-cache-v3'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export type ModifierSource = 'prefix' | 'suffix' | 'implicit' | 'enchant' | 'essence' | 'corrupted' | 'crafted' | 'veiled'

export type ModifierEntry = {
  /** The mods.min.json key -- stable across fetches, used as a React key. */
  key: string
  /** Display text, with its literal "(min-max)" range where it rolls one. */
  text: string
  /** The affix's name, e.g. "of the Brute". Empty for some sources (e.g.
   * corrupted implicits generally have no name of their own). */
  name: string
  source: ModifierSource
  requiredLevel: number
  /** Item classes this can spawn on (from spawn_weights) -- empty for
   * crafted/veiled/implicit/enchant sources, which aren't spawn-weight
   * based. */
  tags: string[]
  stats: { id: string; min: number; max: number }[]
  /** This mod's position in its own tier ladder -- 1 is the best/highest
   * roll (matching in-game "Tier 1" convention), counting up from there.
   * Undefined for a mod that isn't part of a ladder at all (only one
   * version of it exists), which is most sources other than plain
   * prefix/suffix/crafted. See assignTiers for how this is derived. */
  tier?: number
  /** How many tiers exist in this mod's ladder -- alongside `tier`, lets
   * the UI show "3 of 8" rather than just "Tier 3" with no sense of scale. */
  tierCount?: number
}

export type ModifierIndex = {
  fetchedAt: number
  entries: ModifierEntry[]
}

/** Maps a modifier's source to the id of the built-in tag preset that
 * conventionally represents it (see DEFAULT_TAG_PRESETS in poeColors.ts) --
 * used both to badge search results with the same label/color the user
 * sees on that tag elsewhere in the app, and to auto-tag a picked
 * modifier. Sources with no entry here (essence, veiled) have no built-in
 * preset of their own. */
export const TAG_PRESET_ID_FOR_SOURCE: Partial<Record<ModifierSource, string>> = {
  prefix: 'tag-prefix',
  suffix: 'tag-suffix',
  implicit: 'tag-implicit',
  enchant: 'tag-enchant',
  crafted: 'tag-crafted',
  corrupted: 'tag-corrupted',
}

type RawMod = {
  domain?: string
  generation_type?: string
  text?: string
  name?: string
  required_level?: number
  is_essence_only?: boolean
  spawn_weights?: { tag?: string; weight?: number }[]
  stats?: { id?: string; min?: number; max?: number }[]
}

type RawBaseItem = {
  implicits?: string[]
}

/** Base-item implicits (e.g. a ring's "+X to Accuracy Rating") aren't
 * marked as such in mods.min.json itself -- they show up there with
 * generation_type "unique", the same generic bucket used for every fixed
 * (non-procedurally-rolled) mod, unique items' own signature mods
 * included. The only way to tell "a normal implicit every item of this
 * base type has" apart from "this one specific unique's mod" is to check
 * which mod keys base_items.min.json actually lists under some base
 * item's `implicits` -- so that file gets fetched too, purely to build
 * this lookup set. */
function collectImplicitKeys(rawBaseItems: Record<string, RawBaseItem>): Set<string> {
  const keys = new Set<string>()
  for (const item of Object.values(rawBaseItems)) {
    for (const key of item.implicits ?? []) keys.add(key)
  }
  return keys
}

/** Which of RePoE's domain/generation_type combinations actually
 * correspond to a real, textable gear modifier -- verified directly
 * against the live data, since some are misleading. For example
 * generation_type "corrupted" mostly means *map* corruption effects, not
 * item corrupted implicits (those are domain "item" + generation_type
 * "corrupted"); domain "crafted" mostly means bench-craft mods, but also
 * has a few unrelated unique-item-variant entries mixed in (generation_type
 * "unique", excluded here); domain "veiled" itself is just the unrevealed
 * placeholder slot with no real text -- the real Jun-revealed outcomes are
 * domain "unveiled"; and there is no generation_type "essence" for actual
 * item mods at all (that combination only exists for effects granted to
 * the monster trapped *inside* an essence) -- the mods an essence actually
 * puts on your item are ordinary prefix/suffix entries, distinguished only
 * by their own is_essence_only flag for the handful of tiers that are
 * exclusively obtainable that way. */
function classifySource(
  key: string,
  domain: string,
  generationType: string,
  isEssenceOnly: boolean,
  implicitKeys: Set<string>,
): ModifierSource | null {
  if (domain === 'item') {
    if (generationType === 'prefix' || generationType === 'suffix') {
      return isEssenceOnly ? 'essence' : generationType
    }
    if (generationType === 'corrupted') return 'corrupted'
    if (generationType === 'enchantment') return 'enchant'
    // Eldritch (Eater of Worlds / Searing Exarch) implicits -- these are
    // genuinely always implicits, no base_items.min.json cross-reference
    // needed to tell them apart from something else.
    if (generationType === 'eater_of_worlds_implicit' || generationType === 'searing_exarch_implicit') return 'implicit'
    if (generationType === 'unique' && implicitKeys.has(key)) return 'implicit'
    return null
  }
  if (domain === 'crafted' && (generationType === 'prefix' || generationType === 'suffix')) return 'crafted'
  if (domain === 'unveiled' && (generationType === 'prefix' || generationType === 'suffix')) return 'veiled'
  return null
}

/** Strips a mod key down to the shared base of its tier ladder -- e.g.
 * "Strength1".."Strength10" (weakest to strongest roll of the same affix)
 * all strip to "Strength", while unrelated mods that happen to affect the
 * same stat (a unique item's own fixed mod, a Synthesis implicit, ...)
 * strip to a different base entirely and so don't get lumped in with it.
 * A trailing run of underscores is stripped first -- RePoE appends those
 * purely to disambiguate an otherwise-duplicate key, not as tier info. */
function tierLadderKey(key: string): string {
  return key.replace(/_+$/, '').replace(/\d+$/, '')
}

/** Fills in `tier`/`tierCount` for every mod that's part of a ladder of 2+
 * -- grouped by tierLadderKey *within* the same source (so a prefix ladder
 * never merges with a same-named crafted one), sorted weakest-to-strongest
 * by required level, and numbered backwards from that so the strongest
 * (last, highest level) ends up "Tier 1" -- matching the in-game
 * convention that a lower tier number is a better roll. Mutates `entries`
 * in place rather than returning a copy, since this always runs as the
 * last step of buildIndex over an array nothing else holds a reference to
 * yet. */
function assignTiers(entries: ModifierEntry[]): void {
  const groups = new Map<string, ModifierEntry[]>()
  for (const entry of entries) {
    const groupKey = `${entry.source}:${tierLadderKey(entry.key)}`
    const group = groups.get(groupKey)
    if (group) group.push(entry)
    else groups.set(groupKey, [entry])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => a.requiredLevel - b.requiredLevel)
    group.forEach((entry, i) => {
      entry.tier = group.length - i
      entry.tierCount = group.length
    })
  }
}

function buildIndex(raw: Record<string, RawMod>, implicitKeys: Set<string>): ModifierEntry[] {
  const out: ModifierEntry[] = []
  for (const [key, m] of Object.entries(raw)) {
    if (!m.domain || !m.generation_type || !m.text) continue
    const source = classifySource(key, m.domain, m.generation_type, !!m.is_essence_only, implicitKeys)
    if (!source) continue
    out.push({
      key,
      text: m.text,
      name: m.name ?? '',
      source,
      requiredLevel: m.required_level ?? 0,
      tags: (m.spawn_weights ?? [])
        .filter((s): s is { tag: string; weight: number } => !!s.tag && s.tag !== 'default' && (s.weight ?? 0) > 0)
        .map(s => s.tag),
      stats: (m.stats ?? [])
        .filter((s): s is { id: string; min: number; max: number } => typeof s.id === 'string')
        .map(s => ({ id: s.id, min: s.min ?? 0, max: s.max ?? 0 })),
    })
  }
  assignTiers(out)
  return out
}

function readCache(): ModifierIndex | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ModifierIndex
    if (!Array.isArray(parsed.entries) || typeof parsed.fetchedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(index: ModifierIndex) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(index))
  } catch {
    // Storage full/unavailable -- the index still works for this session,
    // it just won't persist. Not worth surfacing as an error.
  }
}

export function isModifierCacheStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > CACHE_TTL_MS
}

/** Synchronous peek at whatever's cached (any age) -- used by
 * ModifierSearchModal to decide whether to show its "load the database"
 * gate or go straight to the search UI, without triggering a fetch. */
export function getCachedModifierIndex(): ModifierIndex | null {
  return readCache()
}

/** Loads (or reuses a fresh cached copy of) the modifier index. Throws on
 * failure -- the caller decides how to surface that, same contract as
 * getCurrencyRates in priceService.ts. */
export async function loadModifierIndex(opts: { forceRefresh?: boolean } = {}): Promise<ModifierIndex> {
  if (!opts.forceRefresh) {
    const cached = readCache()
    if (cached && !isModifierCacheStale(cached.fetchedAt)) return cached
  }

  const [modsRes, baseItemsRes] = await Promise.all([fetch(MODS_URL), fetch(BASE_ITEMS_URL)])
  if (!modsRes.ok) throw new Error(`HTTP ${modsRes.status}`)
  if (!baseItemsRes.ok) throw new Error(`HTTP ${baseItemsRes.status}`)
  const [raw, rawBaseItems] = await Promise.all([
    modsRes.json() as Promise<Record<string, RawMod>>,
    baseItemsRes.json() as Promise<Record<string, RawBaseItem>>,
  ])
  const entries = buildIndex(raw, collectImplicitKeys(rawBaseItems))
  if (entries.length === 0) throw new Error('No usable modifier data in response')

  const index: ModifierIndex = { fetchedAt: Date.now(), entries }
  writeCache(index)
  return index
}
