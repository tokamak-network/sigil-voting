/**
 * MACI Command Packing
 *
 * Binary bit-packing of vote commands for MACI circuit processing.
 *
 * Layout (250 bits total):
 *   [0:49]    stateIndex (50 bits)
 *   [50:99]   voteOptionIndex (50 bits)
 *   [100:149] newVoteWeight (50 bits)
 *   [150:199] nonce (50 bits)
 *   [200:249] pollId (50 bits)
 */

// @ts-expect-error - circomlibjs doesn't have types
import { buildPoseidon } from 'circomlibjs'

export const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Pack vote command fields into a single bigint using bit-packing.
 */
export function packCommand(
  stateIndex: bigint,
  voteOptionIndex: bigint,
  newVoteWeight: bigint,
  nonce: bigint,
  pollId: bigint,
): bigint {
  return (
    stateIndex |
    (voteOptionIndex << 50n) |
    (newVoteWeight << 100n) |
    (nonce << 150n) |
    (pollId << 200n)
  );
}

/**
 * Unpack a packed command back to individual fields.
 */
export function unpackCommand(packed: bigint): {
  stateIndex: bigint;
  voteOptionIndex: bigint;
  newVoteWeight: bigint;
  nonce: bigint;
  pollId: bigint;
} {
  const mask50 = (1n << 50n) - 1n;
  return {
    stateIndex: packed & mask50,
    voteOptionIndex: (packed >> 50n) & mask50,
    newVoteWeight: (packed >> 100n) & mask50,
    nonce: (packed >> 150n) & mask50,
    pollId: (packed >> 200n) & mask50,
  };
}

/**
 * Compute the command hash for EdDSA signing.
 * cmdHash = Poseidon(stateIndex, newPubKeyX, newPubKeyY, newVoteWeight, salt)
 */
export async function computeCommandHash(
  stateIndex: bigint,
  newPubKeyX: bigint,
  newPubKeyY: bigint,
  newVoteWeight: bigint,
  salt: bigint,
): Promise<bigint> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const hashF = poseidon([
    F.e(stateIndex),
    F.e(newPubKeyX),
    F.e(newPubKeyY),
    F.e(newVoteWeight),
    F.e(salt),
  ]);
  return F.toObject(hashF);
}

/**
 * Generate a cryptographically secure random salt in the SNARK field.
 * Uses 31 bytes (248 bits) to stay safely within the ~254-bit field.
 */
export function generateSalt(): bigint {
  const saltBytes = crypto.getRandomValues(new Uint8Array(31));
  const hex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return BigInt('0x' + hex) % SNARK_SCALAR_FIELD;
}
