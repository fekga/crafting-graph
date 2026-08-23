import { useMemo, useState } from 'react'
import { parseItemText, type ParsedItem } from '../itemTextParser'
import { hexToRgbTriple } from '../poeColors'
import type { AffixTag, Modifier } from '../types'

type Props = {
  tagPresets: AffixTag[]
  onAdd: (modifiers: Modifier[], updatedPresets: AffixTag[], nameFromItem: string | null) => void
  onClose: () => void
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

const DEFAULT_MOD_COLOR = '#8888ff'

export default function ItemPasteModal({ tagPresets, onAdd, onClose }: Props) {
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParsedItem | null>(null)
  const [checked, setChecked] = useState<boolean[]>([])
  const [texts, setTexts] = useState<string[]>([])
  const [useName, setUseName] = useState(true)
  const [error, setError] = useState('')

  const canParse = raw.trim().length > 0

  function handleParse() {
    const result = parseItemText(raw)
    if (!result) {
      setError("Couldn't find anything recognizable in that text — check it's a full item copy.")
      setParsed(null)
      return
    }
    setError('')
    setParsed(result)
    setChecked(result.mods.map(() => true))
    setTexts(result.mods.map(m => m.text))
  }

  const displayName = useMemo(() => {
    if (!parsed) return ''
    if (parsed.name && parsed.baseType) return parsed.name
    return parsed.name || parsed.baseType
  }, [parsed])

  function toggle(i: number) {
    setChecked(c => c.map((v, idx) => (idx === i ? !v : v)))
  }

  function handleAdd() {
    if (!parsed) return
    const presets = [...tagPresets]
    const modifiers: Modifier[] = []

    parsed.mods.forEach((mod, i) => {
      if (!checked[i]) return
      const text = (texts[i] ?? mod.text).trim()
      if (!text) return

      const tags: AffixTag[] = mod.tagLabels.map(label => {
        const existing = presets.find(t => t.label.toLowerCase() === label.toLowerCase())
        if (existing) return existing
        const created: AffixTag = { id: makeId('tag'), label, color: '#c8aa6e' }
        presets.push(created)
        return created
      })

      modifiers.push({ id: makeId('mod'), text, textColor: DEFAULT_MOD_COLOR, tags })
    })

    onAdd(modifiers, presets, useName && displayName ? displayName : null)
  }

  const checkedCount = checked.filter(Boolean).length

  return (
    <div
      className="modal-overlay"
      // Deliberately no onClick here: clicking the backdrop must NOT close
      // the modal, only the explicit Close button (or a completed action)
      // should.
    >
      <div className="modal item-paste-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Paste item text</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Copy the item in-game with <strong>Alt+Ctrl+C</strong> — not the plain Ctrl+C copy. That's the one that
          includes each modifier's Prefix/Suffix/Crafted/Fractured origin line, which is what this uses to tag
          modifiers automatically; a plain Ctrl+C copy is missing those lines, so its mods would come through
          untagged. Turn on "Advanced mod descriptions" in game options first, or Alt+Ctrl+C won't include them
          either. Text copied from Path of Building or Craft of Exile works the same way, if it was itself sourced
          from an Alt+Ctrl+C copy. Prefix vs. suffix still can't always be told apart from this text alone, so
          double-check the tags it picks.
        </p>

        {!parsed ? (
          <>
            <textarea
              autoFocus
              className="export-textarea"
              rows={12}
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={'Item Class: Boots\nRarity: Rare\n...'}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="modal-footer">
              <button onClick={handleParse} disabled={!canParse}>
                Parse item
              </button>
            </div>
          </>
        ) : (
          <>
            {displayName && (
              <label className="item-paste-name-row">
                <input type="checkbox" checked={useName} onChange={e => setUseName(e.target.checked)} />
                Use "{displayName}" as this node's name
              </label>
            )}

            {parsed.mods.length === 0 ? (
              <p className="muted">
                No modifier-looking lines were found — the text may not have
                come through fully, or this item has no affixes to add.
              </p>
            ) : (
              <div className="item-paste-mod-list">
                {parsed.mods.map((mod, i) => (
                  <label className="item-paste-mod-row" key={i}>
                    <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)} />
                    <div className="item-paste-mod-body">
                      <div className="item-paste-mod-tags">
                        {mod.tagLabels.map(label => (
                          <span
                            key={label}
                            className="tag-badge"
                            style={{
                              ['--chip-color' as any]: '#c8aa6e',
                              ['--chip-rgb' as any]: hexToRgbTriple('#c8aa6e'),
                            }}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <input
                        className="item-paste-mod-text"
                        value={texts[i] ?? mod.text}
                        onChange={e => setTexts(t => t.map((v, idx) => (idx === i ? e.target.value : v)))}
                      />
                    </div>
                  </label>
                ))}
              </div>
            )}

            {parsed.flags.length > 0 && (
              <p className="muted" style={{ fontSize: 12 }}>
                Also noted on this item: {parsed.flags.join(', ')} (not added as modifiers).
              </p>
            )}

            <div className="modal-footer">
              <button onClick={() => setParsed(null)}>Back</button>
              <button onClick={handleAdd} disabled={checkedCount === 0 && !(useName && displayName)}>
                Add {checkedCount > 0 ? `${checkedCount} modifier${checkedCount === 1 ? '' : 's'}` : ''} to node
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
