import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeLoadout } from '../src/core/decoder'
import { extractAbilityPool } from '../src/core/extract/ability-pool'
import { buildAssignmentProblem } from '../src/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '../src/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '../src/core/model/hardware'
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
  const abilities = extractAbilityPool({
    spec,
    spellMeta,
    selections: decoded.selections,
    race: races.find((race) => race.slug === 'vulpera') ?? null,
    pvpTalentIds: [],
    mode: 'arena',
    arenaTargetScheme: 'focus',
  })
  const problem = buildAssignmentProblem({
    abilities,
    spec,
    hardware: DEFAULT_HARDWARE_CONFIG,
    mode: 'arena',
    arenaTargetScheme: 'focus',
    constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
  })
  const result = solveAssignment(problem, {
    strategyId: 'qap-annealing',
    seed: 1,
    moveBudget: DEFAULT_MOVE_BUDGET,
    hardware: DEFAULT_HARDWARE_CONFIG,
  })
  const abilityById = new Map(problem.abilities.map((a) => [a.id, a]))
  const rows = result.assignments
    .map((bind) => {
      const ability = abilityById.get(bind.abilityId)
      if (!ability) return null
      const name =
        ability.spellId > 0 ? (text.spells[String(ability.spellId)]?.name ?? '?') : ability.id
      const meta = ability.spellId > 0 ? spellMeta[String(ability.spellId)] : null
      const rank = spec.frequencyBySpellId[String(ability.spellId)]?.aplRank ?? null
      return {
        slot: bind.slotId,
        name,
        variant: ability.variantKind,
        spellId: ability.spellId,
        icon: meta?.icon ?? '-',
        category: ability.category,
        freq: ability.frequency.toFixed(2),
        aplRank: rank,
      }
    })
    .filter(Boolean)
  for (const row of rows) {
    console.log(
      `${String(row?.slot).padEnd(16)} ${String(row?.name).padEnd(28)} ${String(row?.variant).padEnd(7)} ${String(row?.spellId).padEnd(8)} ${String(row?.category).padEnd(16)} f=${row?.freq} apl=${row?.aplRank ?? '-'} ${row?.icon}`,
    )
  }
}

main()
