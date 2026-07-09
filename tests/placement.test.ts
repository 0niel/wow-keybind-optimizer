import { describe, expect, it } from 'vitest'
import { buildPlacementPlan, BAR_SIZE, MAX_PLANNED_BARS } from '@/lib/placement'
import type { PlannedBind } from '@/lib/placement'

function bind(keyId: string, modifier: PlannedBind['modifier'], placeable = true): PlannedBind {
  return { keyId, modifier, placeable }
}

describe('placement plan', () => {
  it('mirrors the number row onto the first bar with gaps preserved', () => {
    const plan = buildPlacementPlan([
      bind('Digit3', 'none'),
      bind('Digit1', 'none'),
      bind('Equal', 'none'),
    ])
    expect(plan).toEqual([2, 0, 11])
  })

  it('puts base-layer letters on their own bar in keyboard order when no shift binds exist', () => {
    const plan = buildPlacementPlan([
      bind('KeyF', 'none'),
      bind('Digit1', 'none'),
      bind('KeyQ', 'none'),
      bind('Mouse4', 'none'),
    ])
    expect(plan[1]).toBe(0)
    expect(plan[2]).toBe(BAR_SIZE)
    expect(plan[0]).toBe(BAR_SIZE + 1)
    expect(plan[3]).toBe(BAR_SIZE + 2)
  })

  it('stacks the shift layer right above the main bar with digit columns paired', () => {
    const plan = buildPlacementPlan([
      bind('Digit5', 'none'),
      bind('Digit5', 'shift'),
      bind('Digit1', 'none'),
      bind('Digit1', 'shift'),
    ])
    expect(plan[0]).toBe(4)
    expect(plan[1]).toBe(BAR_SIZE + 4)
    expect(plan[2]).toBe(0)
    expect(plan[3]).toBe(BAR_SIZE + 0)
  })

  it('orders bars: base digits, shift layer, base letters, then packed ctrl/alt', () => {
    const plan = buildPlacementPlan([
      bind('Digit1', 'none'),
      bind('KeyQ', 'none'),
      bind('Digit2', 'shift'),
      bind('KeyE', 'shift'),
      bind('KeyR', 'ctrl'),
    ])
    expect(plan[0]).toBe(0)
    expect(plan[2]).toBe(BAR_SIZE + 1)
    expect(plan[3]).toBe(BAR_SIZE + 0)
    expect(plan[1]).toBe(2 * BAR_SIZE)
    expect(plan[4]).toBe(3 * BAR_SIZE)
  })

  it('packs ctrl and alt layers together without empty bars', () => {
    const plan = buildPlacementPlan([
      bind('KeyQ', 'none'),
      bind('KeyE', 'ctrl'),
      bind('KeyR', 'ctrl'),
      bind('KeyF', 'alt'),
    ])
    expect(plan[0]).toBe(0)
    expect(plan[1]).toBe(BAR_SIZE)
    expect(plan[2]).toBe(BAR_SIZE + 1)
    expect(plan[3]).toBe(BAR_SIZE + 2)
  })

  it('fills shift-layer letters around aligned digits without collisions', () => {
    const plan = buildPlacementPlan([
      bind('Digit1', 'shift'),
      bind('Digit2', 'shift'),
      bind('KeyQ', 'shift'),
      bind('KeyE', 'shift'),
      bind('KeyR', 'shift'),
    ])
    const slots = plan.filter((slot): slot is number => slot !== null)
    expect(new Set(slots).size).toBe(slots.length)
    expect(plan).toEqual([0, 1, 2, 3, 4])
  })

  it('aligns shift letters with their base-letter column when it is free', () => {
    const plan = buildPlacementPlan([
      bind('Digit1', 'none'),
      bind('KeyQ', 'none'),
      bind('KeyE', 'none'),
      bind('KeyE', 'shift'),
      bind('Digit1', 'shift'),
    ])
    expect(plan[0]).toBe(0)
    expect(plan[1]).toBe(2 * BAR_SIZE)
    expect(plan[2]).toBe(2 * BAR_SIZE + 1)
    expect(plan[4]).toBe(BAR_SIZE + 0)
    expect(plan[3]).toBe(BAR_SIZE + 1)
  })

  it('falls back to the first free column when the aligned column is taken', () => {
    const plan = buildPlacementPlan([
      bind('KeyQ', 'none'),
      bind('KeyQ', 'shift'),
      bind('Digit1', 'shift'),
    ])
    expect(plan[0]).toBe(BAR_SIZE)
    expect(plan[2]).toBe(0)
    expect(plan[1]).toBe(1)
  })

  it('skips non-placeable binds and never assigns them slots', () => {
    const plan = buildPlacementPlan([
      bind('Digit1', 'none'),
      bind('WheelUp', 'none', false),
      bind('KeyQ', 'none'),
    ])
    expect(plan[1]).toBeNull()
    expect(plan[0]).toBe(0)
    expect(plan[2]).toBe(BAR_SIZE)
  })

  it('never exceeds the planned bar budget and never collides', () => {
    const many: PlannedBind[] = []
    for (const modifier of ['none', 'shift', 'ctrl', 'alt'] as const) {
      for (let i = 0; i < 40; i++) {
        many.push(bind(`Key${String.fromCharCode(65 + (i % 26))}`, modifier))
      }
    }
    const plan = buildPlacementPlan(many)
    for (const slot of plan) {
      if (slot === null) continue
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThan(MAX_PLANNED_BARS * BAR_SIZE)
    }
  })
})
