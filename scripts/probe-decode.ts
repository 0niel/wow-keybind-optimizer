import { createWagoSource } from './lib/wago'
import { buildTraitData } from './snapshot/traits'
import { decodeLoadout, decodeLoadoutHeader } from '../src/core/decoder'

const STRINGS: Array<[string, string]> = [
  ['raid-totemic', 'CcQAAAAAAAAAAAAAAAAAAAAAAMzMjZmZmZmZmZmZGzAAAAAAAAAALwGMjFN2GAzA2AYWmxMzYZZGYmZjlZmZGGGzAAMDwYmJmZAgxA'],
  ['mplus-totemic', 'CcQAAAAAAAAAAAAAAAAAAAAAAMzMjZmZmZmZmZmZGzAAAAAAAAAALwGMjFN2GAzA2AYWmxMGLLGYmZbsMzMzMYZMDAAwYMjYmBYwYA'],
  ['mplus-stormbringer', 'CcQAAAAAAAAAAAAAAAAAAAAAAMzMzYMzMzMzMzMzMzAAAAAAAAAsBYzMG2gFYGGawCAzyMmxYZZGYmZbsMzMzMGLMDAghxMYEYmBDGXA'],
  ['delves-totemic', 'CcQAAAAAAAAAAAAAAAAAAAAAAMzMjZmZmZmZmZmZGzAAAAAAAAAALwGMjFN2GAzA2AYWmxMGLLzAzMGLmZmZMWYGAADMGzMxMDAMGA'],
  ['frost-mage-st', 'CAEAAAAAAAAAAAAAAAAAAAAAAYGGLzMzsMmZmYmZmZMjZWMzMzMjZAAAgZmZWWmZaDAAAAAAsBw22YmZGMLzDYMDLAAAMzCwMwAmBD'],
  ['frost-mage-aoe', 'CAEAAAAAAAAAAAAAAAAAAAAAAYGGLzMzsMmZmYmxMzMzMziZmZMjZAAAgZmZWWmZaDAA2AAAAWAYbbMzMDmthxMsAAAwMbAzADYGMA'],
  ['devourer-st', 'CgcBAAAAAAAAAAAAAAAAAAAAAAA2MmZmZmZmxwMAAAAAAAegxsNYGAAAAAAAAmxMMzMzMzMzMDzsYGjFZhZmZmt2mZmBwwAQgZMYMD'],
  ['devourer-delves', 'CgcBAAAAAAAAAAAAAAAAAAAAAAA2MmZmZmZmxwMAAAAAAAmxAmBAAAAAAAgZMDzMzMzMzMzwMbzMGbyGACYAGzMzsMzMNbzsNzMGzA'],
  ['assa-rogue-st', 'CMQAAAAAAAAAAAAAAAAAAAAAAYmlxsZwAAAAAAzyglZAAAAAAttNzMzMzMGzMzMbzsMzMDmZmZmxMDjBwALwMGNmFALDYzAgZmBD'],
  ['holy-paladin-raid', 'CEEAAAAAAAAAAAAAAAAAAAAAAAAAAYBAMAAglxMzYGzMzGjxYWGbzMLmpJmlZMzMMMbZAYAYDsZWmxMLz2Mzs1AAAAsAAbMGDzMAAwMDzYMMA'],
  ['holy-paladin-mplus', 'CEEAAAAAAAAAAAAAAAAAAAAAAAAAAMLAgZAAglxMzMzYmZWgxwyYbmZxMNxsMjZmhhZLDADAbgNWmZmZZ2mZmtGAAAgF2YGsBMMAAAzMMjxwA'],
]

async function main() {
  const source = createWagoSource('12.0.7.68367')
  const traitData = await buildTraitData(source)
  console.log(`specs with trees: ${traitData.size}`)
  for (const [label, encoded] of STRINGS) {
    const header = decodeLoadoutHeader(encoded)
    console.log(`${label}: version=${header.serializationVersion} specId=${header.specId}`)
    const spec = traitData.get(header.specId)
    if (!spec) {
      console.log(`  no trait data for spec ${header.specId}`)
      continue
    }
    try {
      const decoded = decodeLoadout(encoded, spec.nodes)
      const purchased = decoded.selections.filter((s) => s.purchased)
      const granted = decoded.selections.filter((s) => s.granted)
      const choices = decoded.selections.filter((s) => s.choiceIndex !== null)
      const subTreePicks = decoded.selections
        .map((s) => {
          const node = spec.nodes.find((n) => n.id === s.nodeId)
          if (node?.kind !== 'subtree-selection' || s.choiceIndex === null) return null
          return node.entries[s.choiceIndex]?.subTreeId ?? null
        })
        .filter((id): id is number => id !== null)
      console.log(
        `  ok: nodes=${spec.nodes.length} selected=${decoded.selections.length} purchased=${purchased.length} granted=${granted.length} choices=${choices.length} heroSubTree=${subTreePicks.join(',')}`,
      )
    } catch (error) {
      console.log(`  DECODE FAILED: ${(error as Error).message}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
