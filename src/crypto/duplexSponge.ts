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
 *
 * Circom equivalent: PoseidonEx(3, 4) with initialState = state[0]
 *
 * Reference: @zk-kit/poseidon-cipher poseidonEncrypt/poseidonDecrypt
 */

// @ts-expect-error - circomlibjs doesn't have types
import { buildPoseidon } from 'circomlibjs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * SNARK scalar field prime (BN254)
 */
const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

/**
 * 2^128 — used for domain separation in initial state
 */
const TWO128 = 2n ** 128n

/**
 * Full Poseidon permutation on t-element state using circomlibjs.
 *
 * circomlibjs poseidon(inputs, initState, nOut):
 *   - Constructs state as [initState, ...inputs] (length t)
 *   - Runs Poseidon permutation
 *   - Returns state[0..nOut-1]
 *
 * To permute [s0, s1, s2, s3]: call poseidon([s1, s2, s3], s0, 4)
 * This matches PoseidonEx(3, 4) in circom with initialState = s0.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poseidonPerm(poseidon: any, state: bigint[]): bigint[] {
  const F = poseidon.F
  const t = state.length

  // poseidon(inputs=[s1..s_{t-1}], initState=s0, nOut=t)
  const inputs = state.slice(1).map((s) => F.e(s))
  const initState = F.e(state[0])
  const result = poseidon(inputs, initState, t)

  // result is array of F elements when nOut > 1
  return result.map((r: unknown) => F.toObject(r))
}

/**
 * Encrypt plaintext using Poseidon DuplexSponge.
 *
 * Compatible with @zk-kit/poseidon-cipher and MACI circuits.
 *
 * @param plaintext - Array of field elements to encrypt
 * @param sharedKey - ECDH shared key [keyX, keyY] (2 elements)
 * @param nonce - Unique nonce for this message
 * @returns Array of ciphertext field elements (padded to multiple of 3, + 1 auth tag)
 */
export async function poseidonEncrypt(
  plaintext: bigint[],
  sharedKey: bigint[],
  nonce: bigint,
): Promise<bigint[]> {
  await init()
  const poseidon = poseidonInstance

  const length = plaintext.length

  // Pad plaintext to multiple of 3 (rate = 3)
  const padded = [...plaintext]
  while (padded.length % 3 !== 0) {
    padded.push(0n)
  }

  // Initial state: [0, key[0], key[1], nonce + length * 2^128]
  let state: bigint[] = [
    0n,
    sharedKey[0],
    sharedKey[1],
    (nonce + BigInt(length) * TWO128) % SNARK_FIELD_SIZE,
  ]

  const ciphertext: bigint[] = []

  // Process each 3-element block
  for (let i = 0; i < padded.length; i += 3) {
    // Permute
    state = poseidonPerm(poseidon, state)

    // Absorb plaintext into rate portion (positions 1, 2, 3)
    state[1] = (state[1] + padded[i]) % SNARK_FIELD_SIZE
    state[2] = (state[2] + padded[i + 1]) % SNARK_FIELD_SIZE
    state[3] = (state[3] + padded[i + 2]) % SNARK_FIELD_SIZE

    // Squeeze ciphertext from rate portion
    ciphertext.push(state[1])
    ciphertext.push(state[2])
    ciphertext.push(state[3])
  }

  // Final permutation for authentication tag
  state = poseidonPerm(poseidon, state)
  ciphertext.push(state[1]) // auth tag

  return ciphertext
}

/**
 * Decrypt ciphertext using Poseidon DuplexSponge.
 *
 * @param ciphertext - Array of ciphertext field elements (includes auth tag at end)
 * @param sharedKey - ECDH shared key [keyX, keyY] (2 elements)
 * @param nonce - Same nonce used for encryption
 * @param length - Original plaintext length
 * @returns Array of plaintext field elements
 * @throws Error if authentication tag doesn't match
 */
export async function poseidonDecrypt(
  ciphertext: bigint[],
  sharedKey: bigint[],
  nonce: bigint,
  length: number,
): Promise<bigint[]> {
  await init()
  const poseidon = poseidonInstance

  // Last element is the authentication tag
  const tag = ciphertext[ciphertext.length - 1]
  const encrypted = ciphertext.slice(0, -1)

  // Initial state (same as encryption)
  let state: bigint[] = [
    0n,
    sharedKey[0],
    sharedKey[1],
    (nonce + BigInt(length) * TWO128) % SNARK_FIELD_SIZE,
  ]

  const plaintext: bigint[] = []

  // Process each 3-element block
  for (let i = 0; i < encrypted.length; i += 3) {
    // Permute
    state = poseidonPerm(poseidon, state)

    // Recover plaintext: pt = ct - state (mod p)
    const p0 =
      (encrypted[i] - state[1] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    const p1 =
      (encrypted[i + 1] - state[2] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    const p2 =
      (encrypted[i + 2] - state[3] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    plaintext.push(p0)
    plaintext.push(p1)
    plaintext.push(p2)

    // Set state rate portion to ciphertext values (for next permutation)
    state[1] = encrypted[i]
    state[2] = encrypted[i + 1]
    state[3] = encrypted[i + 2]
  }

  // Verify authentication tag
  state = poseidonPerm(poseidon, state)
  const expectedTag = state[1]

  if (expectedTag !== tag) {
    throw new Error('DuplexSponge decryption failed: invalid authentication tag')
  }

  // Trim padding
  return plaintext.slice(0, length)
}
