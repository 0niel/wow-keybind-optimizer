import type { Slot } from '@/core/model/ability'
import type { HardwareConfig } from '@/core/model/hardware'
import { buildKeyboardGeometry } from '@/core/hardware/keyboards'

const SAME_KEY_OTHER_MODIFIER = 1.0
const ADJACENT_SAME_MODIFIER = 0.6
const ADJACENT_OTHER_MODIFIER = 0.3
const ADJACENCY_DISTANCE = 1.15

export interface SlotGeometry {
  positions: Map<string, { x: number; y: number }>
}

export function buildSlotGeometry(config: HardwareConfig): SlotGeometry {
  const positions = new Map<string, { x: number; y: number }>()
  for (const key of buildKeyboardGeometry(config.formFactor, config.layout)) {
    positions.set(key.id, { x: key.x + key.w / 2, y: key.y + key.h / 2 })
  }
  const mouseIds = [
    'Mouse4',
    'Mouse5',
    'WheelUp',
    'WheelDown',
    ...Array.from({ length: 12 }, (_, i) => `MouseG${i + 1}`),
  ]
  mouseIds.forEach((id, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    positions.set(id, { x: 20 + column, y: row })
  })
  return { positions }
}

export function buildProximityMatrix(slots: Slot[], geometry: SlotGeometry): Float32Array {
  const n = slots.length
  const matrix = new Float32Array(n * n)
  for (let i = 0; i < n; i++) {
    const a = slots[i]
    if (!a) continue
    const posA = geometry.positions.get(a.keyId)
    for (let j = i + 1; j < n; j++) {
      const b = slots[j]
      if (!b) continue
      let value = 0
      if (a.keyId === b.keyId) {
        value = a.modifier === b.modifier ? 0 : SAME_KEY_OTHER_MODIFIER
      } else {
        const posB = geometry.positions.get(b.keyId)
        if (posA && posB) {
          const distance = Math.hypot(posA.x - posB.x, posA.y - posB.y)
          if (distance <= ADJACENCY_DISTANCE) {
            value = a.modifier === b.modifier ? ADJACENT_SAME_MODIFIER : ADJACENT_OTHER_MODIFIER
          }
        }
      }
      matrix[i * n + j] = value
      matrix[j * n + i] = value
    }
  }
  return matrix
}

export function slotsFormArenaRow(
  slotIndices: number[],
  slots: Slot[],
  geometry: SlotGeometry,
): number {
  const resolved = slotIndices.map((index) => slots[index])
  if (resolved.some((slot) => slot === undefined)) return 0
  const typed = resolved as Slot[]
  const modifiers = new Set(typed.map((slot) => slot.modifier))
  const positions = typed.map((slot) => geometry.positions.get(slot.keyId))
  if (positions.some((p) => p === undefined)) return 0
  const typedPositions = positions as Array<{ x: number; y: number }>
  const sameRow = typedPositions.every((p) => Math.abs(p.y - (typedPositions[0]?.y ?? 0)) < 0.01)
  const sameColumn = typedPositions.every((p) => Math.abs(p.x - (typedPositions[0]?.x ?? 0)) < 0.01)
  if (!sameRow && !sameColumn) return 0
  const coords = sameRow ? typedPositions.map((p) => p.x) : typedPositions.map((p) => p.y)
  const ordered = coords.every((value, index) => index === 0 || value > (coords[index - 1] ?? 0))
  const gaps = coords.slice(1).map((value, index) => Math.abs(value - (coords[index] ?? 0)))
  const consecutive = gaps.every((gap) => gap <= ADJACENCY_DISTANCE)
  if (ordered && consecutive && modifiers.size === 1) return 1
  if (consecutive || modifiers.size === 1) return 0.5
  return 0
}
