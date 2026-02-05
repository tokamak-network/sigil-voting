/**
 * D1 Private Voting - ZK Proof Generation
 *
 * This module handles:
 * - Key generation (secret key, public key)
 * - Note creation and hashing
 * - Merkle tree operations
 * - ZK proof generation using snarkjs
 * - Commitment and nullifier computation
 *
 * Based on: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md
 */

// Storage keys
const SK_STORAGE_KEY = 'zk-vote-secret-key'
const NOTE_STORAGE_KEY = 'zk-vote-note'

// Vote choices
export const CHOICE_AGAINST = 0n
export const CHOICE_FOR = 1n
export const CHOICE_ABSTAIN = 2n

export type VoteChoice = typeof CHOICE_AGAINST | typeof CHOICE_FOR | typeof CHOICE_ABSTAIN

// Interfaces
export interface KeyPair {
  sk: bigint        // Secret key
  pkX: bigint       // Public key X coordinate
  pkY: bigint       // Public key Y coordinate
}

export interface TokenNote {
  noteHash: bigint
  noteValue: bigint
  noteSalt: bigint
  tokenType: bigint  // Token type identifier (per D1 spec)
  pkX: bigint
  pkY: bigint
}

export interface VoteData {
  choice: VoteChoice
  votingPower: bigint
  voteSalt: bigint
  proposalId: bigint
  commitment: bigint
  nullifier: bigint
}

export interface ZKProof {
  pA: [bigint, bigint]
  pB: [[bigint, bigint], [bigint, bigint]]
  pC: [bigint, bigint]
}

export interface ProofInputs {
  // Public inputs (4 as per D1 spec)
  voteCommitment: bigint
  proposalId: bigint
  votingPower: bigint
  merkleRoot: bigint

  // Private inputs
  sk: bigint
  pkX: bigint
  pkY: bigint
  noteHash: bigint
  noteValue: bigint
  noteSalt: bigint
  tokenType: bigint    // Per D1 spec
  choice: bigint
  voteSalt: bigint
  merklePath: bigint[]
  merkleIndex: number  // Single uint per D1 spec
}

export interface ProofGenerationProgress {
  stage: 'preparing' | 'computing-witness' | 'generating-proof' | 'finalizing'
  progress: number
  message: string
}

// ============ Cryptographic Utilities ============

/**
 * Simple Poseidon hash approximation using keccak256
 * In production, use actual Poseidon implementation
 */
function poseidonHash(inputs: bigint[]): bigint {
  // Convert to hex strings and concatenate
  const data = inputs.map(i => i.toString(16).padStart(64, '0')).join('')
  // Use keccak256 (Web Crypto not available for keccak, so we simulate)
  // In production, use circomlibjs poseidon
  let hash = 0n
  for (let i = 0; i < data.length; i++) {
    hash = (hash * 31n + BigInt(data.charCodeAt(i))) % (2n ** 254n)
  }
  return hash
}

/**
 * Generate random field element
 */
function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let value = 0n
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[i])
  }
  // Reduce modulo BN254 scalar field
  const BN254_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
  return value % BN254_ORDER
}

// ============ Key Management ============

/**
 * Generate or restore keypair
 */
export function getOrCreateKeyPair(): KeyPair {
  const stored = localStorage.getItem(SK_STORAGE_KEY)
  if (stored) {
    try {
      const sk = BigInt(stored)
      const { pkX, pkY } = derivePublicKey(sk)
      return { sk, pkX, pkY }
    } catch (e) {
      console.warn('Failed to restore key, creating new one')
    }
  }

  const sk = randomFieldElement()
  const { pkX, pkY } = derivePublicKey(sk)

  localStorage.setItem(SK_STORAGE_KEY, sk.toString())

  return { sk, pkX, pkY }
}

/**
 * Derive public key from secret key
 * In production, use Baby Jubjub curve operations
 */
function derivePublicKey(sk: bigint): { pkX: bigint; pkY: bigint } {
  // Simplified derivation - in production use actual Baby Jubjub
  const pkX = poseidonHash([sk, 1n])
  const pkY = poseidonHash([sk, 2n])
  return { pkX, pkY }
}

/**
 * Export secret key for backup
 */
export function exportSecretKey(): string | null {
  return localStorage.getItem(SK_STORAGE_KEY)
}

/**
 * Import secret key from backup
 */
export function importSecretKey(skHex: string): KeyPair {
  const sk = BigInt(skHex)
  const { pkX, pkY } = derivePublicKey(sk)
  localStorage.setItem(SK_STORAGE_KEY, sk.toString())
  return { sk, pkX, pkY }
}

// ============ Token Note Management ============

// Default token type for governance tokens
const DEFAULT_TOKEN_TYPE = 1n

