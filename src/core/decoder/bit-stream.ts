import { LoadoutDecodeError } from './errors'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export const BITS_PER_CHAR = 6

const CHAR_TO_VALUE = new Map<string, number>(
  Array.from(ALPHABET, (char, index) => [char, index]),
)

export class BitReader {
  private readonly values: number[]
  private cursor = 0

  constructor(encoded: string) {
    if (encoded.length === 0) {
      throw new LoadoutDecodeError('empty-input', 'Import string is empty')
    }
    this.values = Array.from(encoded, (char, index) => {
      const value = CHAR_TO_VALUE.get(char)
      if (value === undefined) {
        throw new LoadoutDecodeError(
          'invalid-character',
          `Invalid character "${char}" at position ${index}`,
        )
      }
      return value
    })
  }

  get totalBits(): number {
    return this.values.length * BITS_PER_CHAR
  }

  get consumedBits(): number {
    return this.cursor
  }

  get remainingBits(): number {
    return this.totalBits - this.cursor
  }

  readBits(count: number): number {
    if (count > 32) {
      throw new RangeError(`Cannot read ${count} bits into a number`)
    }
    if (this.remainingBits < count) {
      throw new LoadoutDecodeError(
        'truncated-stream',
        `Needed ${count} bits at offset ${this.cursor} but only ${this.remainingBits} remain`,
      )
    }
    let result = 0
    for (let i = 0; i < count; i++) {
      const charIndex = Math.floor(this.cursor / BITS_PER_CHAR)
      const bitIndex = this.cursor % BITS_PER_CHAR
      const bit = ((this.values[charIndex] ?? 0) >> bitIndex) & 1
      result |= bit << i
      this.cursor++
    }
    return result >>> 0
  }

  readFlag(): boolean {
    return this.readBits(1) === 1
  }

  assertOnlyZeroPaddingRemains(): void {
    if (this.remainingBits >= BITS_PER_CHAR) {
      throw new LoadoutDecodeError(
        'stream-node-mismatch',
        `${this.remainingBits} unread bits remain; the node list does not match the string's game build`,
      )
    }
    const cursorBefore = this.cursor
    const padding = this.remainingBits > 0 ? this.readBits(this.remainingBits) : 0
    if (padding !== 0) {
      throw new LoadoutDecodeError(
        'stream-node-mismatch',
        `Non-zero padding after offset ${cursorBefore}; the node list does not match the string's game build`,
      )
    }
  }
}

export class BitWriter {
  private readonly bits: number[] = []

  writeBits(value: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.bits.push((value >> i) & 1)
    }
  }

  writeFlag(flag: boolean): void {
    this.bits.push(flag ? 1 : 0)
  }

  toString(): string {
    let result = ''
    for (let offset = 0; offset < this.bits.length; offset += BITS_PER_CHAR) {
      let value = 0
      for (let i = 0; i < BITS_PER_CHAR; i++) {
        value |= (this.bits[offset + i] ?? 0) << i
      }
      result += ALPHABET[value]
    }
    return result
  }
}
