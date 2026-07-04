import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en.json'
import ru from '@/i18n/messages/ru.json'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('i18n completeness', () => {
  it('has identical key sets in en and ru', () => {
    const enKeys = flattenKeys(en).sort()
    const ruKeys = flattenKeys(ru).sort()
    expect(ruKeys).toEqual(enKeys)
  })

  it('has no empty messages', () => {
    for (const messages of [en, ru]) {
      const check = (value: unknown, path: string) => {
        if (typeof value === 'string') {
          expect(value.length, path).toBeGreaterThan(0)
          return
        }
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          check(child, `${path}.${key}`)
        }
      }
      check(messages, '')
    }
  })
})
