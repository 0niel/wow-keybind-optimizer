import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeLoadout } from '@/core/decoder'
import { extractAbilityPool, filterExcludedAbilities } from '@/core/extract/ability-pool'
import { buildAssignmentProblem } from '@/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '@/core/solver'
import { enumerateSlots } from '@/core/scoring/slots'
import { DEFAULT_HARDWARE_CONFIG } from '@/core/model/hardware'
import type { Ability, AssignmentProblem } from '@/core/model/ability'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'
import { DEFAULT_INPUTS, deserializeInputs, serializeInputs } from '@/state/inputs'
import golden from './fixtures/decoder-golden.json'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)

let spec: SpecSnapshot
let spellMeta: SpellMetaShard
let races: RaceRecord[]
let abilities: Ability[]

function buildProblem(overrides: {
  lockedBinds?: Record<string, string>
  hardware?: typeof DEFAULT_HARDWARE_CONFIG
  pool?: Ability[]
}): AssignmentProblem {
  return buildAssignmentProblem({
    abilities: overrides.pool ?? abilities,
    spec,
    hardware: overrides.hardware ?? DEFAULT_HARDWARE_CONFIG,
    mode: 'arena',
    arenaTargetScheme: 'focus',
    constraints: {
      lockedBinds: overrides.lockedBinds ?? {},
      bannedSlotIds: [],
      preservedBinds: {},
    },
  })
}

beforeAll(() => {
  spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', '263.json'), 'utf8')) as SpecSnapshot
  spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
  const goldenCase = golden.cases.find((c) => c.specId === 263)
  if (!goldenCase) throw new Error('missing golden case for 263')
  const decoded = decodeLoadout(
    goldenCase.encoded,
    spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
  )
  abilities = extractAbilityPool({
    spec,
    spellMeta,
    selections: decoded.selections,
    race: races.find((race) => race.slug === 'orc') ?? null,
    pvpTalentIds: spec.pvpTalents.slice(0, 3).map((talent) => talent.id),
    mode: 'arena',
    arenaTargetScheme: 'focus',
  })
})

describe('key priorities', () => {
  it('boost opts an unlisted key into the slot pool at top tier', () => {
    const hardware = {
      ...DEFAULT_HARDWARE_CONFIG,
      keyPriorities: { KeyO: 'boost' as const },
    }
    const slots = enumerateSlots(hardware)
    const boosted = slots.find((slot) => slot.id === 'KeyO')
    expect(boosted).toBeDefined()
    expect(boosted?.tier).toBe(1)
  })

  it('lower reduces a listed key tier and ban still wins', () => {
    const hardware = {
      ...DEFAULT_HARDWARE_CONFIG,
      bannedKeyIds: ['KeyT'],
      keyPriorities: { KeyG: 'lower' as const, KeyT: 'boost' as const },
    }
    const slots = enumerateSlots(hardware)
    expect(slots.find((slot) => slot.id === 'KeyG')?.tier).toBeCloseTo(0.78 * 0.45, 5)
    expect(slots.find((slot) => slot.id === 'KeyT')).toBeUndefined()
  })
})

describe('pinned binds', () => {
  it('the solver honors a pin even on a modifier slot for a panic ability', () => {
    const trinket = abilities.find((ability) => ability.id === 'trinket:pvp')
    expect(trinket).toBeDefined()
    const problem = buildProblem({ lockedBinds: { 'trinket:pvp': 'shift+KeyX' } })
    const result = solveAssignment(problem, {
      strategyId: 'qap-annealing',
      seed: 1,
      moveBudget: DEFAULT_MOVE_BUDGET,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })
    const assignment = result.assignments.find((bind) => bind.abilityId === 'trinket:pvp')
    expect(assignment?.slotId).toBe('shift+KeyX')
    const occupants = result.assignments.filter((bind) => bind.slotId === 'shift+KeyX')
    expect(occupants).toHaveLength(1)
  })

  it('pins survive across all variant seeds', () => {
    const interrupt = abilities.find(
      (ability) => ability.category === 'interrupt' && ability.variantKind === 'base',
    )
    expect(interrupt).toBeDefined()
    if (!interrupt) return
    const problem = buildProblem({ lockedBinds: { [interrupt.id]: 'KeyC' } })
    for (const seed of [1, 2, 3, 4]) {
      const result = solveAssignment(problem, {
        strategyId: 'qap-annealing',
        seed,
        moveBudget: DEFAULT_MOVE_BUDGET,
        hardware: DEFAULT_HARDWARE_CONFIG,
      })
      expect(result.assignments.find((bind) => bind.abilityId === interrupt.id)?.slotId).toBe('KeyC')
    }
  })

  it('sanitizes pins to unknown abilities, unknown slots, and duplicate slots', () => {
    const first = abilities[0]
    const second = abilities[1]
    expect(first && second).toBeTruthy()
    if (!first || !second) return
    const problem = buildProblem({
      lockedBinds: {
        'spell:999999999': 'KeyQ',
        [first.id]: 'shift+KeyO',
        [second.id]: 'KeyE',
        [abilities[2]?.id ?? 'x']: 'KeyE',
      },
    })
    expect(problem.constraints.lockedBinds['spell:999999999']).toBeUndefined()
    expect(problem.constraints.lockedBinds[first.id]).toBeUndefined()
    expect(problem.constraints.lockedBinds[second.id]).toBe('KeyE')
    expect(Object.values(problem.constraints.lockedBinds).filter((slot) => slot === 'KeyE')).toHaveLength(1)
  })
})

describe('excluded abilities', () => {
  it('removes the ability and its variants from the pool', () => {
    const interrupt = abilities.find(
      (ability) => ability.category === 'interrupt' && ability.variantKind === 'base',
    )
    expect(interrupt).toBeDefined()
    if (!interrupt) return
    const filtered = filterExcludedAbilities(abilities, [interrupt.id])
    expect(filtered.some((ability) => ability.id === interrupt.id)).toBe(false)
    expect(filtered.some((ability) => ability.baseAbilityId === interrupt.id)).toBe(false)
    expect(filtered.length).toBeLessThan(abilities.length)
  })
})

describe('inputs serialization', () => {
  it('round-trips priorities, pins, and exclusions through the URL', () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      importString: 'CcQA',
      hardware: {
        ...DEFAULT_HARDWARE_CONFIG,
        keyPriorities: { KeyO: 'boost' as const, KeyZ: 'lower' as const },
      },
      pinnedBinds: { 'spell:51490': 'shift+KeyQ', 'trinket:1': 'KeyF' },
      excludedAbilityIds: ['spell:2645', 'focus:set'],
    }
    const restored = deserializeInputs(serializeInputs(inputs))
    expect(restored.hardware.keyPriorities).toEqual(inputs.hardware.keyPriorities)
    expect(restored.pinnedBinds).toEqual(inputs.pinnedBinds)
    expect(restored.excludedAbilityIds).toEqual(inputs.excludedAbilityIds)
  })
})
