import type { Modifier } from '@/core/model/hardware'

export const BAR_SIZE = 12
export const MAX_PLANNED_BARS = 8

export const KEY_POSITION_ORDER = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0',
  'Minus', 'Equal',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash',
  'Backquote', 'Tab', 'CapsLock', 'Space',
  'Mouse4', 'Mouse5',
  'MouseG1', 'MouseG2', 'MouseG3', 'MouseG4', 'MouseG5', 'MouseG6',
  'MouseG7', 'MouseG8', 'MouseG9', 'MouseG10', 'MouseG11', 'MouseG12',
  'WheelUp', 'WheelDown',
]

export const KEY_POSITION_INDEX = new Map(KEY_POSITION_ORDER.map((keyId, index) => [keyId, index]))

const DIGIT_COLUMN: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Digit8: 7,
  Digit9: 8,
  Digit0: 9,
  Minus: 10,
  Equal: 11,
}

export interface PlannedBind {
  keyId: string
  modifier: Modifier
  placeable: boolean
}

type Entry = readonly [PlannedBind, number]

function keyOrder(keyId: string): number {
  return KEY_POSITION_INDEX.get(keyId) ?? 999
}

function byKeyOrder(a: Entry, b: Entry): number {
  return keyOrder(a[0].keyId) - keyOrder(b[0].keyId)
}

const isDigitKey = (keyId: string): boolean => DIGIT_COLUMN[keyId] !== undefined

export function buildPlacementPlan(binds: PlannedBind[]): (number | null)[] {
  const result: (number | null)[] = binds.map(() => null)
  const entries = binds
    .map((bind, index) => [bind, index] as const)
    .filter(([bind]) => bind.placeable)

  const inGroup = (modifier: Modifier, digits: boolean) => (entry: Entry) =>
    entry[0].modifier === modifier && isDigitKey(entry[0].keyId) === digits

  const stream: Entry[] = [
    ...entries.filter(inGroup('none', true)).sort(byKeyOrder),
    ...entries.filter(inGroup('none', false)).sort(byKeyOrder),
    ...entries.filter(inGroup('shift', true)).sort(byKeyOrder),
    ...entries.filter(inGroup('shift', false)).sort(byKeyOrder),
    ...entries.filter(([bind]) => bind.modifier === 'ctrl').sort(byKeyOrder),
    ...entries.filter(([bind]) => bind.modifier === 'alt').sort(byKeyOrder),
  ]

  const capacity = MAX_PLANNED_BARS * BAR_SIZE
  stream.forEach(([, index], position) => {
    if (position < capacity) result[index] = position
  })

  return result
}
