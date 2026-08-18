import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { CURRENCIES } from './data/currencies'

const renderer = new marked.Renderer()
renderer.link = ({ href, title, text }) => {
  return text
}

marked.setOptions({ breaks: true, renderer: renderer })


const SHORTCODE_RE = /\{\{currency:([^}]+)\}\}/g

/** The shortcode inserted into notes text when a currency icon is picked. */
export function currencyShortcode(name: string): string {
  return `{{currency:${name}}}`
}

function expandCurrencyShortcodes(raw: string): string {
  return raw.replace(SHORTCODE_RE, (match, rawName: string) => {
    const name = rawName.trim().toLowerCase()
    const currency = CURRENCIES.find(c => c.name.toLowerCase() === name)
    if (!currency) return match
    // Rendered as a markdown image so `marked` + DOMPurify handle the
    // actual HTML generation/sanitization — we never inject raw HTML here.
    return `![${currency.name}](${currency.icon})`
  })
}

/** Renders notes markdown (with currency-icon shortcodes expanded) to
 * sanitized HTML safe to render with dangerouslySetInnerHTML — including
 * for notes coming from an imported/pasted graph from someone else. */
export function renderNotesHtml(raw: string): string {
  if (!raw.trim()) return ''
  const withImages = expandCurrencyShortcodes(raw)
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
