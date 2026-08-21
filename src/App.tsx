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
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeTypes,
  type FinalConnectionState,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { decodeGraphText, type ExportPayload } from './exportText'
import { LEFT_TARGET_ID, migrateHandleId, oppositeTypeHandleId, RIGHT_SOURCE_ID } from './handleIds'
import { currencyShortcode, itemArtShortcode } from './notesMarkdown'
import { DEFAULT_TAG_PRESETS, hexToRgbTriple } from './poeColors'
import { clearSlugFromUrl, fetchPasteText, normalizeUrlToSlug, pasteUrlFromSlug, slugFromCurrentLocation } from './pasteService'
import { saveGraph } from './storage'
import type { AffixTag, CraftNodeData, Modifier } from './types'
import CraftNode from './components/CraftNode'
import RemovableEdge from './components/RemovableEdge'
import AffixEditor from './components/AffixEditor'
import CurrencyPicker, { type PickResult } from './components/CurrencyPicker'
import ExportImportModal from './components/ExportImportModal'
import LocalSavesModal from './components/LocalSavesModal'
import ItemPasteModal from './components/ItemPasteModal'
import IconImage from './components/IconImage'
import { computeTotalCost } from './costCalculator'
import { useItemNamesLoaded } from './data/itemNames'
import { resolveIconPath } from './iconResolve'

const nodeTypes: NodeTypes = { craftNode: CraftNode }
const edgeTypes: EdgeTypes = { removable: RemovableEdge }

const DEFAULT_ITEM_ICON_SIZE = 96
const ICON_SIZE_KEY = 'poe-crafting-graph:item-icon-size'

/** Bigger than xyflow's small default arrowhead, to match the enlarged
 * handle dots — both were reported as too small to comfortably grab/see. */
const EDGE_MARKER = { type: MarkerType.ArrowClosed, width: 22, height: 22 }

function withNodeType(n: Node<CraftNodeData>): Node<CraftNodeData> {
  return { ...n, type: 'craftNode' }
}

function withEdgeType(e: Edge): Edge {
  // Every handle now has an explicit id (see handleIds.ts) — edges saved
  // before that existed have no sourceHandle/targetHandle at all, which
  // would leave them attached ambiguously (or to the wrong side) rather
  // than falling back to "the" handle the way a single-handle-per-side
  // setup used to allow.
  return {
    ...e,
    type: 'removable',
    sourceHandle: migrateHandleId(e.sourceHandle, 'source'),
    targetHandle: migrateHandleId(e.targetHandle, 'target'),
  }
}

/** A fresh, empty graph to start from when the user clicks "New". */
function blankGraph(): { nodes: Node<CraftNodeData>[]; edges: Edge[] } {
  return {
    nodes: [
      {
        id: `node-${Date.now()}`,
        type: 'craftNode',
        position: { x: 150, y: 150 },
        data: { label: 'Start', action: 'Base item', modifiers: [], notes: '' },
      },
    ],
    edges: [],
  }
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
          textColor: '#aa9e82',
          tags: [DEFAULT_TAG_PRESETS[4], DEFAULT_TAG_PRESETS[0]],
        },
        {
          id: 'm2',
          text: '+120 to maximum Life',
          textColor: '#8888ff',
          tags: [DEFAULT_TAG_PRESETS[0]],
        },
      ],
      notes: 'Use {{currency:Orb of Annulment}} first if too many junk mods show up.',
      cost: { currency: 'Essence of Horror', amount: 1, chance: 100 },
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: 'e1',
    source: 'node-1',
    target: 'node-2',
    sourceHandle: RIGHT_SOURCE_ID,
    targetHandle: LEFT_TARGET_ID,
    type: 'removable',
    markerEnd: EDGE_MARKER,
  },
]

