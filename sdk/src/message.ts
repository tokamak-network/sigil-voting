/**
 * MACI Encrypted Message Builder
 *
 * Encapsulates the full encryption pipeline:
 *   1. Pack command (bit-packing)
 *   2. Compute command hash (Poseidon)
 *   3. EdDSA sign
 *   4. ECDH shared key derivation
 *   5. DuplexSponge encryption
 *   6. Pad to 10-element array
 */

import { generateEphemeralKeyPair, generateECDHSharedKey, type PubKey } from './crypto/ecdh.js';
import { poseidonEncrypt } from './crypto/duplexSponge.js';
import { eddsaSign, type EdDSASignature } from './crypto/eddsa.js';
import { packCommand, computeCommandHash, generateSalt } from './command.js';

export interface MessageParams {
  /** Voter's state index in MACI state tree */
  stateIndex: bigint;
  /** Vote choice (0=against, 1=for) */
  voteOptionIndex: bigint;
  /** Vote weight (cost = weight²) */
  newVoteWeight: bigint;
  /** MACI nonce (shared counter for votes + key changes) */
  nonce: bigint;
  /** Poll ID */
  pollId: bigint;
  /** Voter's current EdDSA private key */
  voterSk: bigint;
  /** Voter's current EdDSA public key */
  voterPubKey: PubKey;
  /** Coordinator's public key for ECDH encryption */
  coordinatorPubKey: PubKey;
}

export interface KeyChangeMessageParams {
  stateIndex: bigint;
  nonce: bigint;
  pollId: bigint;
  /** Current EdDSA private key (signs the key change) */
  currentSk: bigint;
  /** New EdDSA public key (the key being changed to) */
  newPubKey: PubKey;
  /** Coordinator's public key for ECDH encryption */
  coordinatorPubKey: PubKey;
}

export interface EncryptedMessage {
  /** 10-element encrypted message array for publishMessage */
  encMessage: bigint[];
  /** Ephemeral public key for ECDH */
  ephemeralPubKey: PubKey;
}

/**
 * Build an encrypted vote message ready for Poll.publishMessage().
 */
export async function buildEncryptedVoteMessage(params: MessageParams): Promise<EncryptedMessage> {
  const {
    stateIndex, voteOptionIndex, newVoteWeight,
    nonce, pollId, voterSk, voterPubKey, coordinatorPubKey,
  } = params;

  // 1. Pack command
  const packed = packCommand(stateIndex, voteOptionIndex, newVoteWeight, nonce, pollId);

  // 2. Generate salt
  const salt = generateSalt();

  // 3. Compute command hash
  const cmdHash = await computeCommandHash(
    stateIndex, voterPubKey[0], voterPubKey[1], newVoteWeight, salt,
  );

  // 4. EdDSA sign
  const signature = await eddsaSign(cmdHash, voterSk);

  // 5. ECDH
  const ephemeral = await generateEphemeralKeyPair();
  const sharedKey = await generateECDHSharedKey(ephemeral.sk, coordinatorPubKey);

  // 6. Compose plaintext (7 elements)
  const plaintext = [
    packed,
    voterPubKey[0],
    voterPubKey[1],
    salt,
    signature.R8[0],
    signature.R8[1],
    signature.S,
  ];

  // 7. Encrypt
  const ciphertext = await poseidonEncrypt(plaintext, sharedKey, 0n);

  // 8. Pad to 10 elements
  const encMessage = padTo10(ciphertext);

  return { encMessage, ephemeralPubKey: ephemeral.pubKey };
}

/**
 * Build an encrypted key change message for MACI anti-collusion.
 * Key change: voteOption=0, weight=0.
 */
export async function buildEncryptedKeyChangeMessage(params: KeyChangeMessageParams): Promise<EncryptedMessage> {
  const { stateIndex, nonce, pollId, currentSk, newPubKey, coordinatorPubKey } = params;

  // Pack command (key change: option=0, weight=0)
  const packed = packCommand(stateIndex, 0n, 0n, nonce, pollId);

  const salt = generateSalt();

  // cmdHash: Poseidon(stateIndex, newPubKeyX, newPubKeyY, weight=0, salt)
  const cmdHash = await computeCommandHash(stateIndex, newPubKey[0], newPubKey[1], 0n, salt);

  // Sign with current key
  const signature = await eddsaSign(cmdHash, currentSk);

  // ECDH
  const ephemeral = await generateEphemeralKeyPair();
  const sharedKey = await generateECDHSharedKey(ephemeral.sk, coordinatorPubKey);

  const plaintext = [
    packed,
    newPubKey[0],
    newPubKey[1],
    salt,
    signature.R8[0],
    signature.R8[1],
    signature.S,
  ];

  const ciphertext = await poseidonEncrypt(plaintext, sharedKey, 0n);
  const encMessage = padTo10(ciphertext);

  return { encMessage, ephemeralPubKey: ephemeral.pubKey };
}

/**
 * Pad ciphertext array to exactly 10 elements.
 */
function padTo10(ciphertext: bigint[]): bigint[] {
  const result = new Array(10).fill(0n) as bigint[];
  for (let i = 0; i < Math.min(ciphertext.length, 10); i++) {
    result[i] = ciphertext[i];
  }
  return result;
}

/**
 * Verify a signature matches expected parameters (for testing).
 */
export { type EdDSASignature };
