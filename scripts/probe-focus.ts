import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeLoadout } from '../src/core/decoder'
import { extractAbilityPool } from '../src/core/extract/ability-pool'
import { buildAssignmentProblem } from '../src/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '../src/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '../src/core/model/hardware'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '../src/core/model/snapshot'

const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', '12.0.7.68367')
const STRING =
  'CYQARUG2fGwHkLP0T7/MoTNl/AAAAAzMLbzMGjZZZhxMMDAAAAYxMbwAGwsxEysAAz2YmxMbLmWGzMGLGzMmZ2mNmlZwMzyAAzMAYmxwM+A'

function main() {
  const spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', '262.json'), 'utf8')) as SpecSnapshot
  const spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  const races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
  const text = JSON.parse(readFileSync(join(DATA_ROOT, 'text', 'ru.json'), 'utf8')) as { spells: Record<string, { name: string }> }
  const decoded = decodeLoadout(STRING, spec.nodes.map((n) => ({ id: n.id, kind: n.kind, maxRanks: n.maxRanks })))
  const abilities = extractAbilityPool({
    spec, spellMeta, selections: decoded.selections,
    race: races.find((r) => r.slug === 'orc') ?? null,
    pvpTalentIds: spec.pvpTalents.slice(0, 3).map((t) => t.id),
    mode: 'arena', arenaTargetScheme: 'focus',
  })
  console.log('=== focus/interrupt/cc variants in pool:')
  for (const a of abilities) {
    if (a.variantKind !== 'base' || a.category === 'interrupt' || a.category === 'cc-hard') {
      const nm = a.spellId > 0 ? text.spells[String(a.spellId)]?.name ?? '?' : a.id
      console.log(`  ${a.id.padEnd(28)} variant=${a.variantKind.padEnd(7)} cat=${a.category.padEnd(14)} ${nm}`)
    }
  }
  const problem = buildAssignmentProblem({
    abilities, spec, hardware: DEFAULT_HARDWARE_CONFIG, mode: 'arena', arenaTargetScheme: 'focus',
    constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
  })
  const result = solveAssignment(problem, { strategyId: 'qap-annealing', seed: 1, moveBudget: DEFAULT_MOVE_BUDGET, hardware: DEFAULT_HARDWARE_CONFIG })
  const abilityById = new Map(problem.abilities.map((a) => [a.id, a]))
  const slotById = new Map(problem.slots.map((s) => [s.id, s]))
  console.log('\n=== solved binds (variants only):')
  for (const bind of result.assignments) {
    const a = abilityById.get(bind.abilityId)!
    if (a.variantKind === 'base' && a.category !== 'interrupt' && a.category !== 'cc-hard') continue
    const s = slotById.get(bind.slotId)!
    const key = s.modifier === 'none' ? s.keyLabel : `${s.modifier}+${s.keyLabel}`
    const nm = a.spellId > 0 ? text.spells[String(a.spellId)]?.name ?? '?' : a.id
    console.log(`  ${key.padEnd(12)} ${nm.padEnd(24)} [${a.variantKind}] ${a.category}`)
  }
}
main()
