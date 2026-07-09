import type { Modifier } from '@/core/model/hardware'
import type { AbilityCategory } from '@/core/model/ability-category'
import { isMaintenanceAura } from '@/core/model/usage'

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

export interface PlannedBind {
  keyId: string
  modifier: Modifier
  placeable: boolean
  category?: AbilityCategory
  importance?: number
  frequency?: number
  reactivity?: number
  panic?: number
  auraDurationMs?: number
  maintenance?: boolean
}

type Entry = readonly [PlannedBind, number]

export type VisualCluster =
  | 'rotation'
  | 'burst'
  | 'survival'
  | 'control'
  | 'mobility'
  | 'utility'
  | 'maintenance'

interface BindFamily {
  keyId: string
  entries: Entry[]
  cluster: VisualCluster
  score: number
}

const MODIFIER_RANK: Record<Modifier, number> = { none: 0, shift: 1, ctrl: 2, alt: 3 }
const CLUSTER_RANK: Record<VisualCluster, number> = {
  rotation: 0,
  burst: 1,
  control: 2,
  survival: 3,
  mobility: 4,
  utility: 5,
  maintenance: 6,
}

// Bottom bars stay dedicated to combat. The two default side bars are reserved for
// long-lived maintenance auras, while modern extra bars are deterministic overflow.
const PRIMARY_BAR_ORDER = [0, 1, 2, 5, 6, 7]
const SIDE_BAR_ORDER = [3, 4]
const ALL_BAR_ORDER = [...PRIMARY_BAR_ORDER, ...SIDE_BAR_ORDER]

function keyOrder(keyId: string): number {
  return KEY_POSITION_INDEX.get(keyId) ?? 999
}

export function visualClusterForCategory(category: AbilityCategory | undefined): VisualCluster {
  switch (category) {
    case 'rotational-core':
    case 'rotational-proc':
      return 'rotation'
    case 'cooldown-burst':
    case 'trinket':
      return 'burst'
    case 'defensive-major':
    case 'defensive-minor':
    case 'external':
    case 'heal-utility':
      return 'survival'
    case 'interrupt':
    case 'cc-hard':
    case 'cc-soft':
    case 'dispel':
    case 'targeting':
      return 'control'
    case 'mobility':
      return 'mobility'
    default:
      return 'utility'
  }
}

function bindScore(bind: PlannedBind): number {
  return (
    (bind.importance ?? 0) +
    (bind.frequency ?? 0) * 0.25 +
    (bind.reactivity ?? 0) * 0.15 +
    (bind.panic ?? 0) * 0.15
  )
}

function buildFamilies(entries: Entry[]): BindFamily[] {
  const byKey = new Map<string, Entry[]>()
  for (const entry of entries) {
    const family = byKey.get(entry[0].keyId) ?? []
    family.push(entry)
    byKey.set(entry[0].keyId, family)
  }

  const families: BindFamily[] = []
  for (const [keyId, familyEntries] of byKey) {
    familyEntries.sort(
      (a, b) =>
        (MODIFIER_RANK[a[0].modifier] ?? 9) - (MODIFIER_RANK[b[0].modifier] ?? 9),
    )
    const dominant = [...familyEntries].sort((a, b) => bindScore(b[0]) - bindScore(a[0]))[0]
    const hasMaintenance = familyEntries.some(
      ([bind]) => bind.maintenance === true && isMaintenanceAura(bind.auraDurationMs),
    )
    families.push({
      keyId,
      entries: familyEntries,
      cluster: hasMaintenance ? 'maintenance' : visualClusterForCategory(dominant?.[0].category),
      score: Math.max(0, ...familyEntries.map(([bind]) => bindScore(bind))),
    })
  }

  return families.sort(
    (a, b) =>
      CLUSTER_RANK[a.cluster] - CLUSTER_RANK[b.cluster] ||
      b.score - a.score ||
      keyOrder(a.keyId) - keyOrder(b.keyId),
  )
}

function placeFamilies(
  families: BindFamily[],
  bars: number[],
  result: (number | null)[],
  used: Set<number>,
): BindFamily[] {
  let barCursor = 0
  let offset = 0
  let lastCluster: VisualCluster | null = null
  const overflow: BindFamily[] = []

  for (const family of families) {
    let placed = false
    while (barCursor < bars.length) {
      const bar = bars[barCursor]
      if (bar === undefined) break
      const clusterBreak = lastCluster !== null && family.cluster !== lastCluster && offset >= 8
      if (clusterBreak || family.entries.length > BAR_SIZE - offset) {
        barCursor++
        offset = 0
        lastCluster = null
        continue
      }
      const slots = family.entries.map((_, index) => bar * BAR_SIZE + offset + index)
      if (slots.some((slot) => used.has(slot))) {
        offset++
        continue
      }
      family.entries.forEach(([, index], familyIndex) => {
        const slot = slots[familyIndex]
        if (slot === undefined) return
        result[index] = slot
        used.add(slot)
      })
      offset += family.entries.length
      lastCluster = family.cluster
      placed = true
      break
    }
    if (!placed) overflow.push(family)
  }
  return overflow
}

function placeOverflow(
  families: BindFamily[],
  result: (number | null)[],
  used: Set<number>,
): void {
  for (const family of families) {
    let placed = false
    for (const bar of ALL_BAR_ORDER) {
      for (let offset = 0; offset <= BAR_SIZE - family.entries.length; offset++) {
        const slots = family.entries.map((_, index) => bar * BAR_SIZE + offset + index)
        if (slots.some((slot) => used.has(slot))) continue
        family.entries.forEach(([, index], familyIndex) => {
          const slot = slots[familyIndex]
          if (slot === undefined) return
          result[index] = slot
          used.add(slot)
        })
        placed = true
        break
      }
      if (placed) break
    }
  }
}

export function buildPlacementPlan(binds: PlannedBind[]): (number | null)[] {
  const result: (number | null)[] = binds.map(() => null)
  const entries = binds
    .map((bind, index) => [bind, index] as const)
    .filter(([bind]) => bind.placeable)

  // A physical key is indivisible in the visual plan: Base/Shift/Ctrl/Alt stay
  // adjacent even when one layer is a long-lived preparation aura. Families
  // containing such an aura move as a unit to the side bars.
  const families = buildFamilies(entries)
  const maintenanceFamilies = families.filter((family) => family.cluster === 'maintenance')
  const combatFamilies = families.filter((family) => family.cluster !== 'maintenance')
  const used = new Set<number>()
  const combatOverflow = placeFamilies(
    combatFamilies,
    PRIMARY_BAR_ORDER,
    result,
    used,
  )
  const maintenanceOverflow = placeFamilies(
    maintenanceFamilies,
    SIDE_BAR_ORDER,
    result,
    used,
  )
  placeOverflow([...combatOverflow, ...maintenanceOverflow], result, used)

  return result
}
