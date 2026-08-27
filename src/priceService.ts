// Converts the currencies tracked on a graph (Exalted Orbs, Awakener's
// Orbs, essences, ...) into a chaos/divine-equivalent total, using
// poe.ninja's public economy data. See https://poe.ninja/docs/api.
//
// A few things shape how this is written:
//
// - poe.ninja's own docs ask that "desktop apps and other clients...
//   proxy these requests through their own backend rather than calling
//   the endpoints directly from end-user machines" so they can cache and
//   rate-limit properly. This app has no backend -- it's a static page --
//   so that's not fully achievable here. What IS achievable, and what
//   this does: cache aggressively per-browser (see CACHE_TTL_MS below,
//   comfortably longer than poe.ninja's own ~15-minute data refresh) so
//   a given person's browser doesn't re-request on every page load, and
//   never poll in the background -- a fetch only happens when someone
//   explicitly opens the price panel or hits refresh.
// - The docs also ask for a descriptive User-Agent, which browsers
//   flatly don't allow JavaScript to set (it's a "forbidden header" --
//   only the browser itself controls it). There's no way around this
//   from a client-side-only app; noted here rather than silently ignored.
// - Whether poe.ninja's economy endpoints allow cross-origin browser
//   fetches isn't confirmed, so this tries a direct fetch first and
//   falls back through a few public CORS proxies, the same technique
//   pasteService.ts uses for the same reason.
// - This uses the "stash currency overview" endpoint (documented at
//   /poe1/api/economy/stash/current/currency/overview), which returns
//   the simple `lines[].currencyTypeName` / `lines[].chaosEquivalent`
//   shape below -- not the newer "exchange overview" endpoint, whose
//   response is a reference-basket-plus-relative-rates shape that needs
//   resolving currency ids through a separate `core.items` map. Both are
//   current and documented; this one was chosen because its shape maps
//   directly onto a flat currency-name -> chaos-value table without that
//   extra resolution step.

const CURRENCY_OVERVIEW_URL = (league: string) =>
  `https://poe.ninja/poe1/api/economy/stash/current/currency/overview?league=${encodeURIComponent(league)}&type=Currency`

const LEAGUES_URL = 'https://poe.ninja/poe1/api/economy/leagues'

// Same technique pasteService.ts uses, kept as a separate list rather
// than shared since these two modules fetch conceptually different
// things (item text vs. JSON price data) and have no other reason to
// depend on each other.
const PROXIES: Array<(url: string) => string> = [
  (url: string) => url,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
]

async function fetchJsonWithFallback(url: string): Promise<unknown> {
  let lastError: unknown
  for (const proxy of PROXIES) {
    const attempted = proxy(url)
    try {
      const res = await fetch(attempted)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      // Logged rather than swallowed silently -- if poe.ninja moves this
      // endpoint again, or a given proxy goes down, this is what makes
      // that diagnosable from the browser console instead of just "prices
      // didn't load."
      console.warn(`[priceService] fetch failed for ${attempted}:`, err)
      lastError = err
    }
  }
  throw lastError ?? new Error('All fetch attempts failed')
}

export type CurrencyRates = {
  league: string
  /** currency name (as it appears in a node's `action`/cost currency
   * field) -> chaos-equivalent value of one unit. */
  chaosPerUnit: Map<string, number>
  /** Chaos value of one Divine Orb, if the league's data included it --
   * absent leagues (very early in a league, or an empty/inactive one)
   * might not have a meaningful Divine price yet. */
  chaosPerDivine: number | null
  fetchedAt: number
}

const CACHE_KEY = 'poe-currency-rates-cache-v1'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

type CacheShape = { league: string; fetchedAt: number; entries: [string, number][]; chaosPerDivine: number | null }

function readCache(league: string): CurrencyRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheShape
    if (parsed.league !== league) return null
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return {
      league: parsed.league,
      chaosPerUnit: new Map(parsed.entries),
      chaosPerDivine: parsed.chaosPerDivine,
      fetchedAt: parsed.fetchedAt,
    }
  } catch {
    return null
  }
}

function writeCache(rates: CurrencyRates) {
  try {
    const shape: CacheShape = {
      league: rates.league,
      fetchedAt: rates.fetchedAt,
      entries: Array.from(rates.chaosPerUnit.entries()),
      chaosPerDivine: rates.chaosPerDivine,
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(shape))
  } catch {
    // Storage full or unavailable (private browsing, etc.) -- the rates
    // still work for this session, they just won't persist. Not worth
    // surfacing as an error.
  }
}

/** Thrown by getCurrencyRates when poe.ninja's response came back fine but
 * genuinely has no usable currency data for the league -- some permanent
 * leagues (plain "Hardcore", in particular) and very-low-population
 * temporary ones have little to no tracked market activity. Distinct from
 * a plain Error so the caller can tell "this league has no data" apart
 * from "the request itself failed" and word the two differently. */
export class NoLeagueDataError extends Error {
  constructor() {
    super("This league doesn't have enough currency market data on poe.ninja yet.")
    this.name = 'NoLeagueDataError'
  }
}

