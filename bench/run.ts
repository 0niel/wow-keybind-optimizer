import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { extractAbilityPool } from '../src/core/extract/ability-pool'
import { buildAssignmentProblem } from '../src/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '../src/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '../src/core/model/hardware'
import type { GameMode } from '../src/core/model/ability'
import type { NodeSelection } from '../src/core/decoder'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '../src/core/model/snapshot'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)
const MODES: GameMode[] = ['mythic-plus', 'arena']

function syntheticSelections(spec: SpecSnapshot): NodeSelection[] {
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
    if (!node.forSpec || node.kind === 'subtree-selection') continue
    if (node.subTreeId > 0 && node.subTreeId !== heroSubTreeId) continue
    if (node.entries.length === 0) continue
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

function main() {
  const spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  const races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
  const orc = races.find((race) => race.slug === 'orc') ?? null
  const specFiles = readdirSync(join(DATA_ROOT, 'specs')).filter((file) => file.endsWith('.json'))

  let failures = 0
  let worstMs = 0
  const rows: string[] = []

  for (const file of specFiles) {
    const spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', file), 'utf8')) as SpecSnapshot
    const selections = syntheticSelections(spec)
    for (const mode of MODES) {
      const abilities = extractAbilityPool({
        spec,
        spellMeta,
        selections,
        race: orc,
        pvpTalentIds: spec.pvpTalents.slice(0, 3).map((talent) => talent.id),
        mode,
        arenaTargetScheme: 'arena123',
      })
      const problem = buildAssignmentProblem({
        abilities,
        spec,
        hardware: DEFAULT_HARDWARE_CONFIG,
        mode,
        arenaTargetScheme: 'arena123',
        constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
      })
      const greedy = solveAssignment(problem, {
        strategyId: 'greedy',
        seed: 1,
        moveBudget: 0,
        hardware: DEFAULT_HARDWARE_CONFIG,
      })
      const start = performance.now()
      const qap = solveAssignment(problem, {
        strategyId: 'qap-annealing',
        seed: 1,
        moveBudget: DEFAULT_MOVE_BUDGET,
        hardware: DEFAULT_HARDWARE_CONFIG,
      })
      const elapsed = performance.now() - start
      worstMs = Math.max(worstMs, elapsed)
      const improvement = greedy.objective > 0 ? ((qap.objective - greedy.objective) / greedy.objective) * 100 : 0
      const ok = qap.objective >= greedy.objective - 1e-6
      if (!ok) failures++
      if (elapsed > 1000) failures++
      rows.push(
        `${spec.specId.toString().padStart(5)} ${mode.padEnd(12)} n=${problem.abilities.length
          .toString()
          .padStart(3)} greedy=${greedy.objective.toFixed(3).padStart(8)} qap=${qap.objective
          .toFixed(3)
          .padStart(8)} +${improvement.toFixed(1).padStart(5)}% ${elapsed.toFixed(0).padStart(4)}ms${ok ? '' : '  VIOLATION'}`,
      )
    }
  }

  console.log(rows.join('\n'))
  console.log(`\nspecs=${specFiles.length} runs=${rows.length} worst=${worstMs.toFixed(0)}ms failures=${failures}`)
  if (failures > 0) {
    console.error('BENCH FAILED')
    process.exit(1)
  }
}

main()
