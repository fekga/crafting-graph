/**
 * "Pastebin"-style link sharing for exported graph text, backed by
 * rentry.co.
 *
 * Two things ruled out the obvious approach:
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
const READ_PROXY = 'https://api.allorigins.win/raw?url='
const EXPORT_TOKEN_RE = /POECRAFT1:[A-Za-z0-9+/=]+/g

/** Uploads text to rentry.co and returns the shareable page URL. */
export async function createPasteLink(text: string): Promise<string> {
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
  return `${RENTRY_BASE}/${data.url_short}`
}

/** True if the given text looks like a rentry.co link. */
export function looksLikePasteUrl(text: string): boolean {
  try {
    const host = new URL(text.trim()).hostname.replace(/^www\./, '')
    return host === 'rentry.co' || host === 'rentry.org'
  } catch {
    return false
  }
}

function pageUrlFromLink(url: string): string {
  const clean = url
    .trim()
    .replace(/#.*$/, '')
    .replace(/\/(raw|edit)\/?$/, '')
    .replace(/\/$/, '')
  return clean
}

/** Fetches the export text back out of a rentry.co page. */
export async function fetchPasteText(url: string): Promise<string> {
  const pageUrl = pageUrlFromLink(url)

  let html: string
  try {
    const res = await fetch(CORS_PROXY + encodeURIComponent(pageUrl))
    if (!res.ok) throw new Error(String(res.status))
    html = await res.text()
  } catch {
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
