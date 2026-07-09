import type { ArenaTargetScheme, GameMode } from '@/core/model/ability'
import type {
  HardwareConfig,
  KeyboardFormFactor,
  Modifier,
  MouseModel,
  MovementSchemeId,
  PhysicalLayout,
} from '@/core/model/hardware'
import { DEFAULT_BANNED_KEY_IDS, DEFAULT_HARDWARE_CONFIG } from '@/core/model/hardware'

export interface OptimizerInputs {
  importString: string
  raceId: number | null
  pvpTalentIds: number[]
  mode: GameMode
  arenaTargetScheme: ArenaTargetScheme
  arenaTargetBinds: boolean | null
  hardware: HardwareConfig
  seed: number
}

export const DEFAULT_INPUTS: OptimizerInputs = {
  importString: '',
  raceId: null,
  pvpTalentIds: [],
  mode: 'mythic-plus',
  arenaTargetScheme: 'focus',
  arenaTargetBinds: null,
  hardware: DEFAULT_HARDWARE_CONFIG,
  seed: 1,
}

export function effectiveTargetBinds(inputs: OptimizerInputs): boolean {
  return inputs.arenaTargetBinds ?? inputs.arenaTargetScheme === 'arena123'
}

const GAME_MODES: GameMode[] = ['raid', 'mythic-plus', 'arena', 'rbg', 'battleground']
const FORM_FACTORS: KeyboardFormFactor[] = ['full', 'tkl', 'sixty']
const LAYOUTS: PhysicalLayout[] = ['ansi', 'iso']
const MICE: MouseModel[] = ['none', 'two-button', 'mmo-twelve']
const SCHEMES: MovementSchemeId[] = ['wasd', 'esdf']
const MODIFIERS: Modifier[] = ['none', 'shift', 'ctrl', 'alt']

export function serializeInputs(inputs: OptimizerInputs): URLSearchParams {
  const params = new URLSearchParams()
  if (inputs.importString) params.set('s', inputs.importString)
  if (inputs.raceId !== null) params.set('race', String(inputs.raceId))
  if (inputs.pvpTalentIds.length > 0) params.set('pvp', inputs.pvpTalentIds.join('.'))
  params.set('mode', inputs.mode)
  if (inputs.mode === 'arena') params.set('scheme', inputs.arenaTargetScheme)
  if (inputs.mode === 'arena' && inputs.arenaTargetBinds !== null) {
    params.set('tb', inputs.arenaTargetBinds ? '1' : '0')
  }
  const h = inputs.hardware
  params.set('kb', `${h.formFactor}.${h.layout}.${h.mouse}.${h.movementScheme}`)
  params.set('mods', h.enabledModifiers.filter((m) => m !== 'none').join('.') || 'none-only')
  if (h.includeMouseWheel) params.set('wheel', '1')
  const sortedBanned = [...h.bannedKeyIds].sort()
  const isDefaultBan =
    sortedBanned.length === DEFAULT_BANNED_KEY_IDS.length &&
    sortedBanned.every((keyId, index) => keyId === [...DEFAULT_BANNED_KEY_IDS].sort()[index])
  if (!isDefaultBan) {
    params.set('ban', h.bannedKeyIds.length === 0 ? 'none' : h.bannedKeyIds.join('.'))
  }
  if (inputs.seed !== 1) params.set('seed', String(inputs.seed))
  return params
}

export function deserializeInputs(params: URLSearchParams): OptimizerInputs {
  const hardwareParts = (params.get('kb') ?? '').split('.')
  const formFactor = FORM_FACTORS.find((value) => value === hardwareParts[0]) ?? DEFAULT_HARDWARE_CONFIG.formFactor
  const layout = LAYOUTS.find((value) => value === hardwareParts[1]) ?? DEFAULT_HARDWARE_CONFIG.layout
  const mouse = MICE.find((value) => value === hardwareParts[2]) ?? DEFAULT_HARDWARE_CONFIG.mouse
  const movementScheme = SCHEMES.find((value) => value === hardwareParts[3]) ?? DEFAULT_HARDWARE_CONFIG.movementScheme

  const modsRaw = params.get('mods')
  let enabledModifiers: Modifier[] = DEFAULT_HARDWARE_CONFIG.enabledModifiers
  if (modsRaw === 'none-only') {
    enabledModifiers = ['none']
  } else if (modsRaw) {
    const parsed = modsRaw.split('.').filter((value): value is Modifier => MODIFIERS.includes(value as Modifier))
    enabledModifiers = ['none', ...parsed]
  }

  const banRaw = params.get('ban')
  const bannedKeyIds =
    banRaw === null
      ? DEFAULT_BANNED_KEY_IDS
      : banRaw === 'none'
        ? []
        : banRaw.split('.').filter(Boolean)

  const hardware: HardwareConfig = {
    ...DEFAULT_HARDWARE_CONFIG,
    formFactor,
    layout,
    mouse,
    movementScheme,
    enabledModifiers,
    includeMouseWheel: params.get('wheel') === '1',
    bannedKeyIds,
  }

  const mode = GAME_MODES.find((value) => value === params.get('mode')) ?? DEFAULT_INPUTS.mode
  const scheme: ArenaTargetScheme = params.get('scheme') === 'arena123' ? 'arena123' : 'focus'

  return {
    importString: params.get('s') ?? '',
    raceId: params.get('race') ? Number.parseInt(params.get('race') ?? '', 10) : null,
    pvpTalentIds: (params.get('pvp') ?? '')
      .split('.')
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => !Number.isNaN(value)),
    mode,
    arenaTargetScheme: scheme,
    arenaTargetBinds: params.get('tb') === '1' ? true : params.get('tb') === '0' ? false : null,
    hardware,
    seed: params.get('seed') ? Number.parseInt(params.get('seed') ?? '1', 10) : 1,
  }
}
