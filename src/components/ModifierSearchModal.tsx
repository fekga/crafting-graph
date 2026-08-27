import { useEffect, useMemo, useState } from 'react'
import { hexToRgbTriple } from '../poeColors'
import type { AffixTag } from '../types'
import {
  getCachedModifierIndex,
  isModifierCacheStale,
  loadModifierIndex,
  TAG_PRESET_ID_FOR_SOURCE,
  type ModifierEntry,
  type ModifierIndex,
  type ModifierSource,
} from '../modData'

type Props = {
  tagPresets: AffixTag[]
  onPick: (entry: ModifierEntry) => void
  onClose: () => void
}

// Most sources here have a directly matching default tag preset (see
// DEFAULT_TAG_PRESETS in poeColors.ts) -- reusing that preset's actual
// label/color (rather than a second hardcoded palette) means a badge here
// looks the same as the matching tag chip elsewhere in the app, and picks
// up whatever the user has renamed/recolored it to. Falls back to these
// defaults only when the matching preset was deleted, or for essence/veiled,
// which have no built-in preset of their own -- chosen (gold, pink) to sit
// clearly apart from the other six on the color wheel, since implicit and
// crafted are already both purple/blue-leaning and a close 7th/8th color
// there would be hard to tell apart at a glance.
const FALLBACK_INFO: Record<ModifierSource, { label: string; color: string }> = {
  prefix: { label: 'Prefix', color: '#6fb3c9' },
  suffix: { label: 'Suffix', color: '#d99a4e' },
  implicit: { label: 'Implicit', color: '#9b8cd9' },
  enchant: { label: 'Enchant', color: '#6fcf97' },
  essence: { label: 'Essence', color: '#d4af37' },
  corrupted: { label: 'Corrupted', color: '#d20000' },
  crafted: { label: 'Crafted', color: '#b4b4ff' },
  veiled: { label: 'Veiled', color: '#e0529c' },
}
const ALL_SOURCES = Object.keys(FALLBACK_INFO) as ModifierSource[]

function sourceInfo(source: ModifierSource, tagPresets: AffixTag[]): { label: string; color: string } {
  const presetId = TAG_PRESET_ID_FOR_SOURCE[source]
  const preset = presetId ? tagPresets.find(t => t.id === presetId) : undefined
  return preset ?? FALLBACK_INFO[source]
}

const RESULT_LIMIT = 200

function formatWhen(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Lets someone look up a real in-game modifier's text/range instead of
 * typing it from memory -- sourced from RePoE (see modData.ts for why this
 * fetches live rather than shipping a static snapshot). Opened from the
 * "Search game mods..." button in AffixEditor. */
export default function ModifierSearchModal({ tagPresets, onPick, onClose }: Props) {
  const [index, setIndex] = useState<ModifierIndex | null>(() => getCachedModifierIndex())
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeSources, setActiveSources] = useState<Set<ModifierSource>>(new Set(ALL_SOURCES))

  useEffect(() => {
    if (!index || !isModifierCacheStale(index.fetchedAt)) return
    setRefreshing(true)
    loadModifierIndex({ forceRefresh: true })
      .then(setIndex)
      .catch(() => {
        // A background refresh failing is fine -- the (stale but usable)
        // cached index already loaded above stays in place.
      })
      .finally(() => setRefreshing(false))
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLoad(forceRefresh = false) {
    setLoading(true)
    setError(null)
    loadModifierIndex({ forceRefresh })
      .then(setIndex)
      .catch(() => setError("Couldn't load the modifier database — check your connection and try again."))
      .finally(() => setLoading(false))
  }

  function toggleSource(source: ModifierSource) {
    setActiveSources(prev => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  const results = useMemo(() => {
    if (!index) return []
    const q = query.trim().toLowerCase()
    return index.entries
      .filter(e => activeSources.has(e.source) && (!q || e.text.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)))
      .slice(0, RESULT_LIMIT)
  }, [index, query, activeSources])

  return (
    <div
      className="modal-overlay"
      // Deliberately no onClick here: clicking the backdrop must NOT close
      // the modal, only the explicit Close button should.
    >
      <div className="modal modifier-search-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Search game modifiers</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {!index ? (
          <div className="modifier-search-gate">
            <p className="muted" style={{ marginTop: 0 }}>
              Looks up real modifier text/ranges from Path of Exile's own data (via RePoE), so it always reflects
              the current league rather than a snapshot baked into this site.
            </p>
            <p className="muted">
              This is a one-time ~26&nbsp;MB download, cached on this device afterward — subsequent opens are
              instant.
            </p>
            {error && <p className="muted">{error}</p>}
            <button className="btn-primary" onClick={() => handleLoad()} disabled={loading}>
              {loading ? 'Loading…' : 'Load modifier database'}
            </button>
          </div>
        ) : (
          <>
            <input
              autoFocus
              className="modal-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search modifier text, e.g. 'maximum Life'"
            />

            <div className="modifier-search-toolbar">
              <div className="category-tabs" style={{ marginBottom: 0 }}>
                {ALL_SOURCES.map(source => {
                  const { label, color } = sourceInfo(source, tagPresets)
                  const active = activeSources.has(source)
                  return (
                    <button
                      key={source}
                      type="button"
                      className={`category-tab modifier-source-tab${active ? ' category-tab-active' : ''}`}
                      style={{
                        ['--chip-color' as any]: color,
                        ['--chip-rgb' as any]: hexToRgbTriple(color),
                      }}
                      onClick={() => toggleSource(source)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                {refreshing ? 'Refreshing…' : `Updated ${formatWhen(index.fetchedAt)}`}{' '}
                <button onClick={() => handleLoad(true)} disabled={refreshing} title="Re-check for updated data">
                  {refreshing ? '…' : '⟳'}
                </button>
              </span>
            </div>

            <div className="modal-results">
              {results.length === 0 && <p className="muted">No matching modifiers.</p>}
              {results.map(entry => {
                const { label, color } = sourceInfo(entry.source, tagPresets)
                const tierLabel = entry.tier
                  ? `${entry.source === 'crafted' ? 'Rank' : 'Tier'} ${entry.tier}/${entry.tierCount} · `
                  : ''
                return (
                  <button type="button" className="affix-row" key={entry.key} onClick={() => onPick(entry)}>
                    <span className="affix-text">
                      <span className="affix-name">
                        {entry.name ? `${entry.name} · ` : ''}
                        {tierLabel}
                        Req. level {entry.requiredLevel}
                      </span>
                      <span className="affix-desc">{entry.text}</span>
                    </span>
                    <span
                      className="tag-badge modifier-source-badge"
                      style={{
                        ['--chip-color' as any]: color,
                        ['--chip-rgb' as any]: hexToRgbTriple(color),
                      }}
                    >
                      {label}
                    </span>
                  </button>
                )
              })}
              {results.length === RESULT_LIMIT && (
                <p className="muted">Showing the first {RESULT_LIMIT} matches — narrow your search for more.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
