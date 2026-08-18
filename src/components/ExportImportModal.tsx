import { useState } from 'react'
import { decodeGraphText, encodeGraphText, type ExportPayload } from '../exportText'

type Props = {
  mode: 'export' | 'import'
  exportPayload?: ExportPayload
  onImport: (payload: ExportPayload) => void
  onClose: () => void
}

export default function ExportImportModal({ mode, exportPayload, onImport, onClose }: Props) {
  const [text, setText] = useState(() =>
    mode === 'export' && exportPayload ? encodeGraphText(exportPayload) : '',
  )
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy automatically — select the text and copy it manually.')
    }
  }

  function handleLoad() {
    const payload = decodeGraphText(text)
    if (!payload) {
      setError('That text doesn\u2019t look like a valid crafting-graph export.')
      return
    }
    onImport(payload)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'export' ? 'Export as text' : 'Import from text'}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {mode === 'export' ? (
          <p className="muted" style={{ marginTop: 0 }}>
            Copy this text and send it however you like. Paste it back in via
            "Import from text" on any device to load this exact graph.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Paste a previously exported graph below, then load it.
          </p>
        )}

        <textarea
          className="export-textarea"
          value={text}
          readOnly={mode === 'export'}
          onChange={e => {
            setText(e.target.value)
            setError('')
          }}
          placeholder={mode === 'import' ? 'Paste exported graph text here...' : undefined}
          rows={10}
        />

        {error && <p className="error-text">{error}</p>}

        <div className="modal-footer">
          {mode === 'export' ? (
            <button onClick={copy}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
          ) : (
            <button onClick={handleLoad}>Load graph</button>
          )}
        </div>
      </div>
    </div>
  )
}
