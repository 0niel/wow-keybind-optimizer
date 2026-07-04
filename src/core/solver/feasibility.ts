import type { Ability, AssignmentProblem, Slot } from '@/core/model/ability'

const PANIC_HARD_THRESHOLD = 0.95
const REACTIVE_HARD_THRESHOLD = 0.9
const RELAXATION_STEP = 0.05

export interface FeasibilityContext {
  reactiveSlotThreshold: number
  warnings: string[]
}

export function prepareFeasibility(problem: AssignmentProblem): FeasibilityContext {
  const warnings: string[] = []
  let threshold = problem.weights.reactiveSlotThreshold
  const reactiveAbilities = problem.abilities.filter(
    (ability) => ability.reactivity >= REACTIVE_HARD_THRESHOLD,
  )
  const availableSlots = problem.slots.filter(
    (slot) => !problem.constraints.bannedSlotIds.includes(slot.id),
  )
  while (threshold > 0.3) {
    const qualifying = availableSlots.filter((slot) => slot.accessibility >= threshold)
    if (qualifying.length >= reactiveAbilities.length) break
    threshold -= RELAXATION_STEP
  }
  if (threshold < problem.weights.reactiveSlotThreshold) {
    warnings.push(`reactive-threshold-relaxed:${threshold.toFixed(2)}`)
  }
  return { reactiveSlotThreshold: threshold, warnings }
}

export function isFeasible(
  ability: Ability,
  slot: Slot,
  problem: AssignmentProblem,
  context: FeasibilityContext,
): boolean {
  if (ability.panic >= PANIC_HARD_THRESHOLD && slot.modifier !== 'none') return false
  if (ability.reactivity >= REACTIVE_HARD_THRESHOLD && slot.accessibility < context.reactiveSlotThreshold) {
    return false
  }
  if (
    ability.frequency >= problem.weights.frequencyForTierFloor &&
    !slot.isMouse &&
    slot.tier < problem.weights.frequentSlotTierFloor
  ) {
    return false
  }
  const lockedSlot = problem.constraints.lockedBinds[ability.id]
  if (lockedSlot !== undefined && lockedSlot !== slot.id) return false
  const lockedAbilityForSlot = Object.entries(problem.constraints.lockedBinds).find(
    ([, slotId]) => slotId === slot.id,
  )
  if (lockedAbilityForSlot && lockedAbilityForSlot[0] !== ability.id) return false
  return true
}
