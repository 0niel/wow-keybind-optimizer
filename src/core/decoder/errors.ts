export type DecodeErrorCode =
  | 'empty-input'
  | 'invalid-character'
  | 'truncated-stream'
  | 'unsupported-version'
  | 'stream-node-mismatch'
  | 'rank-overflow'
  | 'choice-index-overflow'

export class LoadoutDecodeError extends Error {
  readonly code: DecodeErrorCode

  constructor(code: DecodeErrorCode, message: string) {
    super(message)
    this.name = 'LoadoutDecodeError'
    this.code = code
  }
}
