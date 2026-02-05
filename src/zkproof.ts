/**
 * D1 Private Voting - ZK Proof Generation
 *
 * This module handles:
 * - Key generation (secret key, public key) using Baby Jubjub
 * - Note creation and hashing using Poseidon
 * - Merkle tree operations
 * - ZK proof generation using snarkjs
 * - Commitment and nullifier computation
 *
 * Based on: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md
 */

// @ts-ignore - circomlibjs doesn't have types
import { buildPoseidon, buildBabyjub } from 'circomlibjs'

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

// ============ Cryptographic Primitives (Lazy Initialization) ============

let poseidonInstance: any = null
let babyjubInstance: any = null

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon()
  }
  return poseidonInstance
}

async function getBabyjub() {
  if (!babyjubInstance) {
    babyjubInstance = await buildBabyjub()
  }
  return babyjubInstance
}

/**
 * Poseidon hash using circomlibjs
 */
async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon()
  const hash = poseidon(inputs.map(x => poseidon.F.e(x)))
  return poseidon.F.toObject(hash)
}

/**
 * Synchronous Poseidon hash (for when we already have instance)
 */
function poseidonHashSync(poseidon: any, inputs: bigint[]): bigint {
  const hash = poseidon(inputs.map(x => poseidon.F.e(x)))
  return poseidon.F.toObject(hash)
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
  // Reduce modulo BabyJubjub subgroup order (for valid secret keys)
  const BABYJUB_SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n
  return value % BABYJUB_SUBORDER
}

// ============ Key Management ============

/**
 * Derive public key from secret key using Baby Jubjub
 */
async function derivePublicKey(sk: bigint): Promise<{ pkX: bigint; pkY: bigint }> {
  const babyjub = await getBabyjub()
  // Multiply base point by sk
  const pubKey = babyjub.mulPointEscalar(babyjub.Base8, sk)
  return {
    pkX: babyjub.F.toObject(pubKey[0]),
    pkY: babyjub.F.toObject(pubKey[1])
  }
}

// BabyJubjub subgroup order
const BABYJUB_SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n

/**
 * Generate or restore keypair
 */
export function getOrCreateKeyPair(): KeyPair {
  const stored = localStorage.getItem(SK_STORAGE_KEY)

  // For sync return, we use pre-computed values if available
  if (stored) {
    try {
      const data = JSON.parse(stored)
      const sk = BigInt(data.sk)

      // Validate that sk is in correct range (BabyJubjub subgroup order)
      if (sk >= BABYJUB_SUBORDER) {
        console.warn('Stored key is out of range, generating new one')
        localStorage.removeItem(SK_STORAGE_KEY)
        localStorage.removeItem(NOTE_STORAGE_KEY)
      } else {
        return {
          sk,
          pkX: BigInt(data.pkX),
          pkY: BigInt(data.pkY)
        }
      }
    } catch (e) {
      console.warn('Failed to restore key, creating new one')
      localStorage.removeItem(SK_STORAGE_KEY)
      localStorage.removeItem(NOTE_STORAGE_KEY)
    }
  }

  // Generate new key - will be updated async
  const sk = randomFieldElement()
  // Temporary placeholder - will be updated by initializeKeyPair
  const tempKeyPair = { sk, pkX: 0n, pkY: 0n }

  // Async initialization
  initializeKeyPair(sk)

  return tempKeyPair
}

/**
 * Async key initialization
 */
async function initializeKeyPair(sk: bigint): Promise<void> {
  const { pkX, pkY } = await derivePublicKey(sk)
  localStorage.setItem(SK_STORAGE_KEY, JSON.stringify({
    sk: sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString()
  }))
}

/**
 * Get or create keypair (async version - preferred)
 */
export async function getOrCreateKeyPairAsync(): Promise<KeyPair> {
  const stored = localStorage.getItem(SK_STORAGE_KEY)

  if (stored) {
    try {
      const data = JSON.parse(stored)
      return {
        sk: BigInt(data.sk),
        pkX: BigInt(data.pkX),
        pkY: BigInt(data.pkY)
      }
    } catch (e) {
      console.warn('Failed to restore key, creating new one')
    }
  }

  const sk = randomFieldElement()
  const { pkX, pkY } = await derivePublicKey(sk)

  localStorage.setItem(SK_STORAGE_KEY, JSON.stringify({
    sk: sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString()
  }))

  return { sk, pkX, pkY }
}

