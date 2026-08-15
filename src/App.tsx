import { useCallback, useEffect, useState } from 'react'
import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { deleteGraph, listGraphs, saveGraph, type SavedGraph } from './storage'
import { buildShareUrl, clearShareHash, readSharedFromUrl } from './share'
import type { CraftNodeData, Modifier } from './types'

const initialNodes: Node<CraftNodeData>[] = [
  {
    id: 'node-1',
    position: { x: 100, y: 150 },
    data: {
      label: 'Start',
      action: 'Base item',
      modifiers: [],
      notes: 'Start with the item you want to craft.',
    },
  },
  {
    id: 'node-2',
    position: { x: 420, y: 150 },
    data: {
      label: 'Essence craft',
      action: 'Essence of Horror',
      modifiers: [
        { id: 'm1', text: '+2 to Level of all Spell Skill Gems', mustRemain: true },
        { id: 'm2', text: '100+ maximum Life', mustRemain: true },
      ],
      notes: '',
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: 'e1',
    source: 'node-1',
    target: 'node-2',
    label: 'Next',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
]

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CraftNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>('node-2')
  const [graphName, setGraphName] = useState('My Crafting Plan')
  const [savedId, setSavedId] = useState<string | undefined>()
  const [graphs, setGraphs] = useState<SavedGraph[]>([])
  const [status, setStatus] = useState('')

  const selectedNode = nodes.find(n => n.id === selectedId)

  useEffect(() => {
    // If this page was opened via a shared link, load that graph first.
    const shared = readSharedFromUrl()
    if (shared) {
      setGraphName(shared.name)
      setNodes(shared.data.nodes)
      setEdges(shared.data.edges)
      setSelectedId(shared.data.nodes[0]?.id ?? null)
      setSavedId(undefined)
      setStatus('Loaded from shared link')
      clearShareHash()
    }

    listGraphs().then(setGraphs).catch(() => setStatus('Could not read saved graphs'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    const outcome = window.prompt('Outcome label', 'Success') || 'Next'
    setEdges(eds =>
      addEdge(
        {
          ...connection,
          id: `e-${Date.now()}`,
          label: outcome,
          markerEnd: { type: MarkerType.ArrowClosed },
        },
        eds,
      ),
    )
  }, [setEdges])

  function addNode() {
    const id = `node-${Date.now()}`
    const node: Node<CraftNodeData> = {
      id,
      position: { x: 250 + nodes.length * 30, y: 300 + nodes.length * 20 },
      data: {
        label: 'New crafting step',
        action: '',
        modifiers: [],
        notes: '',
      },
    }
    setNodes(ns => [...ns, node])
    setSelectedId(id)
  }

  function updateSelected(patch: Partial<CraftNodeData>) {
    if (!selectedId) return
    setNodes(ns =>
      ns.map(n =>
        n.id === selectedId
          ? { ...n, data: { ...n.data, ...patch } }
          : n,
      ),
    )
  }

  function addModifier() {
    if (!selectedNode) return
    const modifier: Modifier = {
      id: `mod-${Date.now()}`,
      text: 'New modifier',
      mustRemain: true,
    }
    updateSelected({ modifiers: [...selectedNode.data.modifiers, modifier] })
  }

  function updateModifier(id: string, patch: Partial<Modifier>) {
    if (!selectedNode) return
    updateSelected({
      modifiers: selectedNode.data.modifiers.map(m =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    })
  }

  function removeModifier(id: string) {
    if (!selectedNode) return
    updateSelected({
      modifiers: selectedNode.data.modifiers.filter(m => m.id !== id),
    })
  }

  async function handleSave() {
    try {
      const result = await saveGraph(graphName, { nodes, edges }, savedId)
      setSavedId(result.id)
      setGraphs(await listGraphs())
      setStatus('Saved')
    } catch {
      setStatus('Could not save')
    }
  }

  async function handleShare() {
    try {
      const url = buildShareUrl({ name: graphName, data: { nodes, edges } })
      await navigator.clipboard.writeText(url)
      setStatus('Share link copied to clipboard')
    } catch {
      setStatus('Could not copy link')
    }
  }

  function loadGraph(graph: SavedGraph) {
    setGraphName(graph.name)
    setSavedId(graph.id)
    setNodes(graph.data.nodes)
    setEdges(graph.data.edges)
    setSelectedId(graph.data.nodes[0]?.id ?? null)
    setStatus('Loaded')
  }

  async function handleDelete() {
    if (!savedId) return
    await deleteGraph(savedId)
    setSavedId(undefined)
    setGraphs(await listGraphs())
    setStatus('Deleted')
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>PoE Crafting Graph</h1>
          <input
            value={graphName}
            onChange={e => setGraphName(e.target.value)}
            className="graph-name"
          />
        </div>
        <div className="toolbar">
          <button onClick={addNode}>+ Add node</button>
          <button onClick={handleSave}>Save</button>
          <button onClick={handleShare}>Share link</button>
          {savedId && <button onClick={handleDelete}>Delete</button>}
          <span className="status">{status}</span>
        </div>
      </header>

      <main>
        <section className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </section>

        <aside>
          <h2>Saved graphs</h2>
          {graphs.length === 0 && <p className="muted">No saved graphs.</p>}
          {graphs.map(g => (
            <button className="saved" key={g.id} onClick={() => loadGraph(g)}>
              {g.name}
            </button>
          ))}

          <hr />

          {selectedNode ? (
            <>
              <h2>Crafting step</h2>

              <label>Name</label>
              <input
                value={selectedNode.data.label}
                onChange={e => updateSelected({ label: e.target.value })}
              />

              <label>Action / currency</label>
              <input
                value={selectedNode.data.action}
                onChange={e => updateSelected({ action: e.target.value })}
                placeholder="e.g. Essence of Horror"
              />

              <div className="row-between">
                <h3>Modifiers</h3>
                <button onClick={addModifier}>+ Add</button>
              </div>

              {selectedNode.data.modifiers.map(mod => (
                <div className="modifier" key={mod.id}>
                  <input
                    value={mod.text}
                    onChange={e =>
                      updateModifier(mod.id, { text: e.target.value })
                    }
                  />
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={mod.mustRemain}
                      onChange={e =>
                        updateModifier(mod.id, { mustRemain: e.target.checked })
                      }
                    />
                    Must remain
                  </label>
                  <button onClick={() => removeModifier(mod.id)}>Remove</button>
                </div>
              ))}

              <label>Notes</label>
              <textarea
                rows={5}
                value={selectedNode.data.notes}
                onChange={e => updateSelected({ notes: e.target.value })}
                placeholder="Describe what this step is trying to achieve..."
              />
            </>
          ) : (
            <p className="muted">Select a node to edit it.</p>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
