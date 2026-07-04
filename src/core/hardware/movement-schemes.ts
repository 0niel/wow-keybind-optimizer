import type { MovementScheme, MovementSchemeId } from '@/core/model/hardware'

const WASD_TIERS: Record<string, number> = {
  KeyQ: 1,
  KeyE: 1,
  KeyR: 1,
  KeyF: 1,
  KeyC: 1,
  KeyX: 1,
  KeyV: 1,
  Digit1: 0.82,
  Digit2: 0.82,
  Digit3: 0.82,
  Digit4: 0.82,
  KeyT: 0.82,
  KeyG: 0.82,
  KeyZ: 0.82,
  KeyB: 0.82,
  Tab: 0.82,
  CapsLock: 0.5,
  Digit5: 0.55,
  Backquote: 0.55,
  KeyY: 0.55,
  KeyH: 0.55,
  KeyN: 0.55,
  F1: 0.55,
  F2: 0.55,
  F3: 0.55,
  Digit6: 0.3,
  F4: 0.3,
  F5: 0.3,
  KeyU: 0.3,
  KeyJ: 0.3,
  KeyM: 0.3,
}

function shiftTiersRight(tiers: Record<string, number>): Record<string, number> {
  const columnShift: Record<string, string> = {
    KeyQ: 'KeyW',
    KeyE: 'KeyR',
    KeyR: 'KeyT',
    KeyF: 'KeyG',
    KeyC: 'KeyV',
    KeyX: 'KeyC',
    KeyV: 'KeyB',
    KeyT: 'KeyY',
    KeyG: 'KeyH',
    KeyZ: 'KeyX',
    KeyB: 'KeyN',
    KeyY: 'KeyU',
    KeyH: 'KeyJ',
    KeyN: 'KeyM',
    KeyU: 'KeyI',
    KeyJ: 'KeyK',
    KeyM: 'Comma',
  }
  const result: Record<string, number> = {}
  for (const [keyId, tier] of Object.entries(tiers)) {
    result[columnShift[keyId] ?? keyId] = tier
  }
  result['KeyA'] = 0.82
  return result
}

export const MOVEMENT_SCHEMES: Record<MovementSchemeId, MovementScheme> = {
  wasd: {
    id: 'wasd',
    movementKeyIds: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'],
    anchorKeyIds: ['KeyW', 'KeyA', 'KeyS', 'KeyD'],
    tierByKeyId: WASD_TIERS,
  },
  esdf: {
    id: 'esdf',
    movementKeyIds: ['KeyE', 'KeyS', 'KeyD', 'KeyF', 'Space'],
    anchorKeyIds: ['KeyE', 'KeyS', 'KeyD', 'KeyF'],
    tierByKeyId: shiftTiersRight(WASD_TIERS),
  },
}

export const DEFAULT_TIER = 0.1

export const ROTATION_KEY_ORDER: Record<MovementSchemeId, string[]> = {
  wasd: [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'KeyQ',
    'KeyE',
    'KeyR',
    'KeyF',
    'KeyC',
    'KeyX',
    'KeyV',
    'KeyT',
    'KeyG',
    'KeyZ',
    'KeyB',
    'Tab',
    'CapsLock',
    'Digit5',
  ],
  esdf: [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'KeyW',
    'KeyR',
    'KeyT',
    'KeyG',
    'KeyV',
    'KeyC',
    'KeyB',
    'KeyY',
    'KeyH',
    'KeyX',
    'KeyN',
    'Tab',
    'CapsLock',
    'Digit5',
  ],
}