/**
 * Export secret key for backup
 */
export function exportSecretKey(): string | null {
  const stored = localStorage.getItem(SK_STORAGE_KEY)
  if (!stored) return null
  try {
    const data = JSON.parse(stored)
    return data.sk
  } catch {
    return stored
  }
}

/**
 * Import secret key from backup
 */
export async function importSecretKey(skHex: string): Promise<KeyPair> {
  const sk = BigInt(skHex)
  const { pkX, pkY } = await derivePublicKey(sk)
  localStorage.setItem(SK_STORAGE_KEY, JSON.stringify({
    sk: sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString()
  }))
  return { sk, pkX, pkY }
}

// ============ Token Note Management ============

// Default token type for governance tokens
const DEFAULT_TOKEN_TYPE = 1n

/**
 * Create a token note representing voting power
 * Per D1 spec: noteHash = hash(pkX, pkY, noteValue, tokenType, noteSalt)
 */
export async function createTokenNoteAsync(keyPair: KeyPair, value: bigint, tokenType: bigint = DEFAULT_TOKEN_TYPE): Promise<TokenNote> {
  const noteSalt = randomFieldElement()
  // D1 spec: hash(pkX, pkY, noteValue, tokenType, noteSalt)
  const noteHash = await poseidonHash([keyPair.pkX, keyPair.pkY, value, tokenType, noteSalt])

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
 * Sync version for backwards compatibility
 */
export function createTokenNote(keyPair: KeyPair, value: bigint, tokenType: bigint = DEFAULT_TOKEN_TYPE): TokenNote {
  const noteSalt = randomFieldElement()
  // Placeholder - will be updated async
  const note: TokenNote = {
    noteHash: 0n,
    noteValue: value,
    noteSalt,
    tokenType,
    pkX: keyPair.pkX,
    pkY: keyPair.pkY,
  }

  // Async compute and store
  createTokenNoteAsync(keyPair, value, tokenType).then(asyncNote => {
    note.noteHash = asyncNote.noteHash
    localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify({
      noteHash: asyncNote.noteHash.toString(),
      noteValue: value.toString(),
      noteSalt: noteSalt.toString(),
      tokenType: tokenType.toString(),
      pkX: keyPair.pkX.toString(),
      pkY: keyPair.pkY.toString(),
    }))
  })

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

const TREE_DEPTH = 20

/**
 * Build merkle tree from note hashes using Poseidon
 */
export async function buildMerkleTreeAsync(noteHashes: bigint[]): Promise<{ root: bigint; depth: number }> {
  const poseidon = await getPoseidon()
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
      nextLevel.push(poseidonHashSync(poseidon, [left, right]))
    }
    currentLevel = nextLevel
  }

  return { root: currentLevel[0], depth: TREE_DEPTH }
}

/**
 * Sync version for backwards compatibility
 */
export function buildMerkleTree(noteHashes: bigint[]): { root: bigint; depth: number } {
  // Return placeholder, actual computation is async
  return { root: 0n, depth: TREE_DEPTH }
}

/**
 * Generate merkle proof for a leaf using Poseidon
 */
export async function generateMerkleProofAsync(
  noteHashes: bigint[],
  leafIndex: number
): Promise<{ path: bigint[]; index: number; root: bigint }> {
  const poseidon = await getPoseidon()
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
      nextLevel.push(poseidonHashSync(poseidon, [left, right]))
    }
    currentLevel = nextLevel
    currentIndex = Math.floor(currentIndex / 2)
  }

  return { path, index: leafIndex, root: currentLevel[0] }
}

/**
 * Sync version for backwards compatibility
 */
export function generateMerkleProof(
  noteHashes: bigint[],
  leafIndex: number
): { path: bigint[]; index: number } {
  return { path: new Array(TREE_DEPTH).fill(0n), index: leafIndex }
}

// ============ Vote Operations ============

/**
 * Compute vote commitment per D1 spec: hash(choice, votingPower, proposalId, voteSalt)
 */
export async function computeCommitmentAsync(choice: VoteChoice, votingPower: bigint, proposalId: bigint, voteSalt: bigint): Promise<bigint> {
  return poseidonHash([choice, votingPower, proposalId, voteSalt])
}

/**
 * Compute nullifier: hash(sk, proposalId)
 */
export async function computeNullifierAsync(sk: bigint, proposalId: bigint): Promise<bigint> {
  return poseidonHash([sk, proposalId])
}

