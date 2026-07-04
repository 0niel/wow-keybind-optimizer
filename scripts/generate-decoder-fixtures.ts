import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createWagoSource } from './lib/wago'
import { buildTraitData } from './snapshot/traits'
import { decodeLoadout, decodeLoadoutHeader } from '../src/core/decoder'

const STRINGS: Array<[string, string]> = [
  ['enhancement-raid-totemic', 'CcQAAAAAAAAAAAAAAAAAAAAAAMzMjZmZmZmZmZmZGzAAAAAAAAAALwGMjFN2GAzA2AYWmxMzYZZGYmZjlZmZGGGzAAMDwYmJmZAgxA'],
  ['enhancement-mplus-stormbringer', 'CcQAAAAAAAAAAAAAAAAAAAAAAMzMzYMzMzMzMzMzMzAAAAAAAAAsBYzMG2gFYGGawCAzyMmxYZZGYmZbsMzMzMGLMDAghxMYEYmBDGXA'],
  ['frost-mage-single-target', 'CAEAAAAAAAAAAAAAAAAAAAAAAYGGLzMzsMmZmYmZmZMjZWMzMzMjZAAAgZmZWWmZaDAAAAAAsBw22YmZGMLzDYMDLAAAMzCwMwAmBD'],
  ['devourer-single-target', 'CgcBAAAAAAAAAAAAAAAAAAAAAAA2MmZmZmZmxwMAAAAAAAegxsNYGAAAAAAAAmxMMzMzMzMzMDzsYGjFZhZmZmt2mZmBwwAQgZMYMD'],
  ['assassination-single-target', 'CMQAAAAAAAAAAAAAAAAAAAAAAYmlxsZwAAAAAAzyglZAAAAAAttNzMzMzMGzMzMbzsMzMDmZmZmxMDjBwALwMGNmFALDYzAgZmBD'],
  ['holy-paladin-raid', 'CEEAAAAAAAAAAAAAAAAAAAAAAAAAAYBAMAAglxMzYGzMzGjxYWGbzMLmpJmlZMzMMMbZAYAYDsZWmxMLz2Mzs1AAAAsAAbMGDzMAAwMDzYMMA'],
]

async function main() {
  const source = createWagoSource('12.0.7.68367')
  const traitData = await buildTraitData(source)
  const specNodes: Record<string, Array<{ id: number; kind: string; maxRanks: number }>> = {}
  const cases = STRINGS.map(([label, encoded]) => {
    const header = decodeLoadoutHeader(encoded)
    const spec = traitData.get(header.specId)
    if (!spec) throw new Error(`No trait data for spec ${header.specId}`)
    specNodes[String(header.specId)] ??= spec.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      maxRanks: node.maxRanks,
    }))
    const decoded = decodeLoadout(encoded, spec.nodes)
    const heroSubTrees = decoded.selections
      .map((selection) => {
        const node = spec.nodes.find((n) => n.id === selection.nodeId)
        if (node?.kind !== 'subtree-selection' || selection.choiceIndex === null) return null
        return node.entries[selection.choiceIndex]?.subTreeId ?? null
      })
      .filter((id): id is number => id !== null)
    return {
      label,
      encoded,
      specId: header.specId,
      expected: {
        selected: decoded.selections.length,
        purchased: decoded.selections.filter((s) => s.purchased).length,
        granted: decoded.selections.filter((s) => s.granted).length,
        choices: decoded.selections.filter((s) => s.choiceIndex !== null).length,
        heroSubTrees,
      },
    }
  })
  const outDir = join(process.cwd(), 'tests', 'fixtures')
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    join(outDir, 'decoder-golden.json'),
    JSON.stringify({ build: source.build, cases, specNodes }, null, 1),
    'utf8',
  )
  console.log(`wrote ${cases.length} golden cases for ${Object.keys(specNodes).length} specs`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
