import { compressToBase64, decompressFromBase64 } from 'lz-string'
import type { GraphData } from './types'

export type ExportPayload = {
  name: string
  data: GraphData
}

const PREFIX = 'POECRAFT1:'
export const EXPORT_PREFIX = PREFIX

/** Encodes a graph as a compact, copy-pasteable text blob (not a URL, so
 * there's no practical size ceiling like there is with URLs/query strings). */
export function encodeGraphText(payload: ExportPayload): string {
  return PREFIX + compressToBase64(JSON.stringify(payload))
}

/** Decodes a text blob produced by encodeGraphText. Returns null if the
 * text isn't recognized or fails to parse. */
export function decodeGraphText(text: string): ExportPayload | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PREFIX)) return null

  try {
    const json = decompressFromBase64(trimmed.slice(PREFIX.length))
    if (!json) return null
    const parsed = JSON.parse(json)
    if (!parsed || !Array.isArray(parsed.data?.nodes) || !Array.isArray(parsed.data?.edges)) {
      return null
    }
    return parsed as ExportPayload
  } catch {
    return null
  }
}
