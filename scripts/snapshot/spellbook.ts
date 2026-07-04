import { asInt } from '../lib/csv'
import { loadTable } from '../lib/wago'
import type { WagoSource } from '../lib/wago'

const CLASS_SKILL_LINE_CATEGORY = 7

export interface BaselineSpell {
  spellId: number
  raceMaskLow: bigint
  raceMaskHigh: bigint
}

export interface SpellbookData {
  baselineByClassId: Map<number, BaselineSpell[]>
  specSpellsBySpecId: Map<number, Array<{ spellId: number; overridesSpellId: number }>>
  classNameById: Map<number, string>
  classSlugById: Map<number, string>
  classColorById: Map<number, string>
  specIdsByClassId: Map<number, number[]>
  roleBySpecId: Map<number, 'dps' | 'healer' | 'tank'>
}

const ROLE_BY_CHR_SPECIALIZATION_ROLE: Record<number, 'tank' | 'healer' | 'dps'> = {
  0: 'tank',
  1: 'healer',
  2: 'dps',
  3: 'dps',
}

export async function buildSpellbookData(source: WagoSource): Promise<SpellbookData> {
  const [skillLines, skillLineAbilities, specializationSpells, chrClasses, chrSpecializations] =
    await Promise.all([
      loadTable(source, 'SkillLine'),
      loadTable(source, 'SkillLineAbility'),
      loadTable(source, 'SpecializationSpells'),
      loadTable(source, 'ChrClasses'),
      loadTable(source, 'ChrSpecialization'),
    ])

  const classNameById = new Map<number, string>()
  const classSlugById = new Map<number, string>()
  const classColorById = new Map<number, string>()
  for (const row of chrClasses) {
    const id = asInt(row, 'ID')
    classNameById.set(id, row['Name_lang'] ?? '')
    classSlugById.set(id, (row['Filename'] ?? '').toLowerCase().replace(/_/g, '-'))
    const toHex = (column: string) => asInt(row, column).toString(16).padStart(2, '0')
    classColorById.set(id, `#${toHex('ClassColorR')}${toHex('ClassColorG')}${toHex('ClassColorB')}`)
  }

  const skillLineByClassId = new Map<number, number>()
  for (const row of skillLines) {
    if (asInt(row, 'CategoryID') !== CLASS_SKILL_LINE_CATEGORY) continue
    const name = row['DisplayName_lang'] ?? ''
    for (const [classId, className] of classNameById) {
      if (name === className) skillLineByClassId.set(classId, asInt(row, 'ID'))
    }
  }

  const spellsBySkillLine = new Map<number, BaselineSpell[]>()
  for (const row of skillLineAbilities) {
    const skillLine = asInt(row, 'SkillLine')
    const record: BaselineSpell = {
      spellId: asInt(row, 'Spell'),
      raceMaskLow: BigInt(row['RaceMasks_0'] ?? '0'),
      raceMaskHigh: BigInt(row['RaceMasks_1'] ?? '0'),
    }
    spellsBySkillLine.set(skillLine, [...(spellsBySkillLine.get(skillLine) ?? []), record])
  }

  const baselineByClassId = new Map<number, BaselineSpell[]>()
  for (const [classId, skillLine] of skillLineByClassId) {
    const seen = new Set<number>()
    const unique = (spellsBySkillLine.get(skillLine) ?? []).filter((record) => {
      if (seen.has(record.spellId)) return false
      seen.add(record.spellId)
      return true
    })
    baselineByClassId.set(classId, unique)
  }

  const specSpellsBySpecId = new Map<number, Array<{ spellId: number; overridesSpellId: number }>>()
  for (const row of specializationSpells) {
    const specId = asInt(row, 'SpecID')
    const record = { spellId: asInt(row, 'SpellID'), overridesSpellId: asInt(row, 'OverridesSpellID') }
    specSpellsBySpecId.set(specId, [...(specSpellsBySpecId.get(specId) ?? []), record])
  }

  const specIdsByClassId = new Map<number, number[]>()
  const roleBySpecId = new Map<number, 'dps' | 'healer' | 'tank'>()
  for (const row of chrSpecializations) {
    const specId = asInt(row, 'ID')
    const classId = asInt(row, 'ClassID')
    if (classId === 0) continue
    specIdsByClassId.set(classId, [...(specIdsByClassId.get(classId) ?? []), specId])
    roleBySpecId.set(specId, ROLE_BY_CHR_SPECIALIZATION_ROLE[asInt(row, 'Role')] ?? 'dps')
  }

  return {
    baselineByClassId,
    specSpellsBySpecId,
    classNameById,
    classSlugById,
    classColorById,
    specIdsByClassId,
    roleBySpecId,
  }
}
