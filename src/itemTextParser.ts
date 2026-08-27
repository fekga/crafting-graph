/**
 * Parses text copied from a Path of Exile item (Ctrl+C in game), or
 * pasted from Path of Building or Craft of Exile — both of those tools
 * read and write the same clipboard format the game uses, so one
 * parser covers all three (Craft of Exile's own FAQ has you paste with
 * "Advanced mod descriptions" on and its "Copy" output round-trips through
 * PoB's item import, confirming they share this format).
 *
 * With "Advanced mod descriptions" on (the setting Craft of Exile also
 * requires), each affix group is preceded by its own header line, e.g.:
 *
 *   { Prefix Modifier "Virile" (Tier: 2) — Life }
 *   +101(100-114) to maximum Life
 *   { Fractured Suffix Modifier "of Puhuarte" — Elemental, Lightning, ... }
 *   +47(46-48)% to Lightning Resistance
 *
 * A header can cover more than one mod line below it (e.g. a "Defences"
 * prefix granting both Armour and Energy Shield lines) — it applies until
 * the next header, flag line, or section break. Some mods are also
 * followed by a full-line parenthetical "reminder text" describing what a
 * chance/condition does, e.g. "(Unnerved enemies take 10% increased Spell
 * Damage)" — that's not a separate modifier, it gets folded into the mod
 * line above it.
 *
 * The parser doesn't try to fully understand every possible section
 * (weapon/armour base stats, flask stats, etc. vary a lot) — a line that
 * looks like "Label: value" is always treated as info, never a modifier,
 * since real affix text is a descriptive sentence and never starts with a
 * bare "Word:" prefix.
 */

export type ParsedMod = {
  text: string
  /** Origin tags detected from a preceding "{ ... }" header line, a
   * trailing "(implicit)"-style marker, or a leading PoB-style "{implicit}"
   * marker on the same line. */
  tagLabels: string[]
}

export type ParsedItem = {
  /** Item's own name, if rare/unique (two name lines). Falls back to the
   * base type for normal/magic items (single name line). */
  name: string
  /** Base type line, when distinct from the name (rare/unique items). */
  baseType: string
  itemClass: string
  rarity: string
  /** Whole-item flags like Corrupted, Mirrored, Fractured Item, etc. */
  flags: string[]
  /** Non-modifier info lines (requirements, sockets, item level, base
   * weapon/armour stats, ...) kept around for reference/notes. */
  infoLines: string[]
  mods: ParsedMod[]
}

const SECTION_BREAK_RE = /^-{5,}\s*$/
const LABEL_VALUE_RE = /^[A-Za-z][A-Za-z0-9 /]*:\s?/
const FULL_LINE_HEADER_RE = /^\{\s*(.+?)\s*\}$/
const FULL_LINE_PAREN_RE = /^\((?:[^()]|\([^()]*\))*\)$/
const INLINE_TRAILING_TAG_RE = /\(([a-z][a-z ]*)\)\s*$/i
const INLINE_LEADING_TAG_RE = /^\{([a-z][a-z0-9: ._-]*)\}\s*/i

const KNOWN_FLAGS = new Set(
  [
    'corrupted',
    'mirrored',
    'unidentified',
    'duplicated',
    'split',
    'unmodifiable',
    'fractured item',
    'synthesised item',
    'shaper item',
    'elder item',
    'crusader item',
    'redeemer item',
    'hunter item',
    'warlord item',
    'searing exarch item',
    'eater of worlds item',
    'veiled',
  ].map(s => s.toLowerCase()),
)

const ORIGIN_KEYWORD_RE: { re: RegExp; label: string }[] = [
  { re: /\bfractured\b/, label: 'Fractured' },
  { re: /\bcrafted\b/, label: 'Crafted' }, // also matches "Master Crafted"
  { re: /\benchant(?:ment)?\b/, label: 'Enchant' },
  { re: /\bimplicit\b/, label: 'Implicit' },
  { re: /\bprefix\b/, label: 'Prefix' },
  { re: /\bsuffix\b/, label: 'Suffix' },
  { re: /\bveiled\b/, label: 'Veiled' },
]

/** Extracts origin tags (Prefix/Suffix/Implicit/Fractured/Crafted/...) from
 * the contents of a "{ ... }" header line, e.g. `Fractured Suffix Modifier
 * "of Puhuarte" — Elemental, Lightning, Resistance, Critical`. */
