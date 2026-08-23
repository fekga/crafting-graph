import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
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
import { currencyShortcode, itemArtShortcode, renderLabelHtml, renderNotesHtml } from './notesMarkdown'
import { DEFAULT_TAG_PRESETS, hexToRgbTriple } from './poeColors'
import { clearSlugFromUrl, fetchPasteText, normalizeUrlToSlug, pasteUrlFromSlug, slugFromCurrentLocation } from './pasteService'
import { saveGraph } from './storage'
import type { AffixTag, CraftCost, CraftNodeData, Modifier } from './types'
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
import { resolveFieldIconPath } from './iconResolve'

const nodeTypes: NodeTypes = { craftNode: CraftNode }
const edgeTypes: EdgeTypes = { removable: RemovableEdge }

const DEFAULT_ITEM_ICON_SIZE = 96
const ICON_SIZE_KEY = 'poe-crafting-graph:item-icon-size'

const DEFAULT_SIDEBAR_WIDTH = 360
const MIN_SIDEBAR_WIDTH = 260
const MAX_SIDEBAR_WIDTH = 640
const SIDEBAR_WIDTH_KEY = 'poe-crafting-graph:sidebar-width'
const SIDEBAR_COLLAPSED_KEY = 'poe-crafting-graph:sidebar-collapsed'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Bigger than xyflow's small default arrowhead, to match the enlarged
 * handle dots — both were reported as too small to comfortably grab/see. */
const EDGE_MARKER = { type: MarkerType.ArrowClosed, width: 22, height: 22 }

function withNodeType(n: Node<CraftNodeData>): Node<CraftNodeData> {
  // Nodes saved before multiple-costs-per-node existed have a singular
  // `cost` field instead of `costs` — migrate it into a one-item list
  // rather than silently dropping it.
  const data = n.data as CraftNodeData & { cost?: CraftCost }
  if (data.costs === undefined && data.cost) {
    const { cost, ...rest } = data
    return { ...n, type: 'craftNode', data: { ...rest, costs: [cost] } }
  }
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
  return { nodes: [], edges: [] }
}

// A brand-new session starts with nothing on the canvas -- the sidebar's
// getting-started panel (shown whenever nothing is selected) explains
// how to add the first node, so a pre-built sample isn't needed to show
// what a graph looks like.
const initialNodes: Node<CraftNodeData>[] = []
const initialEdges: Edge[] = []

