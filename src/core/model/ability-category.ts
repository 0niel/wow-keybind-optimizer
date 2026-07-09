export type AbilityCategory =
  | 'rotational-core'
  | 'rotational-proc'
  | 'cooldown-burst'
  | 'defensive-major'
  | 'defensive-minor'
  | 'external'
  | 'heal-utility'
  | 'interrupt'
  | 'cc-hard'
  | 'cc-soft'
  | 'dispel'
  | 'mobility'
  | 'utility'
  | 'trinket'
  | 'targeting'

export interface CuratedAbilityTraits {
  category: AbilityCategory
  reactivity?: number
  panic?: number
  targeting?: 'self' | 'enemy' | 'ally' | 'ground' | 'none'
}

export const ALL_CATEGORIES: AbilityCategory[] = [
  'rotational-core',
  'rotational-proc',
  'cooldown-burst',
  'defensive-major',
  'defensive-minor',
  'external',
  'heal-utility',
  'interrupt',
  'cc-hard',
  'cc-soft',
  'dispel',
  'mobility',
  'utility',
  'trinket',
  'targeting',
]
