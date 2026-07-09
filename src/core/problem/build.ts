import type {
  Ability,
  ArenaTargetScheme,
  AssignmentProblem,
  GameMode,
  ObjectiveWeights,
  SynergyEdge,
  UserConstraints,
} from '@/core/model/ability'
import { DEFAULT_OBJECTIVE_WEIGHTS } from '@/core/model/ability'
import type { SpecSnapshot } from '@/core/model/snapshot'
import type { HardwareConfig } from '@/core/model/hardware'
import type { AbilityCategory } from '@/core/model/ability-category'
import { enumerateSlots } from '@/core/scoring/slots'
import { scoreImportance } from '@/core/scoring/importance'

const APL_SYNERGY_CAP = 0.6
const SEMANTIC_SYNERGY = 0.4
const VARIANT_SYNERGY = 2.2
const FOCUS_SET_SYNERGY = 0.5
const TRINKET_DEFENSIVE_SYNERGY = 0.5

const SEMANTIC_GROUPS: AbilityCategory[][] = [
  ['cc-hard'],
  ['external'],
  ['heal-utility'],
  ['dispel'],
  ['mobility'],
  ['defensive-major', 'defensive-minor'],
  ['cooldown-burst'],
]

export interface ProblemInput {
  abilities: Ability[]
  spec: SpecSnapshot
  hardware: HardwareConfig
  mode: GameMode
  arenaTargetScheme: ArenaTargetScheme
  constraints: UserConstraints
  weights?: Partial<ObjectiveWeights>
}

export function buildAssignmentProblem(input: ProblemInput): AssignmentProblem {
  const abilities = scoreImportance(input.abilities, input.mode)
  const slots = enumerateSlots(input.hardware)
  const synergies = buildSynergies(abilities, input.spec)
  const arenaTriplets = buildArenaTriplets(abilities)
  return {
    abilities,
    slots,
    synergies,
    arenaTriplets,
    constraints: input.constraints,
    weights: { ...DEFAULT_OBJECTIVE_WEIGHTS, ...input.weights },
  }
}

function buildSynergies(abilities: Ability[], spec: SpecSnapshot): SynergyEdge[] {
  const edges = new Map<string, SynergyEdge>()
  const byId = new Map(abilities.map((ability) => [ability.id, ability]))
  const idsBySpellId = new Map<number, string[]>()
  for (const ability of abilities) {
    if (ability.variantKind !== 'base' || ability.spellId === 0) continue
    idsBySpellId.set(ability.spellId, [...(idsBySpellId.get(ability.spellId) ?? []), ability.id])
  }

  const addEdge = (idA: string, idB: string, weight: number) => {
    if (idA === idB) return
    const key = idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
    const existing = edges.get(key)
    if (existing) {
      existing.weight = Math.max(existing.weight, weight)
      return
    }
    const [abilityIdA, abilityIdB] = idA < idB ? [idA, idB] : [idB, idA]
    edges.set(key, { abilityIdA, abilityIdB, weight })
  }

  for (const [spellIdA, spellIdB, strength] of spec.synergyPairs) {
    for (const idA of idsBySpellId.get(spellIdA) ?? []) {
      for (const idB of idsBySpellId.get(spellIdB) ?? []) {
        addEdge(idA, idB, Math.min(APL_SYNERGY_CAP, strength * APL_SYNERGY_CAP))
      }
    }
  }

  for (const group of SEMANTIC_GROUPS) {
    const groupSet = new Set(group)
    const members = abilities.filter(
      (ability) => groupSet.has(ability.category) && ability.variantKind === 'base',
    )
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i]
        const b = members[j]
        if (a && b) addEdge(a.id, b.id, SEMANTIC_SYNERGY)
      }
    }
  }

  const defensives = abilities.filter(
    (ability) => ability.category === 'defensive-major' && ability.variantKind === 'base',
  )
  for (const trinket of abilities) {
    if (trinket.category !== 'trinket') continue
    for (const defensive of defensives) {
      addEdge(trinket.id, defensive.id, TRINKET_DEFENSIVE_SYNERGY)
    }
  }

  for (const ability of abilities) {
    if (ability.variantKind === 'focus' && ability.baseAbilityId && byId.has(ability.baseAbilityId)) {
      addEdge(ability.id, ability.baseAbilityId, VARIANT_SYNERGY)
      if (byId.has('focus:set')) addEdge(ability.id, 'focus:set', FOCUS_SET_SYNERGY)
    }
  }

  return [...edges.values()]
}

function buildArenaTriplets(abilities: Ability[]): string[][] {
  const byBase = new Map<string, Map<string, string>>()
  for (const ability of abilities) {
    if (!ability.baseAbilityId) continue
    if (ability.variantKind === 'arena1' || ability.variantKind === 'arena2' || ability.variantKind === 'arena3') {
      const group = byBase.get(ability.baseAbilityId) ?? new Map<string, string>()
      group.set(ability.variantKind, ability.id)
      byBase.set(ability.baseAbilityId, group)
    }
  }
  const triplets: string[][] = []
  for (const group of byBase.values()) {
    const one = group.get('arena1')
    const two = group.get('arena2')
    const three = group.get('arena3')
    if (one && two && three) triplets.push([one, two, three])
  }
  return triplets
}
