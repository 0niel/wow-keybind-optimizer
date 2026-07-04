import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeLoadout, decodeLoadoutHeader } from '@/core/decoder'
import type { RaceRecord, SpecSnapshot } from '@/core/model/snapshot'
import examples from '@/../public/data/examples.json'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)

interface Example {
  id: string
  string: string
  mode: string
  scheme?: string
  raceSlug?: string
}

const list = examples as Example[]
const manifest = JSON.parse(readFileSync(join(DATA_ROOT, 'manifest.json'), 'utf8')) as {
  specIds: number[]
}
const races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]

describe('example presets', () => {
  it('has a diverse, non-empty set', () => {
    expect(list.length).toBeGreaterThanOrEqual(6)
    const ids = list.map((example) => example.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(list.map((example) => [example.id, example] as const))(
    'decodes example %s against the shipped snapshot',
    (_id, example) => {
      const specId = decodeLoadoutHeader(example.string).specId
      expect(manifest.specIds).toContain(specId)
      const spec = JSON.parse(
        readFileSync(join(DATA_ROOT, 'specs', `${specId}.json`), 'utf8'),
      ) as SpecSnapshot
      const decoded = decodeLoadout(
        example.string,
        spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
      )
      expect(decoded.selections.length).toBeGreaterThan(20)
      if (example.raceSlug) {
        expect(races.some((race) => race.slug === example.raceSlug)).toBe(true)
      }
    },
  )
})
