import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { useItemNamesLoaded } from '../data/itemNames'
import { oppositeTypeHandleId } from '../handleIds'
import { resolveIconPath } from '../iconResolve'
import { renderLabelHtml } from '../notesMarkdown'
import IconImage from './IconImage'

type EdgeData = {
  /** Opens the shared currency/item picker for this edge's label —
   * threaded through by App.tsx so this component doesn't need its own
   * copy of that modal's state (see the renderEdges comment in App.tsx). */
  onPickIcon?: () => void
  /** True while a guide walkthrough is active — injected at render time
   * by App.tsx, not part of the edge's actual saved data. Locks the label
   * to read-only and hides the remove button, since guide mode is meant
   * to review/execute the plan, not edit it. */
  isExecutionLocked?: boolean
}

/** How long the toolbar stays visible after the mouse leaves either the
 * edge path or the toolbar itself, before actually hiding. The two are
 * separate elements (the toolbar sits at the edge's midpoint, which isn't
 * always touching the path underneath) — without this grace period,
 * moving the mouse across the small gap between them, or between buttons
 * inside the toolbar, would flip `hovered` to false mid-transit and hide
 * the remove button before a click could land on it. */
const HIDE_DELAY_MS = 300

export default function RemovableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  style,
  label,
  data,
}: EdgeProps) {
  // Triggers (once, shared across every edge) the background load of the
  // real-name catalog, and re-renders this edge once it's ready so the
  // icon-pick button's Chaos Orb icon upgrades from the emoji fallback.
  useItemNamesLoaded()
  const { deleteElements, setEdges } = useReactFlow()
  const [hovered, setHovered] = useState(false)
  // Tracked separately from hovered/selected: while the label input has
  // keyboard focus, the toolbar must stay up even if the mouse has
  // wandered off it (e.g. the mouse never moves after clicking in) --
  // otherwise the input (and its buttons) could vanish mid-edit.
  const [focused, setFocused] = useState(false)
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    }
  }, [])

  function show() {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setHovered(true)
  }

  function scheduleHide() {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      setHovered(false)
      hideTimer.current = null
    }, HIDE_DELAY_MS)
  }

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const isExecutionLocked = !!(data as EdgeData | undefined)?.isExecutionLocked
  const visible = !isExecutionLocked && (hovered || selected || focused)
  const labelText = typeof label === 'string' ? label : ''
  const onPickIcon = (data as EdgeData | undefined)?.onPickIcon
  // A generic picture-frame glyph didn't hint at what the button actually
  // does; a real Chaos Orb -- the currency this feature gets reached for
  // most -- reads at a glance as "insert a currency/item icon" instead.
  // Undefined until the name catalog finishes loading, so the emoji stays
  // as a fallback until then.
  const iconPickIconPath = resolveIconPath('Chaos Orb')

  function setLabel(value: string) {
    setEdges((eds: Edge[]) => eds.map(e => (e.id === id ? { ...e, label: value } : e)))
  }

  /** Swaps which end of this edge is the source vs. the target -- each
   * endpoint's handle has to flip *type* (source<->target) while staying
   * on the same side of its node, the same remapping onConnect uses when
   * a connection is dragged in backward. */
  function invertDirection(e: ReactMouseEvent) {
    e.stopPropagation()
    setEdges((eds: Edge[]) =>
      eds.map(edge =>
        edge.id === id
          ? {
              ...edge,
              source: edge.target,
              target: edge.source,
              sourceHandle: oppositeTypeHandleId(edge.targetHandle, 'target'),
              targetHandle: oppositeTypeHandleId(edge.sourceHandle, 'source'),
            }
          : edge,
      ),
    )
  }

  return (
    <>
      {/* Wide, invisible path purely to make hovering the connection easy */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      />
      <path
        id={id}
        d={edgePath}
        className="react-flow__edge-path"
        style={style}
        // getBezierPath always draws from the source point to the target
        // point regardless of which side of the canvas each node happens
        // to sit on, and SVG's marker-end always lands on the path's
        // terminal vertex — so the arrowhead correctly marks the target
        // end even for a connection that visually loops backward.
        markerEnd={markerEnd}
        pointerEvents="none"
      />
      <EdgeLabelRenderer>
        <div
          className="edge-toolbar nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          {/* Buttons above the label rather than beside it -- to its side
           * they'd shift however wide the label happened to be, and ran
           * into the label input itself on a short label. Kept mounted
           * only while genuinely visible/editable, same as the input vs.
           * badge swap below (isExecutionLocked already factors into
           * `visible`, so nothing extra to check here). */}
          {visible && (
            <div className="edge-toolbar-buttons">
              <button className="edge-invert" title="Reverse direction" onClick={invertDirection}>
                ⇄
              </button>
              {onPickIcon && (
                <button
                  className="edge-icon-pick"
                  title="Insert a currency/item icon"
                  onClick={e => {
                    e.stopPropagation()
                    onPickIcon()
                  }}
                >
                  {iconPickIconPath ? (
                    <IconImage className="edge-icon-pick-img" path={iconPickIconPath} alt="" />
                  ) : (
                    '🖼'
                  )}
                </button>
              )}
              <button
                className="edge-remove"
                title="Remove connection"
                onClick={e => {
                  e.stopPropagation()
                  deleteElements({ edges: [{ id }] })
                }}
              >
                ×
              </button>
            </div>
          )}
          {visible ? (
            <input
              className="edge-label-input"
              value={labelText}
              placeholder={'Label…'}
              size={Math.max(6, labelText.length || 6)}
              onChange={e => setLabel(e.target.value)}
              onClick={e => e.stopPropagation()}
              // Keeps the toolbar (this input included) up while typing
              // even if the mouse never moves off it, or wanders away --
              // hovered/selected alone would let scheduleHide yank the
              // input out from under an active edit.
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
          ) : (
            labelText && (
              <span
                className="edge-label-badge"
                // Label text can contain {{currency:...}}/{{item:...}} icon
                // shortcodes — same mechanism as node notes — so it's run
                // through the sanitizing renderer rather than shown raw.
                dangerouslySetInnerHTML={{ __html: renderLabelHtml(labelText) }}
              />
            )
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
