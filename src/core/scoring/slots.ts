import type { HardwareConfig, KeyPriority, Modifier, PhysicalKey } from '@/core/model/hardware'
import { BOOSTED_KEY_TIER, LOWERED_TIER_FACTOR } from '@/core/model/hardware'
import type { Slot } from '@/core/model/ability'
import { buildKeyboardGeometry, isBindableKey } from '@/core/hardware/keyboards'
import { MOVEMENT_SCHEMES, ROTATION_KEY_ORDER } from '@/core/hardware/movement-schemes'
import { MOUSE_BUTTONS, WHEEL_BUTTONS } from '@/core/hardware/mice'

const TIER_WEIGHT = 0.65
const FITTS_WEIGHT = 0.35
const MOVEMENT_NEIGHBOR_PENALTY = 0.08

function applyPriority(base: number, priority: KeyPriority | undefined): number {
  if (priority === 'boost') return Math.max(base, BOOSTED_KEY_TIER)
  if (priority === 'lower') return base * LOWERED_TIER_FACTOR
  return base
}

export function enumerateSlots(config: HardwareConfig): Slot[] {
  const scheme = MOVEMENT_SCHEMES[config.movementScheme]
  const keys = buildKeyboardGeometry(config.formFactor, config.layout)
  const keyById = new Map(keys.map((key) => [key.id, key]))
  const anchors = scheme.anchorKeyIds
    .map((id) => keyById.get(id))
    .filter((key): key is PhysicalKey => key !== undefined)
  const banned = new Set(config.bannedKeyIds)
  const movement = new Set(scheme.movementKeyIds)
  const priorities = config.keyPriorities ?? {}

  const bindableKeys = keys.filter(
    (key) =>
      isBindableKey(key) &&
      !movement.has(key.id) &&
      !banned.has(key.id) &&
      (scheme.tierByKeyId[key.id] !== undefined || priorities[key.id] === 'boost'),
  )

  const rawFitts = new Map<string, number>()
  for (const key of bindableKeys) {
    const distance = Math.min(
      ...anchors.map((anchor) =>
        Math.hypot(centerX(key) - centerX(anchor), key.y + key.h / 2 - (anchor.y + anchor.h / 2)),
      ),
    )
    rawFitts.set(key.id, Math.log2(1 + distance / key.w))
  }
  const maxFitts = Math.max(0.001, ...rawFitts.values())

  const rotationOrder = ROTATION_KEY_ORDER[config.movementScheme]
  const sequenceOrdinalByKey = new Map<string, number>()
  const availableOrder = rotationOrder.filter((keyId) =>
    bindableKeys.some((key) => key.id === keyId),
  )
  availableOrder.forEach((keyId, index) => {
    sequenceOrdinalByKey.set(keyId, availableOrder.length > 1 ? index / (availableOrder.length - 1) : 0)
  })

  const slots: Slot[] = []
  for (const key of bindableKeys) {
    const tier = applyPriority(scheme.tierByKeyId[key.id] ?? 0, priorities[key.id])
    const fitts = (rawFitts.get(key.id) ?? maxFitts) / maxFitts
    const quality = TIER_WEIGHT * tier + FITTS_WEIGHT * (1 - fitts)
    const movementPenalty = isMovementNeighbor(key, anchors) ? MOVEMENT_NEIGHBOR_PENALTY : 0
    for (const modifier of config.enabledModifiers) {
      const accessibility = Math.max(
        0,
        quality * (config.modifierFactors[modifier] ?? 1) - movementPenalty,
      )
      slots.push({
        id: slotId(key.id, modifier),
        keyId: key.id,
        keyLabel: key.label,
        modifier,
        tier,
        fitts,
        accessibility,
        isMouse: false,
        sequenceOrdinal: modifier === 'none' ? (sequenceOrdinalByKey.get(key.id) ?? null) : null,
      })
    }
  }

  const mouseButtons = [
    ...MOUSE_BUTTONS[config.mouse],
    ...(config.includeMouseWheel ? WHEEL_BUTTONS : []),
  ]
  const mouseModifierPenalty: Record<string, number> = { none: 1, shift: 0.75, ctrl: 0.4, alt: 0.32 }
  for (const button of mouseButtons) {
    if (banned.has(button.id)) continue
    const reach = applyPriority(button.reach, priorities[button.id])
    for (const modifier of config.enabledModifiers) {
      const accessibility =
        reach * (config.modifierFactors[modifier] ?? 1) * (mouseModifierPenalty[modifier] ?? 1)
      slots.push({
        id: slotId(button.id, modifier),
        keyId: button.id,
        keyLabel: button.label,
        modifier,
        tier: reach,
        fitts: 0,
        accessibility,
        isMouse: true,
        sequenceOrdinal: null,
      })
    }
  }
  return slots
}

export function slotId(keyId: string, modifier: Modifier): string {
  return modifier === 'none' ? keyId : `${modifier}+${keyId}`
}

function centerX(key: PhysicalKey): number {
  return key.x + key.w / 2
}

function isMovementNeighbor(key: PhysicalKey, anchors: PhysicalKey[]): boolean {
  return anchors.some(
    (anchor) =>
      Math.hypot(centerX(key) - centerX(anchor), key.y + key.h / 2 - (anchor.y + anchor.h / 2)) <=
      1.05,
  )
}
