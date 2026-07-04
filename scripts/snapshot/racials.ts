import { asInt } from '../lib/csv'
import { loadTable } from '../lib/wago'
import type { WagoSource } from '../lib/wago'

export interface RaceData {
  id: number
  name: string
  slug: string
  faction: 'alliance' | 'horde' | 'neutral'
  playableRaceBit: number
  racialSpellIds: number[]
}

const FACTION_BY_ALLIANCE_COLUMN: Record<number, 'alliance' | 'horde' | 'neutral'> = {
  0: 'alliance',
  1: 'horde',
  2: 'neutral',
}

export async function buildRaceData(
  source: WagoSource,
  passiveSpellIds: Set<number>,
): Promise<RaceData[]> {
  const [races, skillLines, skillLineAbilities] = await Promise.all([
    loadTable(source, 'ChrRaces'),
    loadTable(source, 'SkillLine'),
    loadTable(source, 'SkillLineAbility'),
  ])

  const racialSkillLineByRaceName = new Map<string, number[]>()
  for (const row of skillLines) {
    const name = row['DisplayName_lang'] ?? ''
    if (!name.startsWith('Racial - ')) continue
    const raceName = name.slice('Racial - '.length)
    racialSkillLineByRaceName.set(raceName, [
      ...(racialSkillLineByRaceName.get(raceName) ?? []),
      asInt(row, 'ID'),
    ])
  }

  const spellsBySkillLine = new Map<number, number[]>()
  for (const row of skillLineAbilities) {
    const skillLine = asInt(row, 'SkillLine')
    spellsBySkillLine.set(skillLine, [...(spellsBySkillLine.get(skillLine) ?? []), asInt(row, 'Spell')])
  }

  const bySlug = new Map<string, RaceData>()
  for (const row of races) {
    if (asInt(row, 'PlayableRaceBit') < 0) continue
    const name = row['Name_lang'] ?? ''
    const skillLineIds = racialSkillLineByRaceName.get(name)
    if (!skillLineIds) continue
    const spellIds = [
      ...new Set(skillLineIds.flatMap((skillLine) => spellsBySkillLine.get(skillLine) ?? [])),
    ].filter((spellId) => !passiveSpellIds.has(spellId))
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
    const existing = bySlug.get(slug)
    if (existing) {
      existing.racialSpellIds = [...new Set([...existing.racialSpellIds, ...spellIds])]
      if (existing.faction !== (FACTION_BY_ALLIANCE_COLUMN[asInt(row, 'Alliance')] ?? 'neutral')) {
        existing.faction = 'neutral'
      }
      continue
    }
    bySlug.set(slug, {
      id: asInt(row, 'ID'),
      name,
      slug,
      faction: FACTION_BY_ALLIANCE_COLUMN[asInt(row, 'Alliance')] ?? 'neutral',
      playableRaceBit: asInt(row, 'PlayableRaceBit'),
      racialSpellIds: spellIds,
    })
  }
  return [...bySlug.values()]
}
