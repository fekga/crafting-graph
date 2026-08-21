import { useEffect, useRef, useState } from 'react'
import { artImageUrl } from '../data/itemArt'

type Props = {
  /** Path relative to the art tree root, e.g. "Currency/AnnullOrb". */
  path: string
  alt?: string
  className?: string
}

/** Renders an icon from the repoe-fork art tree. Tries `.webp` first (what
 * the game actually ships), falls back to `.png` if that 404s, and
 * finally unmounts itself rather than showing a broken-image glyph if
 * neither exists — some art-tree paths are best-effort guesses and won't
 * always resolve to a real file. Gems and (most) flasks get routed
 * through <CompositeIcon> instead, since their source art isn't a
 * ready-to-use single image (see below).
 */
export default function IconImage({ path, alt = '', className }: Props) {
  const category = compositeCategory(path)
  if (category) {
    return <CompositeIcon path={path} alt={alt} className={className} category={category} />
  }
  return <SimpleIcon path={path} alt={alt} className={className} />
}

// Active skill gem and flask art ships as a horizontal filmstrip of 3
// equal-width frames — the game layers them together client-side to get
// the final icon, rather than shipping one ready image. The finished icon
// is the rightmost frame, with the middle frame drawn on top of it, then
// the leftmost frame drawn on top of that.
//
// Two kinds of paths live under Flasks/ but are already single ready
// icons, not filmstrips: Tinctures, and flasks whose codename starts with
// "Sap" (e.g. "SapFlask") — note this must NOT match "Sapphire" (as in
// SapphireFlask), which is a real filmstrip that happens to also start
// with "Sap".
const SAP_EXCLUDE_RE = /(^|\/)Sap([A-Z]|$)/
const TINCTURE_EXCLUDE_RE = /Tincture/i

function compositeCategory(path: string): 'gem' | 'flask' | null {
  if (path.startsWith('Gems/')) return 'gem'
  if (path.startsWith('Flasks/')) {
    if (SAP_EXCLUDE_RE.test(path) || TINCTURE_EXCLUDE_RE.test(path)) return null
    return 'flask'
  }
  return null
}

function SimpleIcon({ path, alt, className }: Props) {
  const [stage, setStage] = useState<'webp' | 'png' | 'hidden'>('webp')

  // Reset the fallback chain whenever the path itself changes.
  useEffect(() => setStage('webp'), [path])

  if (stage === 'hidden') return null

  return (
    <img
      className={className}
      src={artImageUrl(path, stage)}
      alt={alt}
      loading="lazy"
      onError={() => setStage(s => (s === 'webp' ? 'png' : 'hidden'))}
    />
  )
}

/** How many equal-width frames to split a filmstrip into. Gems always use
 * 3 (confirmed correct for every gem icon). Flasks are also expected to
 * be 3-frame filmstrips, but a few paths that look like flasks turn out
 * to already be a single ready icon (portrait-shaped, taller than wide)
 * — rather than trust the path alone, fall back to 1 frame (no split)
 * whenever the source image itself isn't actually landscape-shaped, since
 * a real 3-frame filmstrip is always noticeably wider than tall. */
function frameCount(category: 'gem' | 'flask', width: number, height: number): number {
  if (category === 'gem') return 3
  return width > height * 1.15 ? 3 : 1
}

/** Composites a filmstrip icon onto a single canvas. Each frame is exactly
 * 1/N of the source image's width and the *full* source height — this
 * art isn't square, so frames are cropped by width only, never assumed to
 * be square crops. Frames are drawn right to left: the rightmost frame
 * first (as the base), then each frame further left on top of it, ending
 * with the leftmost frame on top. */
function CompositeIcon({ path, alt, className, category }: Props & { category: 'gem' | 'flask' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<'webp' | 'png' | 'hidden'>('webp')

  useEffect(() => setStage('webp'), [path])

  useEffect(() => {
    if (stage === 'hidden') return
    let cancelled = false
    const img = new Image()
    // No crossOrigin here on purpose: we only ever drawImage() for display,
    // never read pixels back out (toDataURL/getImageData), so a "tainted"
    // canvas is harmless. Requesting CORS mode when we don't need it just
    // gives the browser one more reason to fail the load outright.
    img.onload = () => {
      if (cancelled) return
      const frames = frameCount(category, img.naturalWidth, img.naturalHeight)
      const frameWidth = img.naturalWidth / frames
      const frameHeight = img.naturalHeight
      if (!frameWidth || !frameHeight) return
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      canvas.width = frameWidth
      canvas.height = frameHeight
      ctx.clearRect(0, 0, frameWidth, frameHeight)
      for (let i = frames - 1; i >= 0; i--) {
        ctx.drawImage(img, i * frameWidth, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight)
      }
    }
    img.onerror = () => {
      if (cancelled) return
      setStage(s => (s === 'webp' ? 'png' : 'hidden'))
    }
    img.src = artImageUrl(path, stage)
    return () => {
      cancelled = true
    }
  }, [path, stage, category])

  if (stage === 'hidden') return null

  return <canvas ref={canvasRef} className={className} role="img" aria-label={alt} />
}
