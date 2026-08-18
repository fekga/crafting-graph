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

export type CraftNodeData = {
  label: string
  action: string
  modifiers: Modifier[]
  notes: string
}

export type GraphData = {
  nodes: any[]
  edges: any[]
  /** The user's personal library of tags, offered as quick-picks in the
   * affix editor. Persisted so it round-trips through export/import. */
  tagPresets?: AffixTag[]
}
