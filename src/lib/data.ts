import type {
  ClassRecord,
  RaceRecord,
  SnapshotManifest,
  SpecSnapshot,
  SpellMetaShard,
  SpellTextShard,
} from '@/core/model/snapshot'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const cache = new Map<string, unknown>()

async function fetchJson<T>(path: string): Promise<T> {
  const cached = cache.get(path)
  if (cached !== undefined) return cached as T
  const response = await fetch(`${basePath}${path}`)
  if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`)
  const payload = (await response.json()) as T
  cache.set(path, payload)
  return payload
}

export interface TextShard {
  spells: SpellTextShard
  subTrees: Record<string, string>
}

export async function loadLatestBuild(): Promise<string> {
  const { build } = await fetchJson<{ build: string }>('/data/retail/latest.json')
  return build
}

export async function loadManifest(build: string): Promise<SnapshotManifest> {
  return fetchJson<SnapshotManifest>(`/data/retail/${build}/manifest.json`)
}

export async function loadClasses(build: string): Promise<ClassRecord[]> {
  return fetchJson<ClassRecord[]>(`/data/retail/${build}/classes.json`)
}

export async function loadRaces(build: string): Promise<RaceRecord[]> {
  return fetchJson<RaceRecord[]>(`/data/retail/${build}/races.json`)
}

export async function loadSpellMeta(build: string): Promise<SpellMetaShard> {
  return fetchJson<SpellMetaShard>(`/data/retail/${build}/spell-meta.json`)
}

export async function loadSpec(build: string, specId: number): Promise<SpecSnapshot> {
  return fetchJson<SpecSnapshot>(`/data/retail/${build}/specs/${specId}.json`)
}

export async function loadText(build: string, locale: string): Promise<TextShard> {
  return fetchJson<TextShard>(`/data/retail/${build}/text/${locale}.json`)
}

export interface ExamplePreset {
  id: string
  string: string
  mode: string
  scheme?: string
  raceSlug?: string
}

export async function loadExamples(): Promise<ExamplePreset[]> {
  return fetchJson<ExamplePreset[]>('/data/examples.json')
}

export const FALLBACK_ICON = 'inv_misc_questionmark'

export function spellIconUrl(icon: string): string {
  const clean = icon.trim().replace(/\s+/g, '').toLowerCase() || FALLBACK_ICON
  return `https://wow.zamimg.com/images/wow/icons/large/${clean}.jpg`
}

export const TRINKET_ICON = 'inv_misc_pocketwatch_01'
export const PVP_TRINKET_ICON = 'inv_jewelry_trinketpvp_01'
export const TARGET_ICON = 'ability_hunter_snipershot'
export const FOCUS_ICON = 'ability_hunter_mastermarksman'

export function abilityIconName(spellId: number, abilityId: string, metaIcon: string | undefined): string | null {
  if (spellId > 0) return metaIcon ?? null
  if (abilityId === 'trinket:pvp') return PVP_TRINKET_ICON
  if (abilityId.startsWith('trinket')) return TRINKET_ICON
  if (abilityId.startsWith('target:arena')) return TARGET_ICON
  if (abilityId === 'focus:set') return FOCUS_ICON
  return null
}

export interface ZeroSpellLabels {
  trinket: string
  pvpTrinket: string
  targetArena: (n: number) => string
  setFocus: string
}

export function zeroSpellLabel(abilityId: string, labels: ZeroSpellLabels): string {
  if (abilityId === 'trinket:pvp') return labels.pvpTrinket
  if (abilityId.startsWith('trinket')) return labels.trinket
  if (abilityId.startsWith('target:arena')) return labels.targetArena(Number(abilityId.slice(-1)) || 1)
  if (abilityId === 'focus:set') return labels.setFocus
  return labels.trinket
}
