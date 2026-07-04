import type { Ability, GameMode } from '@/core/model/ability'
import { MODE_WEIGHTS } from './mode-weights'

const REACTIVITY_WEIGHT = 0.9
const PANIC_WEIGHT = 0.75

export function scoreImportance(abilities: Ability[], mode: GameMode): Ability[] {
  return abilities.map((ability) => {
    const base =
      1 -
      (1 - clamp01(ability.frequency)) *
        (1 - REACTIVITY_WEIGHT * clamp01(ability.reactivity)) *
        (1 - PANIC_WEIGHT * clamp01(ability.panic))
    const modeWeight = MODE_WEIGHTS[ability.category][mode]
    return { ...ability, importance: base * modeWeight }
  })
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
