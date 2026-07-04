import type { TraitNodeKind } from '@/core/decoder'
import type { AbilityCategory } from './ability-category'

export type SpecRole = 'dps' | 'healer' | 'tank'

export type Targeting = 'self' | 'enemy' | 'ally' | 'ground' | 'none'

export type TreeSection = 'class' | 'spec' | 'hero'

export interface SnapshotManifest {
  gameVersion: string
  build: string
  generatedAt: string
  locales: string[]
  specIds: number[]
}

export interface ClassRecord {
  id: number
  slug: string
  color: string
  names: Record<string, string>
  specIds: number[]
}

export interface RaceRecord {
  id: number
  slug: string
  faction: 'alliance' | 'horde' | 'neutral'
  names: Record<string, string>
  racialSpellIds: number[]
}

export interface SpellMetaRecord {
  id: number
  icon: string
  cooldownMs: number
  chargeCooldownMs: number
  charges: number
  gcd: 'normal' | 'off'
  rangeYd: number
  targeting: Targeting
  category: AbilityCategory
  reactivity: number
  panic: number
}

export interface TraitEntryRecord {
  entryId: number
  definitionId: number
  spellId: number
  overridesSpellId: number
  subTreeId: number
  maxRanks: number
  index: number
}

export interface SpecTraitNodeRecord {
  id: number
  kind: TraitNodeKind
  maxRanks: number
  posX: number
  posY: number
  subTreeId: number
  section: TreeSection
  forSpec: boolean
  entries: TraitEntryRecord[]
}

export interface PvpTalentRecord {
  id: number
  spellId: number
}

export interface AbilityFrequencyRecord {
  cpm: number | null
  aplRank: number | null
}

export interface SubTreeRecord {
  id: number
  name: string
}

export interface BaselineSpellRecord {
  spellId: number
  raceIds?: number[]
}

export interface SpecSnapshot {
  specId: number
  classId: number
  role: SpecRole
  names: Record<string, string>
  traitTreeId: number
  nodes: SpecTraitNodeRecord[]
  subTrees: SubTreeRecord[]
  baseline: BaselineSpellRecord[]
  pvpTalents: PvpTalentRecord[]
  defaultPvpTalentIds: number[]
  frequencyBySpellId: Record<string, AbilityFrequencyRecord>
  synergyPairs: Array<[number, number, number]>
  iconBySpellId: Record<string, string>
}

export interface SpellTextRecord {
  name: string
  description: string
}

export type SpellTextShard = Record<string, SpellTextRecord>

export type SpellMetaShard = Record<string, SpellMetaRecord>
