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

const MODIFIER_RANK: Record<Modifier, number> = { none: 0, shift: 1, ctrl: 2, alt: 3 }

type Entry = readonly [PlannedBind, number]

function keyOrder(keyId: string): number {
  return KEY_POSITION_INDEX.get(keyId) ?? 999
}

function byKeyOrder(a: Entry, b: Entry): number {
  return keyOrder(a[0].keyId) - keyOrder(b[0].keyId)
}

function byModifierThenKey(a: Entry, b: Entry): number {
  return (
    MODIFIER_RANK[a[0].modifier] - MODIFIER_RANK[b[0].modifier] ||
    keyOrder(a[0].keyId) - keyOrder(b[0].keyId)
  )
}

export function buildPlacementPlan(binds: PlannedBind[]): (number | null)[] {
  const result: (number | null)[] = binds.map(() => null)
  const entries = binds
    .map((bind, index) => [bind, index] as const)
    .filter(([bind]) => bind.placeable)

  const baseDigits = entries
    .filter(([bind]) => bind.modifier === 'none' && DIGIT_COLUMN[bind.keyId] !== undefined)
    .sort(byKeyOrder)
  const baseOthers = entries
    .filter(([bind]) => bind.modifier === 'none' && DIGIT_COLUMN[bind.keyId] === undefined)
    .sort(byKeyOrder)
  const shiftAll = entries.filter(([bind]) => bind.modifier === 'shift').sort(byKeyOrder)
  const rest = entries
    .filter(([bind]) => bind.modifier === 'ctrl' || bind.modifier === 'alt')
    .sort(byModifierThenKey)

  let nextBar = 0
  const pool: Entry[] = []

  if (baseDigits.length > 0) {
    const bar = nextBar++
    for (const [bind, index] of baseDigits) {
      result[index] = bar * BAR_SIZE + (DIGIT_COLUMN[bind.keyId] ?? 0)
    }
  }

  const letterColumn = new Map<string, number>()
  baseOthers.slice(0, BAR_SIZE).forEach(([bind], position) => {
    letterColumn.set(bind.keyId, position)
  })

  if (shiftAll.length > 0) {
    const bar = nextBar++
    const used = new Set<number>()
    const shiftOthers: Entry[] = []
    for (const entry of shiftAll) {
      const column = DIGIT_COLUMN[entry[0].keyId]
      if (column !== undefined) {
        result[entry[1]] = bar * BAR_SIZE + column
        used.add(column)
      } else {
        shiftOthers.push(entry)
      }
    }
    const unaligned: Entry[] = []
    for (const entry of shiftOthers) {
      const aligned = letterColumn.get(entry[0].keyId)
      if (aligned !== undefined && !used.has(aligned)) {
        result[entry[1]] = bar * BAR_SIZE + aligned
        used.add(aligned)
      } else {
        unaligned.push(entry)
      }
    }
    let column = 0
    for (const entry of unaligned) {
      while (column < BAR_SIZE && used.has(column)) column++
      if (column < BAR_SIZE) {
        result[entry[1]] = bar * BAR_SIZE + column
        used.add(column)
        column++
      } else {
        pool.push(entry)
      }
    }
  }

  if (baseOthers.length > 0) {
    const bar = nextBar++
    baseOthers.slice(0, BAR_SIZE).forEach(([, index], position) => {
      result[index] = bar * BAR_SIZE + position
    })
    for (const entry of baseOthers.slice(BAR_SIZE)) pool.push(entry)
  }

  pool.sort(byModifierThenKey)
  const packed = [...pool, ...rest].sort(byModifierThenKey)
  let bar = nextBar
  let column = 0
  for (const [, index] of packed) {
    if (bar >= MAX_PLANNED_BARS) break
    result[index] = bar * BAR_SIZE + column
    column++
    if (column === BAR_SIZE) {
      column = 0
      bar++
    }
  }

  return result
}