/** Fetches (or reuses a fresh cached copy of) chaos-equivalent rates for
 * every currency poe.ninja tracks in `league`. Throws on failure -- the
 * caller decides how to surface that (this module doesn't know about the
 * UI's loading/error state). */
export async function getCurrencyRates(league: string, opts: { forceRefresh?: boolean } = {}): Promise<CurrencyRates> {
  if (!opts.forceRefresh) {
    const cached = readCache(league)
    if (cached) return cached
  }

  const data = (await fetchJsonWithFallback(CURRENCY_OVERVIEW_URL(league))) as {
    lines?: Array<{ currencyTypeName?: unknown; chaosEquivalent?: unknown }>
  }
  if (!data || !Array.isArray(data.lines)) {
    throw new Error('Unexpected response shape from currency price service')
  }

  const chaosPerUnit = new Map<string, number>()
  for (const line of data.lines) {
    const name = typeof line.currencyTypeName === 'string' ? line.currencyTypeName : null
    const value = typeof line.chaosEquivalent === 'number' ? line.chaosEquivalent : null
    if (name && value !== null && value >= 0) chaosPerUnit.set(name, value)
  }
  // Chaos Orb itself is the unit prices are already denominated in, but
  // isn't always listed against itself -- make sure it's always present
  // and always exactly 1, regardless of what the response did or didn't
  // include.
  chaosPerUnit.set('Chaos Orb', 1)

  if (chaosPerUnit.size <= 1) {
    throw new NoLeagueDataError()
  }

  const rates: CurrencyRates = {
    league,
    chaosPerUnit,
    chaosPerDivine: chaosPerUnit.get('Divine Orb') ?? null,
    fetchedAt: Date.now(),
  }
  writeCache(rates)
  return rates
}

export type LeagueOption = { id: string; name: string }

const LEAGUES_CACHE_KEY = 'poe-leagues-cache-v1'
const LEAGUES_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour -- the league list itself barely changes

function readLeaguesCache(): LeagueOption[] | null {
  try {
    const raw = localStorage.getItem(LEAGUES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { fetchedAt: number; leagues: LeagueOption[] }
    if (Date.now() - parsed.fetchedAt > LEAGUES_CACHE_TTL_MS) return null
    return parsed.leagues
  } catch {
    return null
  }
}

/** The currently active leagues (challenge leagues plus the perennial
 * Standard/Hardcore ones), in the order poe.ninja's own dropdown shows
 * them -- i.e. newest/most-relevant first, which is also what makes
 * `[0]` a reasonable "current league" guess (see detectCurrentLeague).
 * Returns [] (rather than throwing) on failure, same convention as
 * detectCurrentLeague -- a dropdown with no options yet just falls back
 * to showing whatever league name is already set as free text. */
export async function listLeagues(): Promise<LeagueOption[]> {
  const cached = readLeaguesCache()
  if (cached) return cached
  try {
    const data = (await fetchJsonWithFallback(LEAGUES_URL)) as unknown
    if (!Array.isArray(data)) return []
    const leagues = data
      .filter((l): l is { id: string; name?: unknown } => !!l && typeof (l as { id?: unknown }).id === 'string')
      .map(l => ({ id: l.id, name: typeof l.name === 'string' && l.name ? l.name : l.id }))
    if (leagues.length > 0) {
      try {
        localStorage.setItem(LEAGUES_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), leagues }))
      } catch {
        // Storage full/unavailable -- fine, just re-fetches next time.
      }
    }
    return leagues
  } catch {
    return []
  }
}

/** Best-effort detection of the current temporary challenge league, for
 * a sensible default before the person has picked one themselves.
 * Returns null (rather than throwing) on any failure -- this is a
 * convenience, not something worth surfacing as an error on its own. */
export async function detectCurrentLeague(): Promise<string | null> {
  const leagues = await listLeagues()
  return leagues[0]?.id ?? null
}

export type ChaosDivineTotal = {
  chaos: number
  /** null if the league's Divine Orb price isn't known -- shown as a
   * chaos-only total rather than a wrong or made-up divine figure. */
  divine: number | null
  /** Currency names present in the cost list that the price data has no
   * entry for (a very new unique, a typo, a homebrew action name) --
   * surfaced so the total is honestly labeled as a partial figure rather
   * than silently under-counting. */
  unresolved: string[]
}

/** Converts a list of {currency, amount} costs (as produced by
 * computeTotalCost) into a chaos/divine total using the given rates. */
export function convertToChaosAndDivine(
  costs: Array<{ currency: string; amount: number }>,
  rates: CurrencyRates,
): ChaosDivineTotal {
  let chaos = 0
  const unresolved: string[] = []
  for (const cost of costs) {
    const rate = rates.chaosPerUnit.get(cost.currency)
    if (rate === undefined) {
      unresolved.push(cost.currency)
      continue
    }
    chaos += rate * cost.amount
  }
  return {
    chaos: Math.round(chaos * 100) / 100,
    divine: rates.chaosPerDivine ? Math.round((chaos / rates.chaosPerDivine) * 100) / 100 : null,
    unresolved,
  }
}
