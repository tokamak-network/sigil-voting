/**
 * EdDSA-Poseidon Signatures
 *
 * MACI uses EdDSA with Poseidon hash on Baby Jubjub curve.
 * This wraps circomlibjs's buildEddsa().signPoseidon/verifyPoseidon.
 *
 * Signature format: { R8: [Fx, Fy], S: scalar }
 *
 * Reference: MACI maci-crypto EdDSA operations
 */

// @ts-expect-error - circomlibjs doesn't have types
import { buildEddsa, buildBabyjub } from 'circomlibjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let eddsaInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let babyjubInstance: any = null
let initPromise: Promise<void> | null = null

async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      const [eddsa, babyjub] = await Promise.all([
        buildEddsa(),
        buildBabyjub(),
      ])
      eddsaInstance = eddsa
      babyjubInstance = babyjub
    })()
  }
  return initPromise
}

export interface EdDSASignature {
  R8: [bigint, bigint]
  S: bigint
}

/**
 * Convert a bigint private key to a 32-byte Uint8Array for circomlibjs.
 * circomlibjs eddsa accepts Uint8Array as the private key.
 */
function skToBytes(sk: bigint): Uint8Array {
  const hex = sk.toString(16).padStart(64, '0')
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Sign a message (single field element) using EdDSA-Poseidon.
 *
 * @param message - Field element to sign (typically a Poseidon hash of the command)
 * @param sk - Baby Jubjub private key
 * @returns EdDSA signature {R8, S}
 */
export async function eddsaSign(
  message: bigint,
  sk: bigint,
): Promise<EdDSASignature> {
  await init()
  const eddsa = eddsaInstance
  const babyjub = babyjubInstance

  const skBuf = skToBytes(sk)
  const msgF = babyjub.F.e(message)

  const signature = eddsa.signPoseidon(skBuf, msgF)

  return {
    R8: [
      babyjub.F.toObject(signature.R8[0]),
      babyjub.F.toObject(signature.R8[1]),
    ],
    S: signature.S,
  }
}

/**
 * Verify an EdDSA-Poseidon signature.
 *
 * @param message - The signed message (field element)
 * @param signature - The signature to verify
 * @param pubKey - Signer's public key [pkX, pkY]
 * @returns true if signature is valid
 */
export async function eddsaVerify(
  message: bigint,
  signature: EdDSASignature,
  pubKey: [bigint, bigint],
): Promise<boolean> {
  await init()
  const eddsa = eddsaInstance
  const babyjub = babyjubInstance

  const msgF = babyjub.F.e(message)

  // Convert pubKey to field elements
  const pkPoint = [babyjub.F.e(pubKey[0]), babyjub.F.e(pubKey[1])]

  // Convert signature back to circomlibjs format
  const sig = {
    R8: [babyjub.F.e(signature.R8[0]), babyjub.F.e(signature.R8[1])],
    S: signature.S,
  }

  return eddsa.verifyPoseidon(msgF, sig, pkPoint)
}

/**
 * Derive the public key that circomlibjs EdDSA uses internally.
 * This is needed because circomlibjs derives the public key from
 * the private key buffer via its own internal hashing.
 *
 * @param sk - Private key as bigint
 * @returns Public key [pkX, pkY] as derived by circomlibjs eddsa
 */
export async function eddsaDerivePublicKey(
  sk: bigint,
): Promise<[bigint, bigint]> {
  await init()
  const eddsa = eddsaInstance
  const babyjub = babyjubInstance

  const skBuf = skToBytes(sk)
  const pubKey = eddsa.prv2pub(skBuf)

  return [
    babyjub.F.toObject(pubKey[0]),
    babyjub.F.toObject(pubKey[1]),
  ]
}
