import type { AssignmentProblem, BindAssignment, SolveResult } from '@/core/model/ability'
import type { HardwareConfig } from '@/core/model/hardware'
import { prepareFeasibility, isFeasible } from './feasibility'
import { compileProblem, evaluateObjective, abilityMarginal } from './objective'
import type { CompiledProblem } from './objective'
import { buildSlotGeometry } from './proximity'
import { solveGreedy } from './greedy'
import { solveHungarianMax } from './hungarian'
import { refineWithAnnealing } from './annealing'

export type SolverStrategyId = 'greedy' | 'qap-annealing'

export interface SolveOptions {
  strategyId: SolverStrategyId
  seed: number
  moveBudget: number
  hardware: HardwareConfig
}

export const DEFAULT_MOVE_BUDGET = 150_000

export function evaluateFixedAssignment(
  problem: AssignmentProblem,
  hardware: HardwareConfig,
  bindsByAbilityId: Record<string, string>,
): number {
  const geometry = buildSlotGeometry(hardware)
  const compiled = compileProblem(problem, geometry, () => true)
  const slotIndexById = new Map(problem.slots.map((slot, index) => [slot.id, index]))
  const assignment = new Int32Array(problem.abilities.length).fill(-1)
  problem.abilities.forEach((ability, abilityIndex) => {
    const slotId = bindsByAbilityId[ability.id]
    if (slotId === undefined) return
    const slotIndex = slotIndexById.get(slotId)
    if (slotIndex !== undefined) assignment[abilityIndex] = slotIndex
  })
  return evaluateObjective(compiled, assignment)
}

export function solveAssignment(problem: AssignmentProblem, options: SolveOptions): SolveResult {
  const context = prepareFeasibility(problem)
  const geometry = buildSlotGeometry(options.hardware)
  const compiled = compileProblem(problem, geometry, (abilityIndex, slotIndex) => {
    const ability = problem.abilities[abilityIndex]
    const slot = problem.slots[slotIndex]
    if (!ability || !slot) return false
    if (problem.constraints.bannedSlotIds.includes(slot.id)) return false
    return isFeasible(ability, slot, problem, context)
  })

  const assignment = runStrategy(compiled, options)
  return buildResult(compiled, assignment, options, context.warnings)
}

function runStrategy(compiled: CompiledProblem, options: SolveOptions): Int32Array {
  if (options.strategyId === 'greedy') {
    return solveGreedy(compiled)
  }
  const seedAssignment = solveHungarianMax(
    compiled.linear,
    compiled.abilityCount,
    compiled.slotCount,
    compiled.feasible,
  )
  fillUnassigned(compiled, seedAssignment)
  return refineWithAnnealing(compiled, seedAssignment, {
    seed: options.seed,
    moveBudget: options.moveBudget,
  })
}

function fillUnassigned(compiled: CompiledProblem, assignment: Int32Array): void {
  const used = new Set<number>()
  for (const slot of assignment) {
    if (slot >= 0) used.add(slot)
  }
  for (let a = 0; a < compiled.abilityCount; a++) {
    if ((assignment[a] ?? -1) >= 0) continue
    let bestSlot = -1
    let bestScore = Number.NEGATIVE_INFINITY
    for (let s = 0; s < compiled.slotCount; s++) {
      if (used.has(s)) continue
      if (compiled.feasible[a * compiled.slotCount + s] !== 1) continue
      const score = compiled.linear[a * compiled.slotCount + s] ?? 0
      if (score > bestScore) {
        bestScore = score
        bestSlot = s
      }
    }
    if (bestSlot >= 0) {
      assignment[a] = bestSlot
      used.add(bestSlot)
    }
  }
}

function buildResult(
  compiled: CompiledProblem,
  assignment: Int32Array,
  options: SolveOptions,
  warnings: string[],
): SolveResult {
  const assignments: BindAssignment[] = []
  let linearObjective = 0
  const unassigned: string[] = []

  for (let a = 0; a < compiled.abilityCount; a++) {
    const ability = compiled.problem.abilities[a]
    const slotIndex = assignment[a] ?? -1
    if (!ability) continue
    if (slotIndex < 0) {
      unassigned.push(ability.id)
      continue
    }
    const slot = compiled.problem.slots[slotIndex]
    if (!slot) continue
    const marginal = abilityMarginal(compiled, assignment, a)
    linearObjective += marginal.linear
    const constraintNotes: string[] = []
    if (ability.panic >= 0.95) constraintNotes.push('panic-no-modifier')
    if (ability.reactivity >= 0.9) constraintNotes.push('reactive-s-tier')
    if (compiled.problem.constraints.lockedBinds[ability.id]) constraintNotes.push('locked')
    assignments.push({
      abilityId: ability.id,
      slotId: slot.id,
      linearScore: marginal.linear,
      synergyScore: marginal.synergy,
      marginal: marginal.linear + marginal.synergy,
      constraintNotes,
    })
  }

  if (unassigned.length > 0) {
    warnings = [...warnings, `unassigned:${unassigned.join(',')}`]
  }

  return {
    assignments,
    objective: evaluateObjective(compiled, assignment),
    linearObjective,
    strategyId: options.strategyId,
    seed: options.seed,
    warnings,
  }
}
