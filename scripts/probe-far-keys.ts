import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeLoadout } from '../src/core/decoder'
import { extractAbilityPool } from '../src/core/extract/ability-pool'
import { buildAssignmentProblem } from '../src/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '../src/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '../src/core/model/hardware'
import { MOVEMENT_SCHEMES } from '../src/core/hardware/movement-schemes'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '../src/core/model/snapshot'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)
const STRING =
  'CYQARUG2fGwHkLP0T7/MoTNl/AAAAAzMLbzMGjZZZhxMMDAAAAYxMbwAGwsxEysAAz2YmxMbLmWGzMGLGzMmZ2mNmlZwMzyAAzMAYmxwM+A'

function main() {
  const spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', '262.json'), 'utf8')) as SpecSnapshot
  const spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  const races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
  const text = JSON.parse(readFileSync(join(DATA_ROOT, 'text', 'ru.json'), 'utf8')) as {
    spells: Record<string, { name: string }>
  }
  const decoded = decodeLoadout(
    STRING,
    spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
  )
  const hardware = {
    ...DEFAULT_HARDWARE_CONFIG,
    bannedKeyIds: ['Tab', 'CapsLock', 'Digit5'],
  }
  const abilities = extractAbilityPool({
    spec,
    spellMeta,
    selections: decoded.selections,
    race: races.find((race) => race.slug === 'orc') ?? null,
    pvpTalentIds: spec.pvpTalents.slice(0, 3).map((talent) => talent.id),
    mode: 'arena',
    arenaTargetScheme: 'arena123',
  })
  const problem = buildAssignmentProblem({
    abilities,
    spec,
    hardware,
    mode: 'arena',
    arenaTargetScheme: 'arena123',
    constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
  })
  const tiers = MOVEMENT_SCHEMES.wasd.tierByKeyId
  const abilityById = new Map(problem.abilities.map((a) => [a.id, a]))
  const slotById = new Map(problem.slots.map((s) => [s.id, s]))
  for (let seed = 1; seed <= 4; seed++) {
    const result = solveAssignment(problem, {
      strategyId: 'qap-annealing',
      seed,
      moveBudget: DEFAULT_MOVE_BUDGET,
      hardware,
    })
    const far = result.assignments
      .map((assignment) => {
        const slot = slotById.get(assignment.slotId)
        const ability = abilityById.get(assignment.abilityId)
        if (!slot || !ability || slot.isMouse) return null
        if (tiers[slot.keyId] !== undefined) return null
        const name =
          ability.spellId > 0 ? (text.spells[String(ability.spellId)]?.name ?? '?') : ability.id
        return `${assignment.slotId} → ${name} (tier=${slot.tier}, cat=${ability.category})`
      })
      .filter(Boolean)
    console.log(`seed ${seed}: ${far.length} binds on unlisted keys`)
    for (const line of far) console.log(`  ${line}`)
  }
  const unlistedSlots = problem.slots.filter((slot) => !slot.isMouse && tiers[slot.keyId] === undefined)
  console.log(`\nslots on unlisted keys: ${unlistedSlots.length} of ${problem.slots.length} total, pool=${problem.abilities.length}`)
}

main()
