import type { Edge, Node } from '@xyflow/react'

const STORAGE_KEY = 'poe-crafting-snippets'

export type Snippet = {
  id: string
  name: string
  nodes: Node<any>[]
  edges: Edge<any>[]
  updatedAt: number
}

function readAll(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(snippets: Snippet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets))
}

export async function listSnippets(): Promise<Snippet[]> {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveSnippet(name: string, nodes: Node<any>[], edges: Edge<any>[]): Promise<Snippet> {
  const snippets = readAll()
  const created: Snippet = {
    id: crypto.randomUUID(),
    name,
    nodes,
    edges,
    updatedAt: Date.now(),
  }
  snippets.push(created)
  writeAll(snippets)
  return created
}

export async function deleteSnippet(id: string): Promise<void> {
  writeAll(readAll().filter(s => s.id !== id))
}
