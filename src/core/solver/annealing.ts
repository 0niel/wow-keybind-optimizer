import { mulberry32, randomInt } from '@/core/random'
import type { CompiledProblem } from './objective'
import { evaluateObjective } from './objective'
import { slotsFormArenaRow } from './proximity'

export interface AnnealingOptions {
  seed: number
  moveBudget: number
}

export function refineWithAnnealing(
  compiled: CompiledProblem,
  seedAssignment: Int32Array,
  options: AnnealingOptions,
): Int32Array {
  const rng = mulberry32(options.seed)
  const { abilityCount, slotCount } = compiled
  const current = Int32Array.from(seedAssignment)
  const slotToAbility = new Int32Array(slotCount).fill(-1)
  for (let a = 0; a < abilityCount; a++) {
    const slot = current[a] ?? -1
    if (slot >= 0) slotToAbility[slot] = a
  }

  let currentScore = evaluateObjective(compiled, current)
  let best = Int32Array.from(current)
  let bestScore = currentScore

  const meanLinear = averageAssignedLinear(compiled, current)
  const t0 = Math.max(0.01, 0.35 * meanLinear)
  const tEnd = 0.001
  const coolingRatio = tEnd / t0

  for (let step = 0; step < options.moveBudget; step++) {
    const temperature = t0 * Math.pow(coolingRatio, step / options.moveBudget)
    const abilityA = randomInt(rng, abilityCount)
    const slotA = current[abilityA] ?? -1
    if (slotA < 0) continue

    const useSwap = rng() < 0.5
    let delta = 0
    let abilityB = -1
    let targetSlot = -1

    if (useSwap) {
      abilityB = randomInt(rng, abilityCount)
      if (abilityB === abilityA) continue
      const slotB = current[abilityB] ?? -1
      if (slotB < 0) continue
      if (compiled.feasible[abilityA * slotCount + slotB] !== 1) continue
      if (compiled.feasible[abilityB * slotCount + slotA] !== 1) continue
      delta = swapDelta(compiled, current, abilityA, abilityB)
      targetSlot = slotB
    } else {
      targetSlot = randomInt(rng, slotCount)
      if (slotToAbility[targetSlot] !== -1) continue
      if (compiled.feasible[abilityA * slotCount + targetSlot] !== 1) continue
      delta = relocateDelta(compiled, current, abilityA, targetSlot)
    }

    if (delta >= 0 || rng() < Math.exp(delta / temperature)) {
      if (useSwap && abilityB >= 0) {
        const slotB = current[abilityB] ?? -1
        current[abilityA] = slotB
        current[abilityB] = slotA
        if (slotB >= 0) slotToAbility[slotB] = abilityA
        slotToAbility[slotA] = abilityB
      } else {
        current[abilityA] = targetSlot
        slotToAbility[slotA] = -1
        slotToAbility[targetSlot] = abilityA
      }
      currentScore += delta
      if (currentScore > bestScore) {
        bestScore = currentScore
        best = Int32Array.from(current)
      }
    }
  }
  return best
}

function averageAssignedLinear(compiled: CompiledProblem, assignment: Int32Array): number {
  let total = 0
  let count = 0
  for (let a = 0; a < compiled.abilityCount; a++) {
    const slot = assignment[a] ?? -1
    if (slot < 0) continue
    total += Math.abs(compiled.linear[a * compiled.slotCount + slot] ?? 0)
    count++
  }
  return count > 0 ? total / count : 0.1
}

function relocateDelta(
  compiled: CompiledProblem,
  assignment: Int32Array,
  abilityIndex: number,
  targetSlot: number,
): number {
  const currentSlot = assignment[abilityIndex] ?? -1
  let delta =
    (compiled.linear[abilityIndex * compiled.slotCount + targetSlot] ?? 0) -
    (compiled.linear[abilityIndex * compiled.slotCount + currentSlot] ?? 0)
  delta += pairContribution(compiled, assignment, abilityIndex, targetSlot)
  delta -= pairContribution(compiled, assignment, abilityIndex, currentSlot)
  delta += tripletDelta(compiled, assignment, [abilityIndex], [targetSlot])
  return delta
}

