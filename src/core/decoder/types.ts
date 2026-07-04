export type TraitNodeKind = 'single' | 'tiered' | 'choice' | 'subtree-selection'

export interface OrderedTraitNode {
  id: number
  kind: TraitNodeKind
  maxRanks: number
}

export interface LoadoutHeader {
  serializationVersion: number
  specId: number
  treeHash: readonly number[]
}

export interface NodeSelection {
  nodeId: number
  purchased: boolean
  granted: boolean
  ranks: number
  choiceIndex: number | null
}

export interface DecodedLoadout {
  header: LoadoutHeader
  selections: NodeSelection[]
}
