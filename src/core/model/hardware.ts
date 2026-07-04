export type Modifier = 'none' | 'shift' | 'ctrl' | 'alt'

export type KeyboardFormFactor = 'full' | 'tkl' | 'sixty'

export type PhysicalLayout = 'ansi' | 'iso'

export type MouseModel = 'none' | 'two-button' | 'mmo-twelve'

export type MovementSchemeId = 'wasd' | 'esdf'

export interface PhysicalKey {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
}

export interface MouseButton {
  id: string
  label: string
  reach: number
}

export interface MovementScheme {
  id: MovementSchemeId
  movementKeyIds: string[]
  anchorKeyIds: string[]
  tierByKeyId: Record<string, number>
}

export interface HardwareConfig {
  formFactor: KeyboardFormFactor
  layout: PhysicalLayout
  mouse: MouseModel
  movementScheme: MovementSchemeId
  modifierFactors: Record<Modifier, number>
  enabledModifiers: Modifier[]
  includeMouseWheel: boolean
  bannedKeyIds: string[]
}

export const DEFAULT_BANNED_KEY_IDS = ['Tab']

export const DEFAULT_HARDWARE_CONFIG: HardwareConfig = {
  formFactor: 'tkl',
  layout: 'ansi',
  mouse: 'two-button',
  movementScheme: 'wasd',
  modifierFactors: { none: 1, shift: 0.85, ctrl: 0.72, alt: 0.6 },
  enabledModifiers: ['none', 'shift', 'ctrl', 'alt'],
  includeMouseWheel: false,
  bannedKeyIds: DEFAULT_BANNED_KEY_IDS,
}
