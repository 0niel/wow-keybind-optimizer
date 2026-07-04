import type { TraitNodeKind } from '@/core/decoder'

export type SpecRole = 'dps' | 'healer' | 'tank'

export type Targeting = 'self' | 'enemy' | 'ally' | 'ground' | 'none'

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
  specIds: number[]
}

export interface RaceRecord {
  id: number
  slug: string
  faction: 'alliance' | 'horde' | 'neutral'
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

export interface SpecSnapshot {
  specId: number
  classId: number
  role: SpecRole
  traitTreeId: number
  nodes: SpecTraitNodeRecord[]
  subTrees: SubTreeRecord[]
  baselineSpellIds: number[]
  pvpTalents: PvpTalentRecord[]
  defaultPvpTalentIds: number[]
  frequencyBySpellId: Record<string, AbilityFrequencyRecord>
  synergyPairs: Array<[number, number, number]>
}

export interface SpellTextRecord {
  name: string
  description: string
}

export type SpellTextShard = Record<string, SpellTextRecord>

export type SpellMetaShard = Record<string, SpellMetaRecord>
