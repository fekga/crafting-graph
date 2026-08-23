import { useEffect, useMemo, useRef, useState } from 'react'
import { crawlDir, listDir, TOP_CATEGORIES, type ArtNode } from '../data/itemArt'
import { ensureItemNamesLoaded, resolveUniqueName } from '../data/itemNames'
import IconImage from './IconImage'

type FileNode = Extract<ArtNode, { type: 'file' }>

type Props = {
  onPick: (path: string, label: string) => void
}

const SEARCH_DEBOUNCE_MS = 300

/** The real display name for a file node — the PoB-catalog name if this
 * happens to be a known unique, otherwise the prettified codename. */
function displayLabel(n: FileNode): string {
  return resolveUniqueName(n.path, n.label)
}

/** The folder portion of a path, e.g. "Belts/InjectorBelt" -> "Belts". */
function folderOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

export default function ItemArtBrowser({ onPick }: Props) {
  const [pathParts, setPathParts] = useState<string[]>([])
  const [nodes, setNodes] = useState<ArtNode[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Bumped whenever the unique-name catalog finishes loading, so already
  // -rendered labels upgrade from codenames to real names without needing
  // any other state to change.
  const [, forceRerender] = useState(0)

  const [searchResults, setSearchResults] = useState<FileNode[]>([])
  const [searching, setSearching] = useState(false)
  const [searchTruncated, setSearchTruncated] = useState(false)
  const crawlSignal = useRef<{ cancelled: boolean } | null>(null)

  const currentPath = pathParts.join('/')

  useEffect(() => {
    ensureItemNamesLoaded(() => forceRerender(v => v + 1))
  }, [])

  // Debounce the query so a recursive crawl isn't kicked off on every
  // keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setQuery('')
    setDebouncedQuery('')
    listDir(currentPath)
      .then(result => {
        if (!cancelled) setNodes(result)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this folder.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentPath])

  // Recursive search: whenever there's a query, crawl every subfolder
  // under the current one (instead of only filtering its immediate
  // contents) and stream in matches as they're found.
  useEffect(() => {
    if (crawlSignal.current) crawlSignal.current.cancelled = true
    const signal = { cancelled: false }
    crawlSignal.current = signal

    if (!debouncedQuery) {
      setSearchResults([])
      setSearching(false)
      setSearchTruncated(false)
      return
    }

    const q = debouncedQuery.toLowerCase()
    setSearchResults([])
    setSearchTruncated(false)
    setSearching(true)

    crawlDir(
      currentPath,
      files => {
        if (signal.cancelled) return
        const matches = files.filter(
          f => f.name.toLowerCase().includes(q) || displayLabel(f).toLowerCase().includes(q),
        )
        if (matches.length > 0) setSearchResults(prev => [...prev, ...matches])
      },
      { signal },
    )
      .then(({ truncated }) => {
        if (!signal.cancelled) setSearchTruncated(truncated)
      })
      .finally(() => {
        if (!signal.cancelled) setSearching(false)
      })

    return () => {
      signal.cancelled = true
    }
  }, [debouncedQuery, currentPath])

  // With no query, fall back to simple in-folder filtering (kept instant
  // — no need to crawl anything for a folder the user is already in).
  const localFiltered = useMemo(() => {
    if (!nodes) return null
    const q = query.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter(
      n => n.name.toLowerCase().includes(q) || (n.type === 'file' && displayLabel(n).toLowerCase().includes(q)),
    )
  }, [nodes, query])

  const isSearching = debouncedQuery.length > 0

  function enterFolder(name: string) {
    setPathParts(p => [...p, name])
  }

  function goToCrumb(index: number) {
    setPathParts(p => p.slice(0, index + 1))
  }

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const result = await listDir(currentPath, { force: true })
      setNodes(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh this folder.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="art-browser">
      <div className="art-browser-crumbs">
        <button className="art-crumb" onClick={() => setPathParts([])} disabled={pathParts.length === 0}>
          All categories
        </button>
        {pathParts.map((part, i) => (
          <span key={i}>
            <span className="art-crumb-sep">/</span>
            <button className="art-crumb" onClick={() => goToCrumb(i)} disabled={i === pathParts.length - 1}>
              {part}
            </button>
          </span>
        ))}
        <button className="art-refresh" onClick={refresh} title="Re-fetch this folder">
          ↻
        </button>
      </div>

      <input
        className="modal-search"
        placeholder={
          pathParts.length === 0
            ? 'Search all categories...'
            : `Search ${pathParts[pathParts.length - 1]} and its subfolders...`
        }
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      {/* Everything below scrolls as one unit, filling whatever height is
       * left in the modal — status text included, so a long "Searching…"
       * message doesn't shrink the actual results area. */}
      <div className="art-results">
        {loading && !isSearching && <p className="muted">Loading…</p>}
        {error && <p className="error-text">{error}</p>}

        {isSearching ? (
          <>
            {searching && (
              <p className="muted">
                Searching{searchResults.length > 0 ? ` — ${searchResults.length} so far…` : '…'}
              </p>
            )}
            {!searching && searchResults.length === 0 && (
              <p className="muted">Nothing matches "{debouncedQuery}" in this folder or its subfolders.</p>
            )}
            <div className="art-grid art-grid-items">
              {searchResults.map(n => (
                <button
                  key={n.path}
                  className="currency-item"
                  onClick={() => onPick(n.path, displayLabel(n))}
                  title={displayLabel(n)}
                >
                  <IconImage path={n.path} alt="" />
                  <span>{displayLabel(n)}</span>
                  {pathParts.length === 0 && folderOf(n.path) && (
                    <span className="art-item-folder">{folderOf(n.path)}</span>
                  )}
                </button>
              ))}
            </div>
            {!searching && searchTruncated && (
              <p className="muted">Showing partial results — narrow your search to see more.</p>
            )}
          </>
        ) : (
          !loading &&
          !error &&
          localFiltered && (
            <>
              {pathParts.length === 0 && localFiltered.length === 0 && (
                // Root listing failed to parse for some reason — fall back to
                // the known top-level categories so browsing still works.
                <div className="art-grid art-grid-folders">
                  {TOP_CATEGORIES.map(cat => (
                    <button key={cat} className="art-folder" onClick={() => enterFolder(cat)} title={cat}>
                      📁 {cat}
                    </button>
                  ))}
                </div>
              )}

              <div className="art-grid">
                {localFiltered
                  .filter(n => n.type === 'dir')
                  .map(n => (
                    <button key={n.path} className="art-folder" onClick={() => enterFolder(n.name)} title={n.name}>
                      📁 {n.name}
                    </button>
                  ))}
              </div>

              <div className="art-grid art-grid-items">
                {localFiltered
                  .filter((n): n is FileNode => n.type === 'file')
                  .map(n => (
                    <button
                      key={n.path}
                      className="currency-item"
                      onClick={() => onPick(n.path, displayLabel(n))}
                      title={displayLabel(n)}
                    >
                      <IconImage path={n.path} alt="" />
                      <span>{displayLabel(n)}</span>
                    </button>
                  ))}
              </div>

              {localFiltered.length === 0 && (
                <p className="muted">
                  {query ? `Nothing matches "${query}" in this folder.` : 'This folder is empty.'}
                </p>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}
