import { describe, expect, it } from 'vitest'
import { formatSpellDescription } from '@/lib/format'

describe('spell description formatter', () => {
  it('strips nested spell-power scaling from Russian tooltips', () => {
    const raw =
      'Вызывает в области радиусом 8 м землетрясение, наносящее [6 * ([63.25% of Spell Power])] ед. урона от сил природы за 6 сек.'
    const formatted = formatSpellDescription(raw)
    expect(formatted).not.toContain('Spell Power')
    expect(formatted).not.toContain('[')
    expect(formatted).not.toContain('63.25')
    expect(formatted).toContain('урон от сил природы')
    expect(formatted).toContain('радиусом 8 м')
  })

  it('strips attack-power and percent-damage scaling and keeps health wording', () => {
    const raw =
      'Противники получают [Сила атаки * 2.52 * [Percent Damage] * (1 + Универсальность)] ед. урона, а союзники восполняют [Сила атаки * 3.78 * [Percent Damage] * (1 + Универсальность)] ед. здоровья.'
    const formatted = formatSpellDescription(raw)
    expect(formatted).not.toContain('Percent Damage')
    expect(formatted).not.toContain('Универсальность')
    expect(formatted).not.toContain('[')
    expect(formatted).toContain('получают урон')
    expect(formatted).toContain('восполняют здоровье')
  })

  it('removes wrapped percent-of-spell-power parentheses', () => {
    const raw = 'Наносит ([790.005% of Spell Power]) ед. урона от сил природы.'
    const formatted = formatSpellDescription(raw)
    expect(formatted).toBe('Наносит урон от сил природы.')
  })

  it('deduplicates repeated spec paragraphs', () => {
    const raw = 'Поражает цель молнией.\n\nПоражает цель молнией.'
    const formatted = formatSpellDescription(raw)
    expect(formatted).toBe('Поражает цель молнией.')
  })

  it('leaves clean text untouched', () => {
    const raw = 'Прерывает текущее заклинание цели.'
    expect(formatSpellDescription(raw)).toBe('Прерывает текущее заклинание цели.')
  })

  it('handles empty input', () => {
    expect(formatSpellDescription('')).toBe('')
  })
})
