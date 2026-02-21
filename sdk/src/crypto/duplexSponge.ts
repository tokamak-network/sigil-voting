/**
 * Poseidon DuplexSponge Encryption/Decryption
 *
 * Compatible with MACI / @zk-kit/poseidon-cipher and circomlib PoseidonEx.
 *
 * Sponge construction (t=4, rate=3, capacity=1):
 *   1. Initial state = [0, key[0], key[1], nonce + length * 2^128]
 *   2. For each 3-element block:
 *      - Permute state
 *      - Absorb: state[1] += pt[0], state[2] += pt[1], state[3] += pt[2]
 *      - Squeeze: ct[i..i+2] = state[1..3]
 *   3. Final permute, auth tag = state[1]
 */

// @ts-expect-error - circomlibjs doesn't have types
import { buildPoseidon } from 'circomlibjs'

let poseidonInstance: any = null
let initPromise: Promise<void> | null = null

async function init() {
  if (!initPromise) {
    initPromise = (async () => {
      poseidonInstance = await buildPoseidon()
    })()
  }
  return initPromise
}

const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

const TWO128 = 2n ** 128n

function poseidonPerm(poseidon: any, state: bigint[]): bigint[] {
  const F = poseidon.F
  const t = state.length

  const inputs = state.slice(1).map((s) => F.e(s))
  const initState = F.e(state[0])
  const result = poseidon(inputs, initState, t)

  return result.map((r: unknown) => F.toObject(r))
}

export async function poseidonEncrypt(
  plaintext: bigint[],
  sharedKey: bigint[],
  nonce: bigint,
): Promise<bigint[]> {
  await init()
  const poseidon = poseidonInstance

  const length = plaintext.length

  const padded = [...plaintext]
  while (padded.length % 3 !== 0) {
    padded.push(0n)
  }

  let state: bigint[] = [
    0n,
    sharedKey[0],
    sharedKey[1],
    (nonce + BigInt(length) * TWO128) % SNARK_FIELD_SIZE,
  ]

  const ciphertext: bigint[] = []

  for (let i = 0; i < padded.length; i += 3) {
    state = poseidonPerm(poseidon, state)

    state[1] = (state[1] + padded[i]) % SNARK_FIELD_SIZE
    state[2] = (state[2] + padded[i + 1]) % SNARK_FIELD_SIZE
    state[3] = (state[3] + padded[i + 2]) % SNARK_FIELD_SIZE

    ciphertext.push(state[1])
    ciphertext.push(state[2])
    ciphertext.push(state[3])
  }

  state = poseidonPerm(poseidon, state)
  ciphertext.push(state[1])

  return ciphertext
}

export async function poseidonDecrypt(
  ciphertext: bigint[],
  sharedKey: bigint[],
  nonce: bigint,
  length: number,
): Promise<bigint[]> {
  await init()
  const poseidon = poseidonInstance

  const tag = ciphertext[ciphertext.length - 1]
  const encrypted = ciphertext.slice(0, -1)

  let state: bigint[] = [
    0n,
    sharedKey[0],
    sharedKey[1],
    (nonce + BigInt(length) * TWO128) % SNARK_FIELD_SIZE,
  ]

  const plaintext: bigint[] = []

  for (let i = 0; i < encrypted.length; i += 3) {
    state = poseidonPerm(poseidon, state)

    const p0 =
      (encrypted[i] - state[1] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    const p1 =
      (encrypted[i + 1] - state[2] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    const p2 =
      (encrypted[i + 2] - state[3] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    plaintext.push(p0)
    plaintext.push(p1)
    plaintext.push(p2)

    state[1] = encrypted[i]
    state[2] = encrypted[i + 1]
    state[3] = encrypted[i + 2]
  }

  state = poseidonPerm(poseidon, state)
  const expectedTag = state[1]

  if (expectedTag !== tag) {
    throw new Error('DuplexSponge decryption failed: invalid authentication tag')
  }

  return plaintext.slice(0, length)
}
