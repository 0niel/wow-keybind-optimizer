import { asInt } from '../lib/csv'
import { loadTable } from '../lib/wago'
import type { WagoSource } from '../lib/wago'
import type { SpellMetaRecord, Targeting } from '../../src/core/model/snapshot'

const PASSIVE_ATTRIBUTE_BIT = 0x40
const TARGET_ALLY = 21

export type UncategorizedSpellMeta = Omit<SpellMetaRecord, 'category' | 'reactivity' | 'panic'>

export interface SpellUniverse {
  metaBySpellId: Map<number, UncategorizedSpellMeta>
  passiveSpellIds: Set<number>
  iconBySpellId: Map<number, string>
  namesByLocale: Map<string, Map<number, string>>
  descriptionsByLocale: Map<string, Map<number, string>>
  spellIdsByNormalizedName: Map<string, number[]>
}

export function classifySpellTargeting(
  implicitTargets: number[],
  range: { enemy: number; ally: number },
): Targeting {
  if (implicitTargets.includes(TARGET_ALLY)) return 'ally'
  if (range.enemy > 0 && range.ally === 0) return 'enemy'
  if (range.ally > 0 && range.enemy === 0) return 'ally'
  if (range.enemy === 0 && range.ally === 0) return 'self'
  return 'enemy'
}

export function normalizeSpellName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’:,()]/g, '')
    .replace(/[\s-]+/g, '_')
    .trim()
}

export async function buildSpellUniverse(
  source: WagoSource,
  locales: string[],
): Promise<SpellUniverse> {
  const [misc, cooldowns, categories, category, ranges, effects, manifest] = await Promise.all([
    loadTable(source, 'SpellMisc'),
    loadTable(source, 'SpellCooldowns'),
    loadTable(source, 'SpellCategories'),
    loadTable(source, 'SpellCategory'),
    loadTable(source, 'SpellRange'),
    loadTable(source, 'SpellEffect'),
    loadTable(source, 'ManifestInterfaceData'),
  ])

  const implicitTargetsBySpellId = new Map<number, number[]>()
  for (const row of effects) {
    if (asInt(row, 'DifficultyID') !== 0) continue
    const spellId = asInt(row, 'SpellID')
    const targets = implicitTargetsBySpellId.get(spellId) ?? []
    const target0 = asInt(row, 'ImplicitTarget_0')
    const target1 = asInt(row, 'ImplicitTarget_1')
    if (target0 > 0) targets.push(target0)
    if (target1 > 0) targets.push(target1)
    implicitTargetsBySpellId.set(spellId, targets)
  }

  const iconByFileDataId = new Map<number, string>()
  for (const row of manifest) {
    const path = row['FilePath'] ?? ''
    if (!path.toLowerCase().includes('icons')) continue
    const fileName = (row['FileName'] ?? '').replace(/\.blp$/i, '').toLowerCase()
    iconByFileDataId.set(asInt(row, 'ID'), fileName)
  }

  const rangeById = new Map<number, { enemy: number; ally: number }>()
  for (const row of ranges) {
    rangeById.set(asInt(row, 'ID'), {
      enemy: Math.max(asInt(row, 'RangeMax_0'), 0),
      ally: Math.max(asInt(row, 'RangeMax_1'), 0),
    })
  }

  const chargesByCategory = new Map<number, { maxCharges: number; recoveryMs: number }>()
  for (const row of category) {
    const maxCharges = asInt(row, 'MaxCharges')
    if (maxCharges > 0) {
      chargesByCategory.set(asInt(row, 'ID'), {
        maxCharges,
        recoveryMs: asInt(row, 'ChargeRecoveryTime'),
      })
    }
  }

  const cooldownBySpellId = new Map<number, { recoveryMs: number; gcd: 'normal' | 'off' }>()
  for (const row of cooldowns) {
    if (asInt(row, 'DifficultyID') !== 0) continue
    cooldownBySpellId.set(asInt(row, 'SpellID'), {
      recoveryMs: Math.max(asInt(row, 'RecoveryTime'), asInt(row, 'CategoryRecoveryTime')),
      gcd: asInt(row, 'StartRecoveryTime') === 0 ? 'off' : 'normal',
    })
  }

  const chargeInfoBySpellId = new Map<number, { maxCharges: number; recoveryMs: number }>()
  for (const row of categories) {
    if (asInt(row, 'DifficultyID') !== 0) continue
    const chargeCategory = asInt(row, 'ChargeCategory')
    const charges = chargesByCategory.get(chargeCategory)
    if (charges) chargeInfoBySpellId.set(asInt(row, 'SpellID'), charges)
  }

  const metaBySpellId = new Map<number, UncategorizedSpellMeta>()
  const passiveSpellIds = new Set<number>()
  const iconBySpellId = new Map<number, string>()
  for (const row of misc) {
    if (asInt(row, 'DifficultyID') !== 0) continue
    const spellId = asInt(row, 'SpellID')
    const icon = iconByFileDataId.get(asInt(row, 'SpellIconFileDataID'))
    if (icon !== undefined) iconBySpellId.set(spellId, icon)
    const attributes = asInt(row, 'Attributes_0')
    if ((attributes & PASSIVE_ATTRIBUTE_BIT) !== 0) {
      passiveSpellIds.add(spellId)
      continue
    }
    const range = rangeById.get(asInt(row, 'RangeIndex')) ?? { enemy: 0, ally: 0 }
    const cooldown = cooldownBySpellId.get(spellId) ?? { recoveryMs: 0, gcd: 'normal' as const }
    const charges = chargeInfoBySpellId.get(spellId)
    const targeting = classifySpellTargeting(implicitTargetsBySpellId.get(spellId) ?? [], range)
    metaBySpellId.set(spellId, {
      id: spellId,
      icon: iconByFileDataId.get(asInt(row, 'SpellIconFileDataID')) ?? 'inv_misc_questionmark',
      cooldownMs: charges ? charges.recoveryMs : cooldown.recoveryMs,
      chargeCooldownMs: charges?.recoveryMs ?? 0,
      charges: charges?.maxCharges ?? 0,
      gcd: cooldown.gcd,
      rangeYd: Math.max(range.enemy, range.ally),
      targeting,
    })
  }

  const namesByLocale = new Map<string, Map<number, string>>()
  const descriptionsByLocale = new Map<string, Map<number, string>>()
  for (const locale of locales) {
    const names = new Map<number, string>()
    for (const row of await loadTable(source, 'SpellName', locale)) {
      names.set(asInt(row, 'ID'), row['Name_lang'] ?? '')
    }
    namesByLocale.set(locale, names)
    const descriptions = new Map<number, string>()
    for (const row of await loadTable(source, 'Spell', locale)) {
      const description = row['Description_lang'] ?? ''
      if (description !== '') descriptions.set(asInt(row, 'ID'), description)
    }
    descriptionsByLocale.set(locale, descriptions)
  }

  const spellIdsByNormalizedName = new Map<string, number[]>()
  const enNames = namesByLocale.get('enUS') ?? new Map<number, string>()
  for (const [spellId, name] of enNames) {
    const normalized = normalizeSpellName(name)
    if (normalized === '') continue
    const existing = spellIdsByNormalizedName.get(normalized) ?? []
    existing.push(spellId)
    spellIdsByNormalizedName.set(normalized, existing)
  }

  return {
    metaBySpellId,
    passiveSpellIds,
    iconBySpellId,
    namesByLocale,
    descriptionsByLocale,
    spellIdsByNormalizedName,
  }
}
