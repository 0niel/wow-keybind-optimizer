import type { AbilityCategory } from './ability-category'
import type { Targeting } from './snapshot'
import type { Modifier } from './hardware'

export type GameMode = 'raid' | 'mythic-plus' | 'arena' | 'rbg' | 'battleground'

export type ArenaTargetScheme = 'focus' | 'arena123'

export type AbilityVariantKind = 'base' | 'focus' | 'arena1' | 'arena2' | 'arena3'

export interface Ability {
  id: string
  spellId: number
  category: AbilityCategory
  variantKind: AbilityVariantKind
  baseAbilityId: string | null
  frequency: number
  reactivity: number
  panic: number
  offGcd: boolean
  targeting: Targeting
  sourceNodeIds: number[]
  importance: number
  rotationRank: number | null
}

export interface Slot {
  id: string
  keyId: string
  keyLabel: string
  modifier: Modifier
  tier: number
  fitts: number
  accessibility: number
  isMouse: boolean
  sequenceOrdinal: number | null
}

export interface SynergyEdge {
  abilityIdA: string
  abilityIdB: string
  weight: number
}

export interface UserConstraints {
  lockedBinds: Record<string, string>
  bannedSlotIds: string[]
  preservedBinds: Record<string, string>
}

export interface AssignmentProblem {
  abilities: Ability[]
  slots: Slot[]
  synergies: SynergyEdge[]
  arenaTriplets: string[][]
  constraints: UserConstraints
  weights: ObjectiveWeights
}

export interface ObjectiveWeights {
  quadratic: number
  arenaCluster: number
  switchCost: number
  rotationFlow: number
  reactiveSlotThreshold: number
  frequentSlotTierFloor: number
  frequencyForTierFloor: number
}

export const DEFAULT_OBJECTIVE_WEIGHTS: ObjectiveWeights = {
  quadratic: 0.25,
  arenaCluster: 0.2,
  switchCost: 0.3,
  rotationFlow: 0.35,
  reactiveSlotThreshold: 0.75,
  frequentSlotTierFloor: 0.55,
  frequencyForTierFloor: 0.5,
}

export interface BindAssignment {
  abilityId: string
  slotId: string
  linearScore: number
  synergyScore: number
  marginal: number
  constraintNotes: string[]
}

export interface SolveResult {
  assignments: BindAssignment[]
  objective: number
  linearObjective: number
  strategyId: string
  seed: number
  warnings: string[]
}
