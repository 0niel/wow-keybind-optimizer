import { describe, expect, it } from 'vitest'
import { buildPlacementPlan, BAR_SIZE, MAX_PLANNED_BARS } from '@/lib/placement'
import type { PlannedBind } from '@/lib/placement'

function bind(keyId: string, modifier: PlannedBind['modifier'], placeable = true): PlannedBind {
  return { keyId, modifier, placeable }
}

describe('placement plan', () => {
  it('compacts the number row onto the first slots with no gaps', () => {
    const plan = buildPlacementPlan([
      bind('Digit3', 'none'),
      bind('Digit1', 'none'),
      bind('Equal', 'none'),
    ])
    expect(plan).toEqual([1, 0, 2])
  })

  it('fills the main bar first with base digits then base letters', () => {
    const plan = buildPlacementPlan([
      bind('KeyF', 'none'),
      bind('Digit2', 'none'),
      bind('Digit1', 'none'),
      bind('KeyQ', 'none'),
    ])
    expect(plan[2]).toBe(0)
    expect(plan[1]).toBe(1)
    expect(plan[3]).toBe(2)
    expect(plan[0]).toBe(3)
  })

  it('packs the layers in order base, shift, ctrl, alt with no interior gaps', () => {
    const plan = buildPlacementPlan([
      bind('KeyR', 'alt'),
      bind('KeyE', 'shift'),
      bind('Digit1', 'none'),
      bind('KeyQ', 'ctrl'),
    ])
    expect(plan[2]).toBe(0)
    expect(plan[1]).toBe(1)
    expect(plan[3]).toBe(2)
    expect(plan[0]).toBe(3)
  })

  it('overflows onto the next bar only after the current one is full', () => {
    const binds: PlannedBind[] = []
    for (let i = 0; i < BAR_SIZE + 2; i++) binds.push(bind(`Key${String.fromCharCode(65 + i)}`, 'none'))
    const plan = buildPlacementPlan(binds)
    const slots = plan.filter((slot): slot is number => slot !== null).sort((a, b) => a - b)
    expect(slots).toEqual(Array.from({ length: BAR_SIZE + 2 }, (_, i) => i))
    expect(slots.filter((slot) => slot >= BAR_SIZE)).toEqual([BAR_SIZE, BAR_SIZE + 1])
  })

  it('keeps base digits ahead of every other layer', () => {
    const plan = buildPlacementPlan([
      bind('KeyQ', 'shift'),
      bind('Digit4', 'none'),
      bind('Digit1', 'none'),
    ])
    expect(plan[2]).toBe(0)
    expect(plan[1]).toBe(1)
    expect(plan[0]).toBe(2)
  })

  it('skips non-placeable binds and never assigns them slots', () => {
    const plan = buildPlacementPlan([
      bind('Digit1', 'none'),
      bind('WheelUp', 'none', false),
      bind('KeyQ', 'none'),
    ])
    expect(plan[1]).toBeNull()
    expect(plan[0]).toBe(0)
    expect(plan[2]).toBe(1)
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

  it('leaves no interior gap: assigned slots are a contiguous prefix', () => {
    const binds: PlannedBind[] = [
      bind('Digit1', 'none'),
      bind('Digit2', 'none'),
      bind('KeyQ', 'none'),
      bind('KeyE', 'shift'),
      bind('KeyR', 'ctrl'),
      bind('KeyF', 'alt'),
    ]
    const plan = buildPlacementPlan(binds)
    const slots = plan.filter((slot): slot is number => slot !== null).sort((a, b) => a - b)
    expect(slots).toEqual([0, 1, 2, 3, 4, 5])
  })
})
