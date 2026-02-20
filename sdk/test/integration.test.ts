/**
 * SDK Integration Tests
 *
 * Tests the full pipeline: key derivation → command packing → signing → encryption → decryption → verification
 * Uses mock provider (no on-chain calls).
 */

import { describe, it, expect } from 'vitest';
import { MemoryStorage } from '../src/storage.js';
import { createStorageKeys } from '../src/storageKeys.js';
import { KeyManager } from '../src/keyManager.js';
import { buildEncryptedVoteMessage, buildEncryptedKeyChangeMessage } from '../src/message.js';
import { unpackCommand, computeCommandHash } from '../src/command.js';
import { derivePrivateKey, generateRandomPrivateKey } from '../src/crypto/blake512.js';
import { eddsaDerivePublicKey, eddsaVerify } from '../src/crypto/eddsa.js';
import { generateECDHSharedKey, derivePublicKey } from '../src/crypto/ecdh.js';
import { poseidonDecrypt } from '../src/crypto/duplexSponge.js';

const MACI_ADDR = '0xABCDEF1234567890';

describe('SDK Integration: signUp → vote → verify', () => {
  it('should complete full signUp + vote flow with mock', async () => {
    // Setup
    const storage = new MemoryStorage();
    const keys = createStorageKeys(MACI_ADDR);
    const km = new KeyManager(storage, keys);
    const address = '0xVoter1';

    // Coordinator setup
    const coordSeed = new Uint8Array(32); coordSeed.fill(0x99);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await derivePublicKey(coordSk);

    // 1. SignUp: derive key from wallet signature
    const fakeSignature = new Uint8Array(65); fakeSignature.fill(0xab);
    const kp = await km.getOrCreateKeypair(address, 0, fakeSignature);
    km.markSignedUp(address, 1);

    expect(km.isSignedUp(address)).toBe(true);
    expect(km.getStateIndex(address, 0)).toBe(1);
    expect(kp.sk).toBeGreaterThan(0n);

    // 2. Vote: build encrypted message
    const stateIndex = BigInt(km.getStateIndex(address, 0));
    const nonce = BigInt(km.getNonce(address, 0));

    const { encMessage, ephemeralPubKey } = await buildEncryptedVoteMessage({
      stateIndex,
      voteOptionIndex: 1n, // for
      newVoteWeight: 2n,   // 2 votes = 4 credits
      nonce,
      pollId: 0n,
      voterSk: kp.sk,
      voterPubKey: kp.pubKey,
      coordinatorPubKey: coordPubKey,
    });

    // Simulate on-chain submission success
    km.incrementNonce(address, 0);
    expect(km.getNonce(address, 0)).toBe(2);

    // 3. Coordinator decrypts and verifies
    const sharedKey = await generateECDHSharedKey(coordSk, ephemeralPubKey);
    const plaintext = await poseidonDecrypt(encMessage, sharedKey, 0n, 7);

    const cmd = unpackCommand(plaintext[0]);
    expect(cmd.stateIndex).toBe(1n);
    expect(cmd.voteOptionIndex).toBe(1n);
    expect(cmd.newVoteWeight).toBe(2n);

    // Verify signature
    const voterEddsaPk = await eddsaDerivePublicKey(kp.sk);
    const salt = plaintext[3];
    const sig = { R8: [plaintext[4], plaintext[5]] as [bigint, bigint], S: plaintext[6] };
    const cmdHash = await computeCommandHash(stateIndex, kp.pubKey[0], kp.pubKey[1], 2n, salt);
    const valid = await eddsaVerify(cmdHash, sig, voterEddsaPk);
    expect(valid).toBe(true);
  });

  it('should complete key change + re-vote flow', async () => {
    const storage = new MemoryStorage();
    const keys = createStorageKeys(MACI_ADDR);
    const km = new KeyManager(storage, keys);
    const address = '0xVoter2';

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x88);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await derivePublicKey(coordSk);

    // Initial signup
    const fakeSignature = new Uint8Array(65); fakeSignature.fill(0xcd);
    const kp = await km.getOrCreateKeypair(address, 0, fakeSignature);
    km.markSignedUp(address, 2);

    // First vote
    km.incrementNonce(address, 0); // nonce 1 → 2

    // Key change (re-vote preparation)
    const newKp = await km.generateNewKeypair(address, 0);

    const kcResult = await buildEncryptedKeyChangeMessage({
      stateIndex: 2n,
      nonce: BigInt(km.getNonce(address, 0)),
      pollId: 0n,
      currentSk: kp.sk,
      newPubKey: newKp.pubKey,
      coordinatorPubKey: coordPubKey,
    });

    expect(kcResult.encMessage).toHaveLength(10);
    km.incrementNonce(address, 0); // nonce 2 → 3

    // Re-vote with new key
    const voteResult = await buildEncryptedVoteMessage({
      stateIndex: 2n,
      voteOptionIndex: 0n, // against
      newVoteWeight: 1n,
      nonce: BigInt(km.getNonce(address, 0)),
      pollId: 0n,
      voterSk: newKp.sk,
      voterPubKey: newKp.pubKey,
      coordinatorPubKey: coordPubKey,
    });

    // Coordinator verifies re-vote
    const sharedKey = await generateECDHSharedKey(coordSk, voteResult.ephemeralPubKey);
    const plaintext = await poseidonDecrypt(voteResult.encMessage, sharedKey, 0n, 7);

    const cmd = unpackCommand(plaintext[0]);
    expect(cmd.voteOptionIndex).toBe(0n); // against
    expect(cmd.newVoteWeight).toBe(1n);
    expect(cmd.nonce).toBe(3n);
  });

  it('should handle multiple voters independently', async () => {
    const storage = new MemoryStorage();
    const keys = createStorageKeys(MACI_ADDR);
    const km = new KeyManager(storage, keys);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x77);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await derivePublicKey(coordSk);

    // Voter A
    const sigA = new Uint8Array(65); sigA.fill(0x01);
    const kpA = await km.getOrCreateKeypair('0xA', 0, sigA);
    km.markSignedUp('0xA', 1);

    // Voter B
    const sigB = new Uint8Array(65); sigB.fill(0x02);
    const kpB = await km.getOrCreateKeypair('0xB', 0, sigB);
    km.markSignedUp('0xB', 2);

    // Keys should be different
    expect(kpA.sk).not.toBe(kpB.sk);
    expect(kpA.pubKey[0]).not.toBe(kpB.pubKey[0]);

    // Both should be able to vote
    const voteA = await buildEncryptedVoteMessage({
      stateIndex: 1n, voteOptionIndex: 1n, newVoteWeight: 1n,
      nonce: 1n, pollId: 0n,
      voterSk: kpA.sk, voterPubKey: kpA.pubKey,
      coordinatorPubKey: coordPubKey,
    });

    const voteB = await buildEncryptedVoteMessage({
      stateIndex: 2n, voteOptionIndex: 0n, newVoteWeight: 2n,
      nonce: 1n, pollId: 0n,
      voterSk: kpB.sk, voterPubKey: kpB.pubKey,
      coordinatorPubKey: coordPubKey,
    });

    // Both messages should be valid and different
    expect(voteA.encMessage).toHaveLength(10);
    expect(voteB.encMessage).toHaveLength(10);
    expect(voteA.ephemeralPubKey[0]).not.toBe(voteB.ephemeralPubKey[0]);
  });

  it('should export all types correctly', async () => {
    // Verify that all key exports are accessible
    const sdk = await import('../src/index.js');

    expect(sdk.SigilClient).toBeDefined();
    expect(sdk.MemoryStorage).toBeDefined();
    expect(sdk.BrowserStorage).toBeDefined();
    expect(sdk.KeyManager).toBeDefined();
    expect(sdk.packCommand).toBeDefined();
    expect(sdk.unpackCommand).toBeDefined();
    expect(sdk.buildEncryptedVoteMessage).toBeDefined();
    expect(sdk.buildEncryptedKeyChangeMessage).toBeDefined();
    expect(sdk.generateECDHSharedKey).toBeDefined();
    expect(sdk.poseidonEncrypt).toBeDefined();
    expect(sdk.eddsaSign).toBeDefined();
    expect(sdk.derivePrivateKey).toBeDefined();
    expect(sdk.BABYJUB_SUBORDER).toBeDefined();
    expect(sdk.SNARK_SCALAR_FIELD).toBeDefined();
  });

  it('should handle storageKeys scoped to different MACI addresses', () => {
    const keys1 = createStorageKeys('0xAAAAAAAA');
    const keys2 = createStorageKeys('0xBBBBBBBB');

    const k1 = keys1.sk('0xVoter');
    const k2 = keys2.sk('0xVoter');

    // Different MACI addresses should produce different storage keys
    expect(k1).not.toBe(k2);
  });
});
