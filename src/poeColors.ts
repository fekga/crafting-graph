import type { AffixTag } from './types'

/** Colors modeled on Path of Exile's own item-text palette (item rarities,
 * mod text, and crafting-related states like fractured/crafted/corrupted).
 * These are close approximations of the in-client colors, offered as a
 * starting point — any custom hex can still be picked freely. */
export const POE_TEXT_COLORS: { name: string; value: string }[] = [
  { name: 'Normal', value: '#ffffff' },
  { name: 'Magic / Mod text', value: '#8888ff' },
  { name: 'Rare', value: '#ffff77' },
  { name: 'Unique', value: '#af6025' },
  { name: 'Gem', value: '#1ba29b' },
  { name: 'Currency', value: '#aa9e82' },
  { name: 'Corrupted', value: '#d20000' },
  { name: 'Prophecy', value: '#b54bff' },
  { name: 'Crafted', value: '#b4b4ff' },
  { name: 'Fractured', value: '#8ac9d1' },
]

/** The tag library a fresh graph starts with. All fully editable/removable
 * afterward — nothing here is hardcoded into the app logic. */
export const DEFAULT_TAG_PRESETS: AffixTag[] = [
  { id: 'tag-prefix', label: 'Prefix', color: '#6fb3c9' },
  { id: 'tag-suffix', label: 'Suffix', color: '#d99a4e' },
  { id: 'tag-implicit', label: 'Implicit', color: '#9b8cd9' },
  { id: 'tag-enchant', label: 'Enchant', color: '#6fcf97' },
  { id: 'tag-fractured', label: 'Fractured', color: '#8ac9d1' },
  { id: 'tag-crafted', label: 'Crafted', color: '#b4b4ff' },
  { id: 'tag-corrupted', label: 'Corrupted', color: '#d20000' },
]

/** Converts a #rrggbb hex color into an "r, g, b" triple for use inside
 * rgba() — lets badge backgrounds use a translucent tint of any custom
 * color the user picks, not just a fixed preset set. */
export function hexToRgbTriple(hex: string): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6)
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return '255, 255, 255'
  return `${r}, ${g}, ${b}`
}