/**
 * Sync versions for backwards compatibility
 */
export function computeCommitment(choice: VoteChoice, votingPower: bigint, proposalId: bigint, voteSalt: bigint): bigint {
  return 0n // Placeholder
}

export function computeNullifier(sk: bigint, proposalId: bigint): bigint {
  return 0n // Placeholder
}

/**
 * Prepare vote data for commit phase (async version)
 */
export async function prepareVoteAsync(
  keyPair: KeyPair,
  choice: VoteChoice,
  votingPower: bigint,
  proposalId: bigint
): Promise<VoteData> {
  const voteSalt = randomFieldElement()
  const commitment = await computeCommitmentAsync(choice, votingPower, proposalId, voteSalt)
  const nullifier = await computeNullifierAsync(keyPair.sk, proposalId)

  return {
    choice,
    votingPower,
    voteSalt,
    proposalId,
    commitment,
    nullifier,
  }
}

/**
 * Sync version for backwards compatibility
 */
export function prepareVote(
  keyPair: KeyPair,
  choice: VoteChoice,
  votingPower: bigint,
  proposalId: bigint
): VoteData {
  const voteSalt = randomFieldElement()
  return {
    choice,
    votingPower,
    voteSalt,
    proposalId,
    commitment: 0n,
    nullifier: 0n,
  }
}

// ============ ZK Proof Generation ============

/**
 * Generate ZK proof for vote commitment using snarkjs
 */
