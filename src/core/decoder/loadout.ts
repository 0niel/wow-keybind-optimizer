import { BitReader, BitWriter } from './bit-stream'
import { LoadoutDecodeError } from './errors'
import type { DecodedLoadout, LoadoutHeader, NodeSelection, OrderedTraitNode } from './types'

export const SUPPORTED_SERIALIZATION_VERSION = 2

const VERSION_BITS = 8
const SPEC_ID_BITS = 16
const TREE_HASH_BYTES = 16
const RANKS_BITS = 6
const CHOICE_INDEX_BITS = 2

export function decodeLoadoutHeader(encoded: string): LoadoutHeader {
  const reader = new BitReader(encoded)
  return readHeader(reader)
}

export function decodeLoadout(encoded: string, orderedNodes: readonly OrderedTraitNode[]): DecodedLoadout {
  const reader = new BitReader(encoded)
  const header = readHeader(reader)
  if (header.serializationVersion !== SUPPORTED_SERIALIZATION_VERSION) {
    throw new LoadoutDecodeError(
      'unsupported-version',
      `Serialization version ${header.serializationVersion} is not supported (expected ${SUPPORTED_SERIALIZATION_VERSION})`,
    )
  }
  const selections: NodeSelection[] = []
  for (const node of orderedNodes) {
    const selection = readNodeSelection(reader, node)
    if (selection !== null) {
      selections.push(selection)
    }
  }
  reader.assertOnlyZeroPaddingRemains()
  return { header, selections }
}

export function encodeLoadout(
  header: Pick<LoadoutHeader, 'specId'>,
  selections: readonly NodeSelection[],
  orderedNodes: readonly OrderedTraitNode[],
): string {
  const writer = new BitWriter()
  writer.writeBits(SUPPORTED_SERIALIZATION_VERSION, VERSION_BITS)
  writer.writeBits(header.specId, SPEC_ID_BITS)
  for (let i = 0; i < TREE_HASH_BYTES; i++) {
    writer.writeBits(0, 8)
  }
  const selectionByNodeId = new Map(selections.map((s) => [s.nodeId, s]))
  for (const node of orderedNodes) {
    writeNodeSelection(writer, node, selectionByNodeId.get(node.id))
  }
  return writer.toString()
}

function readHeader(reader: BitReader): LoadoutHeader {
  const serializationVersion = reader.readBits(VERSION_BITS)
  const specId = reader.readBits(SPEC_ID_BITS)
  const treeHash: number[] = []
  for (let i = 0; i < TREE_HASH_BYTES; i++) {
    treeHash.push(reader.readBits(8))
  }
  return { serializationVersion, specId, treeHash }
}

function readNodeSelection(reader: BitReader, node: OrderedTraitNode): NodeSelection | null {
  const isSelected = reader.readFlag()
  if (!isSelected) return null

  const isPurchased = reader.readFlag()
  if (!isPurchased) {
    return { nodeId: node.id, purchased: false, granted: true, ranks: node.maxRanks, choiceIndex: null }
  }

  const isPartiallyRanked = reader.readFlag()
  let ranks = node.maxRanks
  if (isPartiallyRanked) {
    ranks = reader.readBits(RANKS_BITS)
    if (ranks > node.maxRanks) {
      throw new LoadoutDecodeError(
        'rank-overflow',
        `Node ${node.id} claims ${ranks} ranks but allows at most ${node.maxRanks}`,
      )
    }
  }

  const isChoiceNode = reader.readFlag()
  let choiceIndex: number | null = null
  if (isChoiceNode) {
    choiceIndex = reader.readBits(CHOICE_INDEX_BITS)
  }
  return { nodeId: node.id, purchased: true, granted: false, ranks, choiceIndex }
}

function writeNodeSelection(
  writer: BitWriter,
  node: OrderedTraitNode,
  selection: NodeSelection | undefined,
): void {
  if (selection === undefined) {
    writer.writeFlag(false)
    return
  }
  writer.writeFlag(true)
  writer.writeFlag(selection.purchased)
  if (!selection.purchased) return

  const isPartiallyRanked = selection.ranks < node.maxRanks
  writer.writeFlag(isPartiallyRanked)
  if (isPartiallyRanked) {
    writer.writeBits(selection.ranks, RANKS_BITS)
  }
  const isChoiceNode = selection.choiceIndex !== null
  writer.writeFlag(isChoiceNode)
  if (selection.choiceIndex !== null) {
    writer.writeBits(selection.choiceIndex, CHOICE_INDEX_BITS)
  }
}
