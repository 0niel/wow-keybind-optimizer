import type { GameMode } from '@/core/model/ability'
import type { AddonKeyboardRow, LuaBindEntry } from '@/lib/exports'

export interface AddonCartEntry {
  id: string
  name: string
  specId: number
  classId: number
  classTag: string
  mode: GameMode
  hash: string
  binds: LuaBindEntry[]
  keyboard: AddonKeyboardRow[]
  preserved: Record<string, string>
  interruptSlotId?: string
  savedAt: number
}

const STORAGE_KEY = 'kbo-addon-cart-v3'

export function cartEntryId(specId: number, mode: string, scheme: string): string {
  return `${specId}:${mode}:${scheme}`
}

export function loadCart(): AddonCartEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is AddonCartEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as AddonCartEntry).id === 'string' &&
        typeof (entry as AddonCartEntry).hash === 'string' &&
        typeof (entry as AddonCartEntry).specId === 'number' &&
        typeof (entry as AddonCartEntry).classId === 'number' &&
        Array.isArray((entry as AddonCartEntry).binds),
    )
  } catch {
    return []
  }
}

export function saveCart(entries: AddonCartEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* storage full or unavailable — cart stays in memory */
  }
}

export function upsertCartEntry(entries: AddonCartEntry[], entry: AddonCartEntry): AddonCartEntry[] {
  const next = entries.filter((candidate) => candidate.id !== entry.id)
  next.push(entry)
  next.sort((a, b) => a.savedAt - b.savedAt)
  return next
}

export function classPreservation(
  entries: AddonCartEntry[],
  classId: number,
): { preservedBinds: Record<string, string>; anchorInterruptSlotId?: string } {
  const sameClass = entries
    .filter((entry) => entry.classId === classId)
    .sort((a, b) => a.savedAt - b.savedAt)
  const preservedBinds: Record<string, string> = {}
  let anchorInterruptSlotId: string | undefined
  for (const entry of sameClass) {
    Object.assign(preservedBinds, entry.preserved)
    if (entry.interruptSlotId) anchorInterruptSlotId = entry.interruptSlotId
  }
  return { preservedBinds, anchorInterruptSlotId }
}

export function classTagFromSlug(slug: string): string {
  return slug.replace(/-/g, '').toUpperCase()
}
