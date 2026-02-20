/**
 * sigil-sdk — Private, Fair, Collusion-Resistant Governance
 *
 * Integrate SIGIL voting into any DAO in 3 lines:
 *
 *   import { SigilClient } from 'sigil-sdk';
 *   const sigil = new SigilClient({ maciAddress, provider, signer });
 *   await sigil.vote(pollId, 'for', 3); // 3 votes = 9 credits (quadratic)
 *
 * Features:
 *   - Private voting (ZK — votes never revealed)
 *   - Anti-collusion (MACI key change — bribery is useless)
 *   - Quadratic voting (fair — cost = votes²)
 *   - On-chain verified (Groth16 ZK-SNARK proofs)
 */

// Main client
export { SigilClient, type SigilConfig } from './client.js';

// Types
export {
  type Poll, type PollStatus, type PollResults, type VoteChoice,
  type VoteReceipt, type KeyPair, type SigilEvent,
  type SignUpResult, type VoteOptions, type KeyChangeResult,
} from './types.js';

// Storage
export {
  type SigilStorage, MemoryStorage, BrowserStorage, createDefaultStorage,
} from './storage.js';

// Key management
export { KeyManager, type MaciKeypair } from './keyManager.js';
export { createStorageKeys, type StorageKeys } from './storageKeys.js';

// Command packing
export {
  packCommand, unpackCommand, computeCommandHash, generateSalt,
  SNARK_SCALAR_FIELD,
} from './command.js';

// Message encryption
export {
  buildEncryptedVoteMessage, buildEncryptedKeyChangeMessage,
  type MessageParams, type KeyChangeMessageParams, type EncryptedMessage,
} from './message.js';

// Crypto primitives
export {
  generateECDHSharedKey, generateEphemeralKeyPair, derivePublicKey,
  BABYJUB_SUBORDER, type PubKey,
} from './crypto/ecdh.js';
export { poseidonEncrypt, poseidonDecrypt } from './crypto/duplexSponge.js';
export {
  eddsaSign, eddsaVerify, eddsaDerivePublicKey, type EdDSASignature,
} from './crypto/eddsa.js';
export {
  derivePrivateKey, generateRandomPrivateKey, derivePrivateKeyFromSignature,
} from './crypto/blake512.js';
