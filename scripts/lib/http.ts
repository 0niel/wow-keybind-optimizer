import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CACHE_DIR = join(process.cwd(), 'scripts', '.cache', 'http')

let lastRequestAt = 0

async function throttle(minIntervalMs: number): Promise<void> {
  const wait = lastRequestAt + minIntervalMs - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastRequestAt = Date.now()
}

export async function fetchJsonCached<T>(
  url: string,
  options: { minIntervalMs?: number; cacheKey?: string } = {},
): Promise<T> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const key = options.cacheKey ?? createHash('sha1').update(url).digest('hex')
  const cachePath = join(CACHE_DIR, `${key}.json`)
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf8')) as T
  }
  await throttle(options.minIntervalMs ?? 150)
  const response = await fetch(url, { headers: { 'User-Agent': 'wow-keybind-optimizer-snapshot' } })
  if (!response.ok) {
    throw new Error(`GET ${url.replace(/api_key=[^&]+/, 'api_key=***')} -> ${response.status}`)
  }
  const payload = (await response.json()) as T
  writeFileSync(cachePath, JSON.stringify(payload), 'utf8')
  return payload
}

export async function fetchTextCached(
  url: string,
  options: { minIntervalMs?: number } = {},
): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const key = createHash('sha1').update(url).digest('hex')
  const cachePath = join(CACHE_DIR, `${key}.txt`)
  if (existsSync(cachePath)) return readFileSync(cachePath, 'utf8')
  await throttle(options.minIntervalMs ?? 150)
  const response = await fetch(url, { headers: { 'User-Agent': 'wow-keybind-optimizer-snapshot' } })
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`)
  const payload = await response.text()
  writeFileSync(cachePath, payload, 'utf8')
  return payload
}

export function loadEnvLocal(): Record<string, string> {
  const path = join(process.cwd(), '.env.local')
  if (!existsSync(path)) return {}
  const result: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match?.[1] !== undefined && match[2] !== undefined) result[match[1]] = match[2]
  }
  return result
}
