export type CurrencyCategory = 'orb' | 'shard' | 'essence' | 'fossil' | 'resonator' | 'catalyst' | 'oil' | 'omen'

export type Currency = {
  id: string
  name: string
  category: CurrencyCategory
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function asCurrency(names: string[], category: CurrencyCategory): Currency[] {
  return names.map(name => ({ id: slug(name), name, category }))
}

const ORBS = [
  'Orb of Transmutation',
  'Orb of Augmentation',
  'Orb of Alteration',
  'Orb of Alchemy',
  'Regal Orb',
  'Chaos Orb',
  'Exalted Orb',
  'Divine Orb',
  'Orb of Annulment',
  'Orb of Scouring',
  'Blessed Orb',
  'Vaal Orb',
  'Chromatic Orb',
  "Jeweller's Orb",
  'Orb of Fusing',
  "Gemcutter's Prism",
  "Cartographer's Chisel",
  "Glassblower's Bauble",
  'Orb of Regret',
  'Silver Coin',
  "Awakener's Orb",
  'Orb of Unmaking',
  'Fracturing Orb',
  'Veiled Chaos Orb',
  'Orb of Binding',
  'Orb of Horizons',
  'Orb of Dominance',
  'Orb of Conflict',
  'Orb of Chance',
  'Ancient Orb',
  "Engineer's Orb",
  'Instilling Orb',
  'Enkindling Orb',
  'Tempering Orb',
  "Harbinger's Orb",
  "Crusader's Exalted Orb",
  "Hunter's Exalted Orb",
  "Redeemer's Exalted Orb",
  "Warlord's Exalted Orb",
]

const SHARDS = [
  'Alchemy Shard',
  'Alteration Shard',
  'Annulment Shard',
  'Regal Shard',
  'Exalted Shard',
  'Ancient Shard',
  'Mirror Shard',
  'Binding Shard',
  'Horizon Shard',
  "Harbinger's Shard",
  "Engineer's Shard",
]

const ESSENCES = [
  'Deafening Essence of Greed',
  'Deafening Essence of Contempt',
  'Deafening Essence of Hatred',
  'Deafening Essence of Woe',
  'Deafening Essence of Fear',
  'Deafening Essence of Anger',
  'Deafening Essence of Torment',
  'Deafening Essence of Sorrow',
  'Deafening Essence of Rage',
  'Deafening Essence of Suffering',
  'Deafening Essence of Wrath',
  'Deafening Essence of Doubt',
  'Deafening Essence of Loathing',
  'Deafening Essence of Zeal',
  'Deafening Essence of Anguish',
  'Deafening Essence of Spite',
  'Deafening Essence of Scorn',
  'Deafening Essence of Envy',
  'Deafening Essence of Misery',
  'Deafening Essence of Dread',
  'Essence of Delirium',
  'Essence of Horror',
  'Essence of Insanity',
  'Essence of Hysteria',
]

const FOSSILS = [
  'Aberrant Fossil',
  'Aetheric Fossil',
  'Bound Fossil',
  'Bountiful Fossil',
  'Corroded Fossil',
  'Dense Fossil',
  'Faceted Fossil',
  'Frigid Fossil',
  'Fundamental Fossil',
  'Gilded Fossil',
  'Glyphic Fossil',
  'Hollow Fossil',
  'Jagged Fossil',
  'Lucent Fossil',
  'Metallic Fossil',
  'Perfect Fossil',
  'Prismatic Fossil',
  'Pristine Fossil',
  'Pungent Fossil',
  'Sanctified Fossil',
  'Scorched Fossil',
  'Serrated Fossil',
  'Shuddering Fossil',
  'Tangled Fossil',
  'Turbulent Fossil',
]

const RESONATORS = [
  'Primitive Chaotic Resonator',
  'Potent Chaotic Resonator',
  'Powerful Chaotic Resonator',
  'Prime Chaotic Resonator',
]

const CATALYSTS = [
  'Abrasive Catalyst',
  'Accelerating Catalyst',
  'Fertile Catalyst',
  'Imbued Catalyst',
  'Intrinsic Catalyst',
  'Noxious Catalyst',
  'Prismatic Catalyst',
  'Tempering Catalyst',
  'Turbulent Catalyst',
  'Unstable Catalyst',
]

const OILS = [
  'Clear Oil',
  'Sepia Oil',
  'Amber Oil',
  'Verdant Oil',
  'Teal Oil',
  'Azure Oil',
  'Indigo Oil',
  'Violet Oil',
  'Crimson Oil',
  'Black Oil',
  'Opalescent Oil',
  'Silver Oil',
  'Golden Oil',
  'Reflective Oil',
  'Prismatic Oil',
]

const OMENS = [
  'Omen of Acceleration',
  'Omen of Adrenaline',
  'Omen of Amelioration',
  'Omen of Bequeathal',
  'Omen of Blanching',
  'Omen of Brilliance',
  'Omen of Connections',
  "Omen of Death's Door",
  'Omen of Death-dancing',
  'Omen of Fortune',
  'Omen of Refreshment',
]

export const CURRENCIES: Currency[] = [
  ...asCurrency(ORBS, 'orb'),
  ...asCurrency(SHARDS, 'shard'),
  ...asCurrency(ESSENCES, 'essence'),
  ...asCurrency(FOSSILS, 'fossil'),
  ...asCurrency(RESONATORS, 'resonator'),
  ...asCurrency(CATALYSTS, 'catalyst'),
  ...asCurrency(OILS, 'oil'),
  ...asCurrency(OMENS, 'omen'),
]

/** Looks up a currency by exact (case-insensitive) name match, e.g. to show
 * an icon next to a node's freeform "action" text if it happens to match,
 * or to decide whether {{currency:Name}} in notes is a real currency
 * before trying to render it as one. Icon resolution itself now happens
 * dynamically by name (see iconResolve.ts / data/itemNames.ts) rather
 * than from a hand-typed path table here — that table was the source of
 * a few currencies pointing at the wrong (or no) icon. */
export function findCurrencyByName(name: string): Currency | undefined {
  const target = name.trim().toLowerCase()
  if (!target) return undefined
  return CURRENCIES.find(c => c.name.toLowerCase() === target)
}