/**
 * Create a token note representing voting power
 * Per D1 spec: noteHash = hash(pkX, pkY, noteValue, tokenType, noteSalt)
 */
export function createTokenNote(keyPair: KeyPair, value: bigint, tokenType: bigint = DEFAULT_TOKEN_TYPE): TokenNote {
  const noteSalt = randomFieldElement()
  // D1 spec: hash(pkX, pkY, noteValue, tokenType, noteSalt)
  const noteHash = poseidonHash([keyPair.pkX, keyPair.pkY, value, tokenType, noteSalt])

  const note: TokenNote = {
    noteHash,
    noteValue: value,
    noteSalt,
    tokenType,
    pkX: keyPair.pkX,
    pkY: keyPair.pkY,
  }

  // Store note
  localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify({
    noteHash: noteHash.toString(),
    noteValue: value.toString(),
    noteSalt: noteSalt.toString(),
    tokenType: tokenType.toString(),
    pkX: keyPair.pkX.toString(),
    pkY: keyPair.pkY.toString(),
  }))

  return note
}

/**
 * Get stored token note
 */
export function getStoredNote(): TokenNote | null {
  const stored = localStorage.getItem(NOTE_STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored)
    return {
      noteHash: BigInt(parsed.noteHash),
      noteValue: BigInt(parsed.noteValue),
      noteSalt: BigInt(parsed.noteSalt),
      tokenType: BigInt(parsed.tokenType || '1'),
      pkX: BigInt(parsed.pkX),
      pkY: BigInt(parsed.pkY),
    }
  } catch {
    return null
  }
}

// ============ Merkle Tree Operations ============

/**
 * Build merkle tree from note hashes
 */
export function buildMerkleTree(noteHashes: bigint[]): { root: bigint; depth: number } {
  const TREE_DEPTH = 20
  let currentLevel = [...noteHashes]

  // Pad to power of 2
  const size = 2 ** TREE_DEPTH
  while (currentLevel.length < size) {
    currentLevel.push(0n)
  }

  // Build tree bottom-up
  for (let level = 0; level < TREE_DEPTH; level++) {
    const nextLevel: bigint[] = []
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]
      const right = currentLevel[i + 1] || 0n
      nextLevel.push(poseidonHash([left, right]))
    }
    currentLevel = nextLevel
  }

  return { root: currentLevel[0], depth: TREE_DEPTH }
}

/**
 * Generate merkle proof for a leaf
 * Per D1 spec: merkleIndex is a single uint representing position
 */
export function generateMerkleProof(
  noteHashes: bigint[],
  leafIndex: number
): { path: bigint[]; index: number } {
  const TREE_DEPTH = 20
  let currentLevel = [...noteHashes]

  // Pad to power of 2
  const size = 2 ** TREE_DEPTH
  while (currentLevel.length < size) {
    currentLevel.push(0n)
  }

  const path: bigint[] = []
  let currentIndex = leafIndex

  // Build proof
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isLeft = currentIndex % 2 === 0
    const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1

    path.push(currentLevel[siblingIndex] || 0n)

    // Move to next level
    const nextLevel: bigint[] = []
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]
      const right = currentLevel[i + 1] || 0n
      nextLevel.push(poseidonHash([left, right]))
    }
    currentLevel = nextLevel
    currentIndex = Math.floor(currentIndex / 2)
  }

  // Return single index (position in tree) per D1 spec
  return { path, index: leafIndex }
}

// ============ Vote Operations ============

/**
 * Compute vote commitment per D1 spec: hash(choice, votingPower, proposalId, voteSalt)
 */
export function computeCommitment(choice: VoteChoice, votingPower: bigint, proposalId: bigint, voteSalt: bigint): bigint {
  return poseidonHash([choice, votingPower, proposalId, voteSalt])
}

/**
 * Compute nullifier: hash(sk, proposalId)
 */
export function computeNullifier(sk: bigint, proposalId: bigint): bigint {
  return poseidonHash([sk, proposalId])
}

/**
 * Prepare vote data for commit phase
 * Per D1 spec: commitment = hash(choice, votingPower, proposalId, voteSalt)
 */
export function prepareVote(
  keyPair: KeyPair,
  choice: VoteChoice,
  votingPower: bigint,
  proposalId: bigint
): VoteData {
  const voteSalt = randomFieldElement()
  const commitment = computeCommitment(choice, votingPower, proposalId, voteSalt)
  const nullifier = computeNullifier(keyPair.sk, proposalId)

  return {
    choice,
    votingPower,
    voteSalt,
    proposalId,
    commitment,
    nullifier,
  }
}

// ============ ZK Proof Generation ============

/**
 * Generate ZK proof for vote commitment
 *
 * In production, this would use snarkjs with the compiled circuit.
 * For demo purposes, we simulate the proof generation.
 *
 * Per D1 spec: 4 public inputs (voteCommitment, proposalId, votingPower, merkleRoot)
 * Nullifier is computed but passed separately to contract
 */
