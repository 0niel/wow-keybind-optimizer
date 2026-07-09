import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SpecSnapshot } from '@/core/model/snapshot'
import { FALLBACK_ICON, spellIconUrl } from '@/lib/data'

describe('spell icon urls', () => {
  it('converts DB2 whitespace to the CDN hyphen convention', () => {
    expect(spellIconUrl(' achievement_firelands raid_ragnaros ')).toBe(
      'https://wow.zamimg.com/images/wow/icons/large/achievement_firelands-raid_ragnaros.jpg',
    )
    expect(spellIconUrl('spell_frost_ring   of frost')).toContain('spell_frost_ring-of-frost.jpg')
  })

  it('uses the question-mark icon only for an empty icon name', () => {
    expect(spellIconUrl('')).toBe(
      `https://wow.zamimg.com/images/wow/icons/large/${FALLBACK_ICON}.jpg`,
    )
  })

  it('normalizes every shipped talent icon without concatenating words', () => {
    const retailRoot = join(process.cwd(), 'public', 'data', 'retail')
    const { build } = JSON.parse(readFileSync(join(retailRoot, 'latest.json'), 'utf8')) as {
      build: string
    }
    const manifest = JSON.parse(
      readFileSync(join(retailRoot, build, 'manifest.json'), 'utf8'),
    ) as { specIds: number[] }

    for (const specId of manifest.specIds) {
      const spec = JSON.parse(
        readFileSync(join(retailRoot, build, 'specs', `${specId}.json`), 'utf8'),
      ) as SpecSnapshot
      for (const icon of Object.values(spec.iconBySpellId)) {
        const url = spellIconUrl(icon)
        expect(url).not.toMatch(/\s/)
        if (/\s/.test(icon)) expect(url).toContain(icon.trim().toLowerCase().replace(/\s+/g, '-'))
      }
    }
  })
})
