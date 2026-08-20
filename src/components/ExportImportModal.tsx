import { useState } from 'react'
import { decodeGraphText, encodeGraphText, type ExportPayload } from '../exportText'
import { createPasteLink, fetchPasteText, looksLikePasteUrl } from '../pasteService'

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

  const [linkUrl, setLinkUrl] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [importUrl, setImportUrl] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not copy automatically — select the text and copy it manually.')
    }
  }

  async function handleCreateLink() {
    setLinkBusy(true)
    setError('')
    try {
      const url = await createPasteLink(text)
      setLinkUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a shareable link.')
    } finally {
      setLinkBusy(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(linkUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      // ignore — the link is still shown and can be selected manually
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

  async function handleFetchLink() {
    if (!importUrl.trim()) return
    setImportBusy(true)
    setError('')
    try {
      const fetched = await fetchPasteText(importUrl)
      const trimmed = fetched.trim()
      setText(trimmed)
      // If it's already a valid export, load it straight away.
      const payload = decodeGraphText(trimmed)
      if (payload) {
        onImport(payload)
      } else {
        setError(
          'Fetched the link, but the contents don\u2019t look like a valid crafting-graph export. Check the text below.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch that link.')
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'export' ? 'Export as text' : 'Import from text'}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {mode === 'export' ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Copy this text and send it however you like, or generate a link
              to share instead. Either can be loaded back in via
              "Import from text" on any device.
            </p>

            <div className="paste-link-row">
              <button onClick={handleCreateLink} disabled={linkBusy}>
                {linkBusy ? 'Creating link\u2026' : 'Create shareable link'}
              </button>
              {linkUrl && (
                <>
                  <input
                    className="paste-link-input"
                    value={linkUrl}
                    readOnly
                    onFocus={e => e.target.select()}
                  />
                  <button onClick={copyLink}>{linkCopied ? 'Copied!' : 'Copy link'}</button>
                </>
              )}
            </div>
            {linkUrl && (
              <p className="muted paste-link-hint">
                Hosted on rentry.co. Anyone with this link can view it (and
                edit or delete the paste — rentry doesn't ask for a login to
                do that, so only share it with people you trust).
              </p>
            )}
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Paste a previously exported graph below, then load it — or fetch
              it straight from a share link.
            </p>

            <div className="paste-link-row">
              <input
                className="paste-link-input"
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                placeholder="Paste a rentry.co link…"
              />
              <button onClick={handleFetchLink} disabled={importBusy || !looksLikePasteUrl(importUrl)}>
                {importBusy ? 'Fetching\u2026' : 'Fetch link'}
              </button>
            </div>
          </>
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
