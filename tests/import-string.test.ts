import { describe, expect, it } from 'vitest'
import { buildAddonKeyboard, buildAddonProfile } from '@/lib/exports'
import type { ExportBind } from '@/lib/exports'
import { DEFAULT_HARDWARE_CONFIG } from '@/core/model/hardware'
import {
  IMPORT_PREFIX,
  adler32Hex,
  buildImportPayload,
  decodeImportString,
  encodeImportString,
} from '@/lib/import-string'

function fixtureBind(keyId: string, wowKey: string, spellId: number, name: string): ExportBind {
  return {
    ability: {
      id: `spell:${spellId}`,
      spellId,
      category: 'rotational-core',
      variantKind: 'base',
      baseAbilityId: null,
      frequency: 0.5,
      reactivity: 0,
      panic: 0,
      offGcd: false,
      targeting: 'enemy',
      sourceNodeIds: [],
      importance: 0,
      rotationRank: null,
    },
    slot: { id: keyId, keyId, modifier: 'none' },
    name,
    wowKey,
  } as unknown as ExportBind
}

function fixtureProfiles() {
  const keyboard = buildAddonKeyboard(DEFAULT_HARDWARE_CONFIG)
  const binds = [
    fixtureBind('KeyQ', 'Q', 51490, 'Гром и молния'),
    fixtureBind('KeyE', 'E', 8004, 'Исцеляющий всплеск'),
    fixtureBind('Digit1', '1', 188196, 'Молния'),
  ]
  return [
    buildAddonProfile('elemental-arena-v1', 'Стихии · Арена · вариант 1', 'arena', 262, 'SHAMAN', binds, keyboard),
    buildAddonProfile('elemental-arena-v2', 'Стихии · Арена · вариант 2', 'arena', 262, 'SHAMAN', binds.slice(0, 2), keyboard),
  ]
}

describe('import string', () => {
  it('computes a stable adler32', () => {
    expect(adler32Hex('')).toBe('00000001')
    expect(adler32Hex('Wikipedia')).toBe('11e60398')
  })

  it('round-trips profiles through encode/decode', async () => {
    const profiles = fixtureProfiles()
    const encoded = await encodeImportString(profiles)
    expect(encoded.startsWith(IMPORT_PREFIX)).toBe(true)
    expect(encoded.endsWith('!')).toBe(true)
    const payload = await decodeImportString(encoded)
    expect(payload).toEqual(buildImportPayload(profiles))
    expect(payload.profiles).toHaveLength(2)
    expect(payload.profiles[0]?.name).toBe('Стихии · Арена · вариант 1')
    expect(payload.profiles[0]?.binds[0]?.spell).toBe(51490)
    expect(payload.profiles[0]?.kb).toBe(payload.profiles[1]?.kb)
    expect(payload.keyboards).toHaveLength(1)
  })

  it('survives whitespace introduced by copy-paste', async () => {
    const encoded = await encodeImportString(fixtureProfiles())
    const mangled = encoded.replace(/(.{60})/g, '$1\n')
    const payload = await decodeImportString(mangled)
    expect(payload.profiles).toHaveLength(2)
  })

  it('rejects truncated strings', async () => {
    const encoded = await encodeImportString(fixtureProfiles())
    await expect(decodeImportString(encoded.slice(0, encoded.length - 12))).rejects.toThrow()
  })

  it('rejects corrupted payloads via checksum', async () => {
    const encoded = await encodeImportString(fixtureProfiles())
    const position = IMPORT_PREFIX.length + 10
    const original = encoded[position]
    const replacement = original === 'A' ? 'B' : 'A'
    const corrupted = `${encoded.slice(0, position)}${replacement}${encoded.slice(position + 1)}`
    await expect(decodeImportString(corrupted)).rejects.toThrow()
  })

  it('stays compact for realistic payloads', async () => {
    const encoded = await encodeImportString(fixtureProfiles())
    expect(encoded.length).toBeLessThan(4000)
  })
})
