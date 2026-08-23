/**
 * "Pastebin"-style link sharing for exported graph text, backed by
 * rentry.co, plus turning that into a link that opens *this app* with the
 * graph already loaded (rather than the bare rentry page).
 *
 * Sharing flow: uploading text to rentry.co returns a slug (e.g. "hello").
 * Rather than hand out the raw rentry.co/hello link, we hand out
 * "<app base>/hello" — e.g. https://fekga.github.io/crafting-graph/hello.
 * GitHub Pages has no server-side routing, so a fresh visit to a path like
 * that 404s by default; public/404.html catches that and bounces back to
 * index.html with the slug preserved (see slugFromCurrentLocation below),
 * so the app can still auto-load the graph and then clean the URL back up.
 *
 * Two things ruled out the obvious approach to the rentry.co side of this:
 * - rentry.co sends no CORS headers, so the browser can't read a response
 *   from it directly (creating or reading) — everything here goes through a
 *   public CORS proxy. That proxy is a third party outside our control; if
 *   it's down, link creation/fetching fails with a clear error, and plain
 *   copy/paste of the export text always still works as a no-dependency
 *   fallback.
 * - rentry's own `/api/raw` (and `/<slug>/raw`) endpoint requires an access
 *   code issued by rentry admins by email — not something this app can get
 *   automatically, so it can't be used to read a page back.
 *
 * Instead, reading fetches the *normal* public page (no access code needed
 * for that — that's the whole point of rentry) and pulls the export text
 * back out of the rendered HTML. Exported text always starts with the
 * `POECRAFT1:` prefix followed only by base64 characters (A-Za-z0-9+/=),
 * none of which have any markdown meaning, so it round-trips through
 * rentry's markdown rendering unchanged and can be found with a simple
 * regex — no need to know rentry's exact page markup, which could change.
 */

const RENTRY_BASE = 'https://rentry.co'
const CORS_PROXY = 'https://corsproxy.io/?url='
// Reading tries these in order and falls back to the next on failure —
// public CORS proxies are flaky/rate-limited individually, but rarely all
// down at once.
const READ_PROXIES = [
  (url: string) => CORS_PROXY + encodeURIComponent(url),
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
]
const EXPORT_TOKEN_RE = /POECRAFT1:[A-Za-z0-9+/=]+/g

/** The app's own base URL, e.g. "https://fekga.github.io/crafting-graph/"
 * — derived at runtime so this works under any origin/subpath rather than
 * hardcoding a specific deployment. */
function appBaseUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

/** If `url` is one of *our own* share links (app base + slug), returns the
 * slug. Otherwise null. */
