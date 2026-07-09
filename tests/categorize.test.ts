import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { categorize } from '../scripts/snapshot/categorize'
import type { UncategorizedSpellMeta } from '../scripts/snapshot/spells'
import { classifySpellTargeting } from '../scripts/snapshot/spells'

const meta: UncategorizedSpellMeta = {
  id: 1,
  icon: 'spell_test',
  cooldownMs: 0,
  chargeCooldownMs: 0,
  charges: 0,
  gcd: 'normal',
  rangeYd: 40,
  targeting: 'enemy',
}

describe('snapshot categorization', () => {
  it('uses explicit ally targets and otherwise falls back to the real spell range', () => {
    expect(classifySpellTargeting([21], { enemy: 40, ally: 40 })).toBe('ally')
    expect(classifySpellTargeting([6], { enemy: 40, ally: 40 })).toBe('enemy')
    expect(classifySpellTargeting([87, 1], { enemy: 40, ally: 40 })).toBe('enemy')
    expect(classifySpellTargeting([53], { enemy: 0, ally: 0 })).toBe('self')
    expect(classifySpellTargeting([16], { enemy: 40, ally: 40 })).toBe('enemy')
    expect(classifySpellTargeting([1], { enemy: 0, ally: 0 })).toBe('self')
  })
  it('preserves curated ally and ground targeting overrides', () => {
    const ally = categorize(meta, 'Cleanse', {
      denylist: new Set(),
      traitsByName: new Map([
        ['cleanse', { category: 'dispel', targeting: 'ally' }],
      ]),
    })
    const ground = categorize(meta, 'Ring of Frost', {
      denylist: new Set(),
      traitsByName: new Map([
        ['ring_of_frost', { category: 'cc-hard', targeting: 'ground' }],
      ]),
    })

    expect(ally.targeting).toBe('ally')
    expect(ground.targeting).toBe('ground')
  })

  it('does not overwrite targeting when curated data has no override', () => {
    const result = categorize(meta, 'Counterspell', {
      denylist: new Set(),
      traitsByName: new Map([['counterspell', { category: 'interrupt' }]]),
    })

    expect(result.targeting).toBeUndefined()
  })

  it('marks a curated long-lived aura as maintenance without guessing from duration alone', () => {
    const result = categorize(
      { ...meta, targeting: 'self', auraDurationMs: 3_600_000 },
      'Test Maintenance Buff',
      {
        denylist: new Set(),
        traitsByName: new Map([
          ['test_maintenance_buff', { category: 'utility', maintenance: true }],
        ]),
      },
    )

    expect(result).toEqual({ category: 'utility', reactivity: 0, panic: 0, maintenance: true })
  })

  it('keeps uncatalogued ally cooldowns out of the damage rotation group', () => {
    const curated = { denylist: new Set<string>(), traitsByName: new Map() }

    expect(categorize({ ...meta, targeting: 'ally', cooldownMs: 120_000 }, 'Roar of Sacrifice', curated))
      .toEqual({ category: 'external', reactivity: 0.75, panic: 0 })
    expect(categorize({ ...meta, targeting: 'ally', cooldownMs: 0 }, 'Unknown Heal', curated))
      .toEqual({ category: 'heal-utility', reactivity: 0.35, panic: 0 })
  })

  it('ships non-empty ally and ground targeting with canonical spell IDs', () => {
    const retailRoot = join(process.cwd(), 'public', 'data', 'retail')
    const { build } = JSON.parse(readFileSync(join(retailRoot, 'latest.json'), 'utf8')) as {
      build: string
    }
    const shipped = JSON.parse(
      readFileSync(join(retailRoot, build, 'spell-meta.json'), 'utf8'),
    ) as Record<string, {
      category: string
      targeting: string
      auraDurationMs?: number
      maintenance?: boolean
    }>
    const distribution = Object.values(shipped).reduce<Record<string, number>>((counts, record) => {
      counts[record.targeting] = (counts[record.targeting] ?? 0) + 1
      return counts
    }, {})

    expect(distribution['ally']).toBeGreaterThan(0)
    expect(distribution['ground']).toBeGreaterThan(0)
    expect(shipped['17']?.targeting).toBe('ally')
    expect(shipped['133']?.targeting).toBe('enemy')
    expect(shipped['6544']?.targeting).toBe('ground')
    expect(shipped['73920']?.targeting).toBe('ground')
    expect(shipped['190356']?.targeting).toBe('ground')
    expect(shipped['2120']?.targeting).toBe('ground')
    expect(shipped['43265']?.targeting).toBe('ground')
    expect(shipped['187827']?.targeting).toBe('self')
    expect(shipped['453']?.targeting).toBe('enemy')
    expect(shipped['702']?.targeting).toBe('enemy')
    expect(shipped['772']?.targeting).toBe('enemy')
    expect(shipped['20549']?.targeting).toBe('self')
    expect(shipped['47568']?.targeting).toBe('self')
    expect(shipped['107570']?.targeting).toBe('enemy')
    expect(shipped['257620']?.targeting).toBe('enemy')
    expect(shipped['192106']?.auraDurationMs).toBe(3_600_000)
    expect(shipped['192106']?.maintenance).toBe(true)
    expect(shipped['974']?.maintenance).not.toBe(true)
    expect(shipped['20484']?.maintenance).not.toBe(true)
    for (const spellId of ['53480', '228049', '406732', '210256', '432459', '472433']) {
      expect(shipped[spellId]?.category).toBe('external')
    }
  })
})