function swapDelta(
  compiled: CompiledProblem,
  assignment: Int32Array,
  abilityA: number,
  abilityB: number,
): number {
  const slotA = assignment[abilityA] ?? -1
  const slotB = assignment[abilityB] ?? -1
  const { slotCount } = compiled
  let delta =
    (compiled.linear[abilityA * slotCount + slotB] ?? 0) -
    (compiled.linear[abilityA * slotCount + slotA] ?? 0) +
    (compiled.linear[abilityB * slotCount + slotA] ?? 0) -
    (compiled.linear[abilityB * slotCount + slotB] ?? 0)

  delta += pairContributionExcluding(compiled, assignment, abilityA, slotB, abilityB)
  delta -= pairContributionExcluding(compiled, assignment, abilityA, slotA, abilityB)
  delta += pairContributionExcluding(compiled, assignment, abilityB, slotA, abilityA)
  delta -= pairContributionExcluding(compiled, assignment, abilityB, slotB, abilityA)

  const directWeight = directSynergy(compiled, abilityA, abilityB)
  if (directWeight > 0) {
    const before = compiled.proximity[slotA * slotCount + slotB] ?? 0
    const after = compiled.proximity[slotB * slotCount + slotA] ?? 0
    delta += compiled.problem.weights.quadratic * directWeight * (after - before)
  }

  delta += tripletDelta(compiled, assignment, [abilityA, abilityB], [slotB, slotA])
  return delta
}

function directSynergy(compiled: CompiledProblem, abilityA: number, abilityB: number): number {
  for (const neighbor of compiled.synergyNeighbors[abilityA] ?? []) {
    if (neighbor.other === abilityB) return neighbor.weight
  }
  return 0
}

function pairContribution(
  compiled: CompiledProblem,
  assignment: Int32Array,
  abilityIndex: number,
  slotIndex: number,
): number {
  if (slotIndex < 0) return 0
  let total = 0
  for (const neighbor of compiled.synergyNeighbors[abilityIndex] ?? []) {
    const otherSlot = assignment[neighbor.other] ?? -1
    if (otherSlot < 0) continue
    total += neighbor.weight * (compiled.proximity[slotIndex * compiled.slotCount + otherSlot] ?? 0)
  }
  return compiled.problem.weights.quadratic * total
}

function pairContributionExcluding(
  compiled: CompiledProblem,
  assignment: Int32Array,
  abilityIndex: number,
  slotIndex: number,
  excludedAbility: number,
): number {
  if (slotIndex < 0) return 0
  let total = 0
  for (const neighbor of compiled.synergyNeighbors[abilityIndex] ?? []) {
    if (neighbor.other === excludedAbility) continue
    const otherSlot = assignment[neighbor.other] ?? -1
    if (otherSlot < 0) continue
    total += neighbor.weight * (compiled.proximity[slotIndex * compiled.slotCount + otherSlot] ?? 0)
  }
  return compiled.problem.weights.quadratic * total
}

function tripletDelta(
  compiled: CompiledProblem,
  assignment: Int32Array,
  movedAbilities: number[],
  newSlots: number[],
): number {
  const affectedTriplets = new Set<number>()
  for (const abilityIndex of movedAbilities) {
    const tripletIndex = compiled.tripletByAbility.get(abilityIndex)
    if (tripletIndex !== undefined) affectedTriplets.add(tripletIndex)
  }
  if (affectedTriplets.size === 0) return 0

  let delta = 0
  for (const tripletIndex of affectedTriplets) {
    const triplet = compiled.tripletIndices[tripletIndex]
    if (!triplet) continue
    const before = tripletScore(compiled, triplet, assignment, null, null)
    const after = tripletScore(compiled, triplet, assignment, movedAbilities, newSlots)
    delta += compiled.problem.weights.arenaCluster * (after - before)
  }
  return delta
}

function tripletScore(
  compiled: CompiledProblem,
  triplet: number[],
  assignment: Int32Array,
  movedAbilities: number[] | null,
  newSlots: number[] | null,
): number {
  const slots = triplet.map((abilityIndex) => {
    if (movedAbilities && newSlots) {
      const movedPosition = movedAbilities.indexOf(abilityIndex)
      if (movedPosition >= 0) return newSlots[movedPosition] ?? -1
    }
    return assignment[abilityIndex] ?? -1
  })
  if (slots.some((slot) => slot < 0)) return 0
  return slotsFormArenaRow(slots, compiled.problem.slots, compiled.geometry)
}
