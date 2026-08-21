import { useEffect, useRef, useState } from 'react'
import {
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { renderLabelHtml } from '../notesMarkdown'

type EdgeData = {
  /** Opens the shared currency/item picker for this edge's label —
   * threaded through by App.tsx so this component doesn't need its own
   * copy of that modal's state (see the renderEdges comment in App.tsx). */
  onPickIcon?: () => void
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
  const { deleteElements, setEdges } = useReactFlow()
  const [hovered, setHovered] = useState(false)
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

  const visible = hovered || selected
  const labelText = typeof label === 'string' ? label : ''
  const onPickIcon = (data as EdgeData | undefined)?.onPickIcon

  function setLabel(value: string) {
    setEdges((eds: Edge[]) => eds.map(e => (e.id === id ? { ...e, label: value } : e)))
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
          {visible ? (
            <>
              <input
                className="edge-label-input"
                value={labelText}
                placeholder={'Label\u2026'}
                size={Math.max(6, labelText.length || 6)}
                onChange={e => setLabel(e.target.value)}
                onClick={e => e.stopPropagation()}
              />
              {onPickIcon && (
                <button
                  className="edge-icon-pick"
                  title="Insert a currency/item icon"
                  onClick={e => {
                    e.stopPropagation()
                    onPickIcon()
                  }}
                >
                  🖼
                </button>
              )}
            </>
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
          <button
            className={`edge-remove${visible ? ' edge-remove-visible' : ''}`}
            title="Remove connection"
            onClick={e => {
              e.stopPropagation()
              deleteElements({ edges: [{ id }] })
            }}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
