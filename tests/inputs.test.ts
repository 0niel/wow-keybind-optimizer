import { describe, expect, it } from 'vitest'
import { deserializeInputs, normalizePvpTalentIds } from '@/state/inputs'

describe('PvP talent input normalization', () => {
  it('keeps only unique talents available to the current specialization', () => {
    expect(normalizePvpTalentIds([11, 99, 22, 11, 33, 44], [11, 22, 33, 44])).toEqual([11, 22, 33])
  })

  it('deduplicates URL talents without dropping a valid tail before the spec loads', () => {
    const inputs = deserializeInputs(new URLSearchParams('pvp=999.998.997.11.11.22.33'))

    expect(inputs.pvpTalentIds).toEqual([999, 998, 997, 11, 22, 33])
    expect(normalizePvpTalentIds(inputs.pvpTalentIds, [11, 22, 33])).toEqual([11, 22, 33])
  })
})