export async function generateVoteProof(
  keyPair: KeyPair,
  note: TokenNote,
  voteData: VoteData,
  merkleRoot: bigint,
  merklePath: bigint[],
  merkleIndex: number,
  onProgress?: (progress: ProofGenerationProgress) => void
): Promise<{ proof: ZKProof; publicSignals: bigint[]; nullifier: bigint }> {
  onProgress?.({
    stage: 'preparing',
    progress: 10,
    message: 'Preparing circuit inputs...'
  })

  await new Promise(r => setTimeout(r, 300))

  // Prepare inputs per D1 spec
  const inputs: ProofInputs = {
    // Public inputs (4 as per D1 spec)
    voteCommitment: voteData.commitment,
    proposalId: voteData.proposalId,
    votingPower: note.noteValue,
    merkleRoot,

    // Private inputs
    sk: keyPair.sk,
    pkX: keyPair.pkX,
    pkY: keyPair.pkY,
    noteHash: note.noteHash,
    noteValue: note.noteValue,
    noteSalt: note.noteSalt,
    tokenType: note.tokenType,
    choice: voteData.choice,
    voteSalt: voteData.voteSalt,
    merklePath,
    merkleIndex,
  }

  onProgress?.({
    stage: 'computing-witness',
    progress: 30,
    message: 'Computing witness...'
  })

  await new Promise(r => setTimeout(r, 500))

  onProgress?.({
    stage: 'generating-proof',
    progress: 50,
    message: 'Generating Groth16 proof (this may take 20-30 seconds)...'
  })

  // In production, this would be:
  // const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  //   inputs,
  //   'circuits/build/PrivateVoting_js/PrivateVoting.wasm',
  //   'circuits/build/PrivateVoting_final.zkey'
  // )

  // Simulate proof generation time
  await new Promise(r => setTimeout(r, 2000))

  onProgress?.({
    stage: 'finalizing',
    progress: 90,
    message: 'Finalizing proof...'
  })

  await new Promise(r => setTimeout(r, 300))

  // Generate simulated proof (in production, use actual snarkjs output)
  const proof: ZKProof = {
    pA: [randomFieldElement(), randomFieldElement()],
    pB: [
      [randomFieldElement(), randomFieldElement()],
      [randomFieldElement(), randomFieldElement()]
    ],
    pC: [randomFieldElement(), randomFieldElement()]
  }

  // 4 public signals as per D1 spec
  const publicSignals = [
    inputs.voteCommitment,
    inputs.proposalId,
    inputs.votingPower,
    inputs.merkleRoot
  ]

  onProgress?.({
    stage: 'finalizing',
    progress: 100,
    message: 'Proof generated!'
  })

  // Nullifier passed separately (not a public input per spec)
  return { proof, publicSignals, nullifier: voteData.nullifier }
}

// ============ Storage Operations ============

/**
 * Store vote data for reveal phase
 */
export function storeVoteForReveal(proposalId: bigint, voteData: VoteData): void {
  const key = `zk-vote-reveal-${proposalId.toString()}`
  localStorage.setItem(key, JSON.stringify({
    choice: voteData.choice.toString(),
    voteSalt: voteData.voteSalt.toString(),
    nullifier: voteData.nullifier.toString(),
  }))
}

/**
 * Get stored vote data for reveal
 */
export function getVoteForReveal(proposalId: bigint): { choice: bigint; voteSalt: bigint; nullifier: bigint } | null {
  const key = `zk-vote-reveal-${proposalId.toString()}`
  const stored = localStorage.getItem(key)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored)
    return {
      choice: BigInt(parsed.choice),
      voteSalt: BigInt(parsed.voteSalt),
      nullifier: BigInt(parsed.nullifier),
    }
  } catch {
    return null
  }
}

/**
 * Clear all stored data (for testing)
 */
export function clearAllData(): void {
  localStorage.removeItem(SK_STORAGE_KEY)
  localStorage.removeItem(NOTE_STORAGE_KEY)
  // Clear reveal data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('zk-vote-reveal-')) {
      localStorage.removeItem(key)
    }
  }
}

// ============ Display Utilities ============

/**
 * Format bigint for display
 */
export function formatBigInt(value: bigint, maxLength = 16): string {
  const hex = value.toString(16)
  if (hex.length <= maxLength) return `0x${hex}`
  return `0x${hex.slice(0, 8)}...${hex.slice(-6)}`
}

/**
 * Get key info for display
 */
export function getKeyInfo(keyPair: KeyPair): { shortSk: string; shortPk: string } {
  return {
    shortSk: formatBigInt(keyPair.sk),
    shortPk: formatBigInt(keyPair.pkX),
  }
}
