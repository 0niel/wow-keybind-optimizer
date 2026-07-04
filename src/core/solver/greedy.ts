import type { CompiledProblem } from './objective'

export function solveGreedy(compiled: CompiledProblem): Int32Array {
  const assignment = new Int32Array(compiled.abilityCount).fill(-1)
  const usedSlots = new Uint8Array(compiled.slotCount)

  const abilityOrder = [...Array(compiled.abilityCount).keys()].sort((a, b) => {
    const importanceA = compiled.problem.abilities[a]?.importance ?? 0
    const importanceB = compiled.problem.abilities[b]?.importance ?? 0
    return importanceB - importanceA
  })
  const slotOrder = [...Array(compiled.slotCount).keys()].sort((a, b) => {
    const accessA = compiled.problem.slots[a]?.accessibility ?? 0
    const accessB = compiled.problem.slots[b]?.accessibility ?? 0
    return accessB - accessA
  })

  for (const abilityIndex of abilityOrder) {
    for (const slotIndex of slotOrder) {
      if (usedSlots[slotIndex] === 1) continue
      if (compiled.feasible[abilityIndex * compiled.slotCount + slotIndex] !== 1) continue
      assignment[abilityIndex] = slotIndex
      usedSlots[slotIndex] = 1
      break
    }
  }
  return assignment
}
