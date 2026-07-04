import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeLoadout } from '../src/core/decoder'
import { extractAbilityPool } from '../src/core/extract/ability-pool'
import { buildAssignmentProblem } from '../src/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '../src/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '../src/core/model/hardware'
import { buildExportBinds, buildLuaBindEntries } from '../src/lib/exports'
import type { RaceRecord, SpecSnapshot, SpellMetaShard, SpellTextShard } from '../src/core/model/snapshot'

const R = join(process.cwd(), 'public', 'data', 'retail', '12.0.7.68367')
const STRING =
  'CYQARUG2fGwHkLP0T7/MoTNl/AAAAAzMLbzMGjZZZhxMMDAAAAYxMbwAGwsxEysAAz2YmxMbLmWGzMGLGzMmZ2mNmlZwMzyAAzMAYmxwM+A'

function main() {
  const spec = JSON.parse(readFileSync(join(R, 'specs', '262.json'), 'utf8')) as SpecSnapshot
  const meta = JSON.parse(readFileSync(join(R, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  const text = JSON.parse(readFileSync(join(R, 'text', 'ru.json'), 'utf8')) as {
    spells: SpellTextShard
  }
  const races = JSON.parse(readFileSync(join(R, 'races.json'), 'utf8')) as RaceRecord[]
  const decoded = decodeLoadout(
    STRING,
    spec.nodes.map((n) => ({ id: n.id, kind: n.kind, maxRanks: n.maxRanks })),
  )
  const abilities = extractAbilityPool({
    spec,
    spellMeta: meta,
    selections: decoded.selections,
    race: races.find((r) => r.slug === 'vulpera') ?? null,
    pvpTalentIds: [],
    mode: 'mythic-plus',
    arenaTargetScheme: 'focus',
  })
  const problem = buildAssignmentProblem({
    abilities,
    spec,
    hardware: DEFAULT_HARDWARE_CONFIG,
    mode: 'mythic-plus',
    arenaTargetScheme: 'focus',
    constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
  })
  const result = solveAssignment(problem, {
    strategyId: 'qap-annealing',
    seed: 1,
    moveBudget: DEFAULT_MOVE_BUDGET,
    hardware: DEFAULT_HARDWARE_CONFIG,
  })
  const binds = buildExportBinds(
    result.assignments,
    problem.abilities,
    problem.slots,
    text.spells,
    'Trinket',
    'PvP Trinket',
  )
  const entries = buildLuaBindEntries(binds)
  entries.forEach((entry, index) => {
    const bind = binds[index]
    if (!bind) return
    const bar = entry.command?.match(/BAR(\d)/)?.[1] ?? '-'
    console.log(
      `${bind.wowKey.padEnd(14)} bar${bar} slot${String(entry.slot ?? '-').padEnd(4)} ${bind.ability.category.padEnd(16)} ${bind.name}`,
    )
  })
}

main()
