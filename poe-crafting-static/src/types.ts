export type Modifier = {
  id: string
  text: string
  mustRemain: boolean
}

export type CraftNodeData = {
  label: string
  action: string
  modifiers: Modifier[]
  notes: string
}

export type GraphData = {
  nodes: any[]
  edges: any[]
}
