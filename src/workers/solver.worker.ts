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
}

export interface SolverSuccess {
  requestId: number
  status: 'done'
  result: SolveResult
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
    })
    const problem = buildAssignmentProblem({
      abilities,
      spec: request.spec,
      hardware: request.hardware,
      mode: request.mode,
      arenaTargetScheme: request.arenaTargetScheme,
      constraints: request.constraints,
    })
    const result = solveAssignment(problem, {
      strategyId: request.strategyId,
      seed: request.seed,
      moveBudget: DEFAULT_MOVE_BUDGET,
      hardware: request.hardware,
    })
    const baseline = solveAssignment(problem, {
      strategyId: 'greedy',
      seed: request.seed,
      moveBudget: 0,
      hardware: request.hardware,
    })
    const response: SolverSuccess = {
      requestId: request.requestId,
      status: 'done',
      result,
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
