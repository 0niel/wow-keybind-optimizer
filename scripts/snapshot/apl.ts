import { fetchJsonCached, fetchTextCached } from '../lib/http'

const SIX_HOURS = 6 * 60 * 60 * 1000

export interface AplProfile {
  aplRankByActionName: Map<string, number>
  adjacencyPairs: Array<[string, string]>
  usesItems: boolean
}

const NON_ABILITY_ACTIONS = new Set([
  'variable',
  'call_action_list',
  'run_action_list',
  'snapshot_stats',
  'flask',
  'food',
  'augmentation',
  'temporary_enchant',
  'potion',
  'auto_attack',
  'wait',
  'pool_resource',
  'invoke_external_buff',
  'use_items',
  'use_item',
  'cancel_buff',
  'retarget_auto_attack',
  'arcane_torrent',
  'blood_fury',
  'berserking',
  'fireblood',
  'ancestral_call',
  'lights_judgment',
  'bag_of_tricks',
])

interface GithubEntry {
  name: string
  download_url: string | null
}

export async function fetchAplIndex(): Promise<Map<string, string>> {
  const entries = await fetchJsonCached<GithubEntry[]>(
    'https://api.github.com/repos/simulationcraft/simc/contents/profiles/MID1?ref=midnight',
    { cacheKey: 'simc-mid1-index', maxAgeMs: SIX_HOURS },
  )
  const bySpecKey = new Map<string, string>()
  for (const entry of entries) {
    const match = entry.name.match(/^MID1_(.+)\.simc$/)
    if (!match?.[1] || !entry.download_url) continue
    bySpecKey.set(match[1].toLowerCase(), entry.download_url)
  }
  return bySpecKey
}

export async function fetchAplProfile(downloadUrl: string): Promise<AplProfile> {
  const text = await fetchTextCached(downloadUrl, { maxAgeMs: SIX_HOURS })
  return parseApl(text)
}

export function parseApl(text: string): AplProfile {
  const aplRankByActionName = new Map<string, number>()
  const adjacencyPairs: Array<[string, string]> = []
  const previousByList = new Map<string, string>()
  let usesItems = false
  let rank = 0

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    const match = line.match(/^actions(?:\.([a-z0-9_]+))?\+?=\/?([a-z0-9_]+)/)
    if (!match) continue
    const list = match[1] ?? 'default'
    if (list === 'precombat') continue
    const action = match[2] ?? ''
    if (action === 'use_items' || action === 'use_item') usesItems = true
    if (NON_ABILITY_ACTIONS.has(action)) continue
    if (!aplRankByActionName.has(action)) {
      aplRankByActionName.set(action, rank)
      rank++
    }
    const previous = previousByList.get(list)
    if (previous !== undefined && previous !== action) {
      adjacencyPairs.push([previous, action])
    }
    previousByList.set(list, action)
  }
  return { aplRankByActionName, adjacencyPairs, usesItems }
}
