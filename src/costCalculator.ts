import type { Node } from '@xyflow/react'
import { resolveFieldIconPath } from './iconResolve'
import type { CraftNodeData } from './types'

export type CostTotal = {
  currency: string
  /** Expected units needed, i.e. amount / (chance / 100) summed across every
   * node that uses this currency — so a 50%-chance step costs twice its
   * face-value amount on average. */
  amount: number
  iconPath?: string
}

/** Aggregates every node's costs into a per-currency expected total. Cost
 * entries with an empty currency name or non-positive amount are skipped. */
export function computeTotalCost(nodes: Node<CraftNodeData>[]): CostTotal[] {
  const totals = new Map<string, number>()
  // Remembers the first explicit icon override seen for each currency
  // name, so the total-cost bar respects a picked/removed icon the same
  // way a single cost row does, rather than always re-resolving by name.
  const overrides = new Map<string, string>()

  for (const node of nodes) {
    for (const cost of node.data.costs ?? []) {
      const currency = cost.currency.trim()
      if (!currency || !(cost.amount > 0)) continue
      const chance = cost.chance > 0 && cost.chance <= 100 ? cost.chance : 100
      const expected = cost.amount / (chance / 100)
      totals.set(currency, (totals.get(currency) ?? 0) + expected)
      if (cost.iconPath !== undefined && !overrides.has(currency)) overrides.set(currency, cost.iconPath)
    }
  }

  return Array.from(totals.entries())
    .map(([currency, amount]) => ({
      currency,
      amount: Math.round(amount * 100) / 100,
      iconPath: resolveFieldIconPath(currency, overrides.get(currency)),
    }))
    .sort((a, b) => b.amount - a.amount)
}
