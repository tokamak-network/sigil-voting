/**
 * ECDH Key Exchange - Baby Jubjub
 *
 * MACI uses Baby Jubjub scalar multiplication for ECDH shared key derivation.
 * The shared key is used as input to Poseidon DuplexSponge encryption.
 *
 * Reference: MACI maci-crypto/ts/index.ts
 */

// @ts-expect-error - circomlibjs doesn't have types
import { buildBabyjub, buildPoseidon } from 'circomlibjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let babyjubInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poseidonInstance: any = null
let initPromise: Promise<void> | null = null

async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      const [babyjub, poseidon] = await Promise.all([
        buildBabyjub(),
        buildPoseidon(),
      ])
      babyjubInstance = babyjub
      poseidonInstance = poseidon
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
 * sharedKey = Poseidon(sk * otherPubKey)
 *
 * Both sides derive the same shared key:
 *   Alice: Poseidon(skA * pkB)
 *   Bob:   Poseidon(skB * pkA)
 *   skA * pkB = skA * (skB * G) = skB * (skA * G) = skB * pkA
 */
export async function generateECDHSharedKey(
  sk: bigint,
  otherPubKey: PubKey,
): Promise<bigint> {
  await init()
  const babyjub = babyjubInstance
  const poseidon = poseidonInstance

  // Convert pubkey components to field elements
  const pkPoint = [
    babyjub.F.e(otherPubKey[0]),
    babyjub.F.e(otherPubKey[1]),
  ]

  // Scalar multiplication: sk * otherPubKey
  const sharedPoint = babyjub.mulPointEscalar(pkPoint, sk)
  const sharedX = babyjub.F.toObject(sharedPoint[0])

  // Hash the x-coordinate to get the shared key (MACI pattern)
  const hash = poseidon([poseidon.F.e(sharedX)])
  return poseidon.F.toObject(hash)
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

  // Generate random scalar in BabyJubjub subgroup
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let value = 0n
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[i])
  }
  const sk = value % BABYJUB_SUBORDER

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
