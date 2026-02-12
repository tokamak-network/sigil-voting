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

// @ts-expect-error - circomlibjs doesn't have types
import { buildPoseidon, buildBabyjub } from 'circomlibjs'
import { generateProofWithFallback } from './workers/proofWorkerHelper'

// Debug mode - set to false for production
const DEBUG = false

// Storage keys (base - wallet address appended at runtime)
const SK_STORAGE_KEY_BASE = 'zk-vote-secret-key'
const NOTE_STORAGE_KEY_BASE = 'zk-vote-note'

// Contract address for vote storage (to avoid conflicts between contract deployments)
const CONTRACT_ADDRESS = '0xc3bF134b60FA8ac7366CA0DeDbD50ECd9751ab39'

// Helper to get wallet-specific storage key
function getSkStorageKey(walletAddress?: string): string {
  return walletAddress
    ? `${SK_STORAGE_KEY_BASE}-${walletAddress.toLowerCase()}`
    : SK_STORAGE_KEY_BASE
}

function getNoteStorageKey(walletAddress?: string): string {
  return walletAddress
    ? `${NOTE_STORAGE_KEY_BASE}-${walletAddress.toLowerCase()}`
    : NOTE_STORAGE_KEY_BASE
}

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

// ============ Cryptographic Primitives (Eager Initialization) ============

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poseidonInstance: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let babyjubInstance: any = null
let initPromise: Promise<void> | null = null

// Pre-load crypto primitives on module load
async function initCrypto() {
  if (!initPromise) {
    initPromise = (async () => {
      const [poseidon, babyjub] = await Promise.all([
        buildPoseidon(),
        buildBabyjub()
      ])
      poseidonInstance = poseidon
      babyjubInstance = babyjub
      if (DEBUG) console.log('[ZK] Crypto primitives loaded')
    })()
  }
  return initPromise
}

// Start loading immediately
initCrypto()

async function getPoseidon() {
  await initCrypto()
  return poseidonInstance
}

async function getBabyjub() {
  await initCrypto()
  return babyjubInstance
}

