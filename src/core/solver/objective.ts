import type { AssignmentProblem } from '@/core/model/ability'
import type { SlotGeometry } from './proximity'
import { buildProximityMatrix, slotsFormArenaRow } from './proximity'

export interface CompiledProblem {
  problem: AssignmentProblem
  geometry: SlotGeometry
  abilityCount: number
  slotCount: number
  linear: Float32Array
  feasible: Uint8Array
  proximity: Float32Array
  synergyNeighbors: Array<Array<{ other: number; weight: number }>>
  tripletIndices: number[][]
  tripletByAbility: Map<number, number>
  switchCostBySlot: Map<number, number>[]
}

export function compileProblem(
  problem: AssignmentProblem,
  geometry: SlotGeometry,
  feasibleFn: (abilityIndex: number, slotIndex: number) => boolean,
): CompiledProblem {
  const abilityCount = problem.abilities.length
  const slotCount = problem.slots.length
  const linear = new Float32Array(abilityCount * slotCount)
  const feasible = new Uint8Array(abilityCount * slotCount)
  const slotIndexById = new Map(problem.slots.map((slot, index) => [slot.id, index]))

  const switchCostBySlot: Map<number, number>[] = []
  for (let a = 0; a < abilityCount; a++) {
    const ability = problem.abilities[a]
    const costs = new Map<number, number>()
    if (ability) {
      const preserved = problem.constraints.preservedBinds[ability.id]
      if (preserved !== undefined) {
        const preservedIndex = slotIndexById.get(preserved)
        if (preservedIndex !== undefined) costs.set(preservedIndex, 0)
      }
    }
    switchCostBySlot.push(costs)
  }

  for (let a = 0; a < abilityCount; a++) {
    const ability = problem.abilities[a]
    if (!ability) continue
    const hasPreserved = problem.constraints.preservedBinds[ability.id] !== undefined
    for (let s = 0; s < slotCount; s++) {
      const slot = problem.slots[s]
      if (!slot) continue
      if (!feasibleFn(a, s)) continue
      feasible[a * slotCount + s] = 1
      let value = ability.importance * slot.accessibility
      if (ability.rotationRank !== null && slot.sequenceOrdinal !== null) {
        value +=
          problem.weights.rotationFlow *
          (1 - Math.abs(ability.rotationRank - slot.sequenceOrdinal))
      }
      if (hasPreserved && !switchCostBySlot[a]?.has(s)) {
        value -= problem.weights.switchCost * ability.importance
      }
      linear[a * slotCount + s] = value
    }
  }

  const abilityIndexById = new Map(problem.abilities.map((ability, index) => [ability.id, index]))
  const synergyNeighbors: Array<Array<{ other: number; weight: number }>> = Array.from(
    { length: abilityCount },
    () => [],
  )
  for (const edge of problem.synergies) {
    const a = abilityIndexById.get(edge.abilityIdA)
    const b = abilityIndexById.get(edge.abilityIdB)
    if (a === undefined || b === undefined) continue
    synergyNeighbors[a]?.push({ other: b, weight: edge.weight })
    synergyNeighbors[b]?.push({ other: a, weight: edge.weight })
  }

  const tripletIndices = problem.arenaTriplets
    .map((triplet) =>
      triplet
        .map((abilityId) => abilityIndexById.get(abilityId))
        .filter((index): index is number => index !== undefined),
    )
    .filter((triplet) => triplet.length === 3)
  const tripletByAbility = new Map<number, number>()
  tripletIndices.forEach((triplet, tripletIndex) => {
    for (const abilityIndex of triplet) tripletByAbility.set(abilityIndex, tripletIndex)
  })

  return {
    problem,
    geometry,
    abilityCount,
    slotCount,
    linear,
    feasible,
    proximity: buildProximityMatrix(problem.slots, geometry),
    synergyNeighbors,
    tripletIndices,
    tripletByAbility,
    switchCostBySlot,
  }
}

export function evaluateObjective(compiled: CompiledProblem, assignment: Int32Array): number {
  let total = 0
  for (let a = 0; a < compiled.abilityCount; a++) {
    const slot = assignment[a] ?? -1
    if (slot < 0) continue
    total += compiled.linear[a * compiled.slotCount + slot] ?? 0
  }
  total += quadraticScore(compiled, assignment)
  return total
}

export function quadraticScore(compiled: CompiledProblem, assignment: Int32Array): number {
  const { problem } = compiled
  let synergy = 0
  for (let a = 0; a < compiled.abilityCount; a++) {
    const slotA = assignment[a] ?? -1
    if (slotA < 0) continue
    for (const neighbor of compiled.synergyNeighbors[a] ?? []) {
      if (neighbor.other <= a) continue
      const slotB = assignment[neighbor.other] ?? -1
      if (slotB < 0) continue
      synergy += neighbor.weight * (compiled.proximity[slotA * compiled.slotCount + slotB] ?? 0)
    }
  }
  let cluster = 0
  for (const triplet of compiled.tripletIndices) {
    const slots = triplet.map((abilityIndex) => assignment[abilityIndex] ?? -1)
    if (slots.some((slot) => slot < 0)) continue
    cluster += slotsFormArenaRow(slots, problem.slots, compiled.geometry)
  }
  return problem.weights.quadratic * synergy + problem.weights.arenaCluster * cluster
}

export function abilityMarginal(
  compiled: CompiledProblem,
  assignment: Int32Array,
  abilityIndex: number,
): { linear: number; synergy: number } {
  const slot = assignment[abilityIndex] ?? -1
  if (slot < 0) return { linear: 0, synergy: 0 }
  const linear = compiled.linear[abilityIndex * compiled.slotCount + slot] ?? 0
  let synergy = 0
  for (const neighbor of compiled.synergyNeighbors[abilityIndex] ?? []) {
    const slotB = assignment[neighbor.other] ?? -1
    if (slotB < 0) continue
    synergy +=
      compiled.problem.weights.quadratic *
      neighbor.weight *
      (compiled.proximity[slot * compiled.slotCount + slotB] ?? 0)
  }
  const tripletIndex = compiled.tripletByAbility.get(abilityIndex)
  if (tripletIndex !== undefined) {
    const triplet = compiled.tripletIndices[tripletIndex]
    if (triplet) {
      const slots = triplet.map((index) => assignment[index] ?? -1)
      if (!slots.some((value) => value < 0)) {
        synergy +=
          (compiled.problem.weights.arenaCluster *
            slotsFormArenaRow(slots, compiled.problem.slots, compiled.geometry)) /
          3
      }
    }
  }
  return { linear, synergy }
}
