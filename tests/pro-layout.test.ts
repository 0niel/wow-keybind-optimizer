import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeLoadout } from '@/core/decoder'
import { extractAbilityPool } from '@/core/extract/ability-pool'
import { buildAssignmentProblem } from '@/core/problem/build'
import { solveAssignment, evaluateFixedAssignment, DEFAULT_MOVE_BUDGET } from '@/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '@/core/model/hardware'
import type { AssignmentProblem } from '@/core/model/ability'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'
import golden from './fixtures/decoder-golden.json'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)

const PRO_ENHANCEMENT_BINDS: Record<number, string> = {
  17364: 'KeyQ',
  60103: 'KeyE',
  188196: 'Digit1',
  188443: 'Digit2',
  470411: 'Digit3',
  187874: 'KeyR',
  470057: 'KeyT',
  57994: 'KeyF',
  108271: 'KeyZ',
  8004: 'shift+KeyE',
  2825: 'shift+KeyB',
  51514: 'shift+KeyF',
  192058: 'KeyG',
  8143: 'shift+KeyG',
  198103: 'shift+KeyR',
}

let spec: SpecSnapshot
let spellMeta: SpellMetaShard
let races: RaceRecord[]

beforeAll(() => {
  spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', '263.json'), 'utf8')) as SpecSnapshot
  spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
})

describe('pro layout sanity', () => {
  it('optimizer matches or beats an expert-style enhancement layout on the same pool', () => {
    const goldenCase = golden.cases.find((c) => c.specId === 263)
    expect(goldenCase).toBeDefined()
    if (!goldenCase) return
    const decoded = decodeLoadout(
      goldenCase.encoded,
      spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
    )
    const orc = races.find((race) => race.slug === 'orc') ?? null
    const fullPool = extractAbilityPool({
      spec,
      spellMeta,
      selections: decoded.selections,
      race: orc,
      pvpTalentIds: [],
      mode: 'mythic-plus',
      arenaTargetScheme: 'focus',
    })

    const proSpellIds = new Set(Object.keys(PRO_ENHANCEMENT_BINDS).map(Number))
    const subsetAbilities = fullPool.filter((ability) => proSpellIds.has(ability.spellId))
    expect(subsetAbilities.length).toBeGreaterThanOrEqual(10)

    const problem: AssignmentProblem = buildAssignmentProblem({
      abilities: subsetAbilities,
      spec,
      hardware: DEFAULT_HARDWARE_CONFIG,
      mode: 'mythic-plus',
      arenaTargetScheme: 'focus',
      constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
    })

    const proBinds: Record<string, string> = {}
    for (const ability of problem.abilities) {
      const slotId = PRO_ENHANCEMENT_BINDS[ability.spellId]
      if (slotId) proBinds[ability.id] = slotId
    }
    const proScore = evaluateFixedAssignment(problem, DEFAULT_HARDWARE_CONFIG, proBinds)

    const optimized = solveAssignment(problem, {
      strategyId: 'qap-annealing',
      seed: 1,
      moveBudget: DEFAULT_MOVE_BUDGET,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })

    expect(proScore).toBeGreaterThan(0)
    expect(optimized.objective).toBeGreaterThanOrEqual(proScore)
  })
})
