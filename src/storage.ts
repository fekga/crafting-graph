import type { GraphData } from './types'

const STORAGE_KEY = 'poe-crafting-graphs'

export type SavedGraph = {
  id: string
  name: string
  data: GraphData
  updatedAt: number
}

function readAll(): SavedGraph[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(graphs: SavedGraph[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs))
}

export async function listGraphs(): Promise<SavedGraph[]> {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveGraph(
  name: string,
  data: GraphData,
  id?: string,
): Promise<SavedGraph> {
  const graphs = readAll()
  const now = Date.now()

  if (id) {
    const idx = graphs.findIndex(g => g.id === id)
    if (idx !== -1) {
      const updated: SavedGraph = { id, name, data, updatedAt: now }
      graphs[idx] = updated
      writeAll(graphs)
      return updated
    }
  }

  const created: SavedGraph = {
    id: crypto.randomUUID(),
    name,
    data,
    updatedAt: now,
  }
  graphs.push(created)
  writeAll(graphs)
  return created
}

export async function deleteGraph(id: string): Promise<void> {
  writeAll(readAll().filter(g => g.id !== id))
}
