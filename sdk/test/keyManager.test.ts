/**
 * KeyManager Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage } from '../src/storage.js';
import { createStorageKeys } from '../src/storageKeys.js';
import { KeyManager } from '../src/keyManager.js';
import { BABYJUB_SUBORDER } from '../src/crypto/ecdh.js';
import { derivePrivateKey } from '../src/crypto/blake512.js';
import { eddsaDerivePublicKey } from '../src/crypto/eddsa.js';

const FAKE_MACI = '0x1234567890abcdef';
const FAKE_ADDR = '0xdeadbeefdeadbeef';

describe('KeyManager', () => {
  let storage: MemoryStorage;
  let km: KeyManager;

  beforeEach(() => {
    storage = new MemoryStorage();
    const keys = createStorageKeys(FAKE_MACI);
    km = new KeyManager(storage, keys);
  });

  it('should create keypair from signature bytes', async () => {
    const sigBytes = new Uint8Array(65);
    sigBytes.fill(0xab);
    const kp = await km.getOrCreateKeypair(FAKE_ADDR, 0, sigBytes);

    expect(kp.sk).toBeGreaterThan(0n);
    expect(kp.sk).toBeLessThan(BABYJUB_SUBORDER);
    expect(kp.pubKey[0]).toBeGreaterThan(0n);
    expect(kp.pubKey[1]).toBeGreaterThan(0n);
  });

  it('should return same keypair on subsequent calls', async () => {
    const sigBytes = new Uint8Array(65);
    sigBytes.fill(0xab);
    const kp1 = await km.getOrCreateKeypair(FAKE_ADDR, 0, sigBytes);
    const kp2 = await km.getOrCreateKeypair(FAKE_ADDR, 0);

    expect(kp1.sk).toBe(kp2.sk);
    expect(kp1.pubKey[0]).toBe(kp2.pubKey[0]);
    expect(kp1.pubKey[1]).toBe(kp2.pubKey[1]);
  });

  it('should generate new random keypair', async () => {
    const kp = await km.generateNewKeypair(FAKE_ADDR, 0);
    expect(kp.sk).toBeGreaterThan(0n);
    expect(kp.pubKey[0]).toBeGreaterThan(0n);
  });

  it('should store and load keypair', async () => {
    const seed = new Uint8Array(32);
    seed.fill(0x42);
    const sk = derivePrivateKey(seed);
    const pubKey = await eddsaDerivePublicKey(sk);

    km.storeKeypair(FAKE_ADDR, 0, sk, pubKey);

    const loaded = await km.loadKeypair(FAKE_ADDR, 0);
    expect(loaded).not.toBeNull();
    expect(loaded!.sk).toBe(sk);
    expect(loaded!.pubKey[0]).toBe(pubKey[0]);
    expect(loaded!.pubKey[1]).toBe(pubKey[1]);
  });

  it('should return null when no keypair stored', async () => {
    const loaded = await km.loadKeypair('0xunknown', 99);
    expect(loaded).toBeNull();
  });

  it('should prefer poll-specific key over global', async () => {
    const sigBytes = new Uint8Array(65);
    sigBytes.fill(0xab);
    await km.getOrCreateKeypair(FAKE_ADDR, 0, sigBytes);

    // Now generate poll-specific key
    const pollKp = await km.generateNewKeypair(FAKE_ADDR, 0);

    // getOrCreateKeypair should return poll-specific
    const loaded = await km.getOrCreateKeypair(FAKE_ADDR, 0);
    expect(loaded.sk).toBe(pollKp.sk);
  });

  it('should track nonce starting at 1', () => {
    expect(km.getNonce(FAKE_ADDR, 0)).toBe(1);
  });

  it('should increment nonce', () => {
    km.incrementNonce(FAKE_ADDR, 0);
    expect(km.getNonce(FAKE_ADDR, 0)).toBe(2);
    km.incrementNonce(FAKE_ADDR, 0);
    expect(km.getNonce(FAKE_ADDR, 0)).toBe(3);
  });

  it('should track state index default=1', () => {
    expect(km.getStateIndex(FAKE_ADDR, 0)).toBe(1);
  });

  it('should save and retrieve state index', () => {
    km.saveStateIndex(FAKE_ADDR, 5);
    expect(km.getStateIndex(FAKE_ADDR, 0)).toBe(5);
    expect(km.getStateIndex(FAKE_ADDR, 1)).toBe(5);
  });

  it('should track signup state', () => {
    expect(km.isSignedUp(FAKE_ADDR)).toBe(false);
    km.markSignedUp(FAKE_ADDR, 3);
    expect(km.isSignedUp(FAKE_ADDR)).toBe(true);
    expect(km.getStateIndex(FAKE_ADDR, 0)).toBe(3);
  });

  it('should isolate nonces per poll', () => {
    km.incrementNonce(FAKE_ADDR, 0);
    expect(km.getNonce(FAKE_ADDR, 0)).toBe(2);
    expect(km.getNonce(FAKE_ADDR, 1)).toBe(1);
  });
});
