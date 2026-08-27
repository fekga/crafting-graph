import { lazy, Suspense, useState } from 'react'
import { POE_TEXT_COLORS, hexToRgbTriple } from '../poeColors'
import type { AffixTag, Modifier } from '../types'
import { TAG_PRESET_ID_FOR_SOURCE, type ModifierEntry } from '../modData'

// Lazy: only needed if "Search game mods..." below is actually clicked,
// which most modifier edits never touch -- no reason for its search UI to
// sit in the main bundle otherwise.
const ModifierSearchModal = lazy(() => import('./ModifierSearchModal'))

type Props = {
  modifier: Modifier | null
  tagPresets: AffixTag[]
  onSave: (modifier: Modifier, tagPresets: AffixTag[]) => void
  onClose: () => void
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

const blankModifier = (): Modifier => ({
  id: makeId('mod'),
  text: '',
  textColor: '#8888ff',
  tags: [],
})

const NEW_TAG_COLOR = '#c8aa6e'

export default function AffixEditor({ modifier, tagPresets, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Modifier>(() => modifier ?? blankModifier())
  const [presets, setPresets] = useState<AffixTag[]>(tagPresets)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [newTagLabel, setNewTagLabel] = useState('')
  const [newTagColor, setNewTagColor] = useState(NEW_TAG_COLOR)
  const [customColorInput, setCustomColorInput] = useState(draft.textColor)
  const [modSearchOpen, setModSearchOpen] = useState(false)

  const isEditing = modifier !== null

  /** Fills the draft in from a picked real modifier, and -- only as a
   * convenience, not a requirement -- turns on whichever tag preset
   * conventionally matches its source (Prefix/Suffix/Implicit/Enchant/
   * Crafted/Corrupted, see TAG_PRESET_ID_FOR_SOURCE), if it's still
   * around -- the user can rename or delete those defaults, in which case
   * this just does nothing rather than recreating one. */
  function handlePickModifier(entry: ModifierEntry) {
    setDraft(d => ({ ...d, text: entry.text }))
    const wantedId = TAG_PRESET_ID_FOR_SOURCE[entry.source]
    const preset = wantedId ? presets.find(t => t.id === wantedId) : undefined
    if (preset && !isTagOn(preset.id)) toggleTag(preset)
    setModSearchOpen(false)
  }

  function isTagOn(tagId: string) {
    return draft.tags.some(t => t.id === tagId)
  }

  function toggleTag(tag: AffixTag) {
    setDraft(d =>
      isTagOn(tag.id)
        ? { ...d, tags: d.tags.filter(t => t.id !== tag.id) }
        : { ...d, tags: [...d.tags, tag] },
    )
  }

  function addPreset() {
    const label = newTagLabel.trim()
    if (!label) return
    const tag: AffixTag = { id: makeId('tag'), label, color: newTagColor }
    setPresets(p => [...p, tag])
    setDraft(d => ({ ...d, tags: [...d.tags, tag] }))
    setNewTagLabel('')
    setNewTagColor(NEW_TAG_COLOR)
  }

  function updatePreset(id: string, patch: Partial<AffixTag>) {
    setPresets(p => p.map(t => (t.id === id ? { ...t, ...patch } : t)))
    // Keep any copy of this tag already attached to the current draft in
    // sync, so editing a preset's color updates the live preview too.
    setDraft(d => ({
      ...d,
      tags: d.tags.map(t => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }

  function removePreset(id: string) {
    setPresets(p => p.filter(t => t.id !== id))
    if (editingPresetId === id) setEditingPresetId(null)
  }

  function setTextColor(color: string) {
    setDraft(d => ({ ...d, textColor: color }))
    setCustomColorInput(color)
  }

  function handleSave() {
    if (!draft.text.trim()) return
    onSave(draft, presets)
  }

  const editingPreset = presets.find(t => t.id === editingPresetId) ?? null

  return (
    <div
      className="modal-overlay"
      // Deliberately no onClick here: clicking the backdrop must NOT close
      // the modal, only the explicit Close button (or a completed action)
      // should.
    >
      <div className="modal affix-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit modifier' : 'Build a modifier'}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="affix-editor-body">
          <div className="row-between">
            <label style={{ margin: 0 }}>Modifier text</label>
            <button type="button" onClick={() => setModSearchOpen(true)}>
              Search game mods…
            </button>
          </div>
          <textarea
            autoFocus
            className="affix-text-input"
            rows={3}
            value={draft.text}
            placeholder="e.g. +(120-140) to maximum Life"
            onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
          />

          <label>Text color</label>
          <div className="color-swatch-grid">
            {POE_TEXT_COLORS.map(c => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                className={`color-swatch${draft.textColor === c.value ? ' color-swatch-active' : ''}`}
                style={{ background: c.value }}
                onClick={() => setTextColor(c.value)}
              />
            ))}
            <label className="color-swatch color-swatch-custom" title="Custom color">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(draft.textColor) ? draft.textColor : '#ffffff'}
                onChange={e => setTextColor(e.target.value)}
              />
            </label>
          </div>
          <div className="color-hex-row">
            <input
              className="color-hex-input"
              value={customColorInput}
              onChange={e => {
                setCustomColorInput(e.target.value)
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  setDraft(d => ({ ...d, textColor: e.target.value }))
                }
              }}
              placeholder="#8888ff"
            />
            <span className="muted" style={{ fontSize: 11 }}>Hex color</span>
          </div>

          <div className="row-between">
            <label style={{ margin: 0 }}>Tags</label>
          </div>
          <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            Attach any tags that apply — a modifier can be both a Prefix and
            Fractured, for example.
          </p>
          <div className="tag-chip-grid">
            {presets.map(tag => (
              <div className="tag-chip-wrap" key={tag.id}>
                <button
                  type="button"
                  className={`tag-chip${isTagOn(tag.id) ? ' tag-chip-active' : ''}`}
                  style={{
                    ['--chip-color' as any]: tag.color,
                    ['--chip-rgb' as any]: hexToRgbTriple(tag.color),
                  }}
                  onClick={() => toggleTag(tag)}
                >
                  {tag.label}
                </button>
                <button
                  type="button"
                  className="tag-chip-edit"
                  title="Edit this tag"
                  onClick={() => setEditingPresetId(id => (id === tag.id ? null : tag.id))}
                >
                  ✎
                </button>
              </div>
            ))}
          </div>

          {editingPreset && (
            <div className="tag-preset-editor">
              <input
                value={editingPreset.label}
                onChange={e => updatePreset(editingPreset.id, { label: e.target.value })}
                placeholder="Tag name"
              />
              <label className="color-swatch color-swatch-custom" title="Tag color">
                <input
                  type="color"
                  value={editingPreset.color}
                  onChange={e => updatePreset(editingPreset.id, { color: e.target.value })}
                />
              </label>
              <button type="button" onClick={() => removePreset(editingPreset.id)}>
                Delete tag
              </button>
              <button type="button" onClick={() => setEditingPresetId(null)}>
                Done
              </button>
            </div>
          )}

          <div className="new-tag-row">
            <input
              value={newTagLabel}
              onChange={e => setNewTagLabel(e.target.value)}
              placeholder="New tag name, e.g. 'Split' or 'Influenced'"
              onKeyDown={e => e.key === 'Enter' && addPreset()}
            />
            <label className="color-swatch color-swatch-custom" title="New tag color">
              <input
                type="color"
                value={newTagColor}
                onChange={e => setNewTagColor(e.target.value)}
              />
            </label>
            <button type="button" onClick={addPreset} disabled={!newTagLabel.trim()}>
              + Add tag
            </button>
          </div>

          <label>Preview</label>
          <div className="affix-preview">
            {draft.tags.map(tag => (
              <span
                key={tag.id}
                className="tag-badge"
                style={{
                  ['--chip-color' as any]: tag.color,
                  ['--chip-rgb' as any]: hexToRgbTriple(tag.color),
                }}
              >
                {tag.label}
              </span>
            ))}
            <span style={{ color: draft.textColor }}>
              {draft.text || 'Modifier text preview...'}
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={handleSave} disabled={!draft.text.trim()}>
            {isEditing ? 'Save changes' : 'Add modifier'}
          </button>
        </div>
      </div>

      {modSearchOpen && (
        <Suspense fallback={null}>
          <ModifierSearchModal tagPresets={presets} onPick={handlePickModifier} onClose={() => setModSearchOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}