// Export preload function for manual triggering
export async function preloadCrypto() {
  await initCrypto()
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Generate or restore keypair (per wallet address)
 */
export function getOrCreateKeyPair(walletAddress?: string): KeyPair {
  const storageKey = getSkStorageKey(walletAddress)
  const noteKey = getNoteStorageKey(walletAddress)
  const stored = localStorage.getItem(storageKey)

  // For sync return, we use pre-computed values if available
  if (stored) {
    try {
      const data = JSON.parse(stored)
      const sk = BigInt(data.sk)

      // Validate that sk is in correct range (BabyJubjub subgroup order)
      if (sk >= BABYJUB_SUBORDER) {
        console.warn('Stored key is out of range, generating new one')
        localStorage.removeItem(storageKey)
        localStorage.removeItem(noteKey)
      } else {
        return {
          sk,
          pkX: BigInt(data.pkX),
          pkY: BigInt(data.pkY)
        }
      }
    } catch {
      console.warn('Failed to restore key, creating new one')
      localStorage.removeItem(storageKey)
      localStorage.removeItem(noteKey)
    }
  }

  // Generate new key - will be updated async
  const sk = randomFieldElement()
  // Temporary placeholder - will be updated by initializeKeyPair
  const tempKeyPair = { sk, pkX: 0n, pkY: 0n }

  // Async initialization
  initializeKeyPair(sk, walletAddress)

  return tempKeyPair
}

/**
 * Async key initialization (per wallet address)
 */
async function initializeKeyPair(sk: bigint, walletAddress?: string): Promise<void> {
  const storageKey = getSkStorageKey(walletAddress)
  const { pkX, pkY } = await derivePublicKey(sk)
  localStorage.setItem(storageKey, JSON.stringify({
    sk: sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString()
  }))
}

/**
 * Get or create keypair (async version - preferred, per wallet address)
 */
export async function getOrCreateKeyPairAsync(walletAddress?: string): Promise<KeyPair> {
  const storageKey = getSkStorageKey(walletAddress)
  const stored = localStorage.getItem(storageKey)

  if (stored) {
    try {
      const data = JSON.parse(stored)
      return {
        sk: BigInt(data.sk),
        pkX: BigInt(data.pkX),
        pkY: BigInt(data.pkY)
      }
    } catch {
      console.warn('Failed to restore key, creating new one')
    }
  }

  const sk = randomFieldElement()
  const { pkX, pkY } = await derivePublicKey(sk)

  localStorage.setItem(storageKey, JSON.stringify({
    sk: sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString()
  }))

  return { sk, pkX, pkY }
}

/**
 * Export secret key for backup (per wallet address)
 */
export function exportSecretKey(walletAddress?: string): string | null {
  const storageKey = getSkStorageKey(walletAddress)
  const stored = localStorage.getItem(storageKey)
  if (!stored) return null
  try {
    const data = JSON.parse(stored)
    return data.sk
  } catch {
    return stored
  }
}

/**
 * Import secret key from backup (per wallet address)
 */
export async function importSecretKey(skHex: string, walletAddress?: string): Promise<KeyPair> {
  const storageKey = getSkStorageKey(walletAddress)
  const sk = BigInt(skHex)
  const { pkX, pkY } = await derivePublicKey(sk)
  localStorage.setItem(storageKey, JSON.stringify({
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
 * Create a token note representing voting power (per wallet address)
 * Per D1 spec: noteHash = hash(pkX, pkY, noteValue, tokenType, noteSalt)
 */
export async function createTokenNoteAsync(keyPair: KeyPair, value: bigint, tokenType: bigint = DEFAULT_TOKEN_TYPE, walletAddress?: string): Promise<TokenNote> {
  const noteKey = getNoteStorageKey(walletAddress)
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
  localStorage.setItem(noteKey, JSON.stringify({
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
 * Sync version for backwards compatibility (per wallet address)
 */
export function createTokenNote(keyPair: KeyPair, value: bigint, tokenType: bigint = DEFAULT_TOKEN_TYPE, walletAddress?: string): TokenNote {
  const noteKey = getNoteStorageKey(walletAddress)
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
  createTokenNoteAsync(keyPair, value, tokenType, walletAddress).then(asyncNote => {
    note.noteHash = asyncNote.noteHash
    localStorage.setItem(noteKey, JSON.stringify({
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
 * Get stored token note (per wallet address)
 */
export function getStoredNote(walletAddress?: string): TokenNote | null {
  const noteKey = getNoteStorageKey(walletAddress)
  const stored = localStorage.getItem(noteKey)
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
 * @deprecated Use buildMerkleTreeAsync instead
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildMerkleTree(_noteHashes: bigint[]): { root: bigint; depth: number } {
  // Return placeholder, actual computation is async
  return { root: 0n, depth: TREE_DEPTH }
}

/**
 * Generate merkle proof for a leaf using Poseidon
 * Uses efficient sparse tree approach - only computes necessary nodes
 */
export async function generateMerkleProofAsync(
  noteHashes: bigint[],
  leafIndex: number
): Promise<{ path: bigint[]; index: number; root: bigint }> {
  const poseidon = await getPoseidon()

  // Pre-compute zero hashes for each level (for sparse tree optimization)
  const zeroHashes: bigint[] = [0n]
  for (let i = 0; i < TREE_DEPTH; i++) {
    zeroHashes.push(poseidonHashSync(poseidon, [zeroHashes[i], zeroHashes[i]]))
  }

  // Use sparse tree approach: only store non-zero nodes
  // Map from index to hash value for each level
  let currentLevel: Map<number, bigint> = new Map()

  // Initialize with actual leaves
  for (let i = 0; i < noteHashes.length; i++) {
    if (noteHashes[i] !== 0n) {
      currentLevel.set(i, noteHashes[i])
    }
  }

  const path: bigint[] = []
  let currentIndex = leafIndex

  // Build tree level by level, only computing necessary nodes
  for (let level = 0; level < TREE_DEPTH; level++) {
    const isLeft = currentIndex % 2 === 0
    const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1

    // Get sibling from current level (or zero hash if not present)
    const sibling = currentLevel.get(siblingIndex) ?? zeroHashes[level]
    path.push(sibling)

    // Build next level - only compute parents of non-zero nodes
    const nextLevel: Map<number, bigint> = new Map()
    const processedParents = new Set<number>()

    // Process all non-zero nodes and their siblings
    for (const [idx] of currentLevel) {
      const parentIdx = Math.floor(idx / 2)
      if (processedParents.has(parentIdx)) continue
      processedParents.add(parentIdx)

      const leftIdx = parentIdx * 2
      const rightIdx = parentIdx * 2 + 1
      const left = currentLevel.get(leftIdx) ?? zeroHashes[level]
      const right = currentLevel.get(rightIdx) ?? zeroHashes[level]

      const parentHash = poseidonHashSync(poseidon, [left, right])
      if (parentHash !== zeroHashes[level + 1]) {
        nextLevel.set(parentIdx, parentHash)
      }
    }

    // Also ensure we compute the path for our target leaf
    const targetParentIdx = Math.floor(currentIndex / 2)
    if (!processedParents.has(targetParentIdx)) {
      const leftIdx = targetParentIdx * 2
      const rightIdx = targetParentIdx * 2 + 1
      const left = currentLevel.get(leftIdx) ?? zeroHashes[level]
      const right = currentLevel.get(rightIdx) ?? zeroHashes[level]
      const parentHash = poseidonHashSync(poseidon, [left, right])
      nextLevel.set(targetParentIdx, parentHash)
    }

    currentLevel = nextLevel
    currentIndex = Math.floor(currentIndex / 2)
  }

  // Root is at index 0
  const root = currentLevel.get(0) ?? zeroHashes[TREE_DEPTH]

  return { path, index: leafIndex, root }
}

/**
 * Find a voter's index in the registered voters list
 */
export function findVoterIndex(registeredVoters: bigint[], noteHash: bigint): number {
  for (let i = 0; i < registeredVoters.length; i++) {
    if (registeredVoters[i] === noteHash) {
      return i
    }
  }
  return -1 // Not found
}

/**
 * Sync version for backwards compatibility
 */
export function generateMerkleProof(
  _noteHashes: bigint[],
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
 * @deprecated Use computeCommitmentAsync instead
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function computeCommitment(_choice: VoteChoice, _votingPower: bigint, _proposalId: bigint, _voteSalt: bigint): bigint {
  return 0n // Placeholder
}

/**
 * @deprecated Use computeNullifierAsync instead
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function computeNullifier(_sk: bigint, _proposalId: bigint): bigint {
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
  _keyPair: KeyPair,
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
 * @param registeredVoters - List of all registered voter note hashes (from contract)
 */
export async function generateVoteProof(
  keyPair: KeyPair,
  note: TokenNote,
  voteData: VoteData,
  merkleRoot: bigint,
  registeredVoters: bigint[],
  _merkleIndex: number,
  onProgress?: (progress: ProofGenerationProgress) => void
): Promise<{ proof: ZKProof; publicSignals: bigint[]; nullifier: bigint; commitment: bigint }> {
  onProgress?.({
    stage: 'preparing',
    progress: 10,
    message: 'Preparing circuit inputs...'
  })

  // Yield to allow UI to update
  await new Promise(resolve => setTimeout(resolve, 100))

  const poseidon = await getPoseidon()

  // Yield again
  await new Promise(resolve => setTimeout(resolve, 50))

  const babyjub = await getBabyjub()

  // Derive actual public key
  const pubKey = babyjub.mulPointEscalar(babyjub.Base8, keyPair.sk)
  const pkX = babyjub.F.toObject(pubKey[0])
  const pkY = babyjub.F.toObject(pubKey[1])

  // Compute actual note hash
  const noteHash = poseidonHashSync(poseidon, [pkX, pkY, note.noteValue, note.tokenType, note.noteSalt])

  // Find voter's index in registered voters list
  const voterIndex = findVoterIndex(registeredVoters, noteHash)
  if (voterIndex === -1) {
    throw new Error('You are not registered as a voter. Please register first.')
  }

  // Generate merkle proof for this voter
  const { path: actualPath, root: actualMerkleRoot } = await generateMerkleProofAsync(registeredVoters, voterIndex)

  // Verify merkle root matches proposal
  if (actualMerkleRoot !== merkleRoot) {
    throw new Error('Merkle root mismatch - voter registry has changed since proposal creation')
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
    merkleIndex: voterIndex,
  }

  onProgress?.({
    stage: 'generating-proof',
    progress: 50,
    message: 'Loading snarkjs...'
  })

  try {
    // Dynamic import snarkjs
    const snarkjs = await import('snarkjs')

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { proof, publicSignals } = await Promise.race([proofPromise, timeoutPromise]) as { proof: any; publicSignals: string[] }

    // Verify nullifier from proof matches our computed nullifier
    // Public signals order (snarkjs): outputs first, then inputs
    // [nullifier, voteCommitment, proposalId, votingPower, merkleRoot]
    const proofNullifier = BigInt(publicSignals[0])
    if (proofNullifier !== nullifier) {
      throw new Error('Nullifier mismatch between local computation and circuit')
    }

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
    const message = error instanceof Error ? error.message : String(error)
    onProgress?.({
      stage: 'finalizing',
      progress: 0,
      message: 'Proof generation failed: ' + message
    })

    // Re-throw the error so the UI can handle it properly
    throw new Error('ZK proof generation failed: ' + message)
  }
}

// ============ Storage Operations ============

/**
 * Store vote data for reveal phase
 */
export function storeVoteForReveal(proposalId: bigint, voteData: VoteData, walletAddress?: string): void {
  // Include contract address AND wallet address in key to avoid conflicts
  const walletPart = walletAddress ? `-${walletAddress.toLowerCase()}` : ''
  const key = `zk-vote-reveal-${CONTRACT_ADDRESS}${walletPart}-${proposalId.toString()}`
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
export function getVoteForReveal(proposalId: bigint, walletAddress?: string): { choice: bigint; voteSalt: bigint; nullifier: bigint; commitment?: bigint; votingPower?: bigint } | null {
  // Include contract address AND wallet address in key to avoid conflicts
  const walletPart = walletAddress ? `-${walletAddress.toLowerCase()}` : ''
  const key = `zk-vote-reveal-${CONTRACT_ADDRESS}${walletPart}-${proposalId.toString()}`
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
  // Clear all zk-vote related keys (including wallet-specific ones)
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('zk-vote-')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
}

// ============ D2 Quadratic Voting ZK Proof Generation ============

/**
 * D2 Vote Data Interface
 */
export interface D2VoteData {
  choice: VoteChoice
  numVotes: bigint
  creditsSpent: bigint  // = numVotes^2
  voteSalt: bigint
  proposalId: bigint
  commitment: bigint
  nullifier: bigint
  txHash?: string       // Transaction hash (for Etherscan link)
}

/**
 * D2 Credit Note Interface
 */
export interface CreditNote {
  creditNoteHash: bigint
  totalCredits: bigint
  creditSalt: bigint
  pkX: bigint
  pkY: bigint
}

/**
 * Create a credit note for D2 voting
 * creditNoteHash = hash(pkX, pkY, totalCredits, creditSalt)
 */
export async function createCreditNoteAsync(keyPair: KeyPair, totalCredits: bigint, walletAddress?: string): Promise<CreditNote> {
  const creditSalt = randomFieldElement()
  const creditNoteHash = await poseidonHash([keyPair.pkX, keyPair.pkY, totalCredits, creditSalt])

  const note: CreditNote = {
    creditNoteHash,
    totalCredits,
    creditSalt,
    pkX: keyPair.pkX,
    pkY: keyPair.pkY,
  }

  // Store credit note
  const storageKey = `zk-credit-note-${walletAddress?.toLowerCase() || 'default'}`
  localStorage.setItem(storageKey, JSON.stringify({
    creditNoteHash: creditNoteHash.toString(),
    totalCredits: totalCredits.toString(),
    creditSalt: creditSalt.toString(),
    pkX: keyPair.pkX.toString(),
    pkY: keyPair.pkY.toString(),
  }))

  return note
}

/**
 * Get stored credit note
 */
export function getStoredCreditNote(walletAddress?: string): CreditNote | null {
  const storageKey = `zk-credit-note-${walletAddress?.toLowerCase() || 'default'}`
  const stored = localStorage.getItem(storageKey)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored)
    return {
      creditNoteHash: BigInt(parsed.creditNoteHash),
      totalCredits: BigInt(parsed.totalCredits),
      creditSalt: BigInt(parsed.creditSalt),
      pkX: BigInt(parsed.pkX),
      pkY: BigInt(parsed.pkY),
    }
  } catch {
    return null
  }
}

/**
 * Compute D2 vote commitment: hash(hash(choice, numVotes, creditsSpent, proposalId), voteSalt, 0, 0)
 * Two-stage hash to match contract's PoseidonT5 (4 inputs)
 */
export async function computeD2CommitmentAsync(
  choice: VoteChoice,
  numVotes: bigint,
  creditsSpent: bigint,
  proposalId: bigint,
  voteSalt: bigint
): Promise<bigint> {
  const inner = await poseidonHash([choice, numVotes, creditsSpent, proposalId])
  return poseidonHash([inner, voteSalt, 0n, 0n])
}

/**
 * Prepare D2 vote data
 */
export async function prepareD2VoteAsync(
  keyPair: KeyPair,
  choice: VoteChoice,
  numVotes: bigint,
  proposalId: bigint
): Promise<D2VoteData> {
  const creditsSpent = numVotes * numVotes  // Quadratic cost!
  const voteSalt = randomFieldElement()
  const commitment = await computeD2CommitmentAsync(choice, numVotes, creditsSpent, proposalId, voteSalt)
  const nullifier = await computeNullifierAsync(keyPair.sk, proposalId)

  return {
    choice,
    numVotes,
    creditsSpent,
    voteSalt,
    proposalId,
    commitment,
    nullifier,
  }
}

/**
 * Generate ZK proof for D2 Quadratic Voting
 *
 * Circuit public inputs: [voteCommitment, proposalId, creditsSpent, creditRoot]
 * Circuit output: nullifier
 */
export async function generateQuadraticProof(
  keyPair: KeyPair,
  creditNote: CreditNote,
  voteData: D2VoteData,
  creditRoot: bigint,
  registeredCreditNotes: bigint[],
  onProgress?: (progress: ProofGenerationProgress) => void
): Promise<{ proof: ZKProof; publicSignals: bigint[]; nullifier: bigint; commitment: bigint }> {
  onProgress?.({
    stage: 'preparing',
    progress: 10,
    message: 'Preparing D2 circuit inputs...'
  })

  await new Promise(resolve => setTimeout(resolve, 100))

  const poseidon = await getPoseidon()
  const babyjub = await getBabyjub()

  // Derive actual public key
  const pubKey = babyjub.mulPointEscalar(babyjub.Base8, keyPair.sk)
  const pkX = babyjub.F.toObject(pubKey[0])
  const pkY = babyjub.F.toObject(pubKey[1])

  // Compute actual credit note hash
  const creditNoteHash = poseidonHashSync(poseidon, [pkX, pkY, creditNote.totalCredits, creditNote.creditSalt])

  // Find index in registered credit notes
  const noteIndex = findVoterIndex(registeredCreditNotes, creditNoteHash)
  if (noteIndex === -1) {
    throw new Error('Your credit note is not registered. Please register first.')
  }

  // Generate merkle proof
  const { path: merklePath, root: actualCreditRoot } = await generateMerkleProofAsync(registeredCreditNotes, noteIndex)

  if (actualCreditRoot !== creditRoot) {
    // Check if the proposal's creditRoot looks like a timestamp (old bug)
    if (creditRoot < BigInt(10000000000000)) {
      throw new Error('This proposal was created with an old version and cannot be voted on. Please create a new proposal.')
    }
    throw new Error('Voter list has changed. Please create a new proposal.')
  }

  // Compute commitment and nullifier (two-stage hash to match contract)
  const inner = poseidonHashSync(poseidon, [
    voteData.choice,
    voteData.numVotes,
    voteData.creditsSpent,
    voteData.proposalId
  ])
  const commitment = poseidonHashSync(poseidon, [inner, voteData.voteSalt, 0n, 0n])
  const nullifier = poseidonHashSync(poseidon, [keyPair.sk, voteData.proposalId])

  onProgress?.({
    stage: 'computing-witness',
    progress: 30,
    message: 'Computing D2 witness...'
  })

  // Prepare circuit inputs for D2
  const circuitInputs = {
    // Public inputs
    voteCommitment: commitment.toString(),
    proposalId: voteData.proposalId.toString(),
    creditsSpent: voteData.creditsSpent.toString(),
    creditRoot: actualCreditRoot.toString(),

    // Private inputs
    sk: keyPair.sk.toString(),
    pkX: pkX.toString(),
    pkY: pkY.toString(),
    totalCredits: creditNote.totalCredits.toString(),
    numVotes: voteData.numVotes.toString(),
    choice: voteData.choice.toString(),
    voteSalt: voteData.voteSalt.toString(),
    creditNoteHash: creditNoteHash.toString(),
    creditSalt: creditNote.creditSalt.toString(),
    merklePath: merklePath.map(p => p.toString()),
    merkleIndex: noteIndex.toString(),
  }

  onProgress?.({
    stage: 'generating-proof',
    progress: 50,
    message: 'Loading D2 circuit files...'
  })

  try {
    // D2 circuit files
    const wasmUrl = '/circuits/D2_QuadraticVoting.wasm'
    const zkeyUrl = '/circuits/D2_QuadraticVoting_final.zkey'

    // Use Web Worker for proof generation (prevents UI freeze)
    const { proof, publicSignals, duration } = await generateProofWithFallback(
      circuitInputs as Record<string, string | string[]>,
      wasmUrl,
      zkeyUrl,
      (progress, message) => {
        onProgress?.({
          stage: 'generating-proof',
          progress: 50 + Math.floor(progress * 0.4),
          message
        })
      }
    )

    // Verify nullifier
    const proofNullifier = BigInt(publicSignals[0])
    if (proofNullifier !== nullifier) {
      throw new Error('Nullifier mismatch in D2 proof')
    }

    onProgress?.({
      stage: 'finalizing',
      progress: 90,
      message: 'Finalizing D2 proof...'
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
      message: 'D2 Proof generated!'
    })

    return {
      proof: zkProof,
      publicSignals: publicSignals.map((s: string) => BigInt(s)),
      nullifier,
      commitment
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onProgress?.({
      stage: 'finalizing',
      progress: 0,
      message: 'D2 proof generation failed: ' + message
    })
    throw new Error('D2 ZK proof generation failed: ' + message)
  }
}

/**
 * Store D2 vote data for reveal phase
 */
export function storeD2VoteForReveal(proposalId: bigint, voteData: D2VoteData, walletAddress?: string, txHash?: string): void {
  const walletPart = walletAddress ? `-${walletAddress.toLowerCase()}` : ''
  const key = `zk-d2-vote-reveal${walletPart}-${proposalId.toString()}`
  localStorage.setItem(key, JSON.stringify({
    choice: voteData.choice.toString(),
    numVotes: voteData.numVotes.toString(),
    creditsSpent: voteData.creditsSpent.toString(),
    voteSalt: voteData.voteSalt.toString(),
    nullifier: voteData.nullifier.toString(),
    commitment: voteData.commitment.toString(),
    txHash: txHash || voteData.txHash,
  }))
}

/**
 * Get stored D2 vote data for reveal
 */
export function getD2VoteForReveal(proposalId: bigint, walletAddress?: string): D2VoteData | null {
  const walletPart = walletAddress ? `-${walletAddress.toLowerCase()}` : ''
  const key = `zk-d2-vote-reveal${walletPart}-${proposalId.toString()}`
  const stored = localStorage.getItem(key)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored)
    return {
      choice: BigInt(parsed.choice) as VoteChoice,
      numVotes: BigInt(parsed.numVotes),
      creditsSpent: BigInt(parsed.creditsSpent),
      voteSalt: BigInt(parsed.voteSalt),
      proposalId,
      nullifier: BigInt(parsed.nullifier),
      commitment: BigInt(parsed.commitment),
      txHash: parsed.txHash,
    }
  } catch {
    return null
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
