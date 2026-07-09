import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeSpellName } from '../src/core/model/spell-name'
import type { CuratedAbilityTraits } from '../src/core/model/ability-category'
import type { SpellMetaShard, SpellTextShard } from '../src/core/model/snapshot'
import { asInt } from './lib/csv'
import { createWagoSource, loadTable } from './lib/wago'
import { classifySpellTargeting } from './snapshot/spells'

const root = process.cwd()
const latest = JSON.parse(
  readFileSync(join(root, 'public', 'data', 'retail', 'latest.json'), 'utf8'),
) as { build: string }
const buildDir = join(root, 'public', 'data', 'retail', latest.build)
const metaPath = join(buildDir, 'spell-meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as SpellMetaShard
const text = JSON.parse(
  readFileSync(join(buildDir, 'text', 'en.json'), 'utf8'),
) as { spells: SpellTextShard }
const traits = JSON.parse(
  readFileSync(join(root, 'data', 'curated', 'ability-traits.json'), 'utf8'),
) as Record<string, CuratedAbilityTraits>

async function main() {
  const source = createWagoSource(latest.build)
  const [rows, miscRows, rangeRows] = await Promise.all([
    loadTable(source, 'SpellEffect'),
    loadTable(source, 'SpellMisc'),
    loadTable(source, 'SpellRange'),
  ])
  const rangeById = new Map<number, { enemy: number; ally: number }>()
  for (const row of rangeRows) {
    rangeById.set(asInt(row, 'ID'), {
      enemy: Math.max(asInt(row, 'RangeMax_0'), 0),
      ally: Math.max(asInt(row, 'RangeMax_1'), 0),
    })
  }
  const rangeBySpellId = new Map<number, { enemy: number; ally: number }>()
  for (const row of miscRows) {
    if (asInt(row, 'DifficultyID') !== 0) continue
    rangeBySpellId.set(
      asInt(row, 'SpellID'),
      rangeById.get(asInt(row, 'RangeIndex')) ?? { enemy: 0, ally: 0 },
    )
  }
  const targetsBySpellId = new Map<number, number[]>()
  for (const row of rows) {
    if (asInt(row, 'DifficultyID') !== 0) continue
    const spellId = asInt(row, 'SpellID')
    const targets = targetsBySpellId.get(spellId) ?? []
    for (const key of ['ImplicitTarget_0', 'ImplicitTarget_1']) {
      const target = asInt(row, key)
      if (target > 0) targets.push(target)
    }
    targetsBySpellId.set(spellId, targets)
  }

  let repaired = 0
  for (const [spellId, record] of Object.entries(meta)) {
    const detected = classifySpellTargeting(
      targetsBySpellId.get(Number(spellId)) ?? [],
      rangeBySpellId.get(Number(spellId)) ?? { enemy: 0, ally: 0 },
    )
    const name = text.spells[spellId]?.name
    const curated = name ? traits[normalizeSpellName(name)]?.targeting : undefined
    const targeting = curated ?? detected
    if (targeting === record.targeting) continue
    record.targeting = targeting
    repaired++
  }

  writeFileSync(metaPath, JSON.stringify(meta), 'utf8')
  console.log(`targeting repaired for ${repaired} spells in ${latest.build}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
