import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import type { MouseEvent } from 'react'
import { LEFT_SOURCE_ID, LEFT_TARGET_ID, RIGHT_SOURCE_ID, RIGHT_TARGET_ID } from '../handleIds'
import { isCurrency, resolveFieldIconPath } from '../iconResolve'
import { renderNotesHtml } from '../notesMarkdown'
import { hexToRgbTriple } from '../poeColors'
import { useItemNamesLoaded } from '../data/itemNames'
import type { CraftNodeData } from '../types'
import IconImage from './IconImage'

export default function CraftNode({ id, data, selected, isConnectable }: NodeProps<Node<CraftNodeData>>) {
  // Triggers (once, shared across every node) the background load of the
  // real-name catalog, and re-renders this node once it's ready so its
  // icons/notes upgrade from "not found yet" to the correct icon without
  // needing to touch anything.
  useItemNamesLoaded()
  // Guide-mode highlight/dim/lock flags — injected at render time by
  // App.tsx (see its renderNodes), not part of the node's actual saved
  // data.
  const guideFlags = data as CraftNodeData & {
    isGuideActive?: boolean
    isGuideDimmed?: boolean
    isGuideLocked?: boolean
  }
  const nodeClassName = [
    'craft-node',
    selected && 'craft-node-selected',
    guideFlags.isGuideActive && 'craft-node-guide-active',
    guideFlags.isGuideDimmed && 'craft-node-guide-dimmed',
  ]
    .filter(Boolean)
    .join(' ')
  const actionIconPath = resolveFieldIconPath(data.action, data.actionIconPath)
  const actionIsCurrency = isCurrency(data.action)
  const { deleteElements, getNode, addNodes } = useReactFlow<Node<CraftNodeData>>()
  const notesHtml = renderNotesHtml(data.notes)

  function handleDuplicate(e: MouseEvent) {
    e.stopPropagation()
    const node = getNode(id)
    if (!node) return
    const newId = `node-${Date.now()}`
    const clone: Node<CraftNodeData> = {
      ...node,
      id: newId,
      selected: false,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: {
        ...node.data,
        modifiers: node.data.modifiers.map(m => ({
          ...m,
          id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        })),
      },
    }
    addNodes(clone)
  }

  return (
    <div className={nodeClassName}>
      {/* Each visible connector actually has two overlapping handles — a
       * source and a target, exactly stacked so only one dot is ever
       * visible per side. This lets a drag be started from *or* dropped
       * on either side, while App.tsx's onConnect flips which node ends
       * up as source/target so the arrow always points from wherever the
       * drag started to wherever it ended, rather than always following
       * handle type. Every handle needs its own explicit id (see
       * handleIds.ts) — leaving one implicit among same-typed siblings is
       * what caused edges to sometimes snap to the wrong side. The
       * id-less-handle-era ones (before this existed) migrate to these
       * same ids via migrateHandleId when a saved/imported edge loads. */}
      <Handle type="source" position={Position.Left} id={LEFT_SOURCE_ID} isConnectable={isConnectable} />
      <Handle type="target" position={Position.Left} id={LEFT_TARGET_ID} isConnectable={isConnectable} />

      {!guideFlags.isGuideLocked && (
        <>
          <button
            className="craft-node-duplicate"
            title="Duplicate node"
            onClick={handleDuplicate}
          >
            ⧉
          </button>

          <button
            className="craft-node-remove"
            title="Remove node"
            onClick={e => {
              e.stopPropagation()
              deleteElements({ nodes: [{ id }] })
            }}
          >
            ×
          </button>
        </>
      )}

      <div className="craft-node-row">
        {actionIconPath && (
          <IconImage
            className={actionIsCurrency ? 'craft-node-icon' : 'craft-node-icon craft-node-icon-item'}
            path={actionIconPath}
            alt=""
          />
        )}
        <div>
          <div className="craft-node-label">{data.label}</div>
          {data.action && <div className="craft-node-action">{data.action}</div>}
        </div>
      </div>

      {data.modifiers.length > 0 && (
        <div className="craft-node-mods">
          {data.modifiers.map(mod => (
            <div className="craft-node-mod" key={mod.id}>
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

      {data.costs && data.costs.filter(c => c.currency && c.amount > 0).length > 0 && (
        <div className="craft-node-costs">
          {data.costs
            .filter(c => c.currency && c.amount > 0)
            .map((cost, i) => {
              const costIconPath = resolveFieldIconPath(cost.currency, cost.iconPath)
              return (
                <div className="craft-node-cost" key={i} title={`${cost.chance}% chance per attempt`}>
                  {costIconPath && <IconImage className="craft-node-cost-icon" path={costIconPath} alt="" />}
                  <span>
                    {cost.amount}× {cost.currency}
                    {cost.chance < 100 && <span className="craft-node-cost-chance"> @ {cost.chance}%</span>}
                  </span>
                </div>
              )
            })}
        </div>
      )}

      {notesHtml && (
        <div className="craft-node-notes nodrag" dangerouslySetInnerHTML={{ __html: notesHtml }} />
      )}

      <Handle type="target" position={Position.Right} id={RIGHT_TARGET_ID} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} id={RIGHT_SOURCE_ID} isConnectable={isConnectable} />
    </div>
  )
}
