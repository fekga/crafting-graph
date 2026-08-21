/**
 * Browses and caches the item art served at
 * https://repoe-fork.github.io/Art/2DItems/ — a plain "tree"-generated
 * directory listing of every 2D item icon extracted from the game (all
 * item classes, not just currency). GitHub Pages serves everything with
 * `Access-Control-Allow-Origin: *` by default, so this can be fetched
 * directly from the browser with no proxy or key needed.
 *
 * The catalog is large (thousands of files across nested folders per item
 * class), so directories are only crawled on demand as the user browses
 * into them, and each directory listing is cached in localStorage so
 * re-opening a folder later doesn't re-fetch it. Image URLs themselves are
 * deterministic from a node's `path` (`<ART_BASE>/<path>.webp`), so nothing
 * about a picked item needs to be looked up again later — a shortcode only
 * needs to remember the path.
 */

export type ArtNode =
  | { type: 'dir'; name: string; path: string }
  | { type: 'file'; name: string; path: string; label: string }

export const ART_BASE = 'https://repoe-fork.github.io/Art/2DItems'

/** The top-level item-class folders, as seen at the root of the tree. */
export const TOP_CATEGORIES = [
  'Amulets',
  'Armours',
  'Belts',
  'Currency',
  'Divination',
  'Effects',
  'Flasks',
  'Gems',
  'Jewels',
  'Maps',
  'QuestItems',
  'Quivers',
  'Relics',
  'Rings',
  'Weapons',
]

const CACHE_PREFIX = 'poe-art-dir:v1:'
const PICKS_KEY = 'poe-art-picks:v1'

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function artImageUrl(path: string, ext: 'webp' | 'png' = 'webp'): string {
  return `${ART_BASE}/${encodePath(path)}.${ext}`
}

/** Turns an internal codename like "AnnullOrb" or "CurrencyRerollRare" into
 * a readable label ("Annull Orb", "Currency Reroll Rare"). These are art
 * filenames, not official item names, so this is best-effort. */
export function prettifyName(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodePart(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

function parseListing(html: string, dirPath: string): ArtNode[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const anchors = Array.from(doc.querySelectorAll('a'))

  const dirs = new Map<string, ArtNode>()
  const fileBases = new Set<string>()

  for (const a of anchors) {
    let href = a.getAttribute('href') || ''
    if (!href || /^https?:\/\//i.test(href)) continue
    href = href.replace(/^\.\//, '')
    if (!href || href === '../' || href === '.') continue

    if (href.endsWith('/')) {
      const name = decodePart(href.slice(0, -1))
      if (!name) continue
      const path = dirPath ? `${dirPath}/${name}` : name
      dirs.set(path, { type: 'dir', name, path })
    } else if (/\.(webp|png)$/i.test(href)) {
      const name = decodePart(href)
      const base = name.replace(/\.(webp|png)$/i, '')
      if (base) fileBases.add(base)
    }
  }

  const files: ArtNode[] = [...fileBases].map(base => {
    const path = dirPath ? `${dirPath}/${base}` : base
    return { type: 'file', name: base, path, label: prettifyName(base) }
  })

  return [...dirs.values(), ...files].sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
  )
}

/** Lists the contents of a folder in the art tree (path relative to
 * ART_BASE, "" for the root), using a cached copy when available. */
export async function listDir(path: string, opts: { force?: boolean } = {}): Promise<ArtNode[]> {
  const cacheKey = CACHE_PREFIX + path
  if (!opts.force) {
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) return JSON.parse(cached) as ArtNode[]
    } catch {
      // corrupt or unavailable cache — fall through to a fresh fetch
    }
  }

  const url = `${ART_BASE}/${path ? `${encodePath(path)}/` : ''}`
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error("Couldn't reach the item art catalog. Check your connection and try again.")
  }
  if (!res.ok) {
    throw new Error(`Couldn't load "${path || 'the catalog'}" (${res.status}).`)
  }
  const html = await res.text()
  const nodes = parseListing(html, path)

  try {
    localStorage.setItem(cacheKey, JSON.stringify(nodes))
  } catch {
    // storage full/unavailable — caching is an optimization, not required
  }
  return nodes
}

/** Recursively walks every subfolder under `rootPath` (using `listDir`'s
 * cache so repeat searches are instant), invoking `onBatch` with newly
 * discovered files as they're found so a caller can show live progress
 * rather than blocking until the whole subtree has been crawled. Caps how
 * many folders it will visit to avoid a pathological crawl of a huge
 * category; the returned `truncated` flag tells the caller whether that
 * cap was hit. Pass `signal` (a `{ cancelled }` box) to abort an
 * in-flight crawl, e.g. when the search query changes again. */
export async function crawlDir(
  rootPath: string,
  onBatch: (files: Extract<ArtNode, { type: 'file' }>[]) => void,
  opts: { maxDirs?: number; concurrency?: number; signal?: { cancelled: boolean } } = {},
): Promise<{ truncated: boolean }> {
  const maxDirs = opts.maxDirs ?? 600
  const concurrency = opts.concurrency ?? 6
  const queue: string[] = [rootPath]
  let visited = 0
  let truncated = false

  async function worker(): Promise<void> {
    for (;;) {
      if (opts.signal?.cancelled) return
      if (visited >= maxDirs) {
        if (queue.length > 0) truncated = true
        return
      }
      const path = queue.shift()
      if (path === undefined) return
      visited++
      let nodes: ArtNode[]
      try {
        nodes = await listDir(path)
      } catch {
        continue // skip folders that fail to load; keep crawling the rest
      }
      if (opts.signal?.cancelled) return
      const files = nodes.filter((n): n is Extract<ArtNode, { type: 'file' }> => n.type === 'file')
      if (files.length > 0) onBatch(files)
      for (const n of nodes) {
        if (n.type === 'dir') queue.push(n.path)
      }
    }
  }

  // Each round spins up workers that drain the shared queue, discovering
  // (and consuming) new subfolders as they go. A worker can exit early if
  // it happens to see an empty queue while a sibling is still mid-fetch —
  // so after a round finishes, re-check for leftovers and run another
  // round if needed. This keeps things parallel without ever stalling.
  while (queue.length > 0 && visited < maxDirs && !opts.signal?.cancelled) {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  }

  return { truncated }
}



type RememberedPick = { name: string; path: string }

function loadPicks(): RememberedPick[] {
  try {
    const raw = localStorage.getItem(PICKS_KEY)
    return raw ? (JSON.parse(raw) as RememberedPick[]) : []
  } catch {
    return []
  }
}

/** Remembers a browsed-in item's path against its display name, so a plain
 * text field (like a node's "action") that later contains this exact name
 * can still show the right icon without re-browsing. */
export function rememberPickedItem(name: string, path: string): void {
  try {
    const picks = loadPicks().filter(p => p.name.toLowerCase() !== name.toLowerCase())
    picks.unshift({ name, path })
    localStorage.setItem(PICKS_KEY, JSON.stringify(picks.slice(0, 300)))
  } catch {
    // non-fatal
  }
}

export function findRememberedItem(name: string): RememberedPick | undefined {
  const target = name.trim().toLowerCase()
  if (!target) return undefined
  return loadPicks().find(p => p.name.toLowerCase() === target)
}
