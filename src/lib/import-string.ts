import type { AddonKeyboardRow, AddonProfile, LuaBindEntry } from '@/lib/exports'

export const IMPORT_PREFIX = '!KBO1!'
export const IMPORT_PAYLOAD_VERSION = 1

export interface ImportPayloadProfile {
  id: string
  name: string
  mode: string
  spec: number
  class: string
  hash: string
  kb: number
  binds: LuaBindEntry[]
}

export interface ImportPayload {
  v: number
  profiles: ImportPayloadProfile[]
  keyboards: AddonKeyboardRow[][]
}

export function adler32Hex(text: string): string {
  let low = 1
  let high = 0
  for (let i = 0; i < text.length; i++) {
    low = (low + text.charCodeAt(i)) % 65521
    high = (high + low) % 65521
  }
  return (high * 65536 + low).toString(16).padStart(8, '0')
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  const buffer = await new Response(source).arrayBuffer()
  return new Uint8Array(buffer)
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x2000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function bytesFromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function buildImportPayload(profiles: AddonProfile[]): ImportPayload {
  const keyboards: AddonKeyboardRow[][] = []
  const indexBySignature = new Map<string, number>()
  const payloadProfiles = profiles.map((profile) => {
    const signature = JSON.stringify(profile.keyboard)
    let kb = indexBySignature.get(signature)
    if (kb === undefined) {
      keyboards.push(profile.keyboard)
      kb = keyboards.length
      indexBySignature.set(signature, kb)
    }
    return {
      id: profile.id,
      name: profile.name,
      mode: profile.mode,
      spec: profile.specId,
      class: profile.classTag,
      hash: profile.hash,
      kb,
      binds: profile.binds,
    }
  })
  return { v: IMPORT_PAYLOAD_VERSION, profiles: payloadProfiles, keyboards }
}

export async function encodeImportString(profiles: AddonProfile[]): Promise<string> {
  const json = JSON.stringify(buildImportPayload(profiles))
  const compressed = await pipeThrough(new TextEncoder().encode(json), new CompressionStream('deflate'))
  const encoded = base64FromBytes(compressed)
  return `${IMPORT_PREFIX}${encoded}!${adler32Hex(encoded)}!`
}

export async function decodeImportString(text: string): Promise<ImportPayload> {
  const compact = text.replace(/\s+/g, '')
  const match = /^!KBO1!([A-Za-z0-9+/=]+)!([0-9a-f]{8})!$/.exec(compact)
  if (!match) throw new Error('bad format')
  const [, encoded, checksum] = match
  if (!encoded || !checksum) throw new Error('bad format')
  if (adler32Hex(encoded) !== checksum) throw new Error('checksum mismatch')
  const inflated = await pipeThrough(bytesFromBase64(encoded), new DecompressionStream('deflate'))
  const payload = JSON.parse(new TextDecoder().decode(inflated)) as ImportPayload
  if (payload.v !== IMPORT_PAYLOAD_VERSION || !Array.isArray(payload.profiles)) {
    throw new Error('unsupported payload')
  }
  return payload
}
