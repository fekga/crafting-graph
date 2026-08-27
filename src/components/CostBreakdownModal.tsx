import type { ReactNode } from 'react'
import type { Node } from '@xyflow/react'
import { computeTotalCost, type CostTotal } from '../costCalculator'
import type { CraftNodeData } from '../types'
import IconImage from './IconImage'

type Props = {
  nodes: Node<CraftNodeData>[]
  totalCost: CostTotal[]
  renderPriceSummary: (costs: CostTotal[]) => ReactNode
  onClose: () => void
}

/** A compact per-step view of the same costs the on-canvas total used to
 * show inline at all times -- pulled into its own modal since a
 * permanently-visible chip row got distracting on graphs with more than a
 * couple of currencies (see the "Cost breakdown" toggle in App.tsx). */
export default function CostBreakdownModal({ nodes, totalCost, renderPriceSummary, onClose }: Props) {
  const steps = nodes
    .map(node => ({ node, cost: computeTotalCost([node]) }))
    .filter(s => s.cost.length > 0)

  return (
    <div
      className="modal-overlay"
      // Deliberately no onClick here: clicking the backdrop must NOT close
      // the modal, only the explicit Close button should.
    >
      <div className="modal cost-breakdown-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Cost breakdown</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {steps.length === 0 ? (
          <p className="muted">No steps have a cost set yet.</p>
        ) : (
          <div className="cost-breakdown-list">
            {steps.map(({ node, cost }) => (
              <div className="cost-breakdown-row" key={node.id}>
                <span className="cost-breakdown-step-name" title={node.data.label}>
                  {node.data.label || node.data.action || 'Untitled step'}
                </span>
                <span className="cost-breakdown-chips">
                  {cost.map(t => (
                    <span className="total-cost-chip" key={t.currency} title={t.currency}>
                      {t.iconPath && <IconImage className="total-cost-icon" path={t.iconPath} alt="" />}
                      <span>
                        {t.amount} {t.currency}
                      </span>
                    </span>
                  ))}
                  {renderPriceSummary(cost)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="cost-breakdown-total">
          <span className="total-cost-label">Total</span>
          {totalCost.map(t => (
            <span className="total-cost-chip" key={t.currency} title={t.currency}>
              {t.iconPath && <IconImage className="total-cost-icon" path={t.iconPath} alt="" />}
              <span>
                {t.amount} {t.currency}
              </span>
            </span>
          ))}
          {renderPriceSummary(totalCost)}
        </div>
      </div>
    </div>
  )
}
