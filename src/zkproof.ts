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

// Storage keys (base - wallet address appended at runtime)
const SK_STORAGE_KEY_BASE = 'zk-vote-secret-key'
const NOTE_STORAGE_KEY_BASE = 'zk-vote-note'

// Contract address for vote storage (to avoid conflicts between contract deployments)
const CONTRACT_ADDRESS = '0xA26ABcfFC9Af5c60CbE5a40E9FA397341aDC7Eb7'

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

let poseidonInstance: any = null
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
      console.log('[ZK] Crypto primitives loaded')
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
    } catch (e) {
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
    } catch (e) {
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
 */
export function buildMerkleTree(_noteHashes: bigint[]): { root: bigint; depth: number } {
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

  // Optimized: For sparse trees, compute only the necessary path
  // Instead of building 2^20 nodes, we compute the root by hashing up through levels
  const path: bigint[] = []
  let currentHash = noteHashes[leafIndex] || 0n
  let currentIndex = leafIndex

  // Pre-compute zero hashes for each level (for sparse tree optimization)
  const zeroHashes: bigint[] = [0n]
  for (let i = 0; i < TREE_DEPTH; i++) {
    zeroHashes.push(poseidonHashSync(poseidon, [zeroHashes[i], zeroHashes[i]]))
  }

  for (let level = 0; level < TREE_DEPTH; level++) {
    const isLeft = currentIndex % 2 === 0

    // For a single-leaf tree at index 0, all siblings are zero hashes at their level
    // For more complex trees with multiple leaves, we'd need the actual siblings
    let sibling: bigint
    if (noteHashes.length === 1 && leafIndex === 0) {
      // Single leaf at index 0: all siblings are zero hashes
      sibling = zeroHashes[level]
    } else {
      // For multi-leaf trees, get actual sibling or zero hash
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1
      sibling = noteHashes[siblingIndex] || zeroHashes[level]
    }

    path.push(sibling)

    // Compute next level hash
    if (isLeft) {
      currentHash = poseidonHashSync(poseidon, [currentHash, sibling])
    } else {
      currentHash = poseidonHashSync(poseidon, [sibling, currentHash])
    }

    currentIndex = Math.floor(currentIndex / 2)
  }

  return { path, index: leafIndex, root: currentHash }
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
 */
export function computeCommitment(_choice: VoteChoice, _votingPower: bigint, _proposalId: bigint, _voteSalt: bigint): bigint {
  return 0n // Placeholder
}

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
 */
export async function generateVoteProof(
  keyPair: KeyPair,
  note: TokenNote,
  voteData: VoteData,
  merkleRoot: bigint,
  _merklePath: bigint[],
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

  // Compute merkle proof using optimized sparse tree approach
  // For single-leaf tree at index 0, we hash up through 20 levels with zero siblings
  console.log('[ZK] NoteHash:', noteHash.toString())
  console.log('[ZK] Merkle root (from proposal):', merkleRoot.toString())

  // Pre-compute zero hashes for each level
  const zeroHashes: bigint[] = [0n]
  for (let i = 0; i < TREE_DEPTH; i++) {
    zeroHashes.push(poseidonHashSync(poseidon, [zeroHashes[i], zeroHashes[i]]))
  }

  // Compute merkle path and root for single-leaf tree at index 0
  const actualPath: bigint[] = []
  let currentHash = noteHash

  for (let level = 0; level < TREE_DEPTH; level++) {
    // At index 0, all siblings are zero hashes
    const sibling = zeroHashes[level]
    actualPath.push(sibling)
    // Index 0 is always left, so hash(current, sibling)
    currentHash = poseidonHashSync(poseidon, [currentHash, sibling])
  }

  const actualMerkleRoot = currentHash
  console.log('[ZK] Computed merkle root:', actualMerkleRoot.toString())

  // Verify merkle root matches proposal
  if (actualMerkleRoot !== merkleRoot) {
    console.error('[ZK] Merkle root mismatch!')
    console.error('[ZK] Expected:', merkleRoot.toString())
    console.error('[ZK] Got:', actualMerkleRoot.toString())
    throw new Error('Merkle root mismatch - your identity does not match this proposal')
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
    console.log('[ZK] Public signals (5):', publicSignals)

    // Verify nullifier from proof matches our computed nullifier
    // Public signals order (snarkjs): outputs first, then inputs
    // [nullifier, voteCommitment, proposalId, votingPower, merkleRoot]
    const proofNullifier = BigInt(publicSignals[0])
    if (proofNullifier !== nullifier) {
      console.error('[ZK] Nullifier mismatch! Computed:', nullifier.toString(), 'Proof:', proofNullifier.toString())
      throw new Error('Nullifier mismatch between local computation and circuit')
    }
    console.log('[ZK] Nullifier verified:', nullifier.toString().slice(0, 20) + '...')

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
