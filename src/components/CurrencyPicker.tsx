import { useMemo, useState } from 'react'
import fuzzysort from 'fuzzysort'
import { CURRENCIES, type Currency } from '../data/currencies'

type Props = {
  onPick: (currency: Currency) => void
  onClose: () => void
}

const GROUPS: { key: Currency['category']; label: string }[] = [
  { key: 'orb', label: 'Orbs' },
  { key: 'shard', label: 'Shards' },
  { key: 'essence', label: 'Essences' },
  { key: 'fossil', label: 'Fossils' },
  { key: 'resonator', label: 'Resonators' },
  { key: 'catalyst', label: 'Catalysts' },
  { key: 'oil', label: 'Oils' },
  { key: 'omen', label: 'Omens' },
]

export default function CurrencyPicker({ onPick, onClose }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return CURRENCIES
    const found = fuzzysort.go(query, CURRENCIES, { key: 'name', limit: 100, threshold: 0 })
    return found.map(r => r.obj)
  }, [query])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Choose a currency</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <input
          autoFocus
          className="modal-search"
          placeholder="Search currency... e.g. 'chaos', 'fosil', 'essence of greed'"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <div className="currency-groups">
          {GROUPS.map(group => {
            const items = filtered.filter(c => c.category === group.key)
            if (items.length === 0) return null
            return (
              <div key={group.key}>
                <h3 className="currency-group-title">{group.label}</h3>
                <div className="currency-grid">
                  {items.map(c => (
                    <button key={c.id} className="currency-item" onClick={() => onPick(c)} title={c.name}>
                      <img src={c.icon} alt="" loading="lazy" />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && <p className="muted">No matching currency.</p>}
        </div>
      </div>
    </div>
  )
}
