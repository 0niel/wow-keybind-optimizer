import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeLoadout } from '../src/core/decoder'
import { extractAbilityPool } from '../src/core/extract/ability-pool'
import { buildAssignmentProblem } from '../src/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '../src/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '../src/core/model/hardware'
import type { RaceRecord, SpecSnapshot, SpellMetaShard, SpellTextShard } from '../src/core/model/snapshot'
import { buildExportBinds, buildLuaBindEntries } from '../src/lib/exports'
import { BAR_SIZE } from '../src/lib/placement'
import type { ZeroSpellLabels } from '../src/lib/data'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)
const STRING =
  'CYQARUG2fGwHkLP0T7/MoTNl/AAAAAzMLbzMGjZZZhxMMDAAAAYxMbwAGwsxEysAAz2YmxMbLmWGzMGLGzMmZ2mNmlZwMzyAAzMAYmxwM+A'

const LABELS: ZeroSpellLabels = {
  trinket: 'Аксессуар',
  pvpTrinket: 'PvP-аксессуар',
  targetArena: (n) => `Цель: арена ${n}`,
  setFocus: 'Фокус: установить',
}

const BAR_NAMES = [
  'MainBar',
  'BottomLeft',
  'BottomRight',
  'Right(side)',
  'Left(side)',
  'MultiBar5',
  'MultiBar6',
  'MultiBar7',
]

function main() {
  const spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', '262.json'), 'utf8')) as SpecSnapshot
  const spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  const races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
  const text = JSON.parse(readFileSync(join(DATA_ROOT, 'text', 'ru.json'), 'utf8')) as {
    spells: SpellTextShard
  }
  const decoded = decodeLoadout(
    STRING,
    spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
  )
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
    hardware: DEFAULT_HARDWARE_CONFIG,
    mode: 'arena',
    arenaTargetScheme: 'arena123',
    constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
  })
  const result = solveAssignment(problem, {
    strategyId: 'qap-annealing',
    seed: 1,
    moveBudget: DEFAULT_MOVE_BUDGET,
    hardware: DEFAULT_HARDWARE_CONFIG,
  })
  const binds = buildExportBinds(result.assignments, problem.abilities, problem.slots, text.spells, LABELS)
  const entries = buildLuaBindEntries(binds)

  const nameByIndex = entries.map((entry, index) => {
    const bind = binds[index]
    const variant = bind && bind.ability.variantKind !== 'base' ? ` [${bind.ability.variantKind}]` : ''
    return `${entry.key} ${bind?.name ?? '?'}${variant}`
  })

  const byBar = new Map<number, Map<number, string>>()
  const keysOnly: string[] = []
  entries.forEach((entry, index) => {
    if (entry.slot === undefined) {
      keysOnly.push(`${nameByIndex[index]}${entry.command ? ` <${entry.command}>` : ''}`)
      return
    }
    const bar = Math.floor(entry.slot / BAR_SIZE)
    const column = entry.slot % BAR_SIZE
    const row = byBar.get(bar) ?? new Map<number, string>()
    row.set(column, nameByIndex[index] ?? '?')
    byBar.set(bar, row)
  })

  console.log(`binds total: ${entries.length}, placed: ${entries.filter((e) => e.slot !== undefined).length}`)
  for (const bar of [...byBar.keys()].sort((a, b) => a - b)) {
    const row = byBar.get(bar)
    if (!row) continue
    console.log(`\n=== bar ${bar} (${BAR_NAMES[bar] ?? '?'}) — ${row.size}/12`)
    for (let column = 0; column < BAR_SIZE; column++) {
      console.log(`  ${String(column + 1).padStart(2)}: ${row.get(column) ?? '—'}`)
    }
  }
  console.log(`\nkeys-only: ${keysOnly.length}`)
  for (const line of keysOnly) console.log(`  ${line}`)

  const spellCounts = new Map<number, number>()
  for (const bind of binds) {
    if (bind.ability.spellId > 0 && bind.ability.variantKind === 'base') {
      spellCounts.set(bind.ability.spellId, (spellCounts.get(bind.ability.spellId) ?? 0) + 1)
    }
  }
  const duplicated = [...spellCounts.entries()].filter(([, count]) => count > 1)
  console.log(`\nduplicate base spells: ${duplicated.length ? JSON.stringify(duplicated) : 'none'}`)
  const unnamed = binds.filter((bind) => bind.name.startsWith('#'))
  console.log(`unnamed binds: ${unnamed.length ? unnamed.map((b) => b.name).join(', ') : 'none'}`)
}

main()
