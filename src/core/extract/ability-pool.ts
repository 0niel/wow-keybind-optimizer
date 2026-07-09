import type { NodeSelection } from '@/core/decoder'
import type {
  RaceRecord,
  SpecSnapshot,
  SpellMetaRecord,
  SpellMetaShard,
} from '@/core/model/snapshot'
import type { Ability, ArenaTargetScheme, GameMode } from '@/core/model/ability'
import { isMaintenanceAura } from '@/core/model/usage'

export interface ExtractionInput {
  spec: SpecSnapshot
  spellMeta: SpellMetaShard
  selections: NodeSelection[]
  race: RaceRecord | null
  pvpTalentIds: number[]
  mode: GameMode
  arenaTargetScheme: ArenaTargetScheme
  spellNames?: Record<string, string>
  includeTargetBinds?: boolean
}

const PVP_MODES: GameMode[] = ['arena', 'rbg', 'battleground']

export function filterExcludedAbilities(abilities: Ability[], excludedIds: string[]): Ability[] {
  if (excludedIds.length === 0) return abilities
  const excluded = new Set(excludedIds)
  return abilities.filter(
    (ability) =>
      !excluded.has(ability.id) &&
      !(ability.baseAbilityId !== null && excluded.has(ability.baseAbilityId)),
  )
}

const CPM_CAP = 10
const APL_RANK_BEST = 0.9
const APL_RANK_WORST = 0.15
const SITUATIONAL_FALLBACK_CAP = 0.5

const SITUATIONAL_CATEGORIES = new Set([
  'utility',
  'cc-hard',
  'cc-soft',
  'dispel',
  'mobility',
  'heal-utility',
  'external',
  'defensive-minor',
])

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
    for (const entry of activeEntries(node, selection)) {
      if (entry.spellId === 0) continue
      talentSpellIds.add(entry.spellId)
      if (entry.overridesSpellId > 0) overriddenSpellIds.add(entry.overridesSpellId)
      sourceNodesBySpellId.set(entry.spellId, [
        ...(sourceNodesBySpellId.get(entry.spellId) ?? []),
        node.id,
      ])
    }
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

  if (input.spellNames && pvpSpellIds.size > 0) {
    const pvpNames = new Set<string>()
    for (const spellId of pvpSpellIds) {
      if (!spellMeta[String(spellId)]) continue
      const name = input.spellNames[String(spellId)]
      if (name) pvpNames.add(name)
    }
    for (const spellId of [...allSpellIds]) {
      if (pvpSpellIds.has(spellId)) continue
      const name = input.spellNames[String(spellId)]
      if (name && pvpNames.has(name)) allSpellIds.delete(spellId)
    }
  }

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
    abilities.push(buildAbility(spellId, meta, spec, sourceNodesBySpellId.get(spellId) ?? [], mode))
  }

  assignRotationRanks(abilities, spec)

  abilities.push(trinketAbility('trinket:1', isPvp))
  if (isPvp) abilities.push(pvpTrinketAbility())

  if (mode === 'arena') {
    const includeTargetBinds = input.includeTargetBinds ?? true
    if (input.arenaTargetScheme === 'focus') {
      const interrupts = abilities.filter(
        (ability) => ability.variantKind === 'base' && ability.category === 'interrupt',
      )
      const primaryCc = abilities
        .filter(
          (ability) =>
            ability.variantKind === 'base' &&
            ability.category === 'cc-hard' &&
            ability.targeting === 'enemy',
        )
        .sort((a, b) => b.frequency - a.frequency || a.spellId - b.spellId)
        .slice(0, 1)
      for (const ability of [...interrupts, ...primaryCc]) {
        abilities.push(variantOf(ability, 'focus', 0.8))
      }
      abilities.push(setFocusAbility())
    }
    if (includeTargetBinds) {
      abilities.push(
        targetingAbility('target:arena1', 'arena1'),
        targetingAbility('target:arena2', 'arena2'),
        targetingAbility('target:arena3', 'arena3'),
      )
    }
  }

  return abilities
}

