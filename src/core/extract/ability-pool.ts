import type { NodeSelection } from '@/core/decoder'
import type {
  RaceRecord,
  SpecSnapshot,
  SpellMetaRecord,
  SpellMetaShard,
} from '@/core/model/snapshot'
import type { Ability, ArenaTargetScheme, GameMode } from '@/core/model/ability'

export interface ExtractionInput {
  spec: SpecSnapshot
  spellMeta: SpellMetaShard
  selections: NodeSelection[]
  race: RaceRecord | null
  pvpTalentIds: number[]
  mode: GameMode
  arenaTargetScheme: ArenaTargetScheme
}

const PVP_MODES: GameMode[] = ['arena', 'rbg', 'battleground']

const CPM_CAP = 10
const APL_RANK_BEST = 0.9
const APL_RANK_WORST = 0.15

export function extractAbilityPool(input: ExtractionInput): Ability[] {
  const { spec, spellMeta, selections, race, pvpTalentIds, mode } = input
  const isPvp = PVP_MODES.includes(mode)

  const sourceNodesBySpellId = new Map<number, number[]>()
  const talentSpellIds = new Set<number>()
  const overriddenSpellIds = new Set<number>()

  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]))
  for (const selection of selections) {
    const node = nodeById.get(selection.nodeId)
    if (!node || selection.ranks === 0) continue
    const entry =
      selection.choiceIndex !== null ? node.entries[selection.choiceIndex] : node.entries[0]
    if (!entry || entry.spellId === 0) continue
    talentSpellIds.add(entry.spellId)
    if (entry.overridesSpellId > 0) overriddenSpellIds.add(entry.overridesSpellId)
    sourceNodesBySpellId.set(entry.spellId, [
      ...(sourceNodesBySpellId.get(entry.spellId) ?? []),
      node.id,
    ])
  }

  const baselineSpellIds = new Set<number>()
  for (const record of spec.baseline) {
    if (record.raceIds && (!race || !record.raceIds.includes(race.id))) continue
    baselineSpellIds.add(record.spellId)
  }

  const pvpSpellIds = new Set<number>()
  if (isPvp) {
    for (const talent of spec.pvpTalents) {
      if (pvpTalentIds.includes(talent.id) && talent.spellId > 0) {
        pvpSpellIds.add(talent.spellId)
      }
    }
  }

  const racialSpellIds = new Set<number>(race?.racialSpellIds ?? [])

  const allSpellIds = new Set<number>([
    ...baselineSpellIds,
    ...talentSpellIds,
    ...pvpSpellIds,
    ...racialSpellIds,
  ])
  for (const spellId of overriddenSpellIds) allSpellIds.delete(spellId)

  const seenIcons = new Map<string, number>()
  const abilities: Ability[] = []
  for (const spellId of allSpellIds) {
    const meta = spellMeta[String(spellId)]
    if (!meta) continue
    if (racialSpellIds.has(spellId) && !talentSpellIds.has(spellId) && !baselineSpellIds.has(spellId)) {
      const iconKey = `${meta.icon}:${meta.category}`
      const existing = seenIcons.get(iconKey)
      if (existing !== undefined) continue
      seenIcons.set(iconKey, spellId)
    }
    abilities.push(buildAbility(spellId, meta, spec, sourceNodesBySpellId.get(spellId) ?? []))
  }

  abilities.push(trinketAbility('trinket:1', isPvp))
  if (isPvp) abilities.push(pvpTrinketAbility())

  if (mode === 'arena') {
    for (const ability of [...abilities]) {
      if (!spawnsTargetVariants(ability)) continue
      if (input.arenaTargetScheme === 'focus') {
        abilities.push(variantOf(ability, 'focus', 0.8))
      } else {
        abilities.push(variantOf(ability, 'arena1', 0.65))
        abilities.push(variantOf(ability, 'arena2', 0.65))
        abilities.push(variantOf(ability, 'arena3', 0.65))
      }
    }
  }

  return abilities
}

function buildAbility(
  spellId: number,
  meta: SpellMetaRecord,
  spec: SpecSnapshot,
  sourceNodeIds: number[],
): Ability {
  return {
    id: `spell:${spellId}`,
    spellId,
    category: meta.category,
    variantKind: 'base',
    baseAbilityId: null,
    frequency: resolveFrequency(spellId, meta, spec),
    reactivity: meta.reactivity,
    panic: meta.panic,
    offGcd: meta.gcd === 'off',
    targeting: meta.targeting,
    sourceNodeIds,
    importance: 0,
  }
}

function resolveFrequency(spellId: number, meta: SpellMetaRecord, spec: SpecSnapshot): number {
  const record = spec.frequencyBySpellId[String(spellId)]
  if (record?.cpm !== null && record?.cpm !== undefined) {
    return Math.min(1, record.cpm / CPM_CAP)
  }
  if (record?.aplRank !== null && record?.aplRank !== undefined) {
    const ranks = Object.values(spec.frequencyBySpellId)
      .map((r) => r.aplRank)
      .filter((rank): rank is number => rank !== null)
    const maxRank = Math.max(1, ...ranks)
    return APL_RANK_BEST - (APL_RANK_BEST - APL_RANK_WORST) * (record.aplRank / maxRank)
  }
  if (meta.cooldownMs > 0) {
    return Math.min(1, 60000 / meta.cooldownMs) * 0.8
  }
  return 0.3
}

function spawnsTargetVariants(ability: Ability): boolean {
  if (ability.variantKind !== 'base') return false
  if (ability.category === 'interrupt') return true
  return ability.category === 'cc-hard' && ability.targeting === 'enemy'
}

function variantOf(
  ability: Ability,
  kind: 'focus' | 'arena1' | 'arena2' | 'arena3',
  importanceFactor: number,
): Ability {
  return {
    ...ability,
    id: `${ability.id}:${kind}`,
    variantKind: kind,
    baseAbilityId: ability.id,
    frequency: ability.frequency * importanceFactor,
    sourceNodeIds: ability.sourceNodeIds,
  }
}

function trinketAbility(id: string, isPvp: boolean): Ability {
  return {
    id,
    spellId: 0,
    category: 'trinket',
    variantKind: 'base',
    baseAbilityId: null,
    frequency: 0.2,
    reactivity: 0,
    panic: isPvp ? 0 : 0.4,
    offGcd: true,
    targeting: 'self',
    sourceNodeIds: [],
    importance: 0,
  }
}

function pvpTrinketAbility(): Ability {
  return {
    id: 'trinket:pvp',
    spellId: 0,
    category: 'trinket',
    variantKind: 'base',
    baseAbilityId: null,
    frequency: 0.15,
    reactivity: 0,
    panic: 1,
    offGcd: false,
    targeting: 'self',
    sourceNodeIds: [],
    importance: 0,
  }
}
