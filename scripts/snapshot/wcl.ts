import { fetchJsonCached } from '../lib/http'

const BASE = 'https://www.warcraftlogs.com/v1'

export interface WclSpecCasts {
  cpmBySpellId: Map<number, number>
  sampledFights: number
}

interface WclZone {
  id: number
  name: string
  frozen: boolean
  encounters: Array<{ id: number; name: string }>
}

interface WclClass {
  id: number
  name: string
  specs: Array<{ id: number; name: string }>
}

interface WclRanking {
  reportID: string
  fightID: number
  name: string
  duration?: number
}

interface WclFights {
  fights: Array<{ id: number; start_time: number; end_time: number }>
  friendlies: Array<{ id: number; name: string }>
}

interface WclCastsTable {
  entries: Array<{ guid: number; total: number }>
  totalTime?: number
}

export class WclV1Client {
  constructor(private readonly apiKey: string) {}

  private url(path: string, params: Record<string, string | number> = {}): string {
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      api_key: this.apiKey,
    })
    return `${BASE}${path}?${query}`
  }

  async zones(): Promise<WclZone[]> {
    return fetchJsonCached<WclZone[]>(this.url('/zones'), { cacheKey: 'wcl-zones', minIntervalMs: 400 })
  }

  async classes(): Promise<WclClass[]> {
    return fetchJsonCached<WclClass[]>(this.url('/classes'), { cacheKey: 'wcl-classes', minIntervalMs: 400 })
  }

  async currentRaidEncounters(): Promise<Array<{ id: number; name: string }>> {
    const zones = await this.zones()
    const openRaids = zones.filter(
      (zone) =>
        !zone.frozen &&
        zone.encounters.length >= 4 &&
        !/dungeon|mythic\+|ptr|dummy/i.test(zone.name),
    )
    const latest = openRaids.at(-1)
    return latest?.encounters ?? []
  }

  async specCasts(
    wclClassId: number,
    wclSpecId: number,
    encounterId: number,
    metric: 'dps' | 'hps',
    sampleSize: number,
  ): Promise<WclSpecCasts> {
    const rankings = await fetchJsonCached<{ rankings: WclRanking[] }>(
      this.url(`/rankings/encounter/${encounterId}`, {
        metric,
        class: wclClassId,
        spec: wclSpecId,
        includeCombatantInfo: 'false',
      }),
      { cacheKey: `wcl-rank-${encounterId}-${wclClassId}-${wclSpecId}-${metric}`, minIntervalMs: 400 },
    )
    const totalCpm = new Map<number, number>()
    let sampled = 0
    for (const ranking of rankings.rankings.slice(0, sampleSize)) {
      try {
        const fights = await fetchJsonCached<WclFights>(
          this.url(`/report/fights/${ranking.reportID}`),
          { cacheKey: `wcl-fights-${ranking.reportID}`, minIntervalMs: 400 },
        )
        const fight = fights.fights.find((f) => f.id === ranking.fightID)
        const source = fights.friendlies.find((f) => f.name === ranking.name)
        if (!fight || !source) continue
        const table = await fetchJsonCached<WclCastsTable>(
          this.url(`/report/tables/casts/${ranking.reportID}`, {
            start: fight.start_time,
            end: fight.end_time,
            sourceid: source.id,
          }),
          {
            cacheKey: `wcl-casts-${ranking.reportID}-${ranking.fightID}-${source.id}`,
            minIntervalMs: 400,
          },
        )
        const minutes = (fight.end_time - fight.start_time) / 60000
        if (minutes <= 0) continue
        for (const entry of table.entries) {
          totalCpm.set(entry.guid, (totalCpm.get(entry.guid) ?? 0) + entry.total / minutes)
        }
        sampled++
      } catch {
        continue
      }
    }
    const cpmBySpellId = new Map<number, number>()
    if (sampled > 0) {
      for (const [spellId, sum] of totalCpm) {
        cpmBySpellId.set(spellId, sum / sampled)
      }
    }
    return { cpmBySpellId, sampledFights: sampled }
  }
}
