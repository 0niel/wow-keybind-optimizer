export interface ZipEntry {
  name: string
  content: string
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] ?? 0
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pushU16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff)
}

function pushU32(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

const UTF8_FLAG = 0x0800
const DOS_EPOCH_DATE = 0x0021

export function buildZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: number[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const data = encoder.encode(entry.content)
    const checksum = crc32(data)

    const local: number[] = []
    pushU32(local, 0x04034b50)
    pushU16(local, 20)
    pushU16(local, UTF8_FLAG)
    pushU16(local, 0)
    pushU16(local, 0)
    pushU16(local, DOS_EPOCH_DATE)
    pushU32(local, checksum)
    pushU32(local, data.length)
    pushU32(local, data.length)
    pushU16(local, nameBytes.length)
    pushU16(local, 0)
    const localHeader = new Uint8Array(local)
    parts.push(localHeader, nameBytes, data)

    pushU32(central, 0x02014b50)
    pushU16(central, 20)
    pushU16(central, 20)
    pushU16(central, UTF8_FLAG)
    pushU16(central, 0)
    pushU16(central, 0)
    pushU16(central, DOS_EPOCH_DATE)
    pushU32(central, checksum)
    pushU32(central, data.length)
    pushU32(central, data.length)
    pushU16(central, nameBytes.length)
    pushU16(central, 0)
    pushU16(central, 0)
    pushU16(central, 0)
    pushU16(central, 0)
    pushU32(central, 0)
    pushU32(central, offset)
    for (const byte of nameBytes) central.push(byte)

    offset += localHeader.length + nameBytes.length + data.length
  }

  const centralBytes = new Uint8Array(central)
  const eocd: number[] = []
  pushU32(eocd, 0x06054b50)
  pushU16(eocd, 0)
  pushU16(eocd, 0)
  pushU16(eocd, entries.length)
  pushU16(eocd, entries.length)
  pushU32(eocd, centralBytes.length)
  pushU32(eocd, offset)
  pushU16(eocd, 0)

  parts.push(centralBytes, new Uint8Array(eocd))

  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(totalLength)
  let position = 0
  for (const part of parts) {
    output.set(part, position)
    position += part.length
  }
  return new Blob([output], { type: 'application/zip' })
}
