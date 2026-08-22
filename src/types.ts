/** A reusable tag "stamp" — Prefix / Suffix / Implicit / Enchant are just the
 * built-in defaults; the user can rename, recolor, add, or remove any of
 * them. A modifier can carry more than one (e.g. Prefix + Fractured). */
export type AffixTag = {
  id: string
  label: string
  color: string
}

export type Modifier = {
  id: string
  text: string
  /** Hex color for the modifier text itself. */
  textColor: string
  /** Tags attached to this modifier, in display order. Each tag is a full
   * snapshot (not just an id) so a modifier keeps its look even if the tag
   * library entry it was copied from is later renamed or recolored. */
  tags: AffixTag[]
}

/** The estimated currency cost of performing this crafting step once. */
export type CraftCost = {
  /** Currency name — freeform, but matching a curated currency name (see
   * data/currencies.ts) gets it an icon and a slot in the total-cost bar. */
  currency: string
  /** How many units this step consumes per attempt. */
  amount: number
  /** Odds (0–100) that a single attempt succeeds. 100 for guaranteed
   * outcomes (e.g. an essence). Below 100, the total-cost bar accounts for
   * the expected number of repeats (amount / (chance / 100)). */
  chance: number
  /** Explicit icon override for `currency`, independent of the text.
   * undefined = no explicit choice — auto-resolve an icon from `currency`
   * by name, same as before this field existed (so old saves keep
   * working unchanged). '' = explicitly no icon, even if the text happens
   * to match a real item name. A real path = the icon picked, which
   * sticks even if `currency` is later edited to something else — e.g. a
   * custom label instead of the item's real name. */
  iconPath?: string
}

export type CraftNodeData = {
  label: string
  action: string
  modifiers: Modifier[]
  notes: string
  /** Explicit icon override for `action`, independent of the text — see
   * CraftCost.iconPath for the full explanation of the undefined/''/path
   * distinction. */
  actionIconPath?: string
  /** Optional — not every step costs currency (e.g. a plain "Base item"
   * starting node). */
  cost?: CraftCost
}

export type GraphData = {
  nodes: any[]
  edges: any[]
  /** The user's personal library of tags, offered as quick-picks in the
   * affix editor. Persisted so it round-trips through export/import. */
  tagPresets?: AffixTag[]
  /** Whether edges render with an animated "marching ants" dash. A
   * graph-wide display toggle rather than a per-edge property, but
   * persisted here so it round-trips through export/import/local saves. */
  edgesAnimated?: boolean
}
