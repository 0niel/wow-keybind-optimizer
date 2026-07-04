import { asInt } from '../lib/csv'
import { loadTable } from '../lib/wago'
import type { WagoSource } from '../lib/wago'
import type { PvpTalentRecord } from '../../src/core/model/snapshot'

export async function buildPvpTalents(
  source: WagoSource,
): Promise<Map<number, PvpTalentRecord[]>> {
  const rows = await loadTable(source, 'PvpTalent')
  const bySpecId = new Map<number, PvpTalentRecord[]>()
  for (const row of rows) {
    const specId = asInt(row, 'SpecID')
    if (specId === 0) continue
    const record: PvpTalentRecord = { id: asInt(row, 'ID'), spellId: asInt(row, 'SpellID') }
    if (record.spellId === 0) continue
    bySpecId.set(specId, [...(bySpecId.get(specId) ?? []), record])
  }
  return bySpecId
}
