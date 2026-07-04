import { asFloat, asInt } from '../lib/csv'
import { loadTable } from '../lib/wago'
import type { WagoSource } from '../lib/wago'
import type { TraitNodeKind } from '../../src/core/decoder/types'
import type { SpecTraitNodeRecord, SubTreeRecord, TraitEntryRecord } from '../../src/core/model/snapshot'

export interface SpecTraitData {
  specId: number
  traitTreeId: number
  nodes: SpecTraitNodeRecord[]
  subTrees: SubTreeRecord[]
}

const NODE_TYPE_CHOICE = 2
const NODE_TYPE_SUBTREE_SELECTION = 3

export async function buildTraitData(source: WagoSource): Promise<Map<number, SpecTraitData>> {
  const [loadouts, nodes, entries, nodeEntries, definitions, subTrees, nodeConds, conds, groupNodes, groupConds, specSetMembers] =
    await Promise.all([
      loadTable(source, 'TraitTreeLoadout'),
      loadTable(source, 'TraitNode'),
      loadTable(source, 'TraitNodeEntry'),
      loadTable(source, 'TraitNodeXTraitNodeEntry'),
      loadTable(source, 'TraitDefinition'),
      loadTable(source, 'TraitSubTree'),
      loadTable(source, 'TraitNodeXTraitCond'),
      loadTable(source, 'TraitCond'),
      loadTable(source, 'TraitNodeGroupXTraitNode'),
      loadTable(source, 'TraitNodeGroupXTraitCond'),
      loadTable(source, 'SpecSetMember'),
    ])

  const specsBySpecSet = new Map<number, Set<number>>()
  for (const row of specSetMembers) {
    const specSet = asInt(row, 'SpecSet')
    const specId = asInt(row, 'ChrSpecializationID')
    const existing = specsBySpecSet.get(specSet) ?? new Set<number>()
    existing.add(specId)
    specsBySpecSet.set(specSet, existing)
  }

  const specSetByCond = new Map<number, number>()
  for (const row of conds) {
    const specSet = asInt(row, 'SpecSetID')
    if (specSet > 0) specSetByCond.set(asInt(row, 'ID'), specSet)
  }

  const condsByNode = new Map<number, number[]>()
  for (const row of nodeConds) {
    const nodeId = asInt(row, 'TraitNodeID')
    const condId = asInt(row, 'TraitCondID')
    condsByNode.set(nodeId, [...(condsByNode.get(nodeId) ?? []), condId])
  }

  const groupsByNode = new Map<number, number[]>()
  for (const row of groupNodes) {
    const nodeId = asInt(row, 'TraitNodeID')
    const groupId = asInt(row, 'TraitNodeGroupID')
    groupsByNode.set(nodeId, [...(groupsByNode.get(nodeId) ?? []), groupId])
  }

  const condsByGroup = new Map<number, number[]>()
  for (const row of groupConds) {
    const groupId = asInt(row, 'TraitNodeGroupID')
    const condId = asInt(row, 'TraitCondID')
    condsByGroup.set(groupId, [...(condsByGroup.get(groupId) ?? []), condId])
  }

  const definitionById = new Map<number, { spellId: number; overridesSpellId: number }>()
  for (const row of definitions) {
    definitionById.set(asInt(row, 'ID'), {
      spellId: asInt(row, 'SpellID'),
      overridesSpellId: asInt(row, 'OverridesSpellID'),
    })
  }

  const entryById = new Map<number, { definitionId: number; maxRanks: number; subTreeId: number }>()
  for (const row of entries) {
    entryById.set(asInt(row, 'ID'), {
      definitionId: asInt(row, 'TraitDefinitionID'),
      maxRanks: asInt(row, 'MaxRanks'),
      subTreeId: asInt(row, 'TraitSubTreeID'),
    })
  }

  const entryLinksByNode = new Map<number, Array<{ entryId: number; index: number }>>()
  for (const row of nodeEntries) {
    const nodeId = asInt(row, 'TraitNodeID')
    const link = { entryId: asInt(row, 'TraitNodeEntryID'), index: asInt(row, '_Index') }
    entryLinksByNode.set(nodeId, [...(entryLinksByNode.get(nodeId) ?? []), link])
  }

  const subTreesByTree = new Map<number, SubTreeRecord[]>()
  for (const row of subTrees) {
    const treeId = asInt(row, 'TraitTreeID')
    const record = { id: asInt(row, 'ID'), name: row['Name_lang'] ?? '' }
    if (record.name.includes('[DNT]')) continue
    subTreesByTree.set(treeId, [...(subTreesByTree.get(treeId) ?? []), record])
  }

  const nodesByTree = new Map<number, SpecTraitNodeRecord[]>()
  const specSetsOfNode = (nodeId: number): number[] => {
    const direct = (condsByNode.get(nodeId) ?? [])
      .map((condId) => specSetByCond.get(condId))
      .filter((specSet): specSet is number => specSet !== undefined)
    const viaGroups = (groupsByNode.get(nodeId) ?? [])
      .flatMap((groupId) => condsByGroup.get(groupId) ?? [])
      .map((condId) => specSetByCond.get(condId))
      .filter((specSet): specSet is number => specSet !== undefined)
    return [...direct, ...viaGroups]
  }

  for (const row of nodes) {
    const treeId = asInt(row, 'TraitTreeID')
    const nodeId = asInt(row, 'ID')
    const type = asInt(row, 'Type')
    const links = (entryLinksByNode.get(nodeId) ?? []).sort((a, b) => a.index - b.index)
    const entryRecords: TraitEntryRecord[] = links.map((link) => {
      const entry = entryById.get(link.entryId)
      const definition = entry ? definitionById.get(entry.definitionId) : undefined
      return {
        entryId: link.entryId,
        definitionId: entry?.definitionId ?? 0,
        spellId: definition?.spellId ?? 0,
        overridesSpellId: definition?.overridesSpellId ?? 0,
        subTreeId: entry?.subTreeId ?? 0,
        maxRanks: entry?.maxRanks ?? 1,
        index: link.index,
      }
    })
    const kind: TraitNodeKind =
      type === NODE_TYPE_SUBTREE_SELECTION
        ? 'subtree-selection'
        : type === NODE_TYPE_CHOICE
          ? 'choice'
          : 'single'
    const record: SpecTraitNodeRecord = {
      id: nodeId,
      kind,
      maxRanks: Math.max(1, ...entryRecords.map((entry) => entry.maxRanks)),
      posX: asFloat(row, 'PosX'),
      posY: asFloat(row, 'PosY'),
      subTreeId: asInt(row, 'TraitSubTreeID'),
      forSpec: false,
      entries: entryRecords,
    }
    nodesByTree.set(treeId, [...(nodesByTree.get(treeId) ?? []), record])
  }

  const result = new Map<number, SpecTraitData>()
  for (const row of loadouts) {
    const specId = asInt(row, 'ChrSpecializationID')
    const traitTreeId = asInt(row, 'TraitTreeID')
    const treeNodes = (nodesByTree.get(traitTreeId) ?? [])
      .map((node) => ({
        ...node,
        forSpec: isNodeForSpec(specSetsOfNode(node.id), specsBySpecSet, specId),
        entries: node.entries.map((entry) => ({ ...entry })),
      }))
      .sort((a, b) => a.id - b.id)
    result.set(specId, {
      specId,
      traitTreeId,
      nodes: treeNodes,
      subTrees: subTreesByTree.get(traitTreeId) ?? [],
    })
  }
  return result
}

function isNodeForSpec(
  specSets: number[],
  specsBySpecSet: Map<number, Set<number>>,
  specId: number,
): boolean {
  if (specSets.length === 0) return true
  return specSets.some((specSet) => specsBySpecSet.get(specSet)?.has(specId) ?? false)
}
