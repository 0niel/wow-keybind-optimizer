import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeLoadout } from '@/core/decoder'
import type { NodeSelection } from '@/core/decoder'
import { extractAbilityPool } from '@/core/extract/ability-pool'
import type { ArenaTargetScheme } from '@/core/model/ability'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'
import golden from './fixtures/decoder-golden.json'

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)

let spec: SpecSnapshot
let spellMeta: SpellMetaShard
let races: RaceRecord[]
let selections: NodeSelection[]

beforeAll(() => {
  spec = JSON.parse(readFileSync(join(DATA_ROOT, 'specs', '263.json'), 'utf8')) as SpecSnapshot
  spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
  const goldenCase = golden.cases.find((c) => c.specId === 263)
  if (!goldenCase) throw new Error('missing golden case for 263')
  selections = decodeLoadout(
    goldenCase.encoded,
    spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
  ).selections
})

function extract(
  scheme: ArenaTargetScheme,
  spellNames?: Record<string, string>,
  includeTargetBinds?: boolean,
) {
  return extractAbilityPool({
    spec,
    spellMeta,
    selections,
    race: races.find((race) => race.slug === 'orc') ?? null,
    pvpTalentIds: spec.pvpTalents.slice(0, 3).map((talent) => talent.id),
    mode: 'arena',
    arenaTargetScheme: scheme,
    spellNames,
    includeTargetBinds,
  })
}

describe('arena pool extraction', () => {
  it('never duplicates a spell across arena target variants', () => {
    for (const scheme of ['focus', 'arena123'] as ArenaTargetScheme[]) {
      const pool = extract(scheme)
      const arenaCastVariants = pool.filter(
        (ability) => ability.variantKind.startsWith('arena') && ability.spellId > 0,
      )
      expect(arenaCastVariants).toEqual([])
      const arenaVariantIds = pool
        .filter((ability) => ability.variantKind.startsWith('arena'))
        .map((ability) => ability.id)
        .sort()
      expect(arenaVariantIds).toEqual(['target:arena1', 'target:arena2', 'target:arena3'])
    }
  })

  it('adds arena targeting binds in both schemes', () => {
    for (const scheme of ['focus', 'arena123'] as ArenaTargetScheme[]) {
      const pool = extract(scheme)
      const targeting = pool.filter((ability) => ability.category === 'targeting')
      const ids = targeting.map((ability) => ability.id).sort()
      expect(ids).toContain('target:arena1')
      expect(ids).toContain('target:arena2')
      expect(ids).toContain('target:arena3')
      if (scheme === 'focus') {
        expect(ids).toContain('focus:set')
      } else {
        expect(ids).not.toContain('focus:set')
      }
    }
  })

  it('omits arena target binds when the toggle is off but keeps set-focus in focus scheme', () => {
    for (const scheme of ['focus', 'arena123'] as ArenaTargetScheme[]) {
      const pool = extract(scheme, undefined, false)
      expect(pool.some((ability) => ability.id.startsWith('target:arena'))).toBe(false)
      if (scheme === 'focus') {
        expect(pool.some((ability) => ability.variantKind === 'focus')).toBe(true)
        expect(pool.some((ability) => ability.id === 'focus:set')).toBe(true)
      } else {
        expect(pool.some((ability) => ability.category === 'targeting')).toBe(false)
      }
    }
  })

  it('keeps focus variants limited to interrupts and the top hard CC', () => {
    const pool = extract('focus')
    const focusVariants = pool.filter((ability) => ability.variantKind === 'focus')
    expect(focusVariants.length).toBeGreaterThan(0)
    for (const variant of focusVariants) {
      const base = pool.find((candidate) => candidate.id === variant.baseAbilityId)
      expect(base).toBeDefined()
      expect(['interrupt', 'cc-hard']).toContain(base?.category)
    }
    const ccFocus = focusVariants.filter((variant) => {
      const base = pool.find((candidate) => candidate.id === variant.baseAbilityId)
      return base?.category === 'cc-hard'
    })
    expect(ccFocus.length).toBeLessThanOrEqual(1)
  })

  it('never lets a metaless pvp passive evict a same-named active ability', () => {
    const victim = extract('focus').find(
      (ability) =>
        ability.spellId > 0 &&
        ability.variantKind === 'base' &&
        spellMeta[String(ability.spellId)] !== undefined,
    )
    expect(victim).toBeDefined()
    if (!victim) return
    const metalessSpellId = 999999999
    expect(spellMeta[String(metalessSpellId)]).toBeUndefined()
    const fakeTalentId = 999999
    const specWithPassive: SpecSnapshot = {
      ...spec,
      pvpTalents: [...spec.pvpTalents, { id: fakeTalentId, spellId: metalessSpellId }],
    }
    const spellNames: Record<string, string> = {
      [String(victim.spellId)]: 'Cloned Name',
      [String(metalessSpellId)]: 'Cloned Name',
    }
    const pool = extractAbilityPool({
      spec: specWithPassive,
      spellMeta,
      selections,
      race: races.find((race) => race.slug === 'orc') ?? null,
      pvpTalentIds: [fakeTalentId],
      mode: 'arena',
      arenaTargetScheme: 'focus',
      spellNames,
    })
    expect(pool.some((ability) => ability.spellId === victim.spellId)).toBe(true)
  })

  it('drops same-named base spells when a pvp talent version is present', () => {
    const plain = extract('focus')
    const pvpTalentSpellIds = new Set(
      spec.pvpTalents.slice(0, 3).map((talent) => talent.spellId).filter((id) => id > 0),
    )
    const pvpAbility = plain.find(
      (ability) => pvpTalentSpellIds.has(ability.spellId) && ability.variantKind === 'base',
    )
    const victim = plain.find(
      (ability) =>
        ability.spellId > 0 &&
        !pvpTalentSpellIds.has(ability.spellId) &&
        ability.variantKind === 'base',
    )
    expect(pvpAbility).toBeDefined()
    expect(victim).toBeDefined()
    if (!pvpAbility || !victim) return
    const spellNames: Record<string, string> = {
      [String(pvpAbility.spellId)]: 'Duplicated Ability',
      [String(victim.spellId)]: 'Duplicated Ability',
    }
    const deduped = extract('focus', spellNames)
    expect(deduped.some((ability) => ability.spellId === pvpAbility.spellId)).toBe(true)
    expect(deduped.some((ability) => ability.spellId === victim.spellId)).toBe(false)
  })
})
