import type { KeyboardFormFactor, PhysicalKey, PhysicalLayout } from '@/core/model/hardware'

interface RowSpec {
  y: number
  startX: number
  keys: Array<[id: string, label: string, width?: number]>
}

const MAIN_BLOCK_ROWS: RowSpec[] = [
  {
    y: 0,
    startX: 0,
    keys: [
      ['Backquote', '`'],
      ['Digit1', '1'],
      ['Digit2', '2'],
      ['Digit3', '3'],
      ['Digit4', '4'],
      ['Digit5', '5'],
      ['Digit6', '6'],
      ['Digit7', '7'],
      ['Digit8', '8'],
      ['Digit9', '9'],
      ['Digit0', '0'],
      ['Minus', '-'],
      ['Equal', '='],
    ],
  },
  {
    y: 1,
    startX: 0,
    keys: [
      ['Tab', 'Tab', 1.5],
      ['KeyQ', 'Q'],
      ['KeyW', 'W'],
      ['KeyE', 'E'],
      ['KeyR', 'R'],
      ['KeyT', 'T'],
      ['KeyY', 'Y'],
      ['KeyU', 'U'],
      ['KeyI', 'I'],
      ['KeyO', 'O'],
      ['KeyP', 'P'],
      ['BracketLeft', '['],
      ['BracketRight', ']'],
    ],
  },
  {
    y: 2,
    startX: 0,
    keys: [
      ['CapsLock', 'Caps', 1.75],
      ['KeyA', 'A'],
      ['KeyS', 'S'],
      ['KeyD', 'D'],
      ['KeyF', 'F'],
      ['KeyG', 'G'],
      ['KeyH', 'H'],
      ['KeyJ', 'J'],
      ['KeyK', 'K'],
      ['KeyL', 'L'],
      ['Semicolon', ';'],
      ['Quote', "'"],
    ],
  },
  {
    y: 3,
    startX: 0,
    keys: [
      ['ShiftLeft', 'Shift', 2.25],
      ['KeyZ', 'Z'],
      ['KeyX', 'X'],
      ['KeyC', 'C'],
      ['KeyV', 'V'],
      ['KeyB', 'B'],
      ['KeyN', 'N'],
      ['KeyM', 'M'],
      ['Comma', ','],
      ['Period', '.'],
      ['Slash', '/'],
    ],
  },
  {
    y: 4,
    startX: 0,
    keys: [
      ['ControlLeft', 'Ctrl', 1.25],
      ['MetaLeft', 'Win', 1.25],
      ['AltLeft', 'Alt', 1.25],
      ['Space', 'Space', 6.25],
    ],
  },
]

const FUNCTION_ROW: RowSpec = {
  y: -1.4,
  startX: 0,
  keys: [
    ['Escape', 'Esc'],
    ['F1', 'F1'],
    ['F2', 'F2'],
    ['F3', 'F3'],
    ['F4', 'F4'],
    ['F5', 'F5'],
    ['F6', 'F6'],
    ['F7', 'F7'],
    ['F8', 'F8'],
  ],
}

const UNBINDABLE_KEY_IDS = new Set(['Escape', 'MetaLeft', 'ShiftLeft', 'ControlLeft', 'AltLeft'])

function expandRows(rows: RowSpec[]): PhysicalKey[] {
  const keys: PhysicalKey[] = []
  for (const row of rows) {
    let x = row.startX
    for (const [id, label, width] of row.keys) {
      const w = width ?? 1
      keys.push({ id, label, x, y: row.y, w, h: 1 })
      x += w
    }
  }
  return keys
}

export function buildKeyboardGeometry(
  formFactor: KeyboardFormFactor,
  layout: PhysicalLayout,
): PhysicalKey[] {
  const rows = formFactor === 'sixty' ? MAIN_BLOCK_ROWS : [FUNCTION_ROW, ...MAIN_BLOCK_ROWS]
  const keys = expandRows(rows)
  if (layout === 'iso') {
    return keys.map((key) =>
      key.id === 'ShiftLeft'
        ? { ...key, w: 1.25 }
        : key.id >= 'KeyZ' && key.y === 3
          ? key
          : key,
    )
  }
  return keys
}

export function isBindableKey(key: PhysicalKey): boolean {
  return !UNBINDABLE_KEY_IDS.has(key.id)
}
