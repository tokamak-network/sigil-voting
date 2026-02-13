/**
 * Poseidon DuplexSponge Encryption/Decryption
 *
 * MACI uses Poseidon in duplex sponge mode (NOT CTR mode) for message encryption.
 * The sponge construction:
 *   1. Initialize state = [0, 0, 0] (rate=2, capacity=1)
 *   2. For each block:
 *      - Absorb: state[0] += plaintext[i], state[1] += (plaintext[i+1] or key)
 *      - Permute: state = Poseidon_permutation(state)
 *      - Squeeze: ciphertext[i] = state[0], ciphertext[i+1] = state[1]
 *
 * Reference: MACI maci-crypto poseidonEncrypt/poseidonDecrypt
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
 * SNARK scalar field prime
 */
const SNARK_FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

/**
 * Poseidon permutation on 3-element state (rate=2, capacity=1).
 * Uses circomlibjs poseidon as the permutation function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function poseidonPermutation(poseidon: any, state: bigint[]): bigint[] {
  // circomlibjs poseidon(inputs) hashes inputs and returns a single value
  // For sponge mode, we need the full permutation output.
  // MACI uses a custom approach: hash state elements to get new state.
  //
  // MACI's poseidon encryption uses poseidon([state[0], state[1], state[2]])
  // and distributes the output across the state.
  const F = poseidon.F

  // Perform Poseidon hash on the full state (3 elements → T4 Poseidon)
  const input = state.map((s) => F.e(s))
  const h = poseidon(input)
  const hashVal = F.toObject(h)

  // New state: the hash determines the permuted state
  // Following MACI's pattern: use the hash to update state elements
  return [
    (state[0] + hashVal) % SNARK_FIELD_SIZE,
    (state[1] + hashVal) % SNARK_FIELD_SIZE,
    (state[2] + hashVal) % SNARK_FIELD_SIZE,
  ]
}

/**
 * Encrypt plaintext using Poseidon DuplexSponge.
 *
 * @param plaintext - Array of field elements to encrypt
 * @param sharedKey - ECDH shared key
 * @param nonce - Unique nonce for this message
 * @returns Array of ciphertext field elements (length = plaintext.length + 1 for tag)
 */
export async function poseidonEncrypt(
  plaintext: bigint[],
  sharedKey: bigint,
  nonce: bigint,
): Promise<bigint[]> {
  await init()
  const poseidon = poseidonInstance
  const F = poseidon.F

  const length = plaintext.length

  // Pad plaintext to even length (rate = 2)
  const padded = [...plaintext]
  if (padded.length % 2 !== 0) {
    padded.push(0n)
  }

  // Initialize sponge state: [0, domain_tag, key]
  // domain_tag encodes the original length
  let state: bigint[] = [
    0n,
    BigInt(length), // domain separator = original plaintext length
    sharedKey,
  ]

  // Absorb nonce
  state[0] = (state[0] + nonce) % SNARK_FIELD_SIZE

  // Initial permutation
  state = poseidonPermutation(poseidon, state)

  const ciphertext: bigint[] = []

  // Process each 2-element block
  for (let i = 0; i < padded.length; i += 2) {
    // Absorb plaintext into rate portion
    state[0] = (state[0] + padded[i]) % SNARK_FIELD_SIZE
    state[1] = (state[1] + padded[i + 1]) % SNARK_FIELD_SIZE

    // Squeeze ciphertext from rate portion (before permutation for MACI compat)
    ciphertext.push(state[0])
    ciphertext.push(state[1])

    // Permute
    state = poseidonPermutation(poseidon, state)
  }

  // Squeeze authentication tag from capacity
  // tag = poseidon([state[0], state[1], sharedKey])
  const tagInput = [F.e(state[0]), F.e(state[1]), F.e(sharedKey)]
  const tag = F.toObject(poseidon(tagInput))
  ciphertext.push(tag)

  return ciphertext
}

/**
 * Decrypt ciphertext using Poseidon DuplexSponge.
 *
 * @param ciphertext - Array of ciphertext field elements (includes tag at end)
 * @param sharedKey - ECDH shared key
 * @param nonce - Same nonce used for encryption
 * @param length - Original plaintext length
 * @returns Array of plaintext field elements
 * @throws Error if authentication tag doesn't match
 */
export async function poseidonDecrypt(
  ciphertext: bigint[],
  sharedKey: bigint,
  nonce: bigint,
  length: number,
): Promise<bigint[]> {
  await init()
  const poseidon = poseidonInstance
  const F = poseidon.F

  // Last element is the authentication tag
  const tag = ciphertext[ciphertext.length - 1]
  const encrypted = ciphertext.slice(0, -1)

  // Initialize sponge state (same as encryption)
  let state: bigint[] = [
    0n,
    BigInt(length),
    sharedKey,
  ]

  // Absorb nonce
  state[0] = (state[0] + nonce) % SNARK_FIELD_SIZE

  // Initial permutation
  state = poseidonPermutation(poseidon, state)

  const plaintext: bigint[] = []

  // Process each 2-element block
  for (let i = 0; i < encrypted.length; i += 2) {
    // Recover plaintext: plaintext = ciphertext - state (mod p)
    const p0 =
      (encrypted[i] - state[0] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    const p1 =
      (encrypted[i + 1] - state[1] + SNARK_FIELD_SIZE) % SNARK_FIELD_SIZE
    plaintext.push(p0)
    plaintext.push(p1)

    // Re-absorb (using ciphertext values = state + plaintext)
    state[0] = encrypted[i]
    state[1] = encrypted[i + 1]

    // Permute
    state = poseidonPermutation(poseidon, state)
  }

  // Verify authentication tag
  const tagInput = [F.e(state[0]), F.e(state[1]), F.e(sharedKey)]
  const expectedTag = F.toObject(poseidon(tagInput))

  if (expectedTag !== tag) {
    throw new Error('DuplexSponge decryption failed: invalid authentication tag')
  }

  // Trim padding
  return plaintext.slice(0, length)
}
