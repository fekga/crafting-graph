import type { Node } from '@xyflow/react'
import { resolveIconPath } from './iconResolve'
import type { CraftNodeData } from './types'

export type CostTotal = {
  currency: string
  /** Expected units needed, i.e. amount / (chance / 100) summed across every
   * node that uses this currency — so a 50%-chance step costs twice its
   * face-value amount on average. */
  amount: number
  iconPath?: string
}

/** Aggregates every node's cost into a per-currency expected total. Nodes
 * without a cost, or with an empty currency name or non-positive amount,
 * are skipped. */
export function computeTotalCost(nodes: Node<CraftNodeData>[]): CostTotal[] {
  const totals = new Map<string, number>()

  for (const node of nodes) {
    const cost = node.data.cost
    if (!cost) continue
    const currency = cost.currency.trim()
    if (!currency || !(cost.amount > 0)) continue
    const chance = cost.chance > 0 && cost.chance <= 100 ? cost.chance : 100
    const expected = cost.amount / (chance / 100)
    totals.set(currency, (totals.get(currency) ?? 0) + expected)
  }

  return Array.from(totals.entries())
    .map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
      iconPath: resolveIconPath(currency),
    }))
    .sort((a, b) => b.amount - a.amount)
}
