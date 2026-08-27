import { useEffect, useState } from 'react'
import { deleteSnippet, listSnippets, type Snippet } from '../snippets'

type Props = {
  onInsert: (snippet: Snippet) => void
  onClose: () => void
}

function formatWhen(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

/** Lets someone reuse a saved cluster of nodes (see "Save as snippet" in
 * App.tsx) across graphs -- a lighter, piece-of-a-graph counterpart to
 * Templates/local saves, which both replace the whole canvas. */
export default function SnippetsModal({ onInsert, onClose }: Props) {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null)

  useEffect(() => {
    listSnippets().then(setSnippets)
  }, [])

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name || 'Untitled'}"? This can't be undone.`)) return
    await deleteSnippet(id)
    setSnippets(await listSnippets())
  }

  return (
    <div
      className="modal-overlay"
      // Deliberately no onClick here: clicking the backdrop must NOT close
      // the modal, only the explicit Close button (or a completed action)
      // should.
    >
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Snippets</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Reusable clusters of nodes, saved from this device. Use "Save as snippet" on a selection to add one here.
        </p>

        {snippets === null && <p className="muted">Loading…</p>}

        {snippets !== null && snippets.length === 0 && (
          <p className="muted">No snippets saved yet.</p>
        )}

        {snippets !== null && snippets.length > 0 && (
          <div className="saved-graph-list">
            {snippets.map(s => (
              <div className="saved-graph-row" key={s.id}>
                <div className="saved-graph-info">
                  <div className="saved-graph-name">{s.name || 'Untitled'}</div>
                  <div className="saved-graph-meta">
                    {s.nodes.length} node{s.nodes.length === 1 ? '' : 's'} · {formatWhen(s.updatedAt)}
                  </div>
                </div>
                <div className="saved-graph-actions">
                  <button onClick={() => onInsert(s)}>Insert</button>
                  <button onClick={() => handleDelete(s.id, s.name)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
