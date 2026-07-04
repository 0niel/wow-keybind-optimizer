import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { parse as parseLua } from 'luaparse'
import { decodeLoadout } from '@/core/decoder'
import { extractAbilityPool } from '@/core/extract/ability-pool'
import { buildAssignmentProblem } from '@/core/problem/build'
import { solveAssignment, DEFAULT_MOVE_BUDGET } from '@/core/solver'
import { DEFAULT_HARDWARE_CONFIG } from '@/core/model/hardware'
import type { ArenaTargetScheme, GameMode, SolveResult } from '@/core/model/ability'
import type { Ability, Slot } from '@/core/model/ability'
import type { RaceRecord, SpecSnapshot, SpellMetaShard } from '@/core/model/snapshot'
import {
  buildExportBinds,
  buildLuaBindEntries,
  interfaceVersionFromBuild,
  macroBody,
  macroName,
  renderAddonToc,
  renderLuaAddon,
  renderMacroList,
  renderPlainList,
} from '@/lib/exports'
import type { ExportBind } from '@/lib/exports'
import { buildZipBlob } from '@/lib/zip'
import golden from './fixtures/decoder-golden.json'

async function readStoredZip(blob: Blob): Promise<Record<string, string>> {
  const arrayBuffer = await blob.arrayBuffer()
  const buffer = new Uint8Array(arrayBuffer)
  const view = new DataView(arrayBuffer)
  const decoder = new TextDecoder()
  let eocd = buffer.length - 22
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('no end-of-central-directory record')
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  const result: Record<string, string> = {}
  for (let entry = 0; entry < count; entry++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('bad central header')
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(buffer.slice(cursor + 46, cursor + 46 + nameLength))
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const size = view.getUint32(localOffset + 18, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    result[name] = decoder.decode(buffer.slice(dataStart, dataStart + size))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return result
}

const BUILD = '12.0.7.68367'
const DATA_ROOT = join(process.cwd(), 'public', 'data', 'retail', BUILD)

let spellMeta: SpellMetaShard
let races: RaceRecord[]

interface SolvedLayout {
  binds: ExportBind[]
  abilities: Ability[]
  slots: Slot[]
  result: SolveResult
}

function solveLayout(specId: number, mode: GameMode, scheme: ArenaTargetScheme): SolvedLayout {
  const spec = JSON.parse(
    readFileSync(join(DATA_ROOT, 'specs', `${specId}.json`), 'utf8'),
  ) as SpecSnapshot
  const text = JSON.parse(readFileSync(join(DATA_ROOT, 'text', 'ru.json'), 'utf8')) as {
    spells: Record<string, { name: string; description: string }>
  }
  const goldenCase = golden.cases.find((c) => c.specId === specId)
  if (!goldenCase) throw new Error(`no golden case for spec ${specId}`)
  const decoded = decodeLoadout(
    goldenCase.encoded,
    spec.nodes.map((node) => ({ id: node.id, kind: node.kind, maxRanks: node.maxRanks })),
  )
  const abilities = extractAbilityPool({
    spec,
    spellMeta,
    selections: decoded.selections,
    race: races.find((race) => race.slug === 'orc') ?? null,
    pvpTalentIds: spec.pvpTalents.slice(0, 3).map((talent) => talent.id),
    mode,
    arenaTargetScheme: scheme,
  })
  const problem = buildAssignmentProblem({
    abilities,
    spec,
    hardware: DEFAULT_HARDWARE_CONFIG,
    mode,
    arenaTargetScheme: scheme,
    constraints: { lockedBinds: {}, bannedSlotIds: [], preservedBinds: {} },
  })
  const result = solveAssignment(problem, {
    strategyId: 'qap-annealing',
    seed: 1,
    moveBudget: DEFAULT_MOVE_BUDGET,
    hardware: DEFAULT_HARDWARE_CONFIG,
  })
  const binds = buildExportBinds(
    result.assignments,
    problem.abilities,
    problem.slots,
    text.spells,
    'Trinket',
    'PvP Trinket',
  )
  return { binds, abilities: problem.abilities, slots: problem.slots, result }
}

beforeAll(() => {
  spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
})

describe('lua addon generator', () => {
  const layouts: Array<[string, () => SolvedLayout]> = [
    ['elemental mythic-plus', () => solveLayout(262, 'mythic-plus', 'focus')],
    ['enhancement arena focus', () => solveLayout(263, 'arena', 'focus')],
    ['enhancement arena123', () => solveLayout(263, 'arena', 'arena123')],
  ]

  it.each(layouts)('emits syntactically valid Lua 5.1 for %s', (_label, build) => {
    const layout = build()
    const lua = renderLuaAddon(layout.binds, 'KeybindOptimizer')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('is locale-independent: no localized names inside the addon source', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    const lua = renderLuaAddon(layout.binds, 'KeybindOptimizer')
    expect(/[а-яА-ЯёЁ]/.test(lua)).toBe(false)
  })

  it('covers every bindable assignment with a BINDS entry', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    const entries = buildLuaBindEntries(layout.binds)
    expect(entries.length).toBe(layout.binds.length)
    const keys = entries.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const entry of entries) {
      expect(entry.spell !== undefined || entry.item !== undefined).toBe(true)
      expect(entry.key).toMatch(/^((SHIFT|CTRL|ALT)-)?[A-Z0-9`\-=[\];',./]+$/)
    }
  })

  it('orders binds by modifier layer then key position', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    const rank: Record<string, number> = { none: 0, shift: 1, ctrl: 2, alt: 3 }
    let previous = -1
    for (const bind of layout.binds) {
      const current = rank[bind.slot.modifier] ?? 9
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it('places each modifier layer on its own action bar', () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const entries = buildLuaBindEntries(layout.binds)
    const barsByModifier = new Map<string, Set<number>>()
    const usedSlots = new Set<number>()
    entries.forEach((entry, index) => {
      if (entry.command === undefined || entry.slot === undefined) return
      expect(usedSlots.has(entry.slot)).toBe(false)
      usedSlots.add(entry.slot)
      const modifier = layout.binds[index]?.slot.modifier ?? 'none'
      const barMatch = entry.command.match(/MULTIACTIONBAR(\d)BUTTON/)
      expect(barMatch).not.toBeNull()
      const barNumber = Number(barMatch?.[1])
      const set = barsByModifier.get(modifier) ?? new Set<number>()
      set.add(barNumber)
      barsByModifier.set(modifier, set)
    })
    const allBars = [...barsByModifier.values()]
    for (let i = 0; i < allBars.length; i++) {
      for (let j = i + 1; j < allBars.length; j++) {
        const a = allBars[i]
        const b = allBars[j]
        if (!a || !b) continue
        for (const bar of a) expect(b.has(bar)).toBe(false)
      }
    }
  })

  it('marks focus, arena, and mouseover binds for macro generation', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    const entries = buildLuaBindEntries(layout.binds)
    const arenaEntries = entries.filter((entry) => entry.target?.startsWith('arena'))
    expect(arenaEntries.length).toBeGreaterThanOrEqual(3)
    const trinkets = entries.filter((entry) => entry.item !== undefined)
    expect(trinkets.map((entry) => entry.item).sort()).toEqual([13, 14])
  })

  it('keeps manual macro bodies within game limits', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    const seenNames = new Set<string>()
    for (const bind of layout.binds) {
      const body = macroBody(bind)
      if (body === null) continue
      expect(body.length).toBeLessThanOrEqual(255)
      const name = macroName(bind)
      expect(name.length).toBeLessThanOrEqual(16)
      seenNames.add(name)
    }
    expect(renderMacroList(layout.binds).length).toBeGreaterThan(0)
  })

  it('renders a plain list and a toc with the right interface version', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    expect(renderPlainList(layout.binds).split('\n').length).toBe(layout.binds.length)
    expect(interfaceVersionFromBuild('12.0.7.68367')).toBe('120007')
    expect(renderAddonToc('KeybindOptimizer', BUILD)).toContain('## Interface: 120007')
  })

  it('packs a ZIP with the correct addon folder structure that round-trips', async () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const toc = renderAddonToc('KeybindOptimizer', BUILD)
    const lua = renderLuaAddon(layout.binds, 'KeybindOptimizer')
    const zip = buildZipBlob([
      { name: 'KeybindOptimizer/KeybindOptimizer.toc', content: toc },
      { name: 'KeybindOptimizer/KeybindOptimizer.lua', content: lua },
    ])
    const extracted = await readStoredZip(zip)
    expect(Object.keys(extracted).sort()).toEqual([
      'KeybindOptimizer/KeybindOptimizer.lua',
      'KeybindOptimizer/KeybindOptimizer.toc',
    ])
    expect(extracted['KeybindOptimizer/KeybindOptimizer.toc']).toBe(toc)
    expect(extracted['KeybindOptimizer/KeybindOptimizer.lua']).toBe(lua)
    expect(() =>
      parseLua(extracted['KeybindOptimizer/KeybindOptimizer.lua'] ?? '', { luaVersion: '5.1' }),
    ).not.toThrow()
    expect(extracted['KeybindOptimizer/KeybindOptimizer.toc']).toMatch(/^## Interface:/)
  })
})
