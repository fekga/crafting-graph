import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import type { MouseEvent } from 'react'
import { findCurrencyByName } from '../data/currencies'
import { renderNotesHtml } from '../notesMarkdown'
import { hexToRgbTriple } from '../poeColors'
import type { CraftNodeData } from '../types'

export default function CraftNode({ id, data, selected }: NodeProps<Node<CraftNodeData>>) {
  const currency = findCurrencyByName(data.action)
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
    <div className={`craft-node${selected ? ' craft-node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} />

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

      <div className="craft-node-row">
        {currency && <img className="craft-node-icon" src={currency.icon} alt="" />}
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

      {notesHtml && (
        <div className="craft-node-notes nodrag" dangerouslySetInnerHTML={{ __html: notesHtml }} />
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  )
}
