import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { GraphData } from './types'

export type SharePayload = {
  name: string
  data: GraphData
}

/** Builds a full, shareable URL that encodes the graph in the hash. */
export function buildShareUrl(payload: SharePayload): string {
  const encoded = compressToEncodedURIComponent(JSON.stringify(payload))
  const url = new URL(window.location.href)
  url.hash = `g=${encoded}`
  return url.toString()
}

/** Reads a shared graph from the current URL hash, if present. */
export function readSharedFromUrl(): SharePayload | null {
  const hash = window.location.hash
  if (!hash.startsWith('#g=')) return null

  const encoded = hash.slice(3)
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json)
    if (!parsed || !Array.isArray(parsed.data?.nodes) || !Array.isArray(parsed.data?.edges)) {
      return null
    }
    return parsed as SharePayload
  } catch {
    return null
  }
}

/** Removes the shared-graph hash from the URL without reloading the page. */
export function clearShareHash() {
  history.replaceState(null, '', window.location.pathname + window.location.search)
}
