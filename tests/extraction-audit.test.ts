import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { NodeSelection } from '@/core/decoder'
import { decodeLoadout, decodeLoadoutHeader } from '@/core/decoder'
import { extractAbilityPool } from '@/core/extract/ability-pool'
import examples from '@/../public/data/examples.json'
import { scoreImportance } from '@/core/scoring/importance'
import type { GameMode } from '@/core/model/ability'
import type { RaceRecord, SpecSnapshot, SpellMetaShard, SpellTextShard } from '@/core/model/snapshot'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)

let spellMeta: SpellMetaShard
let races: RaceRecord[]
let textEn: SpellTextShard
let textRu: SpellTextShard

function fullBuildSelections(spec: SpecSnapshot): NodeSelection[] {
  const selections: NodeSelection[] = []
  let heroSubTreeId: number | null = null
  for (const node of spec.nodes) {
    if (node.kind === 'subtree-selection' && node.forSpec && heroSubTreeId === null) {
      const entry = node.entries[0]
      if (entry) {
        heroSubTreeId = entry.subTreeId
        selections.push({ nodeId: node.id, purchased: true, granted: false, ranks: 1, choiceIndex: 0 })
      }
    }
  }
  for (const node of spec.nodes) {
    if (!node.forSpec || node.kind === 'subtree-selection' || node.entries.length === 0) continue
    if (node.subTreeId > 0 && node.subTreeId !== heroSubTreeId) continue
    selections.push({
      nodeId: node.id,
      purchased: true,
      granted: false,
      ranks: node.maxRanks,
      choiceIndex: node.kind === 'choice' ? 0 : null,
    })
  }
  return selections
}

const specFiles = readdirSync(join(DATA_ROOT, 'specs')).filter((file) => file.endsWith('.json'))

beforeAll(() => {
  spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
  textEn = (JSON.parse(readFileSync(join(DATA_ROOT, 'text', 'en.json'), 'utf8')) as { spells: SpellTextShard }).spells
  textRu = (JSON.parse(readFileSync(join(DATA_ROOT, 'text', 'ru.json'), 'utf8')) as { spells: SpellTextShard }).spells
})

describe('extraction audit: every spec produces a complete, renderable pool', () => {
  it.each(specFiles)('%s', (file) => {
    const spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', file), 'utf8')) as SpecSnapshot
    const race = races.find((candidate) => candidate.slug === 'orc') ?? null
    const selections = fullBuildSelections(spec)

    for (const mode of ['mythic-plus', 'arena'] as GameMode[]) {
      const pool = scoreImportance(
        extractAbilityPool({
          spec,
          spellMeta,
          selections,
          race,
          pvpTalentIds: spec.pvpTalents.slice(0, 3).map((talent) => talent.id),
          mode,
          arenaTargetScheme: 'arena123',
        }),
        mode,
      )
      const base = pool.filter((ability) => ability.variantKind === 'base')
      const context = `spec ${spec.specId} ${mode}`

      expect(base.length, `${context} pool too small — abilities are missing`).toBeGreaterThanOrEqual(10)
      expect(base.length, `${context} pool suspiciously large — junk spells leaking`).toBeLessThanOrEqual(95)

      const trinkets = pool.filter((ability) => ability.category === 'trinket')
      expect(trinkets.length, `${context} trinket count`).toBe(mode === 'arena' ? 2 : 1)

      const targeting = pool.filter((ability) => ability.category === 'targeting')
      expect(targeting.length, `${context} targeting bind count`).toBe(mode === 'arena' ? 3 : 0)

      const spellIds = base.filter((ability) => ability.spellId > 0).map((ability) => ability.spellId)
      expect(new Set(spellIds).size, `${context} duplicate spellIds in pool`).toBe(spellIds.length)

      for (const ability of base) {
        if (ability.spellId === 0) continue
        const id = String(ability.spellId)
        expect(spellMeta[id]?.icon, `${context} ${id} has no icon`).toBeTruthy()
        expect(textEn[id]?.name, `${context} ${id} has no English name`).toBeTruthy()
        expect(textRu[id]?.name, `${context} ${id} has no Russian name`).toBeTruthy()
        expect(Number.isFinite(ability.importance), `${context} ${id} importance is not finite`).toBe(true)
      }
    }
  })
})

interface Example {
  id: string
  string: string
}

const SIGNATURE_ABILITIES: Record<string, string[]> = {
  'elemental-arena': ['Lava Burst', 'Lightning Bolt', 'Earthquake', 'Wind Shear', 'Healing Stream Totem', 'Astral Shift'],
  'enhancement-mplus': ['Lava Lash', 'Wind Shear', 'Crash Lightning', 'Astral Shift', 'Sundering'],
  'holy-paladin-raid': ['Holy Shock', 'Divine Shield', 'Blessing of Freedom', 'Hammer of Justice'],
  'frost-mage-raid': ['Ice Lance', 'Frost Nova', 'Counterspell', 'Ice Block', 'Frostbolt', 'Polymorph'],
}

describe('signature abilities never go missing from real builds', () => {
  it.each(Object.entries(SIGNATURE_ABILITIES))('%s contains its core castables', (exampleId, expectedNames) => {
    const example = (examples as Example[]).find((entry) => entry.id === exampleId)
    expect(example, `example ${exampleId} not found`).toBeDefined()
    if (!example) return
    const specId = decodeLoadoutHeader(example.string).specId
    const spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', `${specId}.json`), 'utf8')) as SpecSnapshot
    const decoded = decodeLoadout(
      example.string,
      spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
    )
    const pool = extractAbilityPool({
      spec,
      spellMeta,
      selections: decoded.selections,
      race: null,
      pvpTalentIds: [],
      mode: 'mythic-plus',
      arenaTargetScheme: 'focus',
    })
    const names = new Set(
      pool
        .filter((ability) => ability.spellId > 0)
        .map((ability) => textEn[String(ability.spellId)]?.name)
        .filter((name): name is string => Boolean(name)),
    )
    for (const expected of expectedNames) {
      expect(names.has(expected), `${exampleId} is missing "${expected}"`).toBe(true)
    }
  })
})
