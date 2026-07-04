import type { MouseButton, MouseModel } from '@/core/model/hardware'

export const MOUSE_BUTTONS: Record<MouseModel, MouseButton[]> = {
  none: [],
  'two-button': [
    { id: 'Mouse4', label: 'M4', reach: 1 },
    { id: 'Mouse5', label: 'M5', reach: 1 },
  ],
  'mmo-twelve': [
    { id: 'MouseG1', label: 'G1', reach: 0.95 },
    { id: 'MouseG2', label: 'G2', reach: 1 },
    { id: 'MouseG3', label: 'G3', reach: 0.85 },
    { id: 'MouseG4', label: 'G4', reach: 0.9 },
    { id: 'MouseG5', label: 'G5', reach: 0.95 },
    { id: 'MouseG6', label: 'G6', reach: 0.8 },
    { id: 'MouseG7', label: 'G7', reach: 0.7 },
    { id: 'MouseG8', label: 'G8', reach: 0.75 },
    { id: 'MouseG9', label: 'G9', reach: 0.6 },
    { id: 'MouseG10', label: 'G10', reach: 0.5 },
    { id: 'MouseG11', label: 'G11', reach: 0.55 },
    { id: 'MouseG12', label: 'G12', reach: 0.4 },
  ],
}

export const WHEEL_BUTTONS: MouseButton[] = [
  { id: 'WheelUp', label: 'WUp', reach: 0.85 },
  { id: 'WheelDown', label: 'WDn', reach: 0.85 },
]
