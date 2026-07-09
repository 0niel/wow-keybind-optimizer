import type {
  ClassRecord,
  RaceRecord,
  SnapshotManifest,
  SpecSnapshot,
  SpellMetaShard,
  SpellTextShard,
} from '@/core/model/snapshot'
import { z } from 'zod'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const cache = new Map<string, unknown>()

const latestSchema = z.object({ build: z.string().min(1) })
const manifestSchema = z.object({
  gameVersion: z.string().min(1),
  build: z.string().min(1),
  generatedAt: z.string().datetime(),
  locales: z.array(z.string().min(2)),
  specIds: z.array(z.number().int().positive()).min(1),
  frequencySources: z
    .record(
      z.string(),
      z.object({
        encounterId: z.number().int().positive(),
        encounterName: z.string().min(1),
        metric: z.enum(['dps', 'hps']),
        samples: z.array(
          z.object({ reportId: z.string().min(1), fightId: z.number().int().positive() }),
        ),
      }),
    )
    .optional(),
  sources: z
    .array(
      z.object({
        id: z.enum(['game-tables', 'combat-logs', 'simulation', 'spell-text']),
        name: z.string().min(1),
        url: z.string().url(),
      }),
    )
    .optional(),
  coverage: z
    .object({
      specs: z.number().int().nonnegative(),
      spellMeta: z.number().int().nonnegative(),
      localizedSpells: z.number().int().nonnegative(),
      combatLogSpecs: z.number().int().nonnegative(),
      simulationSpecs: z.number().int().nonnegative(),
    })
    .optional(),
})

function validated<T>(path: string, schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload)
  if (result.success) return result.data
  throw new Error(`Invalid game data in ${path}: ${result.error.issues[0]?.message ?? 'schema mismatch'}`)
}

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
  const path = '/data/retail/latest.json'
  const payload = await fetchJson<unknown>(path)
  const { build } = validated(path, latestSchema, payload)
  return build
}

export async function loadManifest(build: string): Promise<SnapshotManifest> {
  const path = `/data/retail/${build}/manifest.json`
  return validated(path, manifestSchema, await fetchJson<unknown>(path)) as SnapshotManifest
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
  // FileData icon names occasionally contain spaces. Zamimg exposes those
  // files with hyphen-separated slugs; deleting whitespace produces a 404.
  const clean = icon.trim().replace(/\s+/g, '-').toLowerCase() || FALLBACK_ICON
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
