export { BitReader, BitWriter, BITS_PER_CHAR } from './bit-stream'
export { LoadoutDecodeError } from './errors'
export type { DecodeErrorCode } from './errors'
export {
  SUPPORTED_SERIALIZATION_VERSION,
  decodeLoadout,
  decodeLoadoutHeader,
  encodeLoadout,
} from './loadout'
export type {
  DecodedLoadout,
  LoadoutHeader,
  NodeSelection,
  OrderedTraitNode,
  TraitNodeKind,
} from './types'
