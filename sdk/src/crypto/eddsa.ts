/**
 * EdDSA-Poseidon Signatures
 *
 * MACI uses EdDSA with Poseidon hash on Baby Jubjub curve.
 * Signature format: { R8: [Fx, Fy], S: scalar }
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

function skToBytes(sk: bigint): Uint8Array {
  const hex = sk.toString(16).padStart(64, '0')
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

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

export async function eddsaVerify(
  message: bigint,
  signature: EdDSASignature,
  pubKey: [bigint, bigint],
): Promise<boolean> {
  await init()
  const eddsa = eddsaInstance
  const babyjub = babyjubInstance

  const msgF = babyjub.F.e(message)

  const pkPoint = [babyjub.F.e(pubKey[0]), babyjub.F.e(pubKey[1])]

  const sig = {
    R8: [babyjub.F.e(signature.R8[0]), babyjub.F.e(signature.R8[1])],
    S: signature.S,
  }

  return eddsa.verifyPoseidon(msgF, sig, pkPoint)
}

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
