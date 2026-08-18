import { useEffect, useMemo, useState } from 'react'
import fuzzysort from 'fuzzysort'
import { loadAffixes } from '../affixes'
import type { Affix, AffixKind } from '../types'

type Props = {
  onPick: (affix: Affix) => void
  onClose: () => void
}

type IndexedAffix = {
  affix: Affix
  // Text with numbers stripped, so all tiers of the same mod (which only
  // differ by their rolled values) score identically for relevance —
  // magnitude then breaks the tie (see searchAffixes).
  matchText: string
  magnitude: number
}

const MAX_RESULTS = 40
const DEBOUNCE_MS = 120

const CATEGORIES: { key: AffixKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'prefix', label: 'Prefix' },
  { key: 'suffix', label: 'Suffix' },
  { key: 'implicit', label: 'Implicit' },
  { key: 'enchant', label: 'Enchant' },
]

function buildIndex(affixes: Affix[]): IndexedAffix[] {
  return affixes.map(affix => {
    const nums = affix.text.match(/\d+(\.\d+)?/g)
    return {
      affix,
      matchText: affix.text.replace(/[\d.]+/g, '#'),
      magnitude: nums ? Math.max(...nums.map(Number)) : 0,
    }
  })
}

/** Word-AND fuzzy search: every word in the query must match somewhere in
 * the affix's text (what it actually does) or its flavor name — typo
 * tolerant per word via fuzzysort, but requiring all words to hit keeps
 * multi-word queries like "cold res" or "increased attack speed" from
 * being swamped by irrelevant partial matches. Numbers are stripped from
 * the matched text so every tier of the same mod scores identically;
 * within that tie, the highest-rolled tier sorts first. */
function searchAffixes(query: string, index: IndexedAffix[]): Affix[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return [...index]
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, MAX_RESULTS)
      .map(e => e.affix)
  }

  const scored: { entry: IndexedAffix; score: number }[] = []
  outer: for (const entry of index) {
    let total = 0
    for (const word of words) {
      const textMatch = fuzzysort.single(word, entry.matchText)
      const nameMatch = fuzzysort.single(word, entry.affix.name)
      const best =
        textMatch && nameMatch
          ? Math.max(textMatch.score, nameMatch.score)
          : textMatch?.score ?? nameMatch?.score ?? null
      if (best === null) continue outer // word didn't match at all: disqualify
      total += best
    }
    scored.push({ entry, score: total / words.length })
  }

  scored.sort((a, b) => b.score - a.score || b.entry.magnitude - a.entry.magnitude)
  return scored.slice(0, MAX_RESULTS).map(s => s.entry.affix)
}

export default function ModifierPicker({ onPick, onClose }: Props) {
  const [affixes, setAffixes] = useState<Affix[] | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState<AffixKind | 'all'>('all')
  const [error, setError] = useState('')

  useEffect(() => {
    loadAffixes()
      .then(setAffixes)
      .catch(() => setError('Could not load modifier data. Check your connection and try again.'))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const index = useMemo(() => (affixes ? buildIndex(affixes) : null), [affixes])

  const filteredIndex = useMemo(() => {
    if (!index) return null
    return category === 'all' ? index : index.filter(e => e.affix.kind === category)
  }, [index, category])

  const results: Affix[] = useMemo(() => {
    if (!filteredIndex) return []
    return searchAffixes(debouncedQuery, filteredIndex)
  }, [filteredIndex, debouncedQuery])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Choose a modifier</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="category-tabs">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              className={`category-tab${category === c.key ? ' category-tab-active' : ''}`}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <input
          autoFocus
          className="modal-search"
          placeholder="Search real modifiers... e.g. 'life', 'cold res', 'movment speed'"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        {error && <p className="muted">{error}</p>}
        {!error && !affixes && <p className="muted">Loading modifier data...</p>}

        {affixes && (
          <div className="modal-results">
            {results.length === 0 && <p className="muted">No matching modifiers.</p>}
            {results.map(a => (
              <button
                key={a.id}
                className="affix-row"
                onClick={() => onPick(a)}
              >
                <span className={`kind-badge kind-${a.kind}`}>{a.kind}</span>
                <span className="affix-text">
                  <span className="affix-name">{a.name}</span>
                  <span className="affix-desc">{a.text}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
