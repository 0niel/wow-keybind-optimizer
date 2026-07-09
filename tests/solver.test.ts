import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeLoadout } from '@/core/decoder'
import { extractAbilityPool } from '@/core/extract/ability-pool'
import { buildAssignmentProblem } from '@/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '@/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '@/core/model/hardware'
import type { AssignmentProblem, GameMode } from '@/core/model/ability'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'
import golden from './fixtures/decoder-golden.json'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)

let spec: SpecSnapshot
let spellMeta: SpellMetaShard
let races: RaceRecord[]

function buildProblem(mode: GameMode, arenaScheme: 'focus' | 'arena123' = 'focus'): AssignmentProblem {
  const goldenCase = golden.cases.find((c) => c.specId === 263)
  if (!goldenCase) throw new Error('missing golden case for 263')
  const decoded = decodeLoadout(
    goldenCase.encoded,
    spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
  )
  const orc = races.find((race) => race.slug === 'orc') ?? null
  const abilities = extractAbilityPool({
    spec,
    spellMeta,
    selections: decoded.selections,
    race: orc,
    pvpTalentIds: spec.pvpTalents.slice(0, 3).map((talent) => talent.id),
    mode,
    arenaTargetScheme: arenaScheme,
  })
  return buildAssignmentProblem({
    abilities,
    spec,
    hardware: DEFAULT_HARDWARE_CONFIG,
    mode,
    arenaTargetScheme: arenaScheme,
    constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
  })
}

beforeAll(() => {
  spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', '263.json'), 'utf8')) as SpecSnapshot
  spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
})

describe('extraction', () => {
  it('builds a plausible enhancement pool for mythic plus', () => {
    const problem = buildProblem('mythic-plus')
    expect(problem.abilities.length).toBeGreaterThan(25)
    expect(problem.abilities.length).toBeLessThan(80)
    const categories = new Set(problem.abilities.map((ability) => ability.category))
    expect(categories.has('interrupt')).toBe(true)
    expect(categories.has('defensive-major')).toBe(true)
    expect(categories.has('trinket')).toBe(true)
  })

  it('spawns focus variants for interrupts in arena mode', () => {
    const problem = buildProblem('arena', 'focus')
    const focusVariants = problem.abilities.filter((ability) => ability.variantKind === 'focus')
    expect(focusVariants.length).toBeGreaterThan(0)
    for (const variant of focusVariants) {
      expect(variant.baseAbilityId).not.toBeNull()
    }
  })

  it('spawns arena123 triplets under the arena123 scheme', () => {
    const problem = buildProblem('arena', 'arena123')
    expect(problem.arenaTriplets.length).toBeGreaterThan(0)
    for (const triplet of problem.arenaTriplets) {
      expect(triplet).toHaveLength(3)
    }
  })
})

describe('solver', () => {
  it('satisfies hard constraints in every mode', () => {
    for (const mode of ['raid', 'mythic-plus', 'arena'] as GameMode[]) {
      const problem = buildProblem(mode)
      const result = solveAssignment(problem, {
        strategyId: 'qap-annealing',
        seed: 42,
        moveBudget: 40_000,
        hardware: DEFAULT_HARDWARE_CONFIG,
      })
      const slotById = new Map(problem.slots.map((slot) => [slot.id, slot]))
      const abilityById = new Map(problem.abilities.map((ability) => [ability.id, ability]))
      const usedSlots = new Set<string>()
      for (const bind of result.assignments) {
        expect(usedSlots.has(bind.slotId)).toBe(false)
        usedSlots.add(bind.slotId)
        const ability = abilityById.get(bind.abilityId)
        const slot = slotById.get(bind.slotId)
        expect(ability).toBeDefined()
        expect(slot).toBeDefined()
        if (!ability || !slot) continue
        if (ability.panic >= 0.95) expect(slot.modifier).toBe('none')
        if (ability.frequency >= 0.5 && !slot.isMouse) {
          expect(slot.tier).toBeGreaterThanOrEqual(0.55)
        }
      }
    }
  })

  it('is deterministic for a fixed seed', () => {
    const problem = buildProblem('mythic-plus')
    const a = solveAssignment(problem, {
      strategyId: 'qap-annealing',
      seed: 7,
      moveBudget: 30_000,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })
    const b = solveAssignment(buildProblem('mythic-plus'), {
      strategyId: 'qap-annealing',
      seed: 7,
      moveBudget: 30_000,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })
    expect(a.objective).toBe(b.objective)
    expect(a.assignments).toEqual(b.assignments)
  })

  it('beats or matches greedy on the full objective', () => {
    for (const mode of ['raid', 'mythic-plus', 'arena'] as GameMode[]) {
      const problem = buildProblem(mode)
      const greedy = solveAssignment(problem, {
        strategyId: 'greedy',
        seed: 1,
        moveBudget: 0,
        hardware: DEFAULT_HARDWARE_CONFIG,
      })
      const qap = solveAssignment(buildProblem(mode), {
        strategyId: 'qap-annealing',
        seed: 1,
        moveBudget: 40_000,
        hardware: DEFAULT_HARDWARE_CONFIG,
      })
      expect(qap.objective).toBeGreaterThanOrEqual(greedy.objective)
    }
  })

  it('assigns every ability with the default budget in under a second', () => {
    const problem = buildProblem('arena', 'arena123')
    const start = performance.now()
    const result = solveAssignment(problem, {
      strategyId: 'qap-annealing',
      seed: 3,
      moveBudget: DEFAULT_MOVE_BUDGET,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })
    const elapsed = performance.now() - start
    expect(result.assignments.length).toBe(problem.abilities.length)
    expect(elapsed).toBeLessThan(1000)
  })

  it('keeps most shared abilities on preserved keys when re-solving another mode', () => {
    const base = buildProblem('mythic-plus')
    const baseResult = solveAssignment(base, {
      strategyId: 'qap-annealing',
      seed: 5,
      moveBudget: 40_000,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })
    const preserved: Record<string, string> = {}
    for (const bind of baseResult.assignments) preserved[bind.abilityId] = bind.slotId
    const arenaProblem: AssignmentProblem = {
      ...buildProblem('arena'),
      constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: preserved },
    }
    const arenaResult = solveAssignment(arenaProblem, {
      strategyId: 'qap-annealing',
      seed: 5,
      moveBudget: 40_000,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })
    const shared = arenaResult.assignments.filter(
      (bind) => preserved[bind.abilityId] !== undefined,
    )
    expect(shared.length).toBeGreaterThan(10)
    const kept = shared.filter((bind) => bind.slotId === preserved[bind.abilityId])
    expect(kept.length / shared.length).toBeGreaterThanOrEqual(0.5)
  })

  it('respects locked binds', () => {
    const base = buildProblem('mythic-plus')
    const interrupt = base.abilities.find((ability) => ability.category === 'interrupt')
    expect(interrupt).toBeDefined()
    if (!interrupt) return
    const problem: AssignmentProblem = {
      ...base,
      constraints: { lockedBinds: { [interrupt.id]: 'KeyF' }, bannedSlotIds: [], preservedBinds: {} },
    }
    const result = solveAssignment(problem, {
      strategyId: 'qap-annealing',
      seed: 11,
      moveBudget: 30_000,
      hardware: DEFAULT_HARDWARE_CONFIG,
    })
    const bind = result.assignments.find((assignment) => assignment.abilityId === interrupt.id)
    expect(bind?.slotId).toBe('KeyF')
  })
})
