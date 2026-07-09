import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnvLocal } from './lib/http'
import { createWagoSource, fetchLatestBuild, loadTable } from './lib/wago'
import { asInt } from './lib/csv'
import { buildTraitData } from './snapshot/traits'
import { buildSpellUniverse } from './snapshot/spells'
import { buildSpellbookData } from './snapshot/spellbook'
import { buildRaceData } from './snapshot/racials'
import { buildPvpTalents } from './snapshot/pvp'
import { fetchAplIndex, fetchAplProfile } from './snapshot/apl'
import { WclV1Client } from './snapshot/wcl'
import { categorize, isDenied, loadCuratedData } from './snapshot/categorize'
import { normalizeSpellName } from '../src/core/model/spell-name'
import { fetchWowheadSpell } from './snapshot/wowhead'
import type {
  AbilityFrequencyRecord,
  BaselineSpellRecord,
  ClassRecord,
  RaceRecord,
  SpecSnapshot,
  SpecTraitNodeRecord,
  SpellMetaRecord,
  SpellTextRecord,
} from '../src/core/model/snapshot'

const LOCALES = ['enUS', 'ruRU'] as const
const APP_LOCALE_BY_DATA_LOCALE: Record<string, string> = { enUS: 'en', ruRU: 'ru' }

interface CliOptions {
  build: string | null
  specIds: number[] | null
  skipWcl: boolean
  skipWowhead: boolean
  wclSampleSize: number
  refresh: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    build: null,
    specIds: null,
    skipWcl: false,
    skipWowhead: false,
    wclSampleSize: 5,
    refresh: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--build') options.build = argv[++i] ?? null
    if (arg === '--specs') {
      options.specIds = (argv[++i] ?? '').split(',').map((value) => Number.parseInt(value, 10))
    }
    if (arg === '--skip-wcl') options.skipWcl = true
    if (arg === '--skip-wowhead') options.skipWowhead = true
    if (arg === '--wcl-samples') options.wclSampleSize = Number.parseInt(argv[++i] ?? '5', 10)
    if (arg === '--refresh') options.refresh = true
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.refresh) process.env['SNAPSHOT_REFRESH'] = '1'
  const build = options.build ?? (await fetchLatestBuild('wow'))
  console.log(`snapshot build: ${build}`)
  const source = createWagoSource(build)
  const curated = loadCuratedData()

  const [traitData, universe, spellbook, pvpTalents] = await Promise.all([
    buildTraitData(source),
    buildSpellUniverse(source, [...LOCALES]),
    buildSpellbookData(source),
    buildPvpTalents(source),
  ])
  const races = await buildRaceData(source, universe.passiveSpellIds)
  console.log(`traits=${traitData.size} specs, races=${races.length}`)

  const enNames = universe.namesByLocale.get('enUS') ?? new Map<number, string>()

  const localizedClassNames = new Map<string, Map<number, string>>()
  const localizedSpecNames = new Map<string, Map<number, string>>()
  const localizedRaceNames = new Map<string, Map<number, string>>()
  const localizedSubTreeNames = new Map<string, Map<number, string>>()
  for (const locale of LOCALES) {
    const classes = await loadTable(source, 'ChrClasses', locale)
    localizedClassNames.set(locale, new Map(classes.map((row) => [asInt(row, 'ID'), row['Name_lang'] ?? ''])))
    const specs = await loadTable(source, 'ChrSpecialization', locale)
    localizedSpecNames.set(locale, new Map(specs.map((row) => [asInt(row, 'ID'), row['Name_lang'] ?? ''])))
    const raceRows = await loadTable(source, 'ChrRaces', locale)
    localizedRaceNames.set(locale, new Map(raceRows.map((row) => [asInt(row, 'ID'), row['Name_lang'] ?? ''])))
    const subTreeRows = await loadTable(source, 'TraitSubTree', locale)
    localizedSubTreeNames.set(locale, new Map(subTreeRows.map((row) => [asInt(row, 'ID'), row['Name_lang'] ?? ''])))
  }

  const env = loadEnvLocal()
  const wcl = options.skipWcl || !env['WCL_V1_KEY'] ? null : new WclV1Client(env['WCL_V1_KEY'])
  const wclClasses = wcl ? await wcl.classes() : []
  const encounters = wcl ? await wcl.currentRaidEncounters() : []
  const aplIndex = await fetchAplIndex()

  const specIds = options.specIds ?? [...traitData.keys()].filter((specId) => spellbook.roleBySpecId.has(specId))
  console.log(`emitting ${specIds.length} specs`)

  const referencedSpellIds = new Set<number>()
  const nameOnlySpellIds = new Set<number>()
  const specSnapshots: SpecSnapshot[] = []

  for (const specId of specIds) {
    const traits = traitData.get(specId)
    if (!traits) {
      console.log(`  spec ${specId}: no trait data, skipped`)
      continue
    }
    const classId = [...spellbook.specIdsByClassId.entries()].find(([, ids]) => ids.includes(specId))?.[0]
    if (!classId) {
      console.log(`  spec ${specId}: no class mapping, skipped`)
      continue
    }
    const role = spellbook.roleBySpecId.get(specId) ?? 'dps'
    const className = spellbook.classNameById.get(classId) ?? ''
    const specName = localizedSpecNames.get('enUS')?.get(specId) ?? ''

    const nodesWithSection = assignSections(traits.nodes)

    const treeGrantedNames = new Set<string>()
    for (const node of nodesWithSection) {
      for (const entry of node.entries) {
        if (entry.spellId === 0) continue
        const entryName = enNames.get(entry.spellId)
        if (entryName) treeGrantedNames.add(normalizeSpellName(entryName))
      }
    }

    const specSpells = spellbook.specSpellsBySpecId.get(specId) ?? []
    const specGrantedNames = new Set<string>()
    for (const spell of specSpells) {
      const spellName = enNames.get(spell.spellId)
      if (spellName) specGrantedNames.add(normalizeSpellName(spellName))
    }

    const rawBaseline: BaselineSpellRecord[] = []
    const seenBaselineNames = new Set<string>()
    const overriddenBySpecSpells = new Set<number>()
    for (const spell of specSpells) {
      if (spell.overridesSpellId > 0) overriddenBySpecSpells.add(spell.overridesSpellId)
      const name = enNames.get(spell.spellId) ?? ''
      if (name === '' || isDenied(name, curated)) continue
      if (!universe.metaBySpellId.has(spell.spellId)) continue
      const normalizedName = normalizeSpellName(name)
      if (treeGrantedNames.has(normalizedName)) continue
      if (seenBaselineNames.has(normalizedName)) continue
      seenBaselineNames.add(normalizedName)
      rawBaseline.push({ spellId: spell.spellId })
    }
    for (const record of spellbook.baselineByClassId.get(classId) ?? []) {
      const name = enNames.get(record.spellId) ?? ''
      if (name === '' || isDenied(name, curated)) continue
      if (!universe.metaBySpellId.has(record.spellId)) continue
      const normalizedName = normalizeSpellName(name)
      if (seenBaselineNames.has(normalizedName)) continue
      if (treeGrantedNames.has(normalizedName)) continue
      if (specGrantedNames.has(normalizedName)) continue
      seenBaselineNames.add(normalizedName)
      if (record.raceMaskLow === 0n && record.raceMaskHigh === 0n) {
        rawBaseline.push({ spellId: record.spellId })
        continue
      }
      const raceIds = races
        .filter((race) => {
          const bit = BigInt(race.playableRaceBit)
          return bit < 64n
            ? (record.raceMaskLow & (1n << bit)) !== 0n
            : (record.raceMaskHigh & (1n << (bit - 64n))) !== 0n
        })
        .map((race) => race.id)
      if (raceIds.length > 0) rawBaseline.push({ spellId: record.spellId, raceIds })
    }
    const baseline = rawBaseline.filter((record) => !overriddenBySpecSpells.has(record.spellId))

    const specPvpTalents = pvpTalents.get(specId) ?? []

    const poolSpellIds = new Set<number>()
    for (const record of baseline) poolSpellIds.add(record.spellId)
    for (const spell of specSpells) {
      if (universe.metaBySpellId.has(spell.spellId)) poolSpellIds.add(spell.spellId)
    }
    for (const node of nodesWithSection) {
      for (const entry of node.entries) {
        if (entry.spellId > 0 && universe.metaBySpellId.has(entry.spellId)) poolSpellIds.add(entry.spellId)
      }
    }
    for (const talent of specPvpTalents) {
      if (universe.metaBySpellId.has(talent.spellId)) poolSpellIds.add(talent.spellId)
    }

    const apl = resolveApl(aplIndex, className, specName)
    const aplProfile = apl ? await fetchAplProfile(apl) : null
    const frequencyBySpellId: Record<string, AbilityFrequencyRecord> = {}
    const spellIdByAplName = new Map<string, number>()
    if (aplProfile) {
      for (const [actionName, rank] of aplProfile.aplRankByActionName) {
        const spellId = resolveActionSpellId(actionName, poolSpellIds, universe.spellIdsByNormalizedName)
        if (spellId === null) continue
        spellIdByAplName.set(actionName, spellId)
        frequencyBySpellId[String(spellId)] = { cpm: null, aplRank: rank }
      }
    }

    if (wcl) {
      const wclClass = wclClasses.find((c) => c.name.replace(/\s+/g, '') === className.replace(/\s+/g, ''))
      const wclSpec = wclClass?.specs.find(
        (s) => normalizeSpellName(s.name) === normalizeSpellName(specName),
      )
      const encounter = encounters[0]
      if (wclClass && wclSpec && encounter) {
        try {
          const casts = await wcl.specCasts(
            wclClass.id,
            wclSpec.id,
            encounter.id,
            role === 'healer' ? 'hps' : 'dps',
            options.wclSampleSize,
          )
          for (const [spellId, cpm] of casts.cpmBySpellId) {
            const existing = frequencyBySpellId[String(spellId)]
            frequencyBySpellId[String(spellId)] = {
              cpm: Math.round(cpm * 100) / 100,
              aplRank: existing?.aplRank ?? null,
            }
            if (poolSpellIds.has(spellId)) referencedSpellIds.add(spellId)
          }
          console.log(`  spec ${specId} (${className} ${specName}): wcl fights=${casts.sampledFights}`)
        } catch (error) {
          console.log(`  spec ${specId}: wcl failed (${(error as Error).message})`)
        }
      } else {
        console.log(`  spec ${specId}: no wcl mapping (${className} / ${specName})`)
      }
    }

    const synergyCounts = new Map<string, number>()
    if (aplProfile) {
      for (const [a, b] of aplProfile.adjacencyPairs) {
        const idA = spellIdByAplName.get(a)
        const idB = spellIdByAplName.get(b)
        if (idA === undefined || idB === undefined || idA === idB) continue
        const key = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`
        synergyCounts.set(key, (synergyCounts.get(key) ?? 0) + 1)
      }
    }
    const maxCount = Math.max(1, ...synergyCounts.values())
    const synergyPairs: Array<[number, number, number]> = [...synergyCounts.entries()].map(
      ([key, count]) => {
        const [idA, idB] = key.split(':').map(Number)
        return [idA ?? 0, idB ?? 0, Math.round((count / maxCount) * 100) / 100]
      },
    )

    for (const spellId of poolSpellIds) referencedSpellIds.add(spellId)

    const names: Record<string, string> = {}
    for (const locale of LOCALES) {
      names[APP_LOCALE_BY_DATA_LOCALE[locale] ?? locale] =
        localizedSpecNames.get(locale)?.get(specId) ?? specName
    }

    const iconBySpellId: Record<string, string> = {}
    for (const node of nodesWithSection) {
      if (!node.forSpec) continue
      for (const entry of node.entries) {
        if (entry.spellId === 0) continue
        const icon = universe.iconBySpellId.get(entry.spellId)
        if (icon !== undefined) iconBySpellId[String(entry.spellId)] = icon
        if (!poolSpellIds.has(entry.spellId)) nameOnlySpellIds.add(entry.spellId)
      }
    }
    for (const talent of specPvpTalents) {
      const icon = universe.iconBySpellId.get(talent.spellId)
      if (icon !== undefined) iconBySpellId[String(talent.spellId)] = icon
      if (!poolSpellIds.has(talent.spellId)) nameOnlySpellIds.add(talent.spellId)
    }

    specSnapshots.push({
      specId,
      classId,
      role,
      names,
      traitTreeId: traits.traitTreeId,
      nodes: nodesWithSection,
      subTrees: traits.subTrees,
      baseline,
      pvpTalents: specPvpTalents,
      defaultPvpTalentIds: [],
      frequencyBySpellId,
      synergyPairs,
      iconBySpellId,
    })
  }

  for (const race of races) {
    for (const spellId of race.racialSpellIds) {
      const name = enNames.get(spellId) ?? ''
      if (name !== '' && !isDenied(name, curated) && universe.metaBySpellId.has(spellId)) {
        referencedSpellIds.add(spellId)
      }
    }
  }

  const outDir = join(process.cwd(), 'public', 'data', 'retail', build)
  mkdirSync(join(outDir, 'specs'), { recursive: true })
  mkdirSync(join(outDir, 'text'), { recursive: true })

  const spellMeta: Record<string, SpellMetaRecord> = {}
  for (const spellId of referencedSpellIds) {
    const meta = universe.metaBySpellId.get(spellId)
    if (!meta) continue
    const name = enNames.get(spellId) ?? ''
    const categorized = categorize(meta, name, curated)
    spellMeta[String(spellId)] = { ...meta, ...categorized }
  }

  console.log(`referenced spells: ${referencedSpellIds.size}`)

  for (const locale of LOCALES) {
    const appLocale = APP_LOCALE_BY_DATA_LOCALE[locale] ?? locale
    const names = universe.namesByLocale.get(locale) ?? new Map<number, string>()
    const descriptions = universe.descriptionsByLocale.get(locale) ?? new Map<number, string>()
    const spells: Record<string, SpellTextRecord> = {}
    let wowheadHits = 0
    for (const spellId of referencedSpellIds) {
      let name = names.get(spellId) ?? ''
      let description = descriptions.get(spellId) ?? ''
      if (!options.skipWowhead) {
        const wowhead = await fetchWowheadSpell(spellId, locale)
        if (wowhead?.name) name = wowhead.name
        if (wowhead?.description) {
          description = wowhead.description
          wowheadHits++
        }
        if (wowhead?.icon) {
          const meta = spellMeta[String(spellId)]
          if (meta) meta.icon = wowhead.icon
        }
      }
      spells[String(spellId)] = { name, description }
    }
    for (const spellId of nameOnlySpellIds) {
      if (spells[String(spellId)] !== undefined) continue
      let name = names.get(spellId) ?? ''
      let description = descriptions.get(spellId) ?? ''
      if (!options.skipWowhead) {
        const wowhead = await fetchWowheadSpell(spellId, locale)
        if (wowhead?.name) name = wowhead.name
        if (wowhead?.description) {
          description = wowhead.description
          wowheadHits++
        }
      }
      if (name === '') continue
      spells[String(spellId)] = { name, description }
    }
    const subTreeNames: Record<string, string> = {}
    for (const snapshot of specSnapshots) {
      for (const subTree of snapshot.subTrees) {
        subTreeNames[String(subTree.id)] =
          localizedSubTreeNames.get(locale)?.get(subTree.id) ?? subTree.name
      }
    }
    writeFileSync(
      join(outDir, 'text', `${appLocale}.json`),
      JSON.stringify({ spells, subTrees: subTreeNames }),
      'utf8',
    )
    console.log(`text/${appLocale}.json: ${Object.keys(spells).length} spells, wowhead=${wowheadHits}`)
  }

  writeFileSync(join(outDir, 'spell-meta.json'), JSON.stringify(spellMeta), 'utf8')

  for (const snapshot of specSnapshots) {
    writeFileSync(join(outDir, 'specs', `${snapshot.specId}.json`), JSON.stringify(snapshot), 'utf8')
  }

  const classes: ClassRecord[] = [...spellbook.specIdsByClassId.entries()]
    .filter(([classId]) => spellbook.classNameById.has(classId))
    .map(([classId, ids]) => ({
      id: classId,
      slug: spellbook.classSlugById.get(classId) ?? String(classId),
      color: spellbook.classColorById.get(classId) ?? '#888888',
      names: Object.fromEntries(
        LOCALES.map((locale) => [
          APP_LOCALE_BY_DATA_LOCALE[locale] ?? locale,
          localizedClassNames.get(locale)?.get(classId) ?? '',
        ]),
      ),
      specIds: ids.filter((specId) => specSnapshots.some((s) => s.specId === specId)),
    }))
    .filter((record) => record.specIds.length > 0)
  writeFileSync(join(outDir, 'classes.json'), JSON.stringify(classes, null, 1), 'utf8')

  const raceRecords: RaceRecord[] = races.map((race) => ({
    id: race.id,
    slug: race.slug,
    faction: race.faction,
    names: Object.fromEntries(
      LOCALES.map((locale) => [
        APP_LOCALE_BY_DATA_LOCALE[locale] ?? locale,
        localizedRaceNames.get(locale)?.get(race.id) ?? race.name,
      ]),
    ),
    racialSpellIds: race.racialSpellIds.filter((spellId) => referencedSpellIds.has(spellId)),
  }))
  writeFileSync(join(outDir, 'races.json'), JSON.stringify(raceRecords, null, 1), 'utf8')

  const combatLogSpecs = specSnapshots.filter((snapshot) =>
    Object.values(snapshot.frequencyBySpellId).some((record) => record.cpm !== null),
  ).length
  const simulationSpecs = specSnapshots.filter((snapshot) =>
    Object.values(snapshot.frequencyBySpellId).some((record) => record.aplRank !== null),
  ).length
  const localizedSpellIds = new Set([...referencedSpellIds, ...nameOnlySpellIds])

  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        gameVersion: 'retail',
        build,
        generatedAt: new Date().toISOString(),
        locales: LOCALES.map((locale) => APP_LOCALE_BY_DATA_LOCALE[locale] ?? locale),
        specIds: specSnapshots.map((s) => s.specId),
        sources: [
          { id: 'game-tables', name: 'wago.tools', url: 'https://wago.tools' },
          { id: 'combat-logs', name: 'Warcraft Logs', url: 'https://www.warcraftlogs.com' },
          { id: 'simulation', name: 'SimulationCraft', url: 'https://www.simulationcraft.org' },
          { id: 'spell-text', name: 'Wowhead', url: 'https://www.wowhead.com' },
        ],
        coverage: {
          specs: specSnapshots.length,
          spellMeta: Object.keys(spellMeta).length,
          localizedSpells: localizedSpellIds.size,
          combatLogSpecs,
          simulationSpecs,
        },
      },
      null,
      1,
    ),
    'utf8',
  )
  writeFileSync(
    join(process.cwd(), 'public', 'data', 'retail', 'latest.json'),
    JSON.stringify({ build }),
    'utf8',
  )
  console.log(`snapshot written to ${outDir}`)
}

function assignSections(nodes: SpecTraitNodeRecord[]): SpecTraitNodeRecord[] {
  const mainNodes = nodes.filter((node) => node.subTreeId === 0 && node.entries.length > 0)
  const xs = [...new Set(mainNodes.map((node) => node.posX))].sort((a, b) => a - b)
  let splitX = Number.POSITIVE_INFINITY
  let largestGap = 0
  for (let i = 1; i < xs.length; i++) {
    const gap = (xs[i] ?? 0) - (xs[i - 1] ?? 0)
    if (gap > largestGap) {
      largestGap = gap
      splitX = ((xs[i] ?? 0) + (xs[i - 1] ?? 0)) / 2
    }
  }
  return nodes.map((node) => ({
    ...node,
    section:
      node.subTreeId > 0 || node.kind === 'subtree-selection'
        ? ('hero' as const)
        : node.posX < splitX
          ? ('class' as const)
          : ('spec' as const),
  }))
}

function resolveApl(aplIndex: Map<string, string>, className: string, specName: string): string | null {
  const classKey = className.toLowerCase().replace(/\s+/g, '_')
  const specKey = specName.toLowerCase().replace(/\s+/g, '_')
  const exact = aplIndex.get(`${classKey}_${specKey}`)
  if (exact) return exact
  const candidates = [...aplIndex.entries()].filter(([key]) => key.startsWith(`${classKey}_${specKey}`))
  candidates.sort((a, b) => a[0].length - b[0].length)
  return candidates[0]?.[1] ?? null
}

function resolveActionSpellId(
  actionName: string,
  poolSpellIds: Set<number>,
  spellIdsByNormalizedName: Map<string, number[]>,
): number | null {
  const candidates = spellIdsByNormalizedName.get(actionName) ?? []
  const inPool = candidates.filter((spellId) => poolSpellIds.has(spellId))
  if (inPool.length > 0) return Math.min(...inPool)
  return null
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