function activeEntries(
  node: SpecSnapshot['nodes'][number],
  selection: NodeSelection,
): SpecSnapshot['nodes'][number]['entries'] {
  if (node.kind === 'tiered') {
    const active: SpecSnapshot['nodes'][number]['entries'] = []
    let remaining = selection.ranks
    for (const entry of node.entries) {
      if (remaining <= 0) break
      active.push(entry)
      remaining -= entry.maxRanks
    }
    return active
  }
  const entry =
    selection.choiceIndex !== null ? node.entries[selection.choiceIndex] : node.entries[0]
  return entry ? [entry] : []
}

function assignRotationRanks(abilities: Ability[], spec: SpecSnapshot): void {
  const aplRankOf = (ability: Ability): number =>
    spec.frequencyBySpellId[String(ability.spellId)]?.aplRank ?? Number.MAX_SAFE_INTEGER
  const ranked = abilities
    .filter(
      (ability) =>
        (ability.category === 'rotational-core' || ability.category === 'rotational-proc') &&
        ability.variantKind === 'base' &&
        (ability.frequency >= 0.35 || aplRankOf(ability) !== Number.MAX_SAFE_INTEGER),
    )
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency
      if (aplRankOf(a) !== aplRankOf(b)) return aplRankOf(a) - aplRankOf(b)
      return a.spellId - b.spellId
    })
  ranked.forEach((ability, index) => {
    ability.rotationRank = ranked.length > 1 ? index / (ranked.length - 1) : 0
  })
}

function buildAbility(
  spellId: number,
  meta: SpellMetaRecord,
  spec: SpecSnapshot,
  sourceNodeIds: number[],
  mode: GameMode,
): Ability {
  return {
    id: `spell:${spellId}`,
    spellId,
    category: meta.category,
    variantKind: 'base',
    baseAbilityId: null,
    frequency: resolveFrequency(spellId, meta, spec, mode),
    reactivity: meta.reactivity,
    panic: meta.panic,
    offGcd: meta.gcd === 'off',
    auraDurationMs: meta.auraDurationMs,
    maintenance: meta.maintenance,
    targeting: meta.targeting,
    sourceNodeIds,
    importance: 0,
    rotationRank: null,
  }
}

function resolveFrequency(
  spellId: number,
  meta: SpellMetaRecord,
  spec: SpecSnapshot,
  mode: GameMode,
): number {
  if (meta.maintenance && isMaintenanceAura(meta.auraDurationMs)) return 0.01
  const record = spec.frequencyBySpellId[String(spellId)]
  if (mode === 'raid' && record?.cpm !== null && record?.cpm !== undefined) {
    return Math.min(1, record.cpm / CPM_CAP)
  }
  if (record?.aplRank !== null && record?.aplRank !== undefined) {
    const ranks = Object.values(spec.frequencyBySpellId)
      .map((r) => r.aplRank)
      .filter((rank): rank is number => rank !== null)
    const maxRank = Math.max(1, ...ranks)
    return APL_RANK_BEST - (APL_RANK_BEST - APL_RANK_WORST) * (record.aplRank / maxRank)
  }
  const situationalCap = SITUATIONAL_CATEGORIES.has(meta.category)
    ? SITUATIONAL_FALLBACK_CAP
    : 1
  if (meta.cooldownMs > 0) {
    return Math.min(situationalCap, Math.min(1, 60000 / meta.cooldownMs) * 0.8)
  }
  return Math.min(situationalCap, 0.3)
}

function targetingAbility(id: string, kind: 'arena1' | 'arena2' | 'arena3'): Ability {
  return {
    id,
    spellId: 0,
    category: 'targeting',
    variantKind: kind,
    baseAbilityId: 'target:arena',
    frequency: 0.45,
    reactivity: 0.4,
    panic: 0,
    offGcd: true,
    targeting: 'none',
    sourceNodeIds: [],
    importance: 0,
    rotationRank: null,
  }
}

function setFocusAbility(): Ability {
  return {
    id: 'focus:set',
    spellId: 0,
    category: 'targeting',
    variantKind: 'base',
    baseAbilityId: null,
    frequency: 0.35,
    reactivity: 0.3,
    panic: 0,
    offGcd: true,
    targeting: 'none',
    sourceNodeIds: [],
    importance: 0,
    rotationRank: null,
  }
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
    rotationRank: null,
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
    rotationRank: null,
  }
}
