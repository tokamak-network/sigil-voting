/**
 * MACI Crypto Module
 *
 * Unified exports for all MACI cryptographic primitives:
 * - ECDH: Baby Jubjub key exchange
 * - DuplexSponge: Poseidon sponge encryption/decryption
 * - EdDSA: Poseidon-based signatures
 * - BLAKE512: Key derivation (RFC 8032 style)
 */

export {
  generateECDHSharedKey,
  generateEphemeralKeyPair,
  derivePublicKey,
  BABYJUB_SUBORDER,
  type PubKey,
} from './ecdh'

export {
  poseidonEncrypt,
  poseidonDecrypt,
} from './duplexSponge'

export {
  eddsaSign,
  eddsaVerify,
  eddsaDerivePublicKey,
  type EdDSASignature,
} from './eddsa'

export {
  derivePrivateKey,
  generateRandomPrivateKey,
  derivePrivateKeyFromSignature,
} from './blake512'
