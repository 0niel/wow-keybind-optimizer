import { createWagoSource } from './lib/wago'
import { buildSpellUniverse } from './snapshot/spells'
import { buildSpellbookData } from './snapshot/spellbook'
import { buildRaceData } from './snapshot/racials'

async function main() {
  const source = createWagoSource('12.0.7.68367')
  const universe = await buildSpellUniverse(source, ['enUS'])
  const spellbook = await buildSpellbookData(source)
  const names = universe.namesByLocale.get('enUS') ?? new Map<number, string>()

  const shamanBaseline = (spellbook.baselineByClassId.get(7) ?? []).map((record) => record.spellId)
  const active = shamanBaseline.filter((id) => universe.metaBySpellId.has(id))
  console.log(`shaman baseline: ${shamanBaseline.length} total, ${active.length} non-passive with meta`)
  for (const id of active) {
    const meta = universe.metaBySpellId.get(id)
    console.log(`  ${id} ${names.get(id) ?? '?'} cd=${meta?.cooldownMs} gcd=${meta?.gcd} range=${meta?.rangeYd} targeting=${meta?.targeting}`)
  }

  console.log('--- enhancement spec spells (263)')
  for (const rec of spellbook.specSpellsBySpecId.get(263) ?? []) {
    const passive = universe.passiveSpellIds.has(rec.spellId) ? ' [passive]' : ''
    console.log(`  ${rec.spellId} ${names.get(rec.spellId) ?? '?'}${passive} overrides=${rec.overridesSpellId}`)
  }

  console.log('--- orc racials')
  const races = await buildRaceData(source, universe.passiveSpellIds)
  const orc = races.find((race) => race.slug === 'orc')
  for (const id of orc?.racialSpellIds ?? []) {
    console.log(`  ${id} ${names.get(id) ?? '?'}`)
  }
  console.log(`races: ${races.map((race) => race.slug).join(', ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
