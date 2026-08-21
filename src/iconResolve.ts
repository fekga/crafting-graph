import { findCurrencyByName } from './data/currencies'
import { findRememberedItem } from './data/itemArt'
import { resolveIconPathByName } from './data/itemNames'

/** Resolves an art-tree icon path for a freeform name — a node's "action"
 * text, a cost's currency name, or a note/label icon shortcode. Checks
 * the repoe-fork name catalog first (the same source used to resolve
 * item names when browsing — see data/itemNames.ts), which works for
 * currencies, uniques, gems, flasks, and anything else with a real
 * in-game name; then falls back to anything previously picked via
 * "Browse all item art" (which remembers name -> art-tree path so it
 * doesn't need to be re-browsed to show an icon again). Returns undefined
 * if nothing matches, which is expected for plain descriptive actions
 * like "Base item", or before the name catalog has finished loading. */
export function resolveIconPath(name: string): string | undefined {
  if (!name.trim()) return undefined
  return resolveIconPathByName(name) ?? findRememberedItem(name)?.path
}

/** Whether a freeform name matches a known currency (used to pick alt text
 * / styling that differs for currency icons vs. arbitrary item art). */
export function isCurrency(name: string): boolean {
  return findCurrencyByName(name) !== undefined
}
