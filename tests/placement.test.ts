import { describe, expect, it } from 'vitest'
import { buildPlacementPlan, BAR_SIZE, MAX_PLANNED_BARS } from '@/lib/placement'
import type { PlannedBind } from '@/lib/placement'

function bind(
  keyId: string,
  modifier: PlannedBind['modifier'],
  traits: Partial<Omit<PlannedBind, 'keyId' | 'modifier' | 'placeable'>> = {},
  placeable = true,
): PlannedBind {
  return { keyId, modifier, placeable, ...traits }
}

describe('placement plan', () => {
  it('keeps every modifier of one physical key in one contiguous family', () => {
    const plan = buildPlacementPlan([
      bind('KeyN', 'shift', { category: 'mobility' }),
      bind('KeyQ', 'none', { category: 'rotational-core', importance: 1 }),
      bind('KeyN', 'none', { category: 'mobility' }),
      bind('KeyN', 'ctrl', { category: 'mobility' }),
    ])
    const family = [plan[2], plan[0], plan[3]] as number[]

    expect(new Set(family.map((slot) => Math.floor(slot / BAR_SIZE))).size).toBe(1)
    expect(family).toEqual([family[0], (family[0] ?? 0) + 1, (family[0] ?? 0) + 2])
  })

  it('orders a key family as base, Shift, Ctrl, Alt regardless of input order', () => {
    const plan = buildPlacementPlan([
      bind('KeyF', 'alt', { category: 'defensive-major' }),
      bind('KeyF', 'ctrl', { category: 'defensive-major' }),
      bind('KeyF', 'none', { category: 'defensive-major' }),
      bind('KeyF', 'shift', { category: 'defensive-major' }),
    ])

    expect(plan[2]).toBe(0)
    expect(plan[3]).toBe(1)
    expect(plan[1]).toBe(2)
    expect(plan[0]).toBe(3)
  })

  it('keeps semantic groups together while putting more important families first', () => {
    const plan = buildPlacementPlan([
      bind('KeyM', 'none', { category: 'mobility', importance: 0.3 }),
      bind('KeyQ', 'none', { category: 'rotational-core', importance: 0.7 }),
      bind('KeyN', 'none', { category: 'mobility', importance: 0.9 }),
      bind('KeyE', 'none', { category: 'rotational-core', importance: 1 }),
    ])

    expect(plan[3]).toBe(0)
    expect(plan[1]).toBe(1)
    expect(plan[2]).toBe(2)
    expect(plan[0]).toBe(3)
  })

  it('moves long-lived maintenance auras onto the real side bars', () => {
    const plan = buildPlacementPlan([
      bind('KeyQ', 'none', { category: 'rotational-core', importance: 1 }),
      bind('KeyN', 'none', { category: 'utility', auraDurationMs: 3_600_000, maintenance: true }),
      bind('KeyN', 'shift', { category: 'utility', auraDurationMs: 3_600_000, maintenance: true }),
    ])

    expect(plan[0]).toBe(0)
    expect(Math.floor((plan[1] ?? 0) / BAR_SIZE)).toBe(3)
    expect(plan[2]).toBe((plan[1] ?? 0) + 1)
  })

  it('moves a mixed maintenance family as one contiguous unit', () => {
    const plan = buildPlacementPlan([
      bind('Digit1', 'none', { category: 'defensive-major' }),
      bind('Digit1', 'shift', {
        category: 'utility',
        auraDurationMs: 3_600_000,
        maintenance: true,
      }),
      bind('Digit1', 'ctrl', { category: 'mobility' }),
    ])

    expect(plan).toEqual([36, 37, 38])
  })

  it('does not split a key family across a bar boundary', () => {
    const inputs: PlannedBind[] = Array.from({ length: 11 }, (_, index) =>
      bind(`Key${String.fromCharCode(65 + index)}`, 'none', {
        category: 'rotational-core',
        importance: 1,
      }),
    )
    inputs.push(
      bind('KeyN', 'none', { category: 'rotational-core' }),
      bind('KeyN', 'shift', { category: 'rotational-core' }),
    )
    const plan = buildPlacementPlan(inputs)

    expect(plan[11]).toBe(BAR_SIZE)
    expect(plan[12]).toBe(BAR_SIZE + 1)
  })

  it('skips non-placeable binds and never assigns them slots', () => {
    const plan = buildPlacementPlan([
      bind('Digit1', 'none'),
      bind('WheelUp', 'none', {}, false),
      bind('KeyQ', 'none'),
    ])
    expect(plan[1]).toBeNull()
    expect(plan[0]).not.toBeNull()
    expect(plan[2]).not.toBeNull()
  })

  it('never exceeds the planned bar budget and never collides', () => {
    const many: PlannedBind[] = []
    for (const modifier of ['none', 'shift', 'ctrl', 'alt'] as const) {
      for (let i = 0; i < 40; i++) {
        many.push(bind(`Key${String.fromCharCode(65 + (i % 26))}`, modifier))
      }
    }
    const plan = buildPlacementPlan(many)
    const used = new Set<number>()
    for (const slot of plan) {
      if (slot === null) continue
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThan(MAX_PLANNED_BARS * BAR_SIZE)
      expect(used.has(slot)).toBe(false)
      used.add(slot)
    }
  })
})
