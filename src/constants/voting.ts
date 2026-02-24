/**
 * Shared constants for the MACI voting protocol.
 * Centralizes magic numbers used across components.
 */

/** Transaction receipt wait timeout (ms) */
export const TX_TIMEOUT_MS = 120_000

/** Tally is considered failed after this many seconds post voting-end */
export const FAIL_THRESHOLD_S = 30 * 60

/** SHA-256 output masked to fit SNARK scalar field (< 2^253) */
export const SHA256_SCALAR_MASK = (1n << 253n) - 1n

/**
 * Bit-packing offsets for MACI command encoding.
 * Format: stateIndex | voteOption<<50 | weight<<100 | nonce<<150 | pollId<<200
 */
export const CMD_BITS = {
  VOTE_OPTION: 50n,
  WEIGHT: 100n,
  NONCE: 150n,
  POLL_ID: 200n,
} as const