function parseHeaderTags(inner: string): string[] {
  const s = inner
    .replace(/"[^"]*"/g, ' ') // drop the quoted affix name
    .split('—')[0] // drop the trailing "— group list" part
    .replace(/\([^)]*\)/g, ' ') // drop (Tier: N) / (Greater) / (Lesser)

  const lower = s.toLowerCase()
  const tags: string[] = []
  for (const { re, label } of ORIGIN_KEYWORD_RE) {
    if (re.test(lower)) tags.push(label)
  }
  return [...new Set(tags)]
}

/** Normalizes a PoB-style inline `{implicit}` / `{tags:crafted}` token. */
function normalizeInlineToken(raw: string): string {
  const cleaned = raw
    .replace(/^tags?:/i, '')
    .replace(/range:[^,}]*/gi, '')
    .trim()
  if (!cleaned) return ''
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
}

const KNOWN_ORIGIN_LOWER = ['implicit', 'crafted', 'fractured', 'enchant', 'enchanted', 'scourge', 'veiled', 'corrupted']

/** Strips any PoB-style inline `{...}` / trailing `(implicit)` markers that
 * live on the mod line itself (as opposed to a preceding header line). */
function stripInlineTags(line: string): ParsedMod {
  let text = line
  const tagLabels: string[] = []

  let leading = INLINE_LEADING_TAG_RE.exec(text)
  while (leading) {
    const label = normalizeInlineToken(leading[1])
    if (label) tagLabels.push(label)
    text = text.slice(leading[0].length)
    leading = INLINE_LEADING_TAG_RE.exec(text)
  }

  const trailing = INLINE_TRAILING_TAG_RE.exec(text)
  if (trailing) {
    const label = normalizeInlineToken(trailing[1])
    if (KNOWN_ORIGIN_LOWER.includes(label.toLowerCase())) {
      tagLabels.push(label === 'Enchanted' ? 'Enchant' : label)
      text = text.slice(0, trailing.index).trim()
    }
  }

  return { text: text.trim(), tagLabels }
}

export function parseItemText(raw: string): ParsedItem | null {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd())
  if (!lines.some(l => l.trim())) return null

  const sections: string[][] = [[]]
  for (const line of lines) {
    if (SECTION_BREAK_RE.test(line)) {
      sections.push([])
    } else {
      sections[sections.length - 1].push(line)
    }
  }

  const header = sections[0]?.filter(l => l.trim()) ?? []
  let itemClass = ''
  let rarity = ''
  const nameLines: string[] = []
  for (const line of header) {
    const classMatch = /^Item Class:\s*(.+)$/i.exec(line)
    const rarityMatch = /^Rarity:\s*(.+)$/i.exec(line)
    if (classMatch) itemClass = classMatch[1].trim()
    else if (rarityMatch) rarity = rarityMatch[1].trim()
    else nameLines.push(line.trim())
  }
  const name = nameLines[0] ?? ''
  const baseType = nameLines[1] ?? ''

  const flags: string[] = []
  const infoLines: string[] = []
  const mods: ParsedMod[] = []
  let pendingHeaderTags: string[] = []

  for (const section of sections.slice(1)) {
    pendingHeaderTags = []
    for (const rawLine of section) {
      const line = rawLine.trim()
      if (!line) continue
      if (line.toLowerCase() === 'requirements:') continue

      if (KNOWN_FLAGS.has(line.toLowerCase())) {
        flags.push(line)
        pendingHeaderTags = []
        continue
      }

      const headerMatch = FULL_LINE_HEADER_RE.exec(line)
      if (headerMatch) {
        pendingHeaderTags = parseHeaderTags(headerMatch[1])
        continue
      }

      // A standalone "(...)" line is reminder/flavor text describing the
      // mod just above it, not a separate modifier.
      if (FULL_LINE_PAREN_RE.test(line) && mods.length > 0) {
        mods[mods.length - 1].text = `${mods[mods.length - 1].text} ${line}`.trim()
        continue
      }

      if (LABEL_VALUE_RE.test(line)) {
        infoLines.push(line)
        continue
      }

      const { text, tagLabels: inlineTags } = stripInlineTags(line)
      if (!text) continue
      const tagLabels = [...new Set([...pendingHeaderTags, ...inlineTags])]
      mods.push({ text, tagLabels })
    }
  }

  if (!itemClass && !rarity && !name && mods.length === 0 && infoLines.length === 0) {
    return null
  }

  return { name, baseType, itemClass, rarity, flags, infoLines, mods }
}
