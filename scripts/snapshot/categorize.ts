import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeSpellName } from '../../src/core/model/spell-name'
import type { AbilityCategory, CuratedAbilityTraits } from '../../src/core/model/ability-category'
import type { Targeting } from '../../src/core/model/snapshot'
import type { UncategorizedSpellMeta } from './spells'

export interface CuratedData {
  traitsByName: Map<string, CuratedAbilityTraits>
  denylist: Set<string>
}

export function loadCuratedData(): CuratedData {
  const root = join(process.cwd(), 'data', 'curated')
  const traits = JSON.parse(readFileSync(join(root, 'ability-traits.json'), 'utf8')) as Record<
    string,
    CuratedAbilityTraits
  >
  const denylist = JSON.parse(readFileSync(join(root, 'denylist.json'), 'utf8')) as string[]
  return {
    traitsByName: new Map(Object.entries(traits)),
    denylist: new Set(denylist),
  }
}

export function categorize(
  meta: UncategorizedSpellMeta,
  englishName: string,
  curated: CuratedData,
): { category: AbilityCategory; reactivity: number; panic: number; targeting?: Targeting } {
  const normalized = normalizeSpellName(englishName)
  const traits = curated.traitsByName.get(normalized)
  if (traits) {
    return {
      category: traits.category,
      reactivity: traits.reactivity ?? 0,
      panic: traits.panic ?? 0,
      ...(traits.maintenance ? { maintenance: true } : {}),
      ...(traits.targeting ? { targeting: traits.targeting } : {}),
    }
  }
  if (meta.cooldownMs >= 120_000 && meta.targeting === 'self') {
    return { category: 'cooldown-burst', reactivity: 0, panic: 0 }
  }
  if (meta.cooldownMs >= 45_000 && meta.targeting === 'enemy') {
    return { category: 'cooldown-burst', reactivity: 0, panic: 0 }
  }
  if (meta.targeting === 'ally') {
    return {
      category: meta.cooldownMs >= 30_000 ? 'external' : 'heal-utility',
      reactivity: meta.cooldownMs >= 30_000 ? 0.75 : 0.35,
      panic: 0,
    }
  }
  return { category: 'rotational-core', reactivity: 0, panic: 0 }
}

const DENIED_PREFIXES = [
  'portal_',
  'teleport_',
  'ancient_portal_',
  'ancient_teleport_',
  'summon_',
  'apprentice_riding',
  'journeyman_riding',
  'expert_riding',
  'artisan_riding',
  'master_riding',
]

export function isDenied(englishName: string, curated: CuratedData): boolean {
  const normalized = normalizeSpellName(englishName)
  if (curated.denylist.has(normalized)) return true
  if (normalized.endsWith('_off_hand')) return true
  return DENIED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}
