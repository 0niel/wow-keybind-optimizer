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
import { CATEGORY_HEX } from '@/core/model/category-colors'
import { ALL_CATEGORIES } from '@/core/model/ability-category'
import type { ZeroSpellLabels } from '@/lib/data'
import {
  DEFAULT_ADDON_UI,
  buildAddonKeyboard,
  buildAddonProfile,
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
import type { AddonDecor, AddonProfile, ExportBind } from '@/lib/exports'
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

const EN_LABELS: ZeroSpellLabels = {
  trinket: 'Trinket',
  pvpTrinket: 'PvP Trinket',
  targetArena: (n: number) => `Target arena ${n}`,
  setFocus: 'Set focus',
}

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
  const text = JSON.parse(readFileSync(join(DATA_ROOT, 'text', 'en.json'), 'utf8')) as {
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
    EN_LABELS,
  )
  return { binds, abilities: problem.abilities, slots: problem.slots, result }
}

function testDecor(): AddonDecor {
  const categories = Object.fromEntries(ALL_CATEGORIES.map((category) => [category, category]))
  return {
    colorByCategory: CATEGORY_HEX,
    ru: {
      categories: {
        ...categories,
        interrupt: 'Прерывание',
      } as AddonDecor['ru']['categories'],
      ui: { ...DEFAULT_ADDON_UI, applyButton: 'Применить' },
    },
    en: {
      categories: { ...categories, interrupt: 'Interrupt' } as AddonDecor['en']['categories'],
      ui: { ...DEFAULT_ADDON_UI },
    },
  }
}

const TEST_KEYBOARD = buildAddonKeyboard(DEFAULT_HARDWARE_CONFIG)

function toProfile(layout: SolvedLayout, mode: GameMode, decor?: AddonDecor): AddonProfile {
  return buildAddonProfile(
    `${mode}-v1`,
    `${mode} - variant 1`,
    mode,
    263,
    'SHAMAN',
    layout.binds,
    TEST_KEYBOARD,
    decor,
  )
}

beforeAll(() => {
  spellMeta = JSON.parse(readFileSync(join(DATA_ROOT, 'spell-meta.json'), 'utf8')) as SpellMetaShard
  races = JSON.parse(readFileSync(join(DATA_ROOT, 'races.json'), 'utf8')) as RaceRecord[]
})

