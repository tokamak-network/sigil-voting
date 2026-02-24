/**
 * @sigil/sdk — Private, Fair, Collusion-Resistant Governance
 *
 * Integrate SIGIL voting into any DAO in 3 lines:
 *
 *   import { SigilClient } from '@sigil/sdk';
 *   const sigil = new SigilClient({ maciAddress, provider, signer });
 *   await sigil.vote(pollId, 'for', 3); // 3 votes = 9 credits (quadratic)
 *
 * Features:
 *   - Private voting (ZK — votes never revealed)
 *   - Anti-collusion (MACI key change — bribery is useless)
 *   - Quadratic voting (fair — cost = votes^2)
 *   - On-chain verified (Groth16 ZK-SNARK proofs)
 *
 * Entry points:
 *   @sigil/sdk          — Main client + all utilities
 *   @sigil/sdk/widget   — Framework-agnostic embeddable widget (DOM)
 *   @sigil/sdk/react    — React component wrapper for the widget
 *   @sigil/sdk/crypto   — Low-level crypto primitives
 */

// ─── Main Client ────────────────────────────────────────────────────
export { SigilClient, type SigilConfig } from './client.js';

// ─── Types ──────────────────────────────────────────────────────────
export {
  type Poll,
  type PollStatus,
  type PollResults,
  type VoteChoice,
  type VoteReceipt,
  type KeyPair,
  type SigilEvent,
  type SignUpResult,
  type VoteOptions,
  type KeyChangeResult,
  type ExecutionState,
  type ExecutionInfo,
  type DelegationInfo,
  type TallyStatus,
  type ResultsStatus,
} from './types.js';

// ─── Storage ────────────────────────────────────────────────────────
export {
  type SigilStorage,
  MemoryStorage,
  BrowserStorage,
  createDefaultStorage,
} from './storage.js';

// ─── Key Management ─────────────────────────────────────────────────
export { KeyManager, type MaciKeypair } from './keyManager.js';
export { createStorageKeys, type StorageKeys } from './storageKeys.js';

// ─── Command Packing ────────────────────────────────────────────────
export {
  packCommand,
  unpackCommand,
  computeCommandHash,
  generateSalt,
  SNARK_SCALAR_FIELD,
} from './command.js';

// ─── Message Encryption ─────────────────────────────────────────────
export {
  buildEncryptedVoteMessage,
  buildEncryptedKeyChangeMessage,
  type MessageParams,
  type KeyChangeMessageParams,
  type EncryptedMessage,
} from './message.js';

// ─── Crypto Primitives ──────────────────────────────────────────────
export {
  generateECDHSharedKey,
  generateEphemeralKeyPair,
  derivePublicKey,
  BABYJUB_SUBORDER,
  type PubKey,
} from './crypto/ecdh.js';

export {
  poseidonEncrypt,
  poseidonDecrypt,
} from './crypto/duplexSponge.js';

export {
  eddsaSign,
  eddsaVerify,
  eddsaDerivePublicKey,
  type EdDSASignature,
} from './crypto/eddsa.js';

export {
  derivePrivateKey,
  generateRandomPrivateKey,
  derivePrivateKeyFromSignature,
} from './crypto/blake512.js';

// ─── Widget Types (re-exported for convenience) ─────────────────────
// The widget itself is at '@sigil/sdk/widget', but types are useful
// for consumers who configure widgets programmatically.
export {
  type WidgetConfig,
  type WidgetHandle,
} from './widget.js';
