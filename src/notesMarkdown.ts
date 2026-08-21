import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { CURRENCIES } from './data/currencies'
import { artImageUrl } from './data/itemArt'
import { resolveIconPath } from './iconResolve'

const renderer = new marked.Renderer()
renderer.link = ({ href, title, text }) => {
  return text
}

marked.setOptions({ breaks: true, renderer: renderer })


const SHORTCODE_RE = /\{\{currency:([^}]+)\}\}/g
const ITEM_SHORTCODE_RE = /\{\{item:([^|}]+)\|([^}]+)\}\}/g

/** The shortcode inserted into notes text when a currency icon is picked. */
export function currencyShortcode(name: string): string {
  return `{{currency:${name}}}`
}

/** The shortcode inserted into notes text when an item is picked from the
 * full art browser. Unlike the currency shortcode, this embeds the art
 * tree path directly, so rendering it never needs a name lookup — the
 * image URL is derived from the path alone. */
export function itemArtShortcode(path: string, label: string): string {
  return `{{item:${path}|${label}}}`
}

function expandCurrencyShortcodes(raw: string): string {
  return raw.replace(SHORTCODE_RE, (match, rawName: string) => {
    const name = rawName.trim().toLowerCase()
    const currency = CURRENCIES.find(c => c.name.toLowerCase() === name)
    if (!currency) return match
    const path = resolveIconPath(currency.name)
    // No icon resolved yet (still loading) or not found at all — fall
    // back to plain bold text rather than a markdown image that would
    // 404. If it's just still loading, this self-corrects once the note
    // re-renders after the name catalog finishes (see CraftNode/App's
    // useItemNamesLoaded).
    if (!path) return `**${currency.name}**`
    // Rendered as a markdown image so `marked` + DOMPurify handle the
    // actual HTML generation/sanitization — we never inject raw HTML here.
    return `![${currency.name}](${artImageUrl(path)})`
  })
}

function expandItemShortcodes(raw: string): string {
  return raw.replace(ITEM_SHORTCODE_RE, (_match, rawPath: string, rawLabel: string) => {
    const path = rawPath.trim()
    const label = rawLabel.trim()
    if (!path) return _match
    return `![item](${artImageUrl(path)})`
  })
}

/** Renders a single-line label (inline only — no paragraphs/lists/etc,
 * unlike renderNotesHtml) with currency-icon and item-art shortcodes
 * expanded, sanitized and safe for dangerouslySetInnerHTML. Used for edge
 * labels, which are meant to be a short one-line badge rather than a full
 * note. */
export function renderLabelHtml(raw: string): string {
  if (!raw.trim()) return ''
  const withImages = expandItemShortcodes(expandCurrencyShortcodes(raw))
  const html = marked.parseInline(withImages, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'em', 'del', 'code', 'img', 'br'],
    ALLOWED_ATTR: ['src', 'alt', 'title'],
  })
}

/** Renders notes markdown (with currency-icon and item-art shortcodes
 * expanded) to sanitized HTML safe to render with dangerouslySetInnerHTML —
 * including for notes coming from an imported/pasted graph from someone
 * else. */
export function renderNotesHtml(raw: string): string {
  if (!raw.trim()) return ''
  const withImages = expandItemShortcodes(expandCurrencyShortcodes(raw))
  const html = marked.parse(withImages, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'hr', 'table',
      'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
  })
}
