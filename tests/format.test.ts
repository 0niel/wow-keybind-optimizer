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

  it('replaces Blizzard tooltip value variables with a placeholder', () => {
    const raw =
      'Сокращает время восстановления "Страж природы" на ${$s1/1000} сек. и увеличивает объём здоровья ещё на $s2% максимума.'
    const formatted = formatSpellDescription(raw)
    expect(formatted).not.toContain('$')
    expect(formatted).not.toContain('{')
    expect(formatted).toContain('на X сек.')
    expect(formatted).toContain('ещё на X% максимума')
  })

  it('strips cross-spell references and dangling conditionals', () => {
    const raw = 'Когда вы призываете предка, время восстановления $?a137040'
    const formatted = formatSpellDescription(raw)
    expect(formatted).not.toContain('$')
    expect(formatted).toBe('Когда вы призываете предка, время восстановления')
  })

  it('keeps the first branch of a tooltip conditional', () => {
    const raw = 'Наносит $?a12345[двойной][обычный] урон.'
    expect(formatSpellDescription(raw)).toBe('Наносит двойной урон.')
  })

  it('removes self-referencing $@ tokens and resolves plurals', () => {
    const raw = 'Дает $s1 $lзаряд:заряда:зарядов; эффекта $@spellname на цель.'
    const formatted = formatSpellDescription(raw)
    expect(formatted).not.toContain('$')
    expect(formatted).not.toContain('@')
    expect(formatted).toContain('заряд')
    expect(formatted).not.toContain('spellname')
  })

  it('leaves clean text untouched', () => {
    const raw = 'Прерывает текущее заклинание цели.'
    expect(formatSpellDescription(raw)).toBe('Прерывает текущее заклинание цели.')
  })

  it('handles empty input', () => {
    expect(formatSpellDescription('')).toBe('')
  })
})