function slugFromAppShareUrl(url: string): string | null {
  const trimmed = url.trim().replace(/[?#].*$/, '')
  const base = appBaseUrl()
  if (!trimmed.startsWith(base)) return null
  const slug = trimmed.slice(base.length).replace(/^\/+|\/+$/g, '')
  return slug || null
}

/** Builds the app's own shareable URL for a rentry slug, e.g.
 * "https://fekga.github.io/crafting-graph/hello" — this is what actually
 * gets shared: opening it loads the app with that graph already in. */
export function appShareUrl(slug: string): string {
  return `${appBaseUrl()}${slug}`
}

/** Builds the raw rentry.co URL for a slug, e.g. "https://rentry.co/hello". */
export function pasteUrlFromSlug(slug: string): string {
  return `${RENTRY_BASE}/${slug}`
}

/** Extracts the rentry slug from either a raw rentry.co/org URL or one of
 * our own app share URLs (app base + slug). */
function slugFromAnyPasteLink(url: string): string | null {
  const appSlug = slugFromAppShareUrl(url)
  if (appSlug) return appSlug
  const clean = url
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/(raw|edit)\/?$/, '')
    .replace(/\/$/, '')
  const match = /^https?:\/\/(?:www\.)?rentry\.(?:co|org)\/([^/]+)$/i.exec(clean)
  return match ? match[1] : null
}

/** Extracts a rentry slug straight from the app's current URL — either the
 * pathname beyond the app's base (e.g. "/crafting-graph/hello"), or a
 * "?slug=hello" query param left behind by the GitHub Pages 404 redirect
 * (see public/404.html) for a deep link that couldn't be served directly.
 * Returns null if there's no slug either way. */
export function slugFromCurrentLocation(): string | null {
  const fromQuery = new URLSearchParams(window.location.search).get('slug')
  if (fromQuery) return fromQuery

  const base = import.meta.env.BASE_URL
  let path = window.location.pathname
  if (path.startsWith(base)) path = path.slice(base.length)
  path = path.replace(/^\/+|\/+$/g, '')
  return path || null
}

/** Replaces the current URL with the clean "app base + slug" form (no
 * leftover ?slug= query param), without triggering a navigation/reload. */
export function normalizeUrlToSlug(slug: string): void {
  const url = `${import.meta.env.BASE_URL}${slug}`
  window.history.replaceState(null, '', url)
}

/** Clears any slug (query param or path) from the URL back to the app's
 * plain base, without a reload — used once a shared graph has finished
 * loading (or failed), so the URL doesn't keep pointing at a specific
 * paste after the user starts editing. */
export function clearSlugFromUrl(): void {
  window.history.replaceState(null, '', import.meta.env.BASE_URL)
}

/** Uploads text to rentry.co and returns both the shareable app URL (what
 * you should actually hand out — opening it loads this graph straight
 * away) and the raw rentry.co page URL underneath it. */
export async function createPasteLink(text: string): Promise<{ appUrl: string; rentryUrl: string }> {
  const body = new URLSearchParams()
  body.set('text', text)

  let res: Response
  try {
    res = await fetch(CORS_PROXY + encodeURIComponent(`${RENTRY_BASE}/api/new`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch {
    throw new Error(
      'Could not reach the paste service (rentry.co, via the CORS proxy). Check your connection, or copy the text above and paste it manually.',
    )
  }

  if (!res.ok) {
    throw new Error(`Paste service returned an error (${res.status}). Copy the text above and paste it manually.`)
  }

  const data = await res.json().catch(() => null)
  if (!data || String(data.status) !== '200' || !data.url_short) {
    const detail = data?.content || data?.errors || 'unexpected response'
    throw new Error(`rentry.co rejected the paste (${detail}). Copy the text above and paste it manually.`)
  }
  return { appUrl: appShareUrl(data.url_short), rentryUrl: `${RENTRY_BASE}/${data.url_short}` }
}

/** True if the given text looks like a rentry.co/org link, or one of our
 * own app share links (app base + slug). */
export function looksLikePasteUrl(text: string): boolean {
  return slugFromAnyPasteLink(text.trim()) !== null
}

function pageUrlFromLink(url: string): string {
  const slug = slugFromAnyPasteLink(url)
  return slug ? `${RENTRY_BASE}/${slug}` : url.trim()
}

/** Fetches the export text back out of a rentry.co page, given either a
 * raw rentry link or one of our own app share links. */
export async function fetchPasteText(url: string): Promise<string> {
  const pageUrl = pageUrlFromLink(url)

  let html: string | null = null
  for (const buildProxyUrl of READ_PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(pageUrl))
      if (!res.ok) continue
      html = await res.text()
      break
    } catch {
      // try the next proxy
    }
  }
  if (html === null) {
    throw new Error("Couldn't reach that rentry.co page. Open it yourself, then copy the text and paste it below.")
  }

  const matches = html.match(EXPORT_TOKEN_RE)
  if (!matches || matches.length === 0) {
    throw new Error(
      "That page doesn't seem to contain a crafting-graph export. Open it yourself, then copy the text and paste it below.",
    )
  }
  // If more than one candidate turns up (e.g. a truncated copy in page
  // metadata), the real one is the longest.
  return matches.reduce((longest, candidate) => (candidate.length > longest.length ? candidate : longest))
}
