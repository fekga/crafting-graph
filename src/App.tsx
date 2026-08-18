import { useCallback, useEffect, useRef, useState } from 'react'
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
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { type ExportPayload } from './exportText'
import { currencyShortcode, renderNotesHtml } from './notesMarkdown'
import { DEFAULT_TAG_PRESETS, hexToRgbTriple } from './poeColors'
import type { AffixTag, CraftNodeData, Modifier } from './types'
import CraftNode from './components/CraftNode'
import RemovableEdge from './components/RemovableEdge'
import AffixEditor from './components/AffixEditor'
import CurrencyPicker from './components/CurrencyPicker'
import ExportImportModal from './components/ExportImportModal'
import { findCurrencyByName, type Currency } from './data/currencies'

const nodeTypes: NodeTypes = { craftNode: CraftNode }
const edgeTypes: EdgeTypes = { removable: RemovableEdge }

function withNodeType(n: Node<CraftNodeData>): Node<CraftNodeData> {
  return { ...n, type: 'craftNode' }
}

function withEdgeType(e: Edge): Edge {
  return { ...e, type: 'removable' }
}

const initialNodes: Node<CraftNodeData>[] = [
  {
    id: 'node-1',
    type: 'craftNode',
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
    type: 'craftNode',
    position: { x: 420, y: 150 },
    data: {
      label: 'Essence craft',
      action: 'Essence of Horror',
      modifiers: [
        {
          id: 'm1',
          text: '+2 to Level of all Spell Skill Gems',
          textColor: '#8888ff',
          tags: [DEFAULT_TAG_PRESETS[0]],
        },
        {
          id: 'm2',
          text: '+120 to maximum Life',
          textColor: '#8888ff',
          tags: [DEFAULT_TAG_PRESETS[1]],
        },
      ],
      notes: 'Use {{currency:Orb of Annulment}} first if too many junk mods show up.',
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: 'e1',
    source: 'node-1',
    target: 'node-2',
    type: 'removable',
    markerEnd: { type: MarkerType.ArrowClosed },
  },
]

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CraftNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>('node-2')
  const [graphName, setGraphName] = useState('My Crafting Plan')
  const [status, setStatus] = useState('')
  const [affixEditorFor, setAffixEditorFor] = useState<'new' | string | null>(null)
  const [tagPresets, setTagPresets] = useState<AffixTag[]>(DEFAULT_TAG_PRESETS)
  const [currencyPickerFor, setCurrencyPickerFor] = useState<'action' | 'notes' | null>(null)
  const [exportImportMode, setExportImportMode] = useState<'export' | 'import' | null>(null)
  const [editMode, setEditMode] = useState(true)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const selectedNode = nodes.find(n => n.id === selectedId)

  useEffect(() => {
    if (selectedId && !nodes.some(n => n.id === selectedId)) {
      setSelectedId(nodes[0]?.id ?? null)
    }
  }, [nodes, selectedId])

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source === connection.target) return
    setEdges(eds =>
      addEdge(
        {
          ...connection,
          id: `e-${Date.now()}`,
          type: 'removable',
          markerEnd: { type: MarkerType.ArrowClosed },
        },
        eds,
      ),
    )
  }, [setEdges])

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => conn.source !== conn.target,
    [],
  )

  function addNode() {
    const id = `node-${Date.now()}`
    const node: Node<CraftNodeData> = {
      id,
      type: 'craftNode',
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
    setAffixEditorFor('new')
  }

  function handleSaveAffix(modifier: Modifier, updatedPresets: AffixTag[]) {
    if (!selectedNode || !affixEditorFor) return
    if (affixEditorFor === 'new') {
      updateSelected({ modifiers: [...selectedNode.data.modifiers, modifier] })
    } else {
      updateSelected({
        modifiers: selectedNode.data.modifiers.map(m => (m.id === modifier.id ? modifier : m)),
      })
    }
    setTagPresets(updatedPresets)
    setAffixEditorFor(null)
  }

  function handlePickCurrency(currency: Currency) {
    if (currencyPickerFor === 'notes') {
      insertIntoNotes(currencyShortcode(currency.name))
    } else {
      updateSelected({ action: currency.name })
    }
    setCurrencyPickerFor(null)
  }

  function insertIntoNotes(snippet: string) {
    if (!selectedNode) return
    const textarea = notesRef.current
    const current = selectedNode.data.notes
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    const next = current.slice(0, start) + snippet + current.slice(end)
    updateSelected({ notes: next })
    requestAnimationFrame(() => {
      textarea?.focus()
      const cursor = start + snippet.length
      textarea?.setSelectionRange(cursor, cursor)
    })
  }

  function removeModifier(id: string) {
    if (!selectedNode) return
    updateSelected({
      modifiers: selectedNode.data.modifiers.filter(m => m.id !== id),
    })
  }

  function moveModifier(id: string, direction: -1 | 1) {
    if (!selectedNode) return
    const mods = [...selectedNode.data.modifiers]
    const from = mods.findIndex(m => m.id === id)
    const to = from + direction
    if (from === -1 || to < 0 || to >= mods.length) return
      ;[mods[from], mods[to]] = [mods[to], mods[from]]
    updateSelected({ modifiers: mods })
  }

  function currentExportPayload(): ExportPayload {
    return { name: graphName, data: { nodes, edges, tagPresets } }
  }

  function handleImport(payload: ExportPayload) {
    setGraphName(payload.name)
    setNodes(payload.data.nodes.map(withNodeType))
    setEdges(payload.data.edges.map(withEdgeType))
    setTagPresets(payload.data.tagPresets?.length ? payload.data.tagPresets : DEFAULT_TAG_PRESETS)
    setSelectedId(payload.data.nodes[0]?.id ?? null)
    setStatus('Imported')
    setExportImportMode(null)
  }

  return (
    <div className="app">
      <header>
        <div>
          <h1>Crafting Graph</h1>
          <input
            value={graphName}
            onChange={e => setGraphName(e.target.value)}
            className="graph-name"
          />
        </div>
        <div className="toolbar">
          <button onClick={addNode}>+ Add node</button>
          <button onClick={() => setExportImportMode('export')}>Export text</button>
          <button onClick={() => setExportImportMode('import')}>Import text</button>
          <span className="status">{status}</span>
        </div>
      </header>

      <main>
        <section className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </section>

        <aside>
          {selectedNode ? (
            <>
              <div className="row-between" style={{ marginTop: 0 }}>
                <h2 style={{ border: 'none', padding: 0, margin: 0 }}>Crafting step</h2>
                <button onClick={() => setEditMode(m => !m)}>
                  {editMode ? 'Preview' : 'Edit'}
                </button>
              </div>

              <label>Name</label>
              {editMode ? (
                <input
                  value={selectedNode.data.label}
                  onChange={e => updateSelected({ label: e.target.value })}
                />
              ) : (
                <p className="preview-text preview-name">{selectedNode.data.label || '\u2014'}</p>
              )}

              <label>Action / currency</label>
              {editMode ? (
                <div className="action-row">
                  {(() => {
                    const currency = findCurrencyByName(selectedNode.data.action)
                    return currency && <img className="action-icon" src={currency.icon} alt="" />
                  })()}
                  <input
                    value={selectedNode.data.action}
                    onChange={e => updateSelected({ action: e.target.value })}
                    placeholder="e.g. Essence of Horror"
                  />
                  <button onClick={() => setCurrencyPickerFor('action')}>Pick</button>
                </div>
              ) : (
                <div className="action-row">
                  {(() => {
                    const currency = findCurrencyByName(selectedNode.data.action)
                    return currency && <img className="action-icon" src={currency.icon} alt="" />
                  })()}
                  <p className="preview-text">{selectedNode.data.action || '\u2014'}</p>
                </div>
              )}

              <div className="row-between">
                <h3>Modifiers</h3>
                {editMode && <button onClick={addModifier}>+ Add</button>}
              </div>

              {selectedNode.data.modifiers.length === 0 && (
                <p className="muted">No modifiers yet.</p>
              )}

              {selectedNode.data.modifiers.map((mod, i) => (
                <div className="modifier" key={mod.id}>
                  <div className="modifier-text-row">
                    {mod.tags.map(tag => (
                      <span
                        key={tag.id}
                        className="tag-badge"
                        style={{
                          ['--chip-color' as any]: tag.color,
                          ['--chip-rgb' as any]: hexToRgbTriple(tag.color),
                        }}
                      >
                        {tag.label}
                      </span>
                    ))}
                    <span className="modifier-text" style={{ color: mod.textColor }}>
                      {mod.text}
                    </span>
                  </div>
                  {editMode && (
                    <div className="modifier-actions">
                      <button
                        className="reorder-btn"
                        title="Move up"
                        disabled={i === 0}
                        onClick={() => moveModifier(mod.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="reorder-btn"
                        title="Move down"
                        disabled={i === selectedNode.data.modifiers.length - 1}
                        onClick={() => moveModifier(mod.id, 1)}
                      >
                        ↓
                      </button>
                      <button onClick={() => setAffixEditorFor(mod.id)}>Edit</button>
                      <button onClick={() => removeModifier(mod.id)}>Remove</button>
                    </div>
                  )}
                </div>
              ))}

              <div className="row-between">
                <label style={{ margin: 0 }}>Notes</label>
                {editMode && (
                  <div className="notes-toolbar">
                    <button onClick={() => setCurrencyPickerFor('notes')}>+ Currency icon</button>
                  </div>
                )}
              </div>
              {editMode ? (
                <textarea
                  ref={notesRef}
                  className="notes-textarea"
                  rows={6}
                  value={selectedNode.data.notes}
                  onChange={e => updateSelected({ notes: e.target.value })}
                  placeholder="Describe what this step is trying to achieve... Markdown supported."
                />
              ) : (
                <div
                  className="notes-preview"
                  dangerouslySetInnerHTML={{ __html: renderNotesHtml(selectedNode.data.notes) || '<p class="muted">No notes.</p>' }}
                />
              )}
            </>
          ) : (
            <p className="muted">Select a node to edit it.</p>
          )}
        </aside>
      </main>

      {affixEditorFor && (
        <AffixEditor
          modifier={
            affixEditorFor === 'new'
              ? null
              : selectedNode?.data.modifiers.find(m => m.id === affixEditorFor) ?? null
          }
          tagPresets={tagPresets}
          onSave={handleSaveAffix}
          onClose={() => setAffixEditorFor(null)}
        />
      )}

      {currencyPickerFor && (
        <CurrencyPicker
          onPick={handlePickCurrency}
          onClose={() => setCurrencyPickerFor(null)}
        />
      )}

      {exportImportMode && (
        <ExportImportModal
          mode={exportImportMode}
          exportPayload={exportImportMode === 'export' ? currentExportPayload() : undefined}
          onImport={handleImport}
          onClose={() => setExportImportMode(null)}
        />
      )}
    </div>
  )
}

export default App
