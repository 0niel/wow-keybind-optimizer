import type { AbilityCategory } from '@/core/model/ability-category'
import type { GameMode } from '@/core/model/ability'

type ModeWeightRow = Record<GameMode, number>

export const MODE_WEIGHTS: Record<AbilityCategory, ModeWeightRow> = {
  'rotational-core': { raid: 1.0, 'mythic-plus': 1.0, arena: 1.0, rbg: 1.0, battleground: 1.0 },
  'rotational-proc': { raid: 0.95, 'mythic-plus': 0.95, arena: 0.95, rbg: 0.95, battleground: 0.95 },
  'cooldown-burst': { raid: 0.9, 'mythic-plus': 0.9, arena: 1.1, rbg: 1.0, battleground: 0.95 },
  'defensive-major': { raid: 0.7, 'mythic-plus': 0.95, arena: 1.3, rbg: 1.15, battleground: 1.05 },
  'defensive-minor': { raid: 0.55, 'mythic-plus': 0.8, arena: 1.1, rbg: 1.0, battleground: 0.9 },
  external: { raid: 0.75, 'mythic-plus': 0.85, arena: 1.15, rbg: 1.0, battleground: 0.85 },
  'heal-utility': { raid: 0.5, 'mythic-plus': 0.75, arena: 1.05, rbg: 1.0, battleground: 0.9 },
  interrupt: { raid: 0.8, 'mythic-plus': 1.3, arena: 1.5, rbg: 1.2, battleground: 1.0 },
  'cc-hard': { raid: 0.3, 'mythic-plus': 1.1, arena: 1.4, rbg: 1.2, battleground: 1.05 },
  'cc-soft': { raid: 0.25, 'mythic-plus': 0.6, arena: 1.1, rbg: 1.0, battleground: 0.95 },
  dispel: { raid: 0.4, 'mythic-plus': 0.9, arena: 1.3, rbg: 1.1, battleground: 0.95 },
  mobility: { raid: 0.6, 'mythic-plus': 0.8, arena: 1.2, rbg: 1.3, battleground: 1.2 },
  utility: { raid: 0.35, 'mythic-plus': 0.55, arena: 0.8, rbg: 0.85, battleground: 0.75 },
  trinket: { raid: 0.5, 'mythic-plus': 0.7, arena: 1.35, rbg: 1.15, battleground: 1.05 },
  targeting: { raid: 0, 'mythic-plus': 0, arena: 1.25, rbg: 0.9, battleground: 0.8 },
}
