import { describe, expect, it } from 'vitest'
import {
  BitReader,
  BitWriter,
  LoadoutDecodeError,
  SUPPORTED_SERIALIZATION_VERSION,
  decodeLoadout,
  decodeLoadoutHeader,
  encodeLoadout,
} from '@/core/decoder'
import type { NodeSelection, OrderedTraitNode } from '@/core/decoder'
import { mulberry32, randomInt } from '@/core/random'

function buildSyntheticTree(nodeCount: number, seed: number): OrderedTraitNode[] {
  const rng = mulberry32(seed)
  const nodes: OrderedTraitNode[] = []
  let id = 100
  for (let i = 0; i < nodeCount; i++) {
    id += 1 + randomInt(rng, 40)
    const roll = rng()
    if (roll < 0.2) {
      nodes.push({ id, kind: 'choice', maxRanks: 1 })
    } else if (roll < 0.25) {
      nodes.push({ id, kind: 'subtree-selection', maxRanks: 1 })
    } else {
      nodes.push({ id, kind: 'single', maxRanks: 1 + randomInt(rng, 3) })
    }
  }
  return nodes
}

function buildRandomSelections(nodes: readonly OrderedTraitNode[], seed: number): NodeSelection[] {
  const rng = mulberry32(seed)
  const selections: NodeSelection[] = []
  for (const node of nodes) {
    const roll = rng()
    if (roll < 0.45) continue
    if (roll < 0.55) {
      selections.push({ nodeId: node.id, purchased: false, granted: true, ranks: node.maxRanks, choiceIndex: null })
      continue
    }
    const partial = node.maxRanks > 1 && rng() < 0.4
    const ranks = partial ? 1 + randomInt(rng, node.maxRanks - 1) : node.maxRanks
    const choiceIndex = node.kind === 'single' ? null : randomInt(rng, 2)
    selections.push({ nodeId: node.id, purchased: true, granted: false, ranks, choiceIndex })
  }
  return selections
}

describe('bit stream', () => {
  it('packs values LSB-first within six-bit characters', () => {
    const writer = new BitWriter()
    writer.writeBits(2, 8)
    expect(writer.toString()[0]).toBe('C')
  })

  it('reads back multi-bit values across character boundaries', () => {
    const writer = new BitWriter()
    writer.writeBits(2, 8)
    writer.writeBits(253, 16)
    writer.writeBits(0b101, 3)
    const reader = new BitReader(writer.toString())
    expect(reader.readBits(8)).toBe(2)
    expect(reader.readBits(16)).toBe(253)
    expect(reader.readBits(3)).toBe(0b101)
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => new BitReader('AB*C')).toThrowError(LoadoutDecodeError)
  })

  it('rejects reads past the end of the stream', () => {
    const reader = new BitReader('A')
    expect(() => reader.readBits(7)).toThrowError(LoadoutDecodeError)
  })
})

describe('loadout header', () => {
  it('matches the documented worked example for version 2 spec 253', () => {
    const encoded = encodeLoadout({ specId: 253 }, [], [])
    expect(encoded.startsWith('C0')).toBe(true)
    const header = decodeLoadoutHeader(encoded)
    expect(header.serializationVersion).toBe(SUPPORTED_SERIALIZATION_VERSION)
    expect(header.specId).toBe(253)
    expect(header.treeHash).toHaveLength(16)
    expect(header.treeHash.every((byte) => byte === 0)).toBe(true)
  })

  it('rejects empty input', () => {
    expect(() => decodeLoadoutHeader('')).toThrowError(LoadoutDecodeError)
  })
})

describe('loadout round-trip', () => {
  it.each([1, 2, 3, 4, 5])('encodes and decodes an identical selection set (seed %i)', (seed) => {
    const nodes = buildSyntheticTree(80, seed)
    const selections = buildRandomSelections(nodes, seed * 31)
    const encoded = encodeLoadout({ specId: 263 }, selections, nodes)
    const decoded = decodeLoadout(encoded, nodes)
    expect(decoded.header.specId).toBe(263)
    expect(decoded.selections).toEqual(selections)
  })

  it('treats granted nodes as unpurchased with full ranks', () => {
    const nodes: OrderedTraitNode[] = [{ id: 5, kind: 'single', maxRanks: 2 }]
    const selections: NodeSelection[] = [
      { nodeId: 5, purchased: false, granted: true, ranks: 2, choiceIndex: null },
    ]
    const decoded = decodeLoadout(encodeLoadout({ specId: 63 }, selections, nodes), nodes)
    expect(decoded.selections).toEqual(selections)
  })
})

describe('loadout validation', () => {
  const nodes = buildSyntheticTree(40, 7)
  const selections = buildRandomSelections(nodes, 11)
  const encoded = encodeLoadout({ specId: 71 }, selections, nodes)

  it('rejects unsupported serialization versions', () => {
    const writer = new BitWriter()
    writer.writeBits(3, 8)
    writer.writeBits(71, 16)
    for (let i = 0; i < 16; i++) writer.writeBits(0, 8)
    expect(() => decodeLoadout(writer.toString(), nodes)).toThrowError(/version 3/)
  })

  it('rejects truncated strings', () => {
    expect(() => decodeLoadout(encoded.slice(0, 20), nodes)).toThrowError(LoadoutDecodeError)
  })

  it('rejects decoding against a longer node list than the string encodes', () => {
    const extended = [...nodes, ...buildSyntheticTree(30, 99).map((n) => ({ ...n, id: n.id + 10_000 }))]
    expect(() => decodeLoadout(encoded, extended)).toThrowError(LoadoutDecodeError)
  })

  it('rejects decoding against a shorter node list than the string encodes', () => {
    expect(() => decodeLoadout(encoded, nodes.slice(0, 10))).toThrowError(LoadoutDecodeError)
  })

  it('rejects rank counts above the node maximum', () => {
    const singleNode: OrderedTraitNode[] = [{ id: 9, kind: 'single', maxRanks: 3 }]
    const writer = new BitWriter()
    writer.writeBits(2, 8)
    writer.writeBits(71, 16)
    for (let i = 0; i < 16; i++) writer.writeBits(0, 8)
    writer.writeFlag(true)
    writer.writeFlag(true)
    writer.writeFlag(true)
    writer.writeBits(5, 6)
    writer.writeFlag(false)
    expect(() => decodeLoadout(writer.toString(), singleNode)).toThrowError(/ranks/)
  })
})