function App() {
  // Triggers (once) the background load of the real-name catalog used to
  // resolve currency/item icons, and re-renders once it's ready so the
  // sidebar's icons upgrade from "not found yet" without needing anything
  // else to change.
  useItemNamesLoaded()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CraftNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>('node-2')
  const [graphName, setGraphName] = useState('My Crafting Plan')
  const [status, setStatus] = useState('')
  const [affixEditorFor, setAffixEditorFor] = useState<'new' | string | null>(null)
  const [itemPasteOpen, setItemPasteOpen] = useState(false)
  const [tagPresets, setTagPresets] = useState<AffixTag[]>(DEFAULT_TAG_PRESETS)
  const [currencyPickerFor, setCurrencyPickerFor] = useState<
    'action' | 'notes' | 'cost' | { edgeId: string } | null
  >(null)
  const [exportImportMode, setExportImportMode] = useState<'export' | 'import' | null>(null)
  const [localSavesOpen, setLocalSavesOpen] = useState(false)
  const [currentGraphId, setCurrentGraphId] = useState<string | null>(null)
  const [itemIconSize, setItemIconSize] = useState<number>(() => {
    const stored = Number(localStorage.getItem(ICON_SIZE_KEY))
    return stored >= 32 && stored <= 200 ? stored : DEFAULT_ITEM_ICON_SIZE
  })
  const [edgesAnimated, setEdgesAnimated] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const selectedNode = nodes.find(n => n.id === selectedId)
  const totalCost = computeTotalCost(nodes)
  // The animated dash is a graph-wide display toggle, not stored per edge
  // — applied here at render time rather than baked into each edge object.
  // Every edge also gets an onPickIcon callback threaded through its data,
  // so RemovableEdge can open the shared currency/item picker for its own
  // label without needing its own copy of that modal's state.
  const renderEdges = edges.map(e => ({
    ...e,
    ...(edgesAnimated ? { animated: true } : {}),
    data: { ...(e.data ?? {}), onPickIcon: () => setCurrencyPickerFor({ edgeId: e.id }) },
  }))

  useEffect(() => {
    if (selectedId && !nodes.some(n => n.id === selectedId)) {
      setSelectedId(nodes[0]?.id ?? null)
    }
  }, [nodes, selectedId])

  const dragStartNodeId = useRef<string | null>(null)

  const onConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: { nodeId: string | null }) => {
    dragStartNodeId.current = params.nodeId
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source === connection.target) return
    // React Flow assigns source/target purely by handle type (the
    // source-typed handle always becomes the edge's source), which can
    // end up backward from the direction actually dragged in — e.g.
    // starting the drag at a target handle and dropping on a source
    // handle flips them. Normalize so the arrow always follows the drag:
    // from the node the connection started at, to the node dropped on.
    // Each node's visible connector is really two stacked handles (a
    // source and a target — see CraftNode), so when flipping which node
    // is source vs. target, the handle id has to be remapped to the
    // *other* type at that same side too, or the edge would visually
    // jump to the node's other connector instead of staying where the
    // user actually dragged from/to.
    const startedFromTarget = dragStartNodeId.current !== null && dragStartNodeId.current !== connection.source
    const oriented: Connection = startedFromTarget
      ? {
        source: connection.target,
        target: connection.source,
        sourceHandle: oppositeTypeHandleId(connection.targetHandle, 'target') ?? null,
        targetHandle: oppositeTypeHandleId(connection.sourceHandle, 'source') ?? null,
      }
      : connection
    setEdges(eds =>
      addEdge(
        {
          ...oriented,
          id: `e-${Date.now()}`,
          type: 'removable',
          markerEnd: EDGE_MARKER,
        },
        eds,
      ),
    )
  }, [setEdges])

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => conn.source !== conn.target,
    [],
  )

  // If a connection is dragged out and dropped on empty canvas (not onto
  // another node's handle), spin up a brand new node there and wire it in,
  // instead of just discarding the half-made connection. The arrow always
  // runs from the node the drag started at to the new node, matching
  // onConnect's normalization above — regardless of which handle (source
  // or target) the drag happened to start from. If it started from a
  // target-typed handle, the id has to be remapped to that side's source
  // counterpart (see handleIds.ts) so the edge attaches to the connector
  // actually dragged from, not fromNode's other side.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid || connectionState.toNode || !connectionState.fromNode) return

      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      const position = screenToFlowPosition({ x: point.clientX, y: point.clientY })
      const id = `node-${Date.now()}`
      const newNode: Node<CraftNodeData> = {
        id,
        type: 'craftNode',
        position: { x: position.x - 90, y: position.y - 30 },
        data: { label: 'New crafting step', action: '', modifiers: [], notes: '' },
      }

      const fromHandle = connectionState.fromHandle
      const sourceHandle =
        fromHandle?.type === 'target'
          ? oppositeTypeHandleId(fromHandle.id, 'target')
          : migrateHandleId(fromHandle?.id, 'source')
      const newEdge: Edge = {
        id: `e-${Date.now()}`,
        source: connectionState.fromNode.id,
        target: id,
        sourceHandle,
        // The new node is fresh — always use its primary (left) target
        // handle rather than leaving this unset, which would otherwise
        // be ambiguous now that every handle has an explicit id (see
        // handleIds.ts).
        targetHandle: LEFT_TARGET_ID,
        type: 'removable',
        markerEnd: EDGE_MARKER,
      }

      setNodes(ns => ns.concat(newNode))
      setEdges(eds => eds.concat(newEdge))
      setSelectedId(id)
    },
    [screenToFlowPosition, setNodes, setEdges],
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

  function handleAddFromItemPaste(modifiers: Modifier[], updatedPresets: AffixTag[], nameFromItem: string | null) {
    if (!selectedNode) return
    updateSelected({
      modifiers: [...selectedNode.data.modifiers, ...modifiers],
      ...(nameFromItem ? { label: nameFromItem } : {}),
    })
    setTagPresets(updatedPresets)
    setItemPasteOpen(false)
  }

  function handlePickCurrency(result: PickResult) {
    const shortcode = result.path ? itemArtShortcode(result.path, result.name) : currencyShortcode(result.name)
    if (currencyPickerFor === 'notes') {
      insertIntoNotes(shortcode)
    } else if (currencyPickerFor === 'cost') {
      updateSelected({
        cost: { currency: result.name, amount: selectedNode?.data.cost?.amount ?? 1, chance: selectedNode?.data.cost?.chance ?? 100 },
      })
    } else if (currencyPickerFor && typeof currencyPickerFor === 'object') {
      const { edgeId } = currencyPickerFor
      setEdges(eds =>
        eds.map(e =>
          e.id === edgeId ? { ...e, label: `${typeof e.label === 'string' ? e.label : ''}${shortcode}` } : e,
        ),
      )
    } else {
      updateSelected({ action: result.name })
    }
    setCurrencyPickerFor(null)
  }

  function updateCost(patch: Partial<{ currency: string; amount: number; chance: number }>) {
    if (!selectedNode) return
    const current = selectedNode.data.cost ?? { currency: '', amount: 1, chance: 100 }
    updateSelected({ cost: { ...current, ...patch } })
  }

  function clearCost() {
    if (!selectedNode) return
    updateSelected({ cost: undefined })
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
    return { name: graphName, data: { nodes, edges, tagPresets, edgesAnimated } }
  }

  function handleImport(payload: ExportPayload) {
    setGraphName(payload.name)
    setNodes(payload.data.nodes.map(withNodeType))
    setEdges(payload.data.edges.map(withEdgeType))
    setTagPresets(payload.data.tagPresets?.length ? payload.data.tagPresets : DEFAULT_TAG_PRESETS)
    setEdgesAnimated(payload.data.edgesAnimated ?? false)
    setSelectedId(payload.data.nodes[0]?.id ?? null)
    setCurrentGraphId(null)
    setStatus('Imported')
    setExportImportMode(null)
  }

  // On first load, check whether the URL is pointing at a shared graph
  // (either a real deep link like /crafting-graph/hello, or a
  // ?slug=hello left behind by the GitHub Pages 404 redirect for one —
  // see public/404.html) and load it automatically if so. "new" is a
  // reserved slug (not a real rentry paste) meaning "no shared graph" —
  // it's the default URL, and where "New"/"Clear all" send you too.
  useEffect(() => {
    const slug = slugFromCurrentLocation()
    if (!slug || slug === 'new') {
      normalizeUrlToSlug('new')
      return
    }
    normalizeUrlToSlug(slug)
    setStatus('Loading shared graph\u2026')
    fetchPasteText(pasteUrlFromSlug(slug))
      .then(text => {
        const payload = decodeGraphText(text)
        if (!payload) throw new Error('That link doesn\u2019t contain a valid crafting-graph export.')
        handleImport(payload)
        setStatus('Loaded shared graph')
      })
      .catch(e => {
        setStatus(e instanceof Error ? e.message : 'Could not load that shared graph.')
        clearSlugFromUrl()
      })
    // Intentionally runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveLocal() {
    const payload = currentExportPayload()
    const saved = await saveGraph(payload.name, payload.data, currentGraphId ?? undefined)
    setCurrentGraphId(saved.id)
    setStatus('Saved locally')
  }

  async function handleSaveAsNewLocal() {
    const payload = currentExportPayload()
    const saved = await saveGraph(payload.name, payload.data)
    setCurrentGraphId(saved.id)
    setStatus('Saved as a new local save')
  }

  function handleNewGraph() {
    if (!window.confirm('Start a new graph? Any unsaved changes to the current one will be lost.')) return
    const { nodes: freshNodes, edges: freshEdges } = blankGraph()
    setGraphName('New crafting plan')
    setNodes(freshNodes)
    setEdges(freshEdges)
    setTagPresets(DEFAULT_TAG_PRESETS)
    setEdgesAnimated(false)
    setSelectedId(freshNodes[0]?.id ?? null)
    setCurrentGraphId(null)
    setStatus('')
    normalizeUrlToSlug('new')
  }

  function handleClearAll() {
    if (!window.confirm('Clear the whole canvas? This removes every node and connection.')) return
    setNodes([])
    setEdges([])
    setSelectedId(null)
    setCurrentGraphId(null)
    setStatus('Cleared')
    normalizeUrlToSlug('new')
  }

  function handleLoadLocal(payload: ExportPayload, id: string) {
    setGraphName(payload.name)
    setNodes(payload.data.nodes.map(withNodeType))
    setEdges(payload.data.edges.map(withEdgeType))
    setTagPresets(payload.data.tagPresets?.length ? payload.data.tagPresets : DEFAULT_TAG_PRESETS)
    setEdgesAnimated(payload.data.edgesAnimated ?? false)
    setSelectedId(payload.data.nodes[0]?.id ?? null)
    setCurrentGraphId(id)
    setStatus('Loaded')
    setLocalSavesOpen(false)
  }

  return (
    <div className="app" style={{ ['--item-icon-size' as any]: `${itemIconSize}px` }}>
      <header>
        <div>
          <h1>
            <img src="favicon.png" alt="" className="app-favicon" />
            Crafting Graph
          </h1>
          <input
            value={graphName}
            onChange={e => setGraphName(e.target.value)}
            className="graph-name"
          />
        </div>
        <div className="toolbar">
          <button onClick={addNode}>+ Add node</button>
          <button onClick={handleNewGraph}>New</button>
          <button onClick={handleClearAll}>Clear all</button>
          <button onClick={handleSaveLocal}>Save</button>
          {currentGraphId && <button onClick={handleSaveAsNewLocal}>Save as new</button>}
          <button onClick={() => setLocalSavesOpen(true)}>Load</button>
          <button onClick={() => setExportImportMode('export')}>Export text</button>
          <button onClick={() => setExportImportMode('import')}>Import text</button>
          <label className="animate-edges-control" title="Animate edges with a marching-dash line">
            <input
              type="checkbox"
              checked={edgesAnimated}
              onChange={e => setEdgesAnimated(e.target.checked)}
            />
            Animate edges
          </label>
          <label className="icon-size-control" title="Size of item icons shown on nodes">
            Icon size
            <input
              type="range"
              min={32}
              max={160}
              step={4}
              value={itemIconSize}
              onChange={e => {
                const size = Number(e.target.value)
                setItemIconSize(size)
                localStorage.setItem(ICON_SIZE_KEY, String(size))
              }}
            />
          </label>
          <span className="status">{status}</span>
        </div>
      </header>

      {totalCost.length > 0 && (
        <div className="total-cost-bar">
          <span className="total-cost-label">Total estimated cost</span>
          {totalCost.map(t => (
            <span className="total-cost-chip" key={t.currency} title={t.currency}>
              {t.iconPath && <IconImage className="total-cost-icon" path={t.iconPath} alt="" />}
              <span>
                {t.amount} {t.currency}
              </span>
            </span>
          ))}
        </div>
      )}

      <main>
        <section className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={renderEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
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
              </div>

              <label>Name</label>
              <input
                value={selectedNode.data.label}
                onChange={e => updateSelected({ label: e.target.value })}
              />

              <label>Action / currency</label>
              <div className="action-row">
                {(() => {
                  const iconPath = resolveIconPath(selectedNode.data.action)
                  return iconPath && <IconImage className="action-icon" path={iconPath} alt="" />
                })()}
                <input
                  value={selectedNode.data.action}
                  onChange={e => updateSelected({ action: e.target.value })}
                  placeholder="e.g. Essence of Horror"
                />
                <button onClick={() => setCurrencyPickerFor('action')}>Pick</button>
              </div>

              <div className="row-between">
                <label style={{ margin: 0 }}>Cost</label>
                {selectedNode.data.cost && <button onClick={clearCost}>Remove cost</button>}
              </div>
              {selectedNode.data.cost ? (
                <div className="cost-row">
                  {(() => {
                    const iconPath = resolveIconPath(selectedNode.data.cost!.currency)
                    return iconPath && <IconImage className="action-icon" path={iconPath} alt="" />
                  })()}
                  <input
                    value={selectedNode.data.cost.currency}
                    onChange={e => updateCost({ currency: e.target.value })}
                    placeholder="e.g. Chaos Orb"
                  />
                  <button onClick={() => setCurrencyPickerFor('cost')}>Pick</button>
                  <input
                    className="cost-amount"
                    type="number"
                    min={0}
                    step="any"
                    value={selectedNode.data.cost.amount}
                    onChange={e => updateCost({ amount: Number(e.target.value) })}
                    title="Amount per attempt"
                  />
                  <input
                    className="cost-chance"
                    type="number"
                    min={1}
                    max={100}
                    value={selectedNode.data.cost.chance}
                    onChange={e => updateCost({ chance: Number(e.target.value) })}
                    title="Chance of success (%)"
                  />
                  <span className="cost-chance-suffix">%</span>
                </div>
              ) : (
                <button onClick={() => updateCost({ currency: '', amount: 1, chance: 100 })}>+ Add cost</button>
              )}

              <div className="row-between">
                <h3>Modifiers</h3>
                <div className="modifier-header-actions">
                  <button onClick={() => setItemPasteOpen(true)}>Paste item</button>
                  <button onClick={addModifier}>+ Add</button>
                </div>
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
                </div>
              ))}

              <div className="row-between">
                <label style={{ margin: 0 }}>Notes</label>
                <div className="notes-toolbar">
                  <button onClick={() => setCurrencyPickerFor('notes')}>+ Currency icon</button>
                </div>
              </div>
              <textarea
                ref={notesRef}
                className="notes-textarea"
                rows={6}
                value={selectedNode.data.notes}
                onChange={e => updateSelected({ notes: e.target.value })}
                placeholder="Describe what this step is trying to achieve... Markdown supported."
              />
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
          title={
            currencyPickerFor === 'cost'
              ? 'Choose a cost currency'
              : currencyPickerFor === 'notes'
                ? 'Insert a currency icon'
                : currencyPickerFor && typeof currencyPickerFor === 'object'
                  ? 'Insert an icon into this label'
                  : 'Choose an action / currency icon'
          }
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

      {localSavesOpen && (
        <LocalSavesModal
          currentGraphId={currentGraphId}
          onLoad={handleLoadLocal}
          onClose={() => setLocalSavesOpen(false)}
        />
      )}

      {itemPasteOpen && (
        <ItemPasteModal
          tagPresets={tagPresets}
          onAdd={handleAddFromItemPaste}
          onClose={() => setItemPasteOpen(false)}
        />
      )}
    </div>
  )
}

export default App
