import { loadEnvLocal } from './lib/http'

async function main() {
  const env = loadEnvLocal()
  const key = env['WCL_V1_KEY'] ?? ''
  const zones = (await (
    await fetch(`https://www.warcraftlogs.com/v1/zones?api_key=${key}`)
  ).json()) as Array<{ id: number; name: string; frozen: boolean; encounters: Array<{ id: number; name: string }> }>
  for (const zone of zones.filter((z) => !z.frozen)) {
    console.log(`${zone.id} ${zone.name} frozen=${zone.frozen} encounters=${zone.encounters.length}`)
  }
  const raid = zones
    .filter((z) => !z.frozen && z.encounters.length >= 4 && !/dungeon|mythic\+/i.test(z.name))
    .at(-1)
  console.log(`picked: ${raid?.id} ${raid?.name}`)
  const enc = raid?.encounters[0]
  if (!enc) return
  const url = `https://www.warcraftlogs.com/v1/rankings/encounter/${enc.id}?metric=dps&class=9&spec=2&api_key=${key}`
  const rankings = (await (await fetch(url)).json()) as unknown
  const obj = rankings as { rankings?: Array<Record<string, unknown>>; total?: number }
  console.log(`encounter ${enc.name}: rankings=${obj.rankings?.length} total=${obj.total}`)
  console.log(JSON.stringify(obj.rankings?.[0] ?? rankings).slice(0, 400))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
