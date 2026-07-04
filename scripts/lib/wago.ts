import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsv } from './csv'
import type { CsvRecord } from './csv'

const CACHE_ROOT = join(process.cwd(), 'scripts', '.cache')

export interface WagoSource {
  build: string
  cacheDir: string
}

export function createWagoSource(build: string): WagoSource {
  const buildNumber = build.split('.').at(-1) ?? build
  const cacheDir = join(CACHE_ROOT, buildNumber)
  mkdirSync(cacheDir, { recursive: true })
  return { build, cacheDir }
}

export async function fetchLatestBuild(product: string): Promise<string> {
  const response = await fetch('https://wago.tools/api/builds/latest')
  if (!response.ok) throw new Error(`wago builds API returned ${response.status}`)
  const payload = (await response.json()) as Record<string, { version?: string } | string>
  const entry = payload[product]
  const version = typeof entry === 'string' ? entry : entry?.version
  if (!version) throw new Error(`No build found for product ${product}`)
  return version
}

export async function loadTable(
  source: WagoSource,
  table: string,
  locale?: string,
): Promise<CsvRecord[]> {
  const fileName = locale ? `${table}.${locale}.csv` : `${table}.csv`
  const filePath = join(source.cacheDir, fileName)
  if (!existsSync(filePath)) {
    const localeParam = locale ? `&locale=${locale}` : ''
    const url = `https://wago.tools/db2/${table}/csv?build=${source.build}${localeParam}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`wago table ${table} (${source.build}) returned ${response.status}`)
    }
    writeFileSync(filePath, await response.text(), 'utf8')
  }
  return parseCsv(readFileSync(filePath, 'utf8'))
}
