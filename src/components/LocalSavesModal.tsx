import { useEffect, useState } from 'react'
import { deleteGraph, listGraphs, type SavedGraph } from '../storage'
import type { ExportPayload } from '../exportText'

type Props = {
  currentGraphId: string | null
  onLoad: (payload: ExportPayload, id: string) => void
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

export default function LocalSavesModal({ currentGraphId, onLoad, onClose }: Props) {
  const [graphs, setGraphs] = useState<SavedGraph[] | null>(null)

  useEffect(() => {
    listGraphs().then(setGraphs)
  }, [])

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name || 'Untitled'}"? This can't be undone.`)) return
    await deleteGraph(id)
    setGraphs(await listGraphs())
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
          <h2>Graphs saved on this device</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Saved locally in this browser's storage. Use "Save" in the toolbar
          to add or update an entry here.
        </p>

        {graphs === null && <p className="muted">Loading…</p>}

        {graphs !== null && graphs.length === 0 && (
          <p className="muted">No graphs saved yet.</p>
        )}

        {graphs !== null && graphs.length > 0 && (
          <div className="saved-graph-list">
            {graphs.map(g => (
              <div
                className={`saved-graph-row${g.id === currentGraphId ? ' saved-graph-row-current' : ''}`}
                key={g.id}
              >
                <div className="saved-graph-info">
                  <div className="saved-graph-name">
                    {g.name || 'Untitled'}
                    {g.id === currentGraphId && <span className="saved-graph-current-tag">current</span>}
                  </div>
                  <div className="saved-graph-meta">
                    {g.data.nodes.length} node{g.data.nodes.length === 1 ? '' : 's'} · {formatWhen(g.updatedAt)}
                  </div>
                </div>
                <div className="saved-graph-actions">
                  <button onClick={() => onLoad({ name: g.name, data: g.data }, g.id)}>Load</button>
                  <button onClick={() => handleDelete(g.id, g.name)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
