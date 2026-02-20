/**
 * BLAKE512 Key Derivation
 *
 * MACI uses BLAKE2b-512 for deriving Baby Jubjub private keys from seeds,
 * following the RFC 8032 (EdDSA) key derivation pattern.
 */

import { blake2b } from '@noble/hashes/blake2.js'

const BABYJUB_SUBORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n

/**
 * Derive a Baby Jubjub private key from a seed using BLAKE2b-512.
 */
export function derivePrivateKey(seed: Uint8Array): bigint {
  const hash = blake2b(seed, { dkLen: 64 })

  const keyBytes = hash.slice(0, 32)

  keyBytes[0] &= 0xf8
  keyBytes[31] &= 0x7f
  keyBytes[31] |= 0x40

  let scalar = 0n
  for (let i = 31; i >= 0; i--) {
    scalar = (scalar << 8n) | BigInt(keyBytes[i])
  }

  return scalar % BABYJUB_SUBORDER
}

/**
 * Generate a random private key using BLAKE2b-512.
 */
export function generateRandomPrivateKey(): bigint {
  const seed = new Uint8Array(32)
  crypto.getRandomValues(seed)
  return derivePrivateKey(seed)
}

/**
 * Derive a private key from a wallet signature.
 */
export function derivePrivateKeyFromSignature(signature: Uint8Array): bigint {
  return derivePrivateKey(signature)
}
