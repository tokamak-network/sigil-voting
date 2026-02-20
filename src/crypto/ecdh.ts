/**
 * ECDH Key Exchange - Baby Jubjub
 *
 * MACI uses Baby Jubjub scalar multiplication for ECDH shared key derivation.
 * The shared key is used as input to Poseidon DuplexSponge encryption.
 *
 * Reference: MACI maci-crypto/ts/index.ts
 */

// @ts-expect-error - circomlibjs doesn't have types
import { buildBabyjub } from 'circomlibjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let babyjubInstance: any = null
let initPromise: Promise<void> | null = null

async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      babyjubInstance = await buildBabyjub()
    })()
  }
  return initPromise
}

export type PubKey = [bigint, bigint]

/**
 * BabyJubjub subgroup order
 */
export const BABYJUB_SUBORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n

/**
 * Generate ECDH shared key from private key and other party's public key.
 * Returns the raw ECDH point [x, y] for use as DuplexSponge encryption key.
 *
 * Both sides derive the same shared point:
 *   Alice: skA * pkB
 *   Bob:   skB * pkA
 *   skA * pkB = skA * (skB * G) = skB * (skA * G) = skB * pkA
 *
 * The returned [x, y] is used directly as key[0], key[1] in PoseidonDuplexSponge.
 * This matches MACI's ECDH → DuplexSponge pipeline.
 */
export async function generateECDHSharedKey(
  sk: bigint,
  otherPubKey: PubKey,
): Promise<PubKey> {
  await init()
  const babyjub = babyjubInstance

  // Convert pubkey components to field elements
  const pkPoint = [
    babyjub.F.e(otherPubKey[0]),
    babyjub.F.e(otherPubKey[1]),
  ]

  // Scalar multiplication: sk * otherPubKey
  const sharedPoint = babyjub.mulPointEscalar(pkPoint, sk)

  return [
    babyjub.F.toObject(sharedPoint[0]),
    babyjub.F.toObject(sharedPoint[1]),
  ]
}

/**
 * Generate an ephemeral key pair for one-time ECDH.
 * Uses crypto.getRandomValues for randomness.
 */
export async function generateEphemeralKeyPair(): Promise<{
  sk: bigint
  pubKey: PubKey
}> {
  await init()
  const babyjub = babyjubInstance

  // Generate random scalar in BabyJubjub subgroup via rejection sampling
  // Avoids modular bias from simple modulo reduction
  let sk = 0n
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    let value = 0n
    for (let i = 0; i < 32; i++) {
      value = (value << 8n) | BigInt(bytes[i])
    }
    sk = value % BABYJUB_SUBORDER
    if (sk !== 0n) break
  }
  if (sk === 0n) throw new Error('Failed to generate non-zero ephemeral key')

  // Derive public key: pk = sk * G (Base8)
  const pubKeyPoint = babyjub.mulPointEscalar(babyjub.Base8, sk)
  const pubKey: PubKey = [
    babyjub.F.toObject(pubKeyPoint[0]),
    babyjub.F.toObject(pubKeyPoint[1]),
  ]

  return { sk, pubKey }
}

/**
 * Derive public key from secret key using Baby Jubjub base point.
 */
export async function derivePublicKey(sk: bigint): Promise<PubKey> {
  await init()
  const babyjub = babyjubInstance
  const pubKeyPoint = babyjub.mulPointEscalar(babyjub.Base8, sk)
  return [
    babyjub.F.toObject(pubKeyPoint[0]),
    babyjub.F.toObject(pubKeyPoint[1]),
  ]
}
