import { describe, expect, it } from 'vitest'
import { decodeLoadout, decodeLoadoutHeader } from '@/core/decoder'
import type { OrderedTraitNode } from '@/core/decoder'
import golden from './fixtures/decoder-golden.json'

interface GoldenCase {
  label: string
  encoded: string
  specId: number
  expected: {
    selected: number
    purchased: number
    granted: number
    choices: number
    heroSubTrees: number[]
  }
}

const cases = golden.cases as GoldenCase[]
const specNodes = golden.specNodes as Record<string, OrderedTraitNode[]>

describe('decoder against live 12.0.7 export strings', () => {
  it.each(cases.map((c) => [c.label, c] as const))('decodes %s', (_label, goldenCase) => {
    const header = decodeLoadoutHeader(goldenCase.encoded)
    expect(header.serializationVersion).toBe(2)
    expect(header.specId).toBe(goldenCase.specId)

    const nodes = specNodes[String(goldenCase.specId)]
    expect(nodes).toBeDefined()
    const decoded = decodeLoadout(goldenCase.encoded, nodes ?? [])

    expect(decoded.selections).toHaveLength(goldenCase.expected.selected)
    expect(decoded.selections.filter((s) => s.purchased)).toHaveLength(goldenCase.expected.purchased)
    expect(decoded.selections.filter((s) => s.granted)).toHaveLength(goldenCase.expected.granted)
    expect(decoded.selections.filter((s) => s.choiceIndex !== null)).toHaveLength(
      goldenCase.expected.choices,
    )
  })

  it('covers at least five distinct classes worth of specs', () => {
    const specIds = new Set(cases.map((c) => c.specId))
    expect(specIds.size).toBeGreaterThanOrEqual(5)
  })
})
