import { decodeLoadout } from '@/core/decoder'
import type { NodeSelection } from '@/core/decoder'
import { extractAbilityPool } from '@/core/extract/ability-pool'
import { buildAssignmentProblem } from '@/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '@/core/solver'
import type { SolverStrategyId } from '@/core/solver'
import type {
  Ability,
  ArenaTargetScheme,
  GameMode,
  Slot,
  SolveResult,
  SynergyEdge,
  UserConstraints,
} from '@/core/model/ability'
import type { HardwareConfig } from '@/core/model/hardware'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'

export interface SolverRequest {
  requestId: number
  spec: SpecSnapshot
  spellMeta: SpellMetaShard
  importString: string
  race: RaceRecord | null
  pvpTalentIds: number[]
  mode: GameMode
  arenaTargetScheme: ArenaTargetScheme
  hardware: HardwareConfig
  constraints: UserConstraints
  seed: number
  strategyId: SolverStrategyId
  spellNames?: Record<string, string>
  preservedBinds?: Record<string, string>
  anchorInterruptSlotId?: string
  includeTargetBinds?: boolean
}

export interface LayoutVariant {
  seed: number
  result: SolveResult
}

export interface SolverSuccess {
  requestId: number
  status: 'done'
  variants: LayoutVariant[]
  baseline: SolveResult
  abilities: Ability[]
  slots: Slot[]
  synergies: SynergyEdge[]
  selections: NodeSelection[]
}

export interface SolverFailure {
  requestId: number
  status: 'error'
  code: string
  message: string
}

export type SolverResponse = SolverSuccess | SolverFailure

self.onmessage = (event: MessageEvent<SolverRequest>) => {
  const request = event.data
  try {
    const decoded = decodeLoadout(
      request.importString.trim(),
      request.spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
    )
    const abilities = extractAbilityPool({
      spec: request.spec,
      spellMeta: request.spellMeta,
      selections: decoded.selections,
      race: request.race,
      pvpTalentIds: request.pvpTalentIds,
      mode: request.mode,
      arenaTargetScheme: request.arenaTargetScheme,
      spellNames: request.spellNames,
      includeTargetBinds: request.includeTargetBinds,
    })
    const preservedBinds: Record<string, string> = { ...(request.preservedBinds ?? {}) }
    if (request.anchorInterruptSlotId) {
      const interrupt = abilities.find(
        (ability) => ability.category === 'interrupt' && ability.variantKind === 'base',
      )
      if (interrupt && preservedBinds[interrupt.id] === undefined) {
        preservedBinds[interrupt.id] = request.anchorInterruptSlotId
      }
    }
    const abilityIds = new Set(abilities.map((ability) => ability.id))
    for (const abilityId of Object.keys(preservedBinds)) {
      if (!abilityIds.has(abilityId)) delete preservedBinds[abilityId]
    }
    const problem = buildAssignmentProblem({
      abilities,
      spec: request.spec,
      hardware: request.hardware,
      mode: request.mode,
      arenaTargetScheme: request.arenaTargetScheme,
      constraints: {
        ...request.constraints,
        preservedBinds: { ...request.constraints.preservedBinds, ...preservedBinds },
      },
    })
    const variantSeeds = [1, 2, 3, 4]
    const variants: LayoutVariant[] = []
    const seenSignatures = new Set<string>()
    for (const seed of variantSeeds) {
      const result = solveAssignment(problem, {
        strategyId: request.strategyId,
        seed,
        moveBudget: DEFAULT_MOVE_BUDGET,
        hardware: request.hardware,
      })
      const signature = result.assignments
        .map((bind) => `${bind.abilityId}=${bind.slotId}`)
        .sort()
        .join('|')
      if (seenSignatures.has(signature)) continue
      seenSignatures.add(signature)
      variants.push({ seed, result })
    }
    variants.sort((a, b) => b.result.objective - a.result.objective)
    const baseline = solveAssignment(problem, {
      strategyId: 'greedy',
      seed: 1,
      moveBudget: 0,
      hardware: request.hardware,
    })
    const response: SolverSuccess = {
      requestId: request.requestId,
      status: 'done',
      variants,
      baseline,
      abilities: problem.abilities,
      slots: problem.slots,
      synergies: problem.synergies,
      selections: decoded.selections,
    }
    self.postMessage(response)
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'unknown'
    const response: SolverFailure = {
      requestId: request.requestId,
      status: 'error',
      code,
      message: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
