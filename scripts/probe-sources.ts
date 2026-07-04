import { loadEnvLocal } from './lib/http'
import { WclV1Client } from './snapshot/wcl'
import { fetchAplIndex, fetchAplProfile } from './snapshot/apl'

async function main() {
  const env = loadEnvLocal()
  const key = env['WCL_V1_KEY']
  if (!key) throw new Error('WCL_V1_KEY missing in .env.local')
  const wcl = new WclV1Client(key)

  const classes = await wcl.classes()
  console.log(`wcl classes: ${classes.length}`)
  const shaman = classes.find((c) => c.name === 'Shaman')
  console.log(`shaman: id=${shaman?.id} specs=${shaman?.specs.map((s) => `${s.id}:${s.name}`).join(' ')}`)

  const encounters = await wcl.currentRaidEncounters()
  console.log(`current raid encounters: ${encounters.map((e) => e.name).join(', ')}`)

  const enhancementSpec = shaman?.specs.find((s) => s.name === 'Enhancement')
  if (shaman && enhancementSpec && encounters[0]) {
    const casts = await wcl.specCasts(shaman.id, enhancementSpec.id, encounters[0].id, 'dps', 2)
    console.log(`enhancement casts sampled=${casts.sampledFights} spells=${casts.cpmBySpellId.size}`)
    const top = [...casts.cpmBySpellId.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    for (const [spellId, cpm] of top) console.log(`  ${spellId}: ${cpm.toFixed(2)} cpm`)
  }

  const aplIndex = await fetchAplIndex()
  console.log(`MID1 profiles: ${aplIndex.size}`)
  console.log([...aplIndex.keys()].slice(0, 12).join(', '))
  const enhancementUrl = aplIndex.get('shaman_enhancement')
  if (enhancementUrl) {
    const profile = await fetchAplProfile(enhancementUrl)
    const ranked = [...profile.aplRankByActionName.entries()].slice(0, 12)
    console.log(`enhancement apl actions: ${profile.aplRankByActionName.size}, pairs: ${profile.adjacencyPairs.length}, items: ${profile.usesItems}`)
    console.log(ranked.map(([name, r]) => `${r}:${name}`).join(' '))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
