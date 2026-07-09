import { writeFileSync } from 'node:fs'
import { parse } from 'luaparse'
import { buildAddonProfile, renderLuaAddon, buildAddonKeyboard } from '../src/lib/exports'
import { DEFAULT_HARDWARE_CONFIG } from '../src/core/model/hardware'
import type { ExportBind } from '../src/lib/exports'

const binds = [
  {
    ability: {
      id: 'spell:51490',
      spellId: 51490,
      category: 'utility',
      variantKind: 'base',
      baseAbilityId: null,
      frequency: 0.3,
      reactivity: 0,
      panic: 0,
      offGcd: false,
      targeting: 'enemy',
      sourceNodeIds: [],
      importance: 0,
      rotationRank: null,
    },
    slot: { id: 's', keyId: 'KeyQ', modifier: 'none' },
    name: 'Thunderstorm',
    wowKey: 'Q',
  },
] as unknown as ExportBind[]

const profile = buildAddonProfile(
  'p1',
  'Test',
  'arena',
  262,
  'SHAMAN',
  binds,
  buildAddonKeyboard(DEFAULT_HARDWARE_CONFIG),
)
const lua = renderLuaAddon([profile], 'KeybindOptimizer')
writeFileSync('scripts/.cache/addon-check.lua', lua)
parse(lua, { luaVersion: '5.1' })
console.log('lua parses ok, length', lua.length)
