/**
 * BLAKE512 Key Derivation
 *
 * MACI uses BLAKE2b-512 for deriving Baby Jubjub private keys from seeds,
 * following the RFC 8032 (EdDSA) key derivation pattern:
 *   1. Hash the seed with BLAKE2b-512
 *   2. Prune the lower 32 bytes (clear/set specific bits)
 *   3. Interpret as little-endian scalar
 *   4. Reduce modulo Baby Jubjub subgroup order
 *
 * Reference: MACI genPrivKey, RFC 8032 Section 5.1.5
 */

import { blake2b } from '@noble/hashes/blake2.js'

/**
 * Baby Jubjub subgroup order
 */
const BABYJUB_SUBORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n

/**
 * Derive a Baby Jubjub private key from a seed using BLAKE2b-512.
 *
 * Process:
 *   1. BLAKE2b-512(seed) → 64 bytes
 *   2. Take lower 32 bytes
 *   3. Prune per RFC 8032: clear lowest 3 bits, clear highest bit, set second-highest bit
 *   4. Interpret as little-endian 256-bit integer
 *   5. Reduce modulo Baby Jubjub subgroup order
 *
 * @param seed - Arbitrary seed bytes (e.g., signature, random bytes)
 * @returns Baby Jubjub private key as bigint
 */
export function derivePrivateKey(seed: Uint8Array): bigint {
  // Step 1: BLAKE2b-512 hash
  const hash = blake2b(seed, { dkLen: 64 })

  // Step 2: Take lower 32 bytes
  const keyBytes = hash.slice(0, 32)

  // Step 3: Prune per RFC 8032
  keyBytes[0] &= 0xf8 // Clear lowest 3 bits
  keyBytes[31] &= 0x7f // Clear highest bit
  keyBytes[31] |= 0x40 // Set second-highest bit

  // Step 4: Interpret as little-endian 256-bit integer
  let scalar = 0n
  for (let i = 31; i >= 0; i--) {
    scalar = (scalar << 8n) | BigInt(keyBytes[i])
  }

  // Step 5: Reduce modulo subgroup order
  return scalar % BABYJUB_SUBORDER
}

/**
 * Generate a random private key using BLAKE2b-512.
 * Uses crypto.getRandomValues as the entropy source.
 *
 * @returns Baby Jubjub private key as bigint
 */
export function generateRandomPrivateKey(): bigint {
  const seed = new Uint8Array(32)
  crypto.getRandomValues(seed)
  return derivePrivateKey(seed)
}

/**
 * Derive a private key from a wallet signature.
 * This allows deterministic key derivation from a user's Ethereum wallet.
 *
 * @param signature - Ethereum signature bytes (65 bytes typically)
 * @returns Baby Jubjub private key as bigint
 */
export function derivePrivateKeyFromSignature(signature: Uint8Array): bigint {
  return derivePrivateKey(signature)
}
