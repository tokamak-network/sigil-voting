/**
 * KeyManager — EdDSA keypair management for MACI
 *
 * Handles keypair creation, storage, retrieval, state index tracking,
 * and MACI nonce management. Works with any SigilStorage backend.
 */

import type { SigilStorage } from './storage.js';
import type { StorageKeys } from './storageKeys.js';
import { derivePrivateKey, generateRandomPrivateKey } from './crypto/blake512.js';
import { eddsaDerivePublicKey } from './crypto/eddsa.js';

export interface MaciKeypair {
  sk: bigint;
  pubKey: [bigint, bigint];
}

export class KeyManager {
  private storage: SigilStorage;
  private keys: StorageKeys;

  constructor(storage: SigilStorage, keys: StorageKeys) {
    this.storage = storage;
    this.keys = keys;
  }

  /**
   * Get or create a MACI keypair for the given address+poll.
   * Priority: poll-specific > global > derive from signature bytes.
   */
  async getOrCreateKeypair(
    address: string,
    pollId: number,
    signatureBytes?: Uint8Array,
  ): Promise<MaciKeypair> {
    // Try poll-specific key first
    const pollSkStr = this.storage.getItem(this.keys.skPoll(address, pollId));
    if (pollSkStr) {
      const sk = BigInt(pollSkStr);
      const pubKey = await this.loadOrDerivePubKey(address, pollId, sk);
      return { sk, pubKey };
    }

    // Try global key
    const globalSkStr = this.storage.getItem(this.keys.sk(address));
    if (globalSkStr) {
      const sk = BigInt(globalSkStr);
      const pubKey = await this.loadOrDeriveGlobalPubKey(address, sk);
      return { sk, pubKey };
    }

    // Derive from signature or generate random
    let sk: bigint;
    if (signatureBytes && signatureBytes.length > 0) {
      sk = derivePrivateKey(signatureBytes);
    } else {
      sk = generateRandomPrivateKey();
    }
    const pubKey = await eddsaDerivePublicKey(sk);

    // Store globally
    this.storage.setItem(this.keys.sk(address), sk.toString());
    this.storage.setItem(
      this.keys.pk(address),
      JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]),
    );

    return { sk, pubKey };
  }

  /**
   * Generate a new random keypair and store as poll-specific.
   * Used for key changes (MACI anti-collusion).
   */
  async generateNewKeypair(address: string, pollId: number): Promise<MaciKeypair> {
    const sk = generateRandomPrivateKey();
    const pubKey = await eddsaDerivePublicKey(sk);

    this.storeKeypair(address, pollId, sk, pubKey);
    return { sk, pubKey };
  }

  /**
   * Store a keypair for a specific poll.
   */
  storeKeypair(address: string, pollId: number, sk: bigint, pubKey: [bigint, bigint]): void {
    this.storage.setItem(this.keys.skPoll(address, pollId), sk.toString());
    this.storage.setItem(
      this.keys.pubkey(address, pollId),
      JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]),
    );
  }

  /**
   * Load a keypair for a specific poll. Returns null if not found.
   */
  async loadKeypair(address: string, pollId: number): Promise<MaciKeypair | null> {
    const skStr = this.storage.getItem(this.keys.skPoll(address, pollId));
    if (!skStr) {
      const globalStr = this.storage.getItem(this.keys.sk(address));
      if (!globalStr) return null;
      const sk = BigInt(globalStr);
      const pubKey = await this.loadOrDeriveGlobalPubKey(address, sk);
      return { sk, pubKey };
    }
    const sk = BigInt(skStr);
    const pubKey = await this.loadOrDerivePubKey(address, pollId, sk);
    return { sk, pubKey };
  }

  /**
   * Get state index for address (global > poll-specific > default 1).
   */
  getStateIndex(address: string, pollId: number): number {
    const globalVal = this.storage.getItem(this.keys.stateIndex(address));
    if (globalVal) return parseInt(globalVal, 10);
    const pollVal = this.storage.getItem(this.keys.stateIndexPoll(address, pollId));
    if (pollVal) return parseInt(pollVal, 10);
    return 1;
  }

  /**
   * Save state index for address.
   */
  saveStateIndex(address: string, stateIndex: number): void {
    this.storage.setItem(this.keys.stateIndex(address), String(stateIndex));
  }

  /**
   * Get the current MACI nonce (votes + key changes share a single counter).
   */
  getNonce(address: string, pollId: number): number {
    const key = this.keys.nonce(address, pollId);
    return parseInt(this.storage.getItem(key) || '1', 10);
  }

  /**
   * Increment the MACI nonce after a successful message submission.
   */
  incrementNonce(address: string, pollId: number): void {
    const key = this.keys.nonce(address, pollId);
    const current = this.getNonce(address, pollId);
    this.storage.setItem(key, String(current + 1));
  }

  /**
   * Check if user has been registered (signed up).
   */
  isSignedUp(address: string): boolean {
    return this.storage.getItem(this.keys.signup(address)) !== null;
  }

  /**
   * Mark user as registered.
   */
  markSignedUp(address: string, stateIndex: number): void {
    this.storage.setItem(this.keys.signup(address), String(stateIndex));
    this.saveStateIndex(address, stateIndex);
  }

  private async loadOrDerivePubKey(
    address: string,
    pollId: number,
    sk: bigint,
  ): Promise<[bigint, bigint]> {
    const stored = this.storage.getItem(this.keys.pubkey(address, pollId));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return [BigInt(parsed[0]), BigInt(parsed[1])];
      } catch {
        this.storage.removeItem(this.keys.pubkey(address, pollId));
      }
    }
    const pubKey = await eddsaDerivePublicKey(sk);
    this.storage.setItem(
      this.keys.pubkey(address, pollId),
      JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]),
    );
    return pubKey;
  }

  private async loadOrDeriveGlobalPubKey(
    address: string,
    sk: bigint,
  ): Promise<[bigint, bigint]> {
    const stored = this.storage.getItem(this.keys.pk(address));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return [BigInt(parsed[0]), BigInt(parsed[1])];
      } catch {
        this.storage.removeItem(this.keys.pk(address));
      }
    }
    const pubKey = await eddsaDerivePublicKey(sk);
    this.storage.setItem(
      this.keys.pk(address),
      JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]),
    );
    return pubKey;
  }
}
