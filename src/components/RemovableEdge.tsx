import { useState } from 'react'
import {
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'

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
}: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const [hovered, setHovered] = useState(false)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const visible = hovered || selected

  return (
    <>
      {/* Wide, invisible path purely to make hovering the connection easy */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <path
        id={id}
        d={edgePath}
        className="react-flow__edge-path"
        style={style}
        markerEnd={markerEnd}
        pointerEvents="none"
      />
      <EdgeLabelRenderer>
        <button
          className={`edge-remove${visible ? ' edge-remove-visible' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          title="Remove connection"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={e => {
            e.stopPropagation()
            deleteElements({ edges: [{ id }] })
          }}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