describe('lua addon generator', () => {
  const layouts: Array<[string, GameMode, ArenaTargetScheme, number]> = [
    ['elemental mythic-plus', 'mythic-plus', 'focus', 262],
    ['enhancement arena focus', 'arena', 'focus', 263],
    ['enhancement arena123', 'arena', 'arena123', 263],
  ]

  it.each(layouts)('emits syntactically valid Lua 5.1 for %s', (_label, mode, scheme, specId) => {
    const layout = solveLayout(specId, mode, scheme)
    const lua = renderLuaAddon([toProfile(layout, mode)], 'KeybindOptimizer')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('ships multiple profiles with stable hashes and per-character selection', () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const profileA = toProfile(layout, 'arena')
    const profileB = toProfile(layout, 'arena')
    expect(profileA.hash).toBe(profileB.hash)
    expect(profileA.hash).toMatch(/^[0-9a-f]{8}$/)
    const lua = renderLuaAddon([profileA], 'KeybindOptimizer')
    expect(lua).toContain('local PROFILES = {')
    expect(lua).toContain(`hash = "${profileA.hash}"`)
    expect(lua).toContain('spec = 263')
    expect(lua).toContain('class = "SHAMAN"')
    expect(lua).toContain('KeybindOptimizerCharDB')
    expect(lua).toContain('currentProfile')
    expect(lua).toContain('profileBySpec')
    expect(lua).toContain('appliedBySpec')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('switches profiles per spec with class-wide fallback and never wipes state on trait events', () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'arena')], 'KeybindOptimizer')
    expect(lua).toContain('currentProfileIndex')
    expect(lua).toContain('playerClassTag')
    expect(lua).toContain('scheduleAuto')
    expect(lua).toContain('msgSpecSwitched')
    expect(lua).toContain('msgSpecAdapted')
    expect(lua).not.toContain('appliedHash = nil')
    expect(lua).toContain('invalidateApplied')
    expect(lua).toContain('"^KO%d+$"')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('uses identity-verified spell pickup instead of raw spellbook indices', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'mythic-plus')], 'KeybindOptimizer')
    expect(lua).toContain('C_Spell.PickupSpell')
    expect(lua).toContain('FindSpellBookSlotForSpell')
    expect(lua).toContain('pcall(C_SpellBook.PickupSpellBookItem, slotIndex, bank or 0)')
    expect(lua).not.toContain('pcall(C_SpellBook.PickupSpellBookItem, spellId)')
    expect(lua).toContain('cursorHasSpell')
    expect(lua).toContain('actionMatchesSpell')
    expect(lua).toContain('GetCursorInfo()')
    expect(lua).toContain('FindSpellOverrideByID')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('applies idempotently: hash + verification gate, combat queue, trait invalidation', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    const lua = renderLuaAddon([toProfile(layout, 'arena')], 'KeybindOptimizer')
    expect(lua).toContain('verifyApplied')
    expect(lua).toContain('appliedBySpec')
    expect(lua).toContain('st.hash = profile.hash')
    expect(lua).toContain('PLAYER_REGEN_ENABLED')
    expect(lua).toContain('TRAIT_CONFIG_UPDATED')
    expect(lua).toContain('ACTIVE_PLAYER_SPECIALIZATION_CHANGED')
    expect(lua).toContain('applyQueued')
    expect(lua).toContain('if db().autoApply then apply("auto") end')
    expect(lua).toContain('placeVerified')
    expect(lua).toContain('GetMacroInfo(id) == label')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('renders the in-game layout browser with icons and tooltips', () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'arena', testDecor())], 'KeybindOptimizer', testDecor())
    expect(lua).toContain('KeybindOptimizerBrowser')
    expect(lua).toContain('C_Spell.GetSpellTexture')
    expect(lua).toContain('UISpecialFrames')
    expect(lua).toContain('SetSpellByID')
    expect(lua).toContain('browserProfileButtons')
    expect(lua).toContain('UIPanelButtonTemplate')
    expect(lua).toContain('SetDesaturated')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('ships the keyboard view with layers, history backups and restore', () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'arena')], 'KeybindOptimizer')
    expect(lua).toContain('local KEYBOARDS = {')
    expect(lua).toContain('kb = 1')
    expect(lua).toContain('updateKeyboardView')
    expect(lua).toContain('browserLayer')
    expect(lua).toContain('SHIFT-')
    expect(lua).toContain('captureBackup')
    expect(lua).toContain('restoreBackup')
    expect(lua).toContain('restoreQueued')
    expect(lua).toContain('macroBodies')
    expect(lua).toContain('^MACRO (KO%d+)$')
    expect(lua).toContain('c.backups')
    expect(lua).toContain('TARGETARENA(%d)')
    expect(lua).toMatch(/k = "Q", label = "Q"/)
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('clears the previous profile placements before applying a new one', () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'arena')], 'KeybindOptimizer')
    expect(lua).toContain('for _, record in pairs(st.placements or {}) do')
    expect(lua).toContain('captureBackup(UI.backupAuto, true)')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('exposes expanded settings and slash commands', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'mythic-plus')], 'KeybindOptimizer')
    for (const command of ['apply', 'force', 'check', 'profile', 'auto', 'mouseover', 'colors', 'legend', 'clearmain', 'bars', 'mainbar', 'help']) {
      expect(lua).toMatch(new RegExp(`command == "${command}"`))
    }
    expect(lua).toContain('"autoApply"')
    expect(lua).toContain('"mouseover"')
    expect(lua).toContain('UICheckButtonTemplate')
    expect(lua).toMatch(/RegisterAddOnCategory|InterfaceOptions_AddCategory/)
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('offers every slash command as a button in the browser and settings panel', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'mythic-plus')], 'KeybindOptimizer')
    expect(lua).toContain('makeCommandButton')
    expect(lua).toContain('makePanelButton')
    for (const key of ['UI.forceButton', 'UI.checkButton', 'UI.barsButton', 'UI.clearMainButton']) {
      const uses = lua.split(key).length - 1
      expect(uses).toBeGreaterThanOrEqual(2)
    }
    expect(lua).toContain('runCheck')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('enables hidden bars through Edit Mode layouts, not account settings', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'mythic-plus')], 'KeybindOptimizer')
    expect(lua).toContain('C_EditMode.GetLayouts')
    expect(lua).toContain('C_EditMode.SaveLayouts')
    expect(lua).toContain('Enum.EditModeActionBarSetting')
    expect(lua).toContain('SetActionBarToggles')
    expect(lua).not.toContain('Enum.EditModeAccountSetting["Show"')
  })

  it('colors buttons and bakes both locales when decor is supplied', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    const decor = testDecor()
    const entries = buildLuaBindEntries(layout.binds, decor)
    expect(entries.some((entry) => entry.category !== undefined)).toBe(true)
    const lua = renderLuaAddon([toProfile(layout, 'mythic-plus', decor)], 'KeybindOptimizer', decor)
    expect(lua).toContain('decorateButton')
    expect(lua).toContain('SetColorTexture')
    expect(lua).toContain('MultiBarBottomLeftButton')
    expect(lua).toContain('isProtectedSlot')
    expect(lua).toContain('isOwnedMacroName')
    expect(lua).toContain('^KO%d+$')
    expect(lua).toContain('clearOwnedButtons')
    expect(lua).toContain('IsSpellKnownOrOverridesKnown')
    expect(lua).toContain('KeybindOptimizerDB')
    expect(lua).toContain('LEGEND_CATEGORIES')
    expect(lua).toContain('KeybindOptimizerLegend')
    expect(lua).toContain('GetLocale')
    expect(lua).toContain('Прерывание')
    expect(lua).toContain('Interrupt')
    expect(() => parseLua(lua, { luaVersion: '5.1' })).not.toThrow()
  })

  it('is locale-independent without decor: no localized names inside the addon source', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    const lua = renderLuaAddon([toProfile(layout, 'mythic-plus')], 'KeybindOptimizer')
    expect(/[а-яА-ЯёЁ]/.test(lua)).toBe(false)
  })

  it('covers every assignment with a BINDS entry: spells, items, commands, macros', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    const entries = buildLuaBindEntries(layout.binds)
    expect(entries.length).toBe(layout.binds.length)
    const keys = entries.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const entry of entries) {
      expect(
        entry.spell !== undefined ||
          entry.item !== undefined ||
          entry.command !== undefined ||
          entry.macrotext !== undefined,
      ).toBe(true)
      expect(entry.key).toMatch(/^((SHIFT|CTRL|ALT)-)?[A-Z0-9`\-=[\];',./]+$/)
    }
    const commands = entries.filter((entry) => entry.command !== undefined)
    expect(commands.map((entry) => entry.command).sort()).toEqual([
      'TARGETARENA1',
      'TARGETARENA2',
      'TARGETARENA3',
    ])
  })

  it('adds a set-focus macro bind under the focus scheme', () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const entries = buildLuaBindEntries(layout.binds)
    const setFocus = entries.find((entry) => entry.macrotext !== undefined)
    expect(setFocus).toBeDefined()
    expect(setFocus?.macrotext).toBe('/focus [@mouseover,exists][]')
    const focusBind = layout.binds.find((bind) => bind.ability.id === 'focus:set')
    expect(focusBind).toBeDefined()
    if (focusBind) expect(macroBody(focusBind)).toBe('/focus [@mouseover,exists][]')
  })

  it('plans keyboard-mirrored bar slots: digits aligned, layers on separate bars', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    const entries = buildLuaBindEntries(layout.binds)
    const digitColumn: Record<string, number> = {
      '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '0': 9, '-': 10, '=': 11,
    }
    for (const entry of entries) {
      if (entry.command !== undefined) {
        expect(entry.slot).toBeUndefined()
        continue
      }
      expect(entry.slot).toBeDefined()
      const column = digitColumn[entry.key]
      if (column !== undefined) {
        expect(entry.slot).toBe(column)
      }
    }
    const shiftDigits = entries.filter(
      (entry) => entry.slot !== undefined && /^SHIFT-[0-9=-]$/.test(entry.key),
    )
    for (const entry of shiftDigits) {
      const keyChar = entry.key.slice(6)
      expect((entry.slot ?? 0) % 12).toBe(digitColumn[keyChar])
      expect(entry.slot ?? 0).toBeGreaterThanOrEqual(12)
    }
    const slots = entries.map((entry) => entry.slot).filter((slot) => slot !== undefined)
    expect(new Set(slots).size).toBe(slots.length)
  })

  it('keeps manual macro bodies within game limits', () => {
    const layout = solveLayout(263, 'arena', 'arena123')
    for (const bind of layout.binds) {
      const body = macroBody(bind)
      if (body === null) continue
      expect(body.length).toBeLessThanOrEqual(255)
      const name = macroName(bind)
      expect(name.length).toBeLessThanOrEqual(16)
    }
    expect(renderMacroList(layout.binds).length).toBeGreaterThan(0)
  })

  it('renders a plain list and a toc with the right interface version', () => {
    const layout = solveLayout(262, 'mythic-plus', 'focus')
    expect(renderPlainList(layout.binds).split('\n').length).toBe(layout.binds.length)
    expect(interfaceVersionFromBuild('12.0.7.68367')).toBe('120007')
    const toc = renderAddonToc('KeybindOptimizer', BUILD)
    expect(toc).toContain('## Interface: 120007')
    expect(toc).toContain('## SavedVariables: KeybindOptimizerDB')
    expect(toc).toContain('## SavedVariablesPerCharacter: KeybindOptimizerCharDB')
  })

  it('packs a ZIP with the correct addon folder structure that round-trips', async () => {
    const layout = solveLayout(263, 'arena', 'focus')
    const toc = renderAddonToc('KeybindOptimizer', BUILD)
    const lua = renderLuaAddon([toProfile(layout, 'arena')], 'KeybindOptimizer')
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
  })
})