function App() {
  // Triggers (once) the background load of the real-name catalog used to
  // resolve currency/item icons, and re-renders once it's ready so the
  // sidebar's icons upgrade from "not found yet" without needing anything
  // else to change.
  useItemNamesLoaded()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CraftNodeData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [graphName, setGraphName] = useState('My Crafting Plan')
  const [status, setStatus] = useState('')
  const [affixEditorFor, setAffixEditorFor] = useState<'new' | string | null>(null)
  const [itemPasteOpen, setItemPasteOpen] = useState(false)
  const [tagPresets, setTagPresets] = useState<AffixTag[]>(DEFAULT_TAG_PRESETS)
  const [currencyPickerFor, setCurrencyPickerFor] = useState<
    'action' | 'notes' | { edgeId: string } | { costIndex: number } | null
  >(null)
  const [exportImportMode, setExportImportMode] = useState<'export' | 'import' | null>(null)
  const [localSavesOpen, setLocalSavesOpen] = useState(false)
  const [currentGraphId, setCurrentGraphId] = useState<string | null>(null)
  const [itemIconSize, setItemIconSize] = useState<number>(() => {
    const stored = Number(localStorage.getItem(ICON_SIZE_KEY))
    return stored >= 32 && stored <= 200 ? stored : DEFAULT_ITEM_ICON_SIZE
  })
  const [edgesAnimated, setEdgesAnimated] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return stored >= MIN_SIDEBAR_WIDTH && stored <= MAX_SIDEBAR_WIDTH ? stored : DEFAULT_SIDEBAR_WIDTH
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true')
  // Narrow-screen only: the header's action buttons and view-settings
  // collapse into a dropdown menu behind a hamburger button, since there
  // isn't room to lay them out inline the way desktop does. Irrelevant
  // (and never toggled) above the mobile breakpoint — see the
  // `.mobile-menu-toggle` / `.header-menu-panel` rules in styles.css.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const sidebarResizing = useRef(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()
  // The canvas section's own on-screen position/size -- used by addNode
  // to drop a new node at the center of whatever's currently in view,
  // rather than a fixed spot that drifts off-screen once you've panned
  // or zoomed away from it.
  const canvasRef = useRef<HTMLElement>(null)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  // Drag-to-resize for the sidebar. Listens on the window (not just the
  // handle) so the resize keeps tracking even if the cursor briefly
  // leaves the thin handle during a fast drag.
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!sidebarResizing.current) return
      setSidebarWidth(clamp(window.innerWidth - e.clientX, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH))
    }
    function onMouseUp() {
      if (!sidebarResizing.current) return
      sidebarResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function startSidebarResize(e: ReactMouseEvent) {
    if (sidebarCollapsed) return
    e.preventDefault()
    sidebarResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // Node selection lives on the nodes themselves (node.selected, managed by
  // React Flow's own click/shift-click/rubber-band-select handling via
  // onNodesChange) rather than as separate app state — that's what makes
  // multi-select work for free: selecting several nodes just means several
  // of them have .selected = true, no extra plumbing needed.
  const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id)
  const selectedId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
  const selectedNode = nodes.find(n => n.id === selectedId)
  const selectedActionIconPath = selectedNode
    ? resolveFieldIconPath(selectedNode.data.action, selectedNode.data.actionIconPath)
    : undefined
  const totalCost = computeTotalCost(nodes)
  // The animated dash is a graph-wide display toggle, not stored per edge
  // — applied here at render time rather than baked into each edge object.
  // --- Guide mode --------------------------------------------------------
  // Steps through the graph one node at a time, following whichever
  // outgoing connection the user says actually happened. Beyond a plain
  // straight line, this also has to handle:
  //  - multiple starting points (e.g. a base item prepared alongside a
  //    separately-bought donor item) that later join into one path,
  //  - a genuine join, only offered once every branch feeding into it has
  //    actually been walked through, and
  //  - retry loops (an edge back to an earlier step in the SAME branch,
  //    e.g. "didn't hit the mod, try the essence again") which must
  //    always stay choosable and must NOT be mistaken for a second branch
  //    that needs finishing first.
  // All three fall out of one rule: a node is "ready" once every incoming
  // edge that ISN'T a loop-back has been walked. Distinguishing a loop-
  // back from a real converging branch is what guideGatingPredecessors
  // does below, via reachability rather than just counting edges.
  const [guide, setGuide] = useState<{ path: string[] } | null>(null)
  // When "Guide me" is clicked and there's more than one valid starting
  // point (see guideStartCandidates below) and none of them is already
  // selected, this holds the candidates so a picker can be shown instead
  // of silently guessing which one to begin at.
  const [guideStartChoices, setGuideStartChoices] = useState<Node<CraftNodeData>[] | null>(null)
  const guideCurrentId = guide ? guide.path[guide.path.length - 1] : null
  const guideCurrentNode = guideCurrentId ? nodes.find(n => n.id === guideCurrentId) : undefined
  const guideVisitedNodes = guide
    ? (guide.path.map(id => nodes.find(n => n.id === id)).filter(Boolean) as Node<CraftNodeData>[])
    : []
  const guideSpent = computeTotalCost(guideVisitedNodes)
  const guideActionIconPath = guideCurrentNode
    ? resolveFieldIconPath(guideCurrentNode.data.action, guideCurrentNode.data.actionIconPath)
    : undefined

  /** Every node reachable by following outgoing edges forward from
   * `startId`, including through cycles (the seen-set guards against
   * infinite looping, not against revisiting nodes along the way). */
  function guideForwardReachable(startId: string): Set<string> {
    const seen = new Set<string>()
    const stack = [startId]
    while (stack.length > 0) {
      const id = stack.pop() as string
      for (const e of edges) {
        if (e.source !== id || seen.has(e.target)) continue
        seen.add(e.target)
        stack.push(e.target)
      }
    }
    return seen
  }

  const guidePreds = (() => {
    const map = new Map<string, string[]>()
    for (const e of edges) map.set(e.target, [...(map.get(e.target) ?? []), e.source])
    return map
  })()

  /** The incoming edges that actually have to be walked before a node is
   * reachable — every predecessor except ones the node can itself reach
   * by following edges forward, since those are a loop back from later
   * in its own branch rather than a separate branch joining in here. A
   * node ends up with 2+ of these only at a genuine join (like a
   * recombinator); everything else — including a node with several
   * loop-back edges pointing at it — has 0 or 1, so it's never gated on
   * "the other branch" the way a real join is. */
  function guideGatingPredecessors(nodeId: string): string[] {
    const preds = guidePreds.get(nodeId) ?? []
    if (preds.length < 2) return preds
    const reachableFromNode = guideForwardReachable(nodeId)
    return preds.filter(p => !reachableFromNode.has(p))
  }

  function guideIsReady(nodeId: string, visited: Set<string>): boolean {
    return guideGatingPredecessors(nodeId).every(p => visited.has(p))
  }

  const guideVisited = new Set(guide?.path ?? [])

  /** Every outgoing edge from the current step. */
  const guideDirectEdges = guideCurrentId ? edges.filter(e => e.source === guideCurrentId) : []
  /** ...and just the ones that are actually available to click right now
   * — always including a loop-back target regardless of whether it's
   * been visited before, since "try again" is meant to be repeatable. */
  const guideDirectReady = guideDirectEdges.filter(e => guideIsReady(e.target, guideVisited))
  /** The rest: a direct next step exists, but its target is still
   * waiting on a sibling branch — shown as a note rather than a button. */
  const guidePendingHere = guideDirectEdges
    .map(e => {
      const target = nodes.find(n => n.id === e.target)
      const waitingOn = guideGatingPredecessors(e.target)
        .filter(p => !guideVisited.has(p))
        .map(p => nodes.find(n => n.id === p))
        .filter((n): n is Node<CraftNodeData> => !!n)
      return target && waitingOn.length > 0 ? { node: target, waitingOn } : null
    })
    .filter((x): x is { node: Node<CraftNodeData>; waitingOn: Node<CraftNodeData>[] } => !!x)
  /** Once the current branch has genuinely run dry — a dead end, or
   * every direct option is still waiting on a sibling branch — offer any
   * other unvisited node with no incoming edges at all: a genuinely
   * separate starting point elsewhere in the graph that hasn't been
   * walked yet (see guideStartCandidates). Deliberately NOT "any
   * ready-and-unvisited node": the node just past a split that WASN'T
   * taken has exactly one predecessor (the split itself), which is
   * already visited, so it'd otherwise look just as "ready" as a real
   * separate branch — but a split's outcomes are mutually exclusive
   * (only one of them actually happened), not a second thing still left
   * to do. Reaching a dead end on one arm of a split is simply the end
   * of that arm, not a cue to go walk the other one too. */
  const guideOtherBranches =
    guideDirectReady.length === 0
      ? nodes.filter(
          n =>
            n.id !== guideCurrentId &&
            !guideVisited.has(n.id) &&
            (guidePreds.get(n.id) ?? []).length === 0,
        )
      : []

  // While guiding, the current node gets a highlight and everything else
  // dims — injected at render time (like renderEdges below) rather than
  // stored on the actual nodes, since it's a transient display state.
  // isGuideLocked also rides along on every node so CraftNode can hide
  // its duplicate/remove buttons: the whole point of walking through a
  // plan is reviewing/executing it, not editing it out from under
  // yourself mid-walkthrough.
  const renderNodes = guide
    ? nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          isGuideActive: n.id === guideCurrentId,
          isGuideDimmed: n.id !== guideCurrentId,
          isGuideLocked: true,
        },
      }))
    : nodes

  // Every edge also gets an onPickIcon callback threaded through its
  // data, so RemovableEdge can open the shared currency/item picker for
  // its own label without needing its own copy of that modal's state --
  // and, while guiding, isGuideLocked, so its label can't be edited and
  // its remove button doesn't render.
  const renderEdges = edges.map(e => ({
    ...e,
    ...(edgesAnimated ? { animated: true } : {}),
    data: {
      ...(e.data ?? {}),
      onPickIcon: () => setCurrencyPickerFor({ edgeId: e.id }),
      isGuideLocked: !!guide,
    },
  }))

  // Keeps the current guide step in view without the user having to pan
  // themselves.
  useEffect(() => {
    if (!guideCurrentId) return
    fitView({ nodes: [{ id: guideCurrentId }], duration: 400, padding: 0.4, maxZoom: 1.2 })
  }, [guideCurrentId, fitView])

  /** Nodes nothing else points into — the natural place(s) to start a
   * walkthrough from. Selecting one of these before pressing "Guide me"
   * controls which branch it opens on; with more than one candidate and
   * nothing relevant selected, startGuide shows a picker instead of
   * guessing. */
  function guideStartCandidates(): Node<CraftNodeData>[] {
    const targets = new Set(edges.map(e => e.target))
    return nodes.filter(n => !targets.has(n.id))
  }

  function startGuide() {
    const candidates = guideStartCandidates()
    if (candidates.length === 0) {
      setStatus('Select a node to start the guide from.')
      return
    }
    // Only honor the current selection as the starting point if it's
    // actually one of the graph's real starts (no incoming edges) --
    // otherwise whatever node was last selected while editing (which
    // could be anywhere in the graph) would silently hijack where the
    // guide begins. Deliberately selecting one of several valid starts
    // still works, and skips the picker below.
    if (selectedId && candidates.some(n => n.id === selectedId)) {
      beginGuideAt(selectedId)
      return
    }
    if (candidates.length === 1) {
      beginGuideAt(candidates[0].id)
      return
    }
    // More than one valid start and none of them is what's selected --
    // ask which one, rather than silently picking whichever happens to
    // come first.
    setGuideStartChoices(candidates)
  }

  function beginGuideAt(startId: string) {
    setGuide({ path: [startId] })
    selectOnly(startId)
    // The guide panel lives in the sidebar, so make sure it's actually
    // showing -- otherwise, on mobile especially, starting the guide
    // does nothing visible until the sidebar is opened by hand. Likewise
    // close the header's mobile dropdown, since "Guide me" lives in it
    // and leaving it open would just cover the sidebar it opens.
    setSidebarCollapsed(false)
    setMobileMenuOpen(false)
    setGuideStartChoices(null)
  }

  /** Advances to `nodeId`, whether that's the target of a direct edge
   * from the current step or a jump to an unrelated ready branch (see
   * guideOtherBranches) — either way it's just appended to the path, so
   * a loop-back target can appear here more than once. */
  function guideChoose(nodeId: string) {
    if (!guide) return
    setGuide({ path: [...guide.path, nodeId] })
    selectOnly(nodeId)
  }

  function guideBack() {
    if (!guide || guide.path.length <= 1) return
    const nextPath = guide.path.slice(0, -1)
    setGuide({ path: nextPath })
    selectOnly(nextPath[nextPath.length - 1])
  }

  function guideRestart() {
    if (!guide) return
    setGuide({ path: [guide.path[0]] })
    selectOnly(guide.path[0])
  }

  function exitGuide() {
    setGuide(null)
  }

  /** Selects exactly one node (deselecting everything else) — used after
   * actions that create/load a node programmatically, where there's no
   * click event for React Flow to handle selection from itself. */
  function selectOnly(id: string | null) {
    setNodes(ns => ns.map(n => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })))
  }

  // --- Undo / redo -----------------------------------------------------
  // Tracks nodes+edges as the undoable unit (the graph's actual content —
  // name/tag-library/display-setting changes aren't included, matching
  // what people mean by "undo" in a node editor). Rapid-fire changes
  // (dragging a node, typing in a field) are coalesced into one history
  // entry by only committing after a short pause, rather than recording
  // every intermediate value.
  type GraphSnapshot = { nodes: Node<CraftNodeData>[]; edges: Edge[] }
  const [past, setPast] = useState<GraphSnapshot[]>([])
  const [future, setFuture] = useState<GraphSnapshot[]>([])
  const lastSnapshot = useRef<GraphSnapshot>({ nodes: initialNodes, edges: initialEdges })
  const skipHistory = useRef(false)
  const historyDebounce = useRef<number | null>(null)

  useEffect(() => {
    if (skipHistory.current) {
      skipHistory.current = false
      lastSnapshot.current = { nodes, edges }
      return
    }
    if (historyDebounce.current !== null) window.clearTimeout(historyDebounce.current)
    historyDebounce.current = window.setTimeout(() => {
      setPast(p => [...p, lastSnapshot.current].slice(-100))
      setFuture([])
      lastSnapshot.current = { nodes, edges }
    }, 500)
    return () => {
      if (historyDebounce.current !== null) window.clearTimeout(historyDebounce.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  /** Resets undo/redo history — used whenever the graph is switched out
   * wholesale (New/Clear all/Import/Load/opening a shared link), since
   * undoing back into a *different* graph you just loaded would be
   * confusing rather than useful. */
  function resetHistory(snapshot: GraphSnapshot) {
    if (historyDebounce.current !== null) window.clearTimeout(historyDebounce.current)
    skipHistory.current = true
    lastSnapshot.current = snapshot
    setPast([])
    setFuture([])
  }

  function undo() {
    if (past.length === 0) return
    if (historyDebounce.current !== null) window.clearTimeout(historyDebounce.current)
    const previous = past[past.length - 1]
    setPast(p => p.slice(0, -1))
    setFuture(f => [{ nodes, edges }, ...f])
    skipHistory.current = true
    setNodes(previous.nodes)
    setEdges(previous.edges)
  }

  function redo() {
    if (future.length === 0) return
    if (historyDebounce.current !== null) window.clearTimeout(historyDebounce.current)
    const next = future[0]
    setFuture(f => f.slice(1))
    setPast(p => [...p, { nodes, edges }])
    skipHistory.current = true
    setNodes(next.nodes)
    setEdges(next.edges)
  }

  // Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) to redo — but only
  // when focus isn't inside a text field, so the browser's own undo for
  // whatever you're typing takes priority as expected.
  useEffect(() => {
    function isTextEntry(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      if (isTextEntry(e.target)) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [past, future, nodes, edges])

  /** Deletes every currently-selected node (and any edges attached to
   * them) — the bulk counterpart to a single node's own remove button. */
  function deleteSelectedNodes() {
    if (selectedNodeIds.length === 0) return
    const idSet = new Set(selectedNodeIds)
    setNodes(ns => ns.filter(n => !idSet.has(n.id)))
    setEdges(eds => eds.filter(e => !idSet.has(e.source) && !idSet.has(e.target)))
  }

  /** Duplicates every currently-selected node, offset slightly so the
   * copies don't sit exactly on top of the originals, and selects the new
   * copies (mirrors a single node's own duplicate button). */
  function duplicateSelectedNodes() {
    if (selectedNodeIds.length === 0) return
    const idSet = new Set(selectedNodeIds)
    const idMap = new Map<string, string>()
    const clones = nodes
      .filter(n => idSet.has(n.id))
      .map((n, i) => {
        const newId = `node-${Date.now()}-${i}`
        idMap.set(n.id, newId)
        return {
          ...n,
          id: newId,
          selected: true,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          data: {
            ...n.data,
            modifiers: n.data.modifiers.map(m => ({
              ...m,
              id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            })),
          },
        }
      })
    // Edges that ran between two nodes that were both duplicated get
    // duplicated too, wired between the new copies.
    const clonedEdges = edges
      .filter(e => idSet.has(e.source) && idSet.has(e.target))
      .map(e => ({
        ...e,
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }))
    setNodes(ns => ns.map(n => ({ ...n, selected: false })).concat(clones))
    setEdges(eds => eds.concat(clonedEdges))
  }

  const dragStartNodeId = useRef<string | null>(null)

  const onConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: { nodeId: string | null }) => {
    dragStartNodeId.current = params.nodeId
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    // See the matching guard in onConnectEnd -- nodesConnectable={!guide}
    // is what actually stops a connection drag from starting, this is
    // just a second line of defense on the same "a new edge got made"
    // path.
    if (guide || connection.source === connection.target) return
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
  }, [setEdges, guide])

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
      // Belt-and-suspenders alongside nodesConnectable={!guide} on
      // <ReactFlow> below: that prop is what actually stops a connection
      // drag from starting in the first place, but this guards the same
      // "dropped on empty canvas" node-creation path directly too, in
      // case a connection is ever already in progress right as a guide
      // starts.
      if (guide || connectionState.isValid || connectionState.toNode || !connectionState.fromNode) return

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

      setNodes(ns => ns.map(n => ({ ...n, selected: false })).concat({ ...newNode, selected: true }))
      setEdges(eds => eds.concat(newEdge))
    },
    [screenToFlowPosition, setNodes, setEdges, guide],
  )

  // Successive Add-node clicks nudge around the center a little instead
  // of landing in the exact same spot, so they don't stack invisibly on
  // top of each other -- wraps after 8 so a long run of adds spirals
  // near the center rather than drifting away from it.
  const addNodeOffsetRef = useRef(0)

  function addNode() {
    const id = `node-${Date.now()}`
    const bounds = canvasRef.current?.getBoundingClientRect()
    const center = bounds
      ? screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
      : { x: 400, y: 300 }
    const step = addNodeOffsetRef.current % 8
    addNodeOffsetRef.current += 1
    const angle = (step / 8) * Math.PI * 2
    const radius = 26
    const node: Node<CraftNodeData> = {
      id,
      type: 'craftNode',
      // -90/-30 centers the node's own box on that point, matching the
      // same offset onConnectEnd uses when dropping a node under the
      // cursor.
      position: {
        x: center.x - 90 + Math.cos(angle) * radius,
        y: center.y - 30 + Math.sin(angle) * radius,
      },
      data: {
        label: 'New crafting step',
        action: '',
        modifiers: [],
        notes: '',
      },
    }
    setNodes(ns => ns.map(n => ({ ...n, selected: false })).concat({ ...node, selected: true }))
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
    } else if (currencyPickerFor && typeof currencyPickerFor === 'object' && 'costIndex' in currencyPickerFor) {
      const { costIndex } = currencyPickerFor
      const current = selectedNode?.data.costs?.[costIndex]
      updateCost(costIndex, {
        currency: result.name,
        amount: current?.amount ?? 1,
        chance: current?.chance ?? 100,
        iconPath: result.path ?? '',
      })
    } else if (currencyPickerFor && typeof currencyPickerFor === 'object' && 'edgeId' in currencyPickerFor) {
      const { edgeId } = currencyPickerFor
      setEdges(eds =>
        eds.map(e =>
          e.id === edgeId ? { ...e, label: `${typeof e.label === 'string' ? e.label : ''}${shortcode}` } : e,
        ),
      )
    } else {
      updateSelected({ action: result.name, actionIconPath: result.path ?? '' })
    }
    setCurrencyPickerFor(null)
  }

  /** Replaces one cost entry (by index) with `patch` merged over its
   * current values — used for all the per-row edits (currency text,
   * amount, chance, icon). */
  function updateCost(
    index: number,
    patch: Partial<{ currency: string; amount: number; chance: number; iconPath: string }>,
  ) {
    if (!selectedNode) return
    const costs = selectedNode.data.costs ?? []
    const current = costs[index] ?? { currency: '', amount: 1, chance: 100 }
    const next = costs.slice()
    next[index] = { ...current, ...patch }
    updateSelected({ costs: next })
  }

  /** Appends a new blank cost row — a node can have several (e.g. a
   * fossil plus a resonator used together). */
  function addCost() {
    if (!selectedNode) return
    updateSelected({ costs: [...(selectedNode.data.costs ?? []), { currency: '', amount: 1, chance: 100 }] })
  }

  /** Removes one cost row entirely (not just its icon). */
  function removeCost(index: number) {
    if (!selectedNode) return
    const next = (selectedNode.data.costs ?? []).filter((_, i) => i !== index)
    updateSelected({ costs: next.length > 0 ? next : undefined })
  }

  /** Clears the icon entirely — explicitly "no icon", not just resetting
   * to auto-detect (which could just silently bring the same icon back
   * if the text happens to match a real item name). See
   * CraftNodeData.actionIconPath for the undefined/''/path distinction. */
  function removeActionIcon() {
    updateSelected({ actionIconPath: '' })
  }

  function removeCostIcon(index: number) {
    updateCost(index, { iconPath: '' })
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
    const withTypes = payload.data.nodes.map(withNodeType)
    const withEdgeTypes = payload.data.edges.map(withEdgeType)
    setGraphName(payload.name)
    setNodes(withTypes)
    setEdges(withEdgeTypes)
    setTagPresets(payload.data.tagPresets?.length ? payload.data.tagPresets : DEFAULT_TAG_PRESETS)
    setEdgesAnimated(payload.data.edgesAnimated ?? false)
    selectOnly(withTypes[0]?.id ?? null)
    setCurrentGraphId(null)
    setStatus('Imported')
    setExportImportMode(null)
    resetHistory({ nodes: withTypes, edges: withEdgeTypes })
    setGuide(null)
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
    selectOnly(freshNodes[0]?.id ?? null)
    setCurrentGraphId(null)
    setStatus('')
    normalizeUrlToSlug('new')
    resetHistory({ nodes: freshNodes, edges: freshEdges })
    setGuide(null)
  }

  function handleClearAll() {
    if (!window.confirm('Clear the whole canvas? This removes every node and connection.')) return
    setNodes([])
    setEdges([])
    setCurrentGraphId(null)
    setStatus('Cleared')
    normalizeUrlToSlug('new')
    resetHistory({ nodes: [], edges: [] })
    setGuide(null)
  }

  function handleLoadLocal(payload: ExportPayload, id: string) {
    const withTypes = payload.data.nodes.map(withNodeType)
    const withEdgeTypes = payload.data.edges.map(withEdgeType)
    setGraphName(payload.name)
    setNodes(withTypes)
    setEdges(withEdgeTypes)
    setTagPresets(payload.data.tagPresets?.length ? payload.data.tagPresets : DEFAULT_TAG_PRESETS)
    setEdgesAnimated(payload.data.edgesAnimated ?? false)
    selectOnly(withTypes[0]?.id ?? null)
    setCurrentGraphId(id)
    setStatus('Loaded')
    setLocalSavesOpen(false)
    resetHistory({ nodes: withTypes, edges: withEdgeTypes })
    setGuide(null)
  }

  return (
    <div className="app" style={{ ['--item-icon-size' as any]: `${itemIconSize}px` }}>
      <header>
        <div className="header-brand">
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="app-favicon" />
          <h1>Crafting Graph</h1>
          {/* Hamburger toggle — hidden on desktop by CSS, where the actions
           * below are always shown inline instead of behind this menu. */}
          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(o => !o)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
          <span className="header-disclaimer">
            Not affiliated with or endorsed by Grinding Gear Games
          </span>
        </div>

        <div className="header-workspace">
          <div className="header-title-block">
            <span className="header-eyebrow">Current plan</span>
            <input
              value={graphName}
              onChange={e => setGraphName(e.target.value)}
              className="graph-name"
            />
            {status && <span className="status">{status}</span>}
          </div>

          {/* On mobile this whole block is a dropdown behind the hamburger
           * button above; on desktop the open/closed class has no effect
           * (see the plain, non-media-query `.header-menu-panel` rule) so
           * it always renders inline as it always has. */}
          <div className={`header-menu-panel${mobileMenuOpen ? ' header-menu-panel-open' : ''}`}>
            <div className="header-actions">
              <div className="button-group">
                <button className="btn-primary" onClick={addNode}>+ Add node</button>
                <button onClick={handleNewGraph}>New</button>
                <button onClick={handleClearAll}>Clear all</button>
              </div>
              <div className="button-group">
                <button onClick={undo} disabled={past.length === 0} title="Undo (Ctrl/Cmd+Z)">
                  ↶ Undo
                </button>
                <button onClick={redo} disabled={future.length === 0} title="Redo (Ctrl/Cmd+Shift+Z)">
                  ↷ Redo
                </button>
              </div>
              <div className="button-group">
                <button onClick={handleSaveLocal}>Save</button>
                {currentGraphId && <button onClick={handleSaveAsNewLocal}>Save as new</button>}
                <button onClick={() => setLocalSavesOpen(true)}>Load</button>
              </div>
              <div className="button-group">
                <button onClick={() => setExportImportMode('export')}>Export text</button>
                <button onClick={() => setExportImportMode('import')}>Import text</button>
              </div>
              <div className="button-group">
                {guide ? (
                  <button className="btn-primary" onClick={exitGuide}>■ Exit guide</button>
                ) : (
                  <button className="btn-primary" onClick={startGuide} title="Step through the graph one node at a time">
                    ▶ Guide me
                  </button>
                )}
              </div>
            </div>

            <div className="view-settings">
              <span className="view-settings-label">View</span>
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
            </div>
          </div>
        </div>
      </header>

      {/* Mobile-only backdrop: tapping outside the open dropdown closes it.
       * Invisible and non-interactive whenever the menu is closed or the
       * viewport is wide enough that `.header-menu-panel` isn't a dropdown
       * in the first place (see its plain, non-media-query rule). */}
      {mobileMenuOpen && <div className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} />}

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

      <main style={{ ['--sidebar-width' as any]: `${sidebarCollapsed ? 0 : sidebarWidth}px` }}>
        <section className="canvas" ref={canvasRef}>
          <ReactFlow
            nodes={renderNodes}
            edges={renderEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            // No onNodeClick here — React Flow already turns clicks (plain,
            // shift-click, ctrl/cmd-click, and shift-drag rubber-band
            // select) into the right node.selected changes on its own via
            // onNodesChange; selectedNode/selectedNodeIds above are just
            // derived from that. A custom handler here would only fight it
            // and break multi-select.
            deleteKeyCode={guide ? [] : ['Backspace', 'Delete']}
            // While a guide is active this is meant to be a walkthrough of
            // the plan, not an editing session -- dragging nodes around,
            // dragging out new connections, or deleting something with the
            // keyboard are all disabled for the duration (selection, pan,
            // and zoom stay on, since those are just how you look at it).
            // The per-node/per-edge buttons and edge label input are
            // separately hidden via isGuideLocked in CraftNode/RemovableEdge.
            nodesDraggable={!guide}
            nodesConnectable={!guide}
            // Explicit rather than relying on defaults: a one-finger drag
            // on empty canvas pans, a two-finger pinch zooms, and a
            // two-finger drag also pans -- the standard touch map for a
            // pannable/zoomable surface, so the graph is fully
            // navigable by hand on a phone or tablet, not just a mouse.
            panOnDrag
            zoomOnPinch
            zoomOnScroll
            panOnScroll={false}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </section>

        <div
          className={`sidebar-resizer${sidebarCollapsed ? ' sidebar-resizer-collapsed' : ''}`}
          onMouseDown={startSidebarResize}
          title={sidebarCollapsed ? undefined : 'Drag to resize'}
        >
          <button
            className="sidebar-toggle"
            onClick={e => {
              e.stopPropagation()
              setSidebarCollapsed(c => !c)
            }}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {sidebarCollapsed ? '◂' : '▸'}
          </button>
        </div>

        <aside>
          {sidebarCollapsed ? null : guide ? (
            <div className="guide-panel">
              <div className="row-between" style={{ marginTop: 0 }}>
                <h2 style={{ border: 'none', padding: 0, margin: 0 }}>Guide</h2>
                <button onClick={exitGuide}>Exit guide</button>
              </div>
              <p className="muted">Step {guide.path.length}</p>

              {!guideCurrentNode ? (
                <>
                  <p className="muted">This step's node no longer exists — it may have been deleted.</p>
                  <div className="guide-controls">
                    <button onClick={guideBack} disabled={guide.path.length <= 1}>
                      ← Back
                    </button>
                    <button onClick={exitGuide}>Exit guide</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="action-row">
                    {guideActionIconPath && <IconImage className="action-icon" path={guideActionIconPath} alt="" />}
                    <p className="guide-node-title">{guideCurrentNode.data.label}</p>
                  </div>
                  {guideCurrentNode.data.action && <p className="muted">{guideCurrentNode.data.action}</p>}

                  {guideCurrentNode.data.modifiers.length > 0 && (
                    <div className="guide-modifiers">
                      {guideCurrentNode.data.modifiers.map(mod => (
                        <div className="modifier-text-row" key={mod.id}>
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
                          <span style={{ color: mod.textColor }}>{mod.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {guideCurrentNode.data.notes && (
                    <div
                      className="craft-node-notes"
                      dangerouslySetInnerHTML={{ __html: renderNotesHtml(guideCurrentNode.data.notes) }}
                    />
                  )}

                  {(guideCurrentNode.data.costs ?? []).some(c => c.currency && c.amount > 0) && (
                    <>
                      <h3>This step's cost</h3>
                      {guideCurrentNode.data.costs!.map((cost, i) => {
                        const iconPath = resolveFieldIconPath(cost.currency, cost.iconPath)
                        return (
                          cost.currency &&
                          cost.amount > 0 && (
                            <div className="craft-node-cost" key={i}>
                              {iconPath && <IconImage className="craft-node-cost-icon" path={iconPath} alt="" />}
                              <span>
                                {cost.amount}× {cost.currency}
                                {cost.chance < 100 && <span className="craft-node-cost-chance"> @ {cost.chance}%</span>}
                              </span>
                            </div>
                          )
                        )
                      })}
                    </>
                  )}

                  <h3>Spent so far</h3>
                  {guideSpent.length === 0 ? (
                    <p className="muted">Nothing yet.</p>
                  ) : (
                    <div className="guide-spent">
                      {guideSpent.map(t => (
                        <span className="total-cost-chip" key={t.currency}>
                          {t.iconPath && <IconImage className="total-cost-icon" path={t.iconPath} alt="" />}
                          <span>
                            {t.amount} {t.currency}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <h3>What happened?</h3>
                  {(guideDirectReady.length > 0 || guideOtherBranches.length > 0) && (
                    <div className="guide-choices">
                      {guideDirectReady.map(edge => {
                        // No label usually just means "the normal/expected
                        // outcome" -- labels are how a branch (a failure, a
                        // specific roll, etc.) gets called out as
                        // different from that default, so an unlabeled
                        // edge reads as a plain success rather than
                        // borrowing whatever the next node happens to be
                        // named.
                        const label =
                          typeof edge.label === 'string' && edge.label ? edge.label : 'Success'
                        return (
                          <button key={edge.id} className="guide-choice-btn" onClick={() => guideChoose(edge.target)}>
                            {/* The label may contain {{currency:...}}/{{item:...}}
                             * icon shortcodes (same as the edge's own label
                             * badge on the canvas) -- render them rather than
                             * showing the raw shortcode text. */}
                            <span dangerouslySetInnerHTML={{ __html: renderLabelHtml(label) }} />
                            {' →'}
                          </button>
                        )
                      })}
                      {/* Not reachable by a direct edge from here -- another
                       * starting branch that hasn't been walked yet, or a
                       * join that just cleared because its last branch
                       * finished elsewhere. Tagged so it doesn't look like
                       * a normal continuation of this step. */}
                      {guideOtherBranches.map(node => (
                        <button key={node.id} className="guide-choice-btn" onClick={() => guideChoose(node.id)}>
                          <span className="guide-choice-branch-tag">Other branch</span>
                          {node.data.label}
                          {' →'}
                        </button>
                      ))}
                    </div>
                  )}

                  {guideDirectEdges.length === 0 && guideOtherBranches.length === 0 && guidePendingHere.length === 0 && (
                    <p className="muted">This is an end point — nothing crafted further from here.</p>
                  )}

                  {guidePendingHere.length > 0 && (
                    <div className="guide-pending">
                      {guidePendingHere.map(({ node, waitingOn }) => (
                        <p className="muted guide-pending-item" key={node.id}>
                          <strong>{node.data.label}</strong> is waiting on{' '}
                          {waitingOn.map(w => w.data.label).join(', ')} from the other branch before it's available.
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="guide-controls">
                    <button onClick={guideBack} disabled={guide.path.length <= 1}>
                      ← Back
                    </button>
                    <button onClick={guideRestart} disabled={guide.path.length <= 1}>
                      Restart
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : selectedNode ? (
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
                {selectedActionIconPath && <IconImage className="action-icon" path={selectedActionIconPath} alt="" />}
                <input
                  value={selectedNode.data.action}
                  onChange={e => updateSelected({ action: e.target.value })}
                  placeholder="e.g. Essence of Horror"
                />
                <button onClick={() => setCurrencyPickerFor('action')}>Pick</button>
                {selectedActionIconPath && (
                  <button onClick={removeActionIcon} title="Remove this icon">
                    Remove icon
                  </button>
                )}
              </div>

              <div className="row-between">
                <label style={{ margin: 0 }}>Costs</label>
                <button onClick={addCost}>+ Add cost</button>
              </div>
              {(selectedNode.data.costs ?? []).length === 0 && (
                <p className="muted">No cost set.</p>
              )}
              {(selectedNode.data.costs ?? []).map((cost, i) => {
                const costIconPath = resolveFieldIconPath(cost.currency, cost.iconPath)
                return (
                  <div className="cost-row" key={i}>
                    {costIconPath && <IconImage className="action-icon" path={costIconPath} alt="" />}
                    <input
                      value={cost.currency}
                      onChange={e => updateCost(i, { currency: e.target.value })}
                      placeholder="e.g. Chaos Orb"
                    />
                    <button onClick={() => setCurrencyPickerFor({ costIndex: i })}>Pick</button>
                    {costIconPath && (
                      <button onClick={() => removeCostIcon(i)} title="Remove this icon">
                        Remove icon
                      </button>
                    )}
                    <input
                      className="cost-amount"
                      type="number"
                      min={0}
                      step="any"
                      value={cost.amount}
                      onChange={e => updateCost(i, { amount: Number(e.target.value) })}
                      title="Amount per attempt"
                    />
                    <input
                      className="cost-chance"
                      type="number"
                      min={1}
                      max={100}
                      value={cost.chance}
                      onChange={e => updateCost(i, { chance: Number(e.target.value) })}
                      title="Chance of success (%)"
                    />
                    <span className="cost-chance-suffix">%</span>
                    <button onClick={() => removeCost(i)} title="Remove this cost row">
                      Remove
                    </button>
                  </div>
                )
              })}

              <div className="row-between">
                <h3>Modifiers</h3>
                <div className="modifier-header-actions">
                  <button
                    onClick={() => setItemPasteOpen(true)}
                    title="Copy the item in-game with Alt+Ctrl+C, not plain Ctrl+C"
                  >
                    Paste item
                  </button>
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
          ) : selectedNodeIds.length > 1 ? (
            <div className="multi-select-panel">
              <h2 style={{ border: 'none', padding: 0, margin: 0 }}>Crafting step</h2>
              <p className="muted">{selectedNodeIds.length} nodes selected.</p>
              <div className="multi-select-actions">
                <button onClick={duplicateSelectedNodes}>Duplicate selected</button>
                <button onClick={deleteSelectedNodes}>Remove selected</button>
              </div>
              <p className="muted multi-select-hint">
                Click a single node (or Esc, then click one) to edit it individually. Shift-click or drag a
                selection box to change which nodes are selected.
              </p>
            </div>
          ) : (
            <div className="empty-state-help">
              <h2 style={{ border: 'none', padding: 0, margin: 0 }}>Getting started</h2>
              <p className="muted">Nothing selected — here's the short version of how this works.</p>

              <h3>Building the plan</h3>
              <p className="muted">
                <strong>+ Add node</strong> drops a new crafting step onto the canvas. Drag from the edge of one
                node to another to connect them — an edge means "this step leads to that one." A node with more
                than one outgoing edge is a branch point (e.g. different outcomes of an essence craft); click an
                edge to give it a label describing which outcome it represents.
              </p>

              <h3>Selecting nodes</h3>
              <p className="muted">
                Click a node to edit it here. To work on several at once, Shift-click each one, or drag a
                selection box across empty canvas — that's the quickest way to duplicate or delete a whole batch
                of steps together.
              </p>

              <h3>Costs</h3>
              <p className="muted">
                Each step can list one or more costs: a currency, how much it takes per attempt, and the chance
                of success if it's not guaranteed. Every node's costs get combined into the total shown along the
                top of the canvas, so you can see the expected spend for the whole plan at a glance.
              </p>

              <h3>Modifiers</h3>
              <p className="muted">
                A node's modifiers are the affixes the item is meant to have once that step's done — add them one
                at a time, or use <strong>Paste item</strong> to fill them in automatically from an item's text
                (copy it in-game with <strong>Alt+Ctrl+C</strong>, not plain Ctrl+C, so the origin tags come
                through). They're just documentation for the step; they don't affect the cost calculation.
              </p>

              <h3>Walking through it</h3>
              <p className="muted">
                <strong>Guide me</strong> steps through the graph one node at a time, asking what actually
                happened at each branch — handy for following your own plan later without re-reading the whole
                graph.
              </p>
            </div>
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
            currencyPickerFor === 'notes'
              ? 'Insert a currency icon'
              : currencyPickerFor && typeof currencyPickerFor === 'object' && 'costIndex' in currencyPickerFor
                ? 'Choose a cost currency'
                : currencyPickerFor && typeof currencyPickerFor === 'object' && 'edgeId' in currencyPickerFor
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
      {guideStartChoices && (
        <div
          className="modal-overlay"
          // Deliberately no onClick here: clicking the backdrop must NOT
          // close the modal, only the explicit Cancel button should --
          // same convention as every other modal in this app.
        >
          <div className="modal guide-start-picker" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Start from which node?</h2>
              <button onClick={() => setGuideStartChoices(null)}>Cancel</button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Nothing feeds into any of these, so any of them could be where the plan begins. Pick one to start
              the guide there.
            </p>
            <div className="guide-start-choice-list">
              {guideStartChoices.map(node => {
                const iconPath = resolveFieldIconPath(node.data.action, node.data.actionIconPath)
                return (
                  <button key={node.id} className="guide-start-choice-btn" onClick={() => beginGuideAt(node.id)}>
                    {iconPath && <IconImage className="guide-start-choice-icon" path={iconPath} alt="" />}
                    <span className="guide-start-choice-text">
                      <span className="guide-start-choice-label">{node.data.label || node.data.action || 'Untitled step'}</span>
                      {node.data.label && node.data.action && (
                        <span className="guide-start-choice-action">{node.data.action}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