export async function generateVoteProof(
  keyPair: KeyPair,
  note: TokenNote,
  voteData: VoteData,
  merkleRoot: bigint,
  merklePath: bigint[],
  merkleIndex: number,
  onProgress?: (progress: ProofGenerationProgress) => void
): Promise<{ proof: ZKProof; publicSignals: bigint[]; nullifier: bigint; commitment: bigint }> {
  onProgress?.({
    stage: 'preparing',
    progress: 10,
    message: 'Preparing circuit inputs...'
  })

  // Yield to allow UI to update
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('[ZK] Loading Poseidon...')
  const poseidon = await getPoseidon()

  // Yield again
  await new Promise(resolve => setTimeout(resolve, 50))

  console.log('[ZK] Loading BabyJubjub...')
  const babyjub = await getBabyjub()

  console.log('[ZK] Crypto libraries loaded')

  // Derive actual public key
  const pubKey = babyjub.mulPointEscalar(babyjub.Base8, keyPair.sk)
  const pkX = babyjub.F.toObject(pubKey[0])
  const pkY = babyjub.F.toObject(pubKey[1])

  // Compute actual note hash
  const noteHash = poseidonHashSync(poseidon, [pkX, pkY, note.noteValue, note.tokenType, note.noteSalt])

  // For demo: if merkleRoot equals noteHash, use empty path (single-leaf tree)
  // In production, would fetch real merkle proof from snapshot service
  console.log('[ZK] NoteHash:', noteHash.toString())
  console.log('[ZK] Merkle root (from proposal):', merkleRoot.toString())

  let actualMerkleRoot: bigint
  let actualPath: bigint[]

  if (merkleRoot === noteHash) {
    // Single-leaf tree: root = leaf, path is all zeros
    console.log('[ZK] Using single-leaf merkle tree (root = noteHash)')
    actualMerkleRoot = noteHash
    actualPath = Array(TREE_DEPTH).fill(0n)
  } else {
    // Build merkle tree (demo: single note, padded with zeros)
    console.log('[ZK] Building merkle tree from noteHash')
    const noteHashes = [noteHash]
    let currentLevel = [...noteHashes]
    const size = 2 ** TREE_DEPTH
    while (currentLevel.length < size) {
      currentLevel.push(0n)
    }

    actualPath = []
    let currentIndex = 0

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isLeft = currentIndex % 2 === 0
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1
      actualPath.push(currentLevel[siblingIndex] || 0n)

      const nextLevel: bigint[] = []
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i]
        const right = currentLevel[i + 1] || 0n
        nextLevel.push(poseidonHashSync(poseidon, [left, right]))
      }
      currentLevel = nextLevel
      currentIndex = Math.floor(currentIndex / 2)
    }

    actualMerkleRoot = currentLevel[0]
    console.log('[ZK] Computed merkle root:', actualMerkleRoot.toString())
  }

  // Compute actual commitment and nullifier
  const voteSalt = voteData.voteSalt
  const commitment = poseidonHashSync(poseidon, [voteData.choice, note.noteValue, voteData.proposalId, voteSalt])
  const nullifier = poseidonHashSync(poseidon, [keyPair.sk, voteData.proposalId])

  // Yield before heavy computation
  await new Promise(resolve => setTimeout(resolve, 50))

  onProgress?.({
    stage: 'computing-witness',
    progress: 30,
    message: 'Computing merkle tree...'
  })

  console.log('[ZK] Computing merkle tree...')

  // Prepare circuit inputs
  const circuitInputs = {
    // Public inputs
    voteCommitment: commitment.toString(),
    proposalId: voteData.proposalId.toString(),
    votingPower: note.noteValue.toString(),
    merkleRoot: actualMerkleRoot.toString(),

    // Private inputs
    sk: keyPair.sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString(),
    noteHash: noteHash.toString(),
    noteValue: note.noteValue.toString(),
    noteSalt: note.noteSalt.toString(),
    tokenType: note.tokenType.toString(),
    choice: voteData.choice.toString(),
    voteSalt: voteSalt.toString(),
    merklePath: actualPath.map(p => p.toString()),
    merkleIndex: 0,
  }

  onProgress?.({
    stage: 'generating-proof',
    progress: 50,
    message: 'Loading snarkjs...'
  })

  try {
    // Dynamic import snarkjs
    console.log('[ZK] Importing snarkjs...')
    const snarkjs = await import('snarkjs')
    console.log('[ZK] snarkjs imported successfully')

    // Load circuit files from public directory
    const wasmUrl = '/circuits/PrivateVoting.wasm'
    const zkeyUrl = '/circuits/PrivateVoting_final.zkey'

    onProgress?.({
      stage: 'generating-proof',
      progress: 60,
      message: 'Loading circuit files (8.5MB)...'
    })

    // Yield to allow UI to update before heavy computation
    await new Promise(resolve => setTimeout(resolve, 100))

    console.log('[ZK] Starting proof generation (this may take 30-60 seconds)...')
    console.log('[ZK] Circuit inputs:', JSON.stringify(circuitInputs, (_, v) => typeof v === 'bigint' ? v.toString() : v))

    const startTime = Date.now()

    // Generate proof with timeout
    const proofPromise = snarkjs.groth16.fullProve(
      circuitInputs,
      wasmUrl,
      zkeyUrl
    )

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Proof generation timed out after 120 seconds')), 120000)
    })

    const { proof, publicSignals } = await Promise.race([proofPromise, timeoutPromise]) as { proof: any; publicSignals: string[] }

    console.log('[ZK] Proof generated in', Date.now() - startTime, 'ms')

    onProgress?.({
      stage: 'finalizing',
      progress: 90,
      message: 'Finalizing proof...'
    })

    // Convert proof to contract format
    const zkProof: ZKProof = {
      pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      pB: [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
      ],
      pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])]
    }

    onProgress?.({
      stage: 'finalizing',
      progress: 100,
      message: 'Proof generated!'
    })

    return {
      proof: zkProof,
      publicSignals: publicSignals.map((s: string) => BigInt(s)),
      nullifier,
      commitment
    }
  } catch (error) {
    console.error('Proof generation failed:', error)

    onProgress?.({
      stage: 'finalizing',
      progress: 0,
      message: 'Proof generation failed: ' + (error as Error).message
    })

    // Re-throw the error so the UI can handle it properly
    throw new Error('ZK proof generation failed: ' + (error as Error).message)
  }
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
    commitment: voteData.commitment.toString(),
    votingPower: voteData.votingPower.toString(),
  }))
}

/**
 * Get stored vote data for reveal
 */
export function getVoteForReveal(proposalId: bigint): { choice: bigint; voteSalt: bigint; nullifier: bigint; commitment?: bigint; votingPower?: bigint } | null {
  const key = `zk-vote-reveal-${proposalId.toString()}`
  const stored = localStorage.getItem(key)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored)
    return {
      choice: BigInt(parsed.choice),
      voteSalt: BigInt(parsed.voteSalt),
      nullifier: BigInt(parsed.nullifier),
      commitment: parsed.commitment ? BigInt(parsed.commitment) : undefined,
      votingPower: parsed.votingPower ? BigInt(parsed.votingPower) : undefined,
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
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('zk-vote-reveal-')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
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
