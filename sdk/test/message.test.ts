/**
 * Message Encryption Pipeline Tests
 */

import { describe, it, expect } from 'vitest';
import { buildEncryptedVoteMessage, buildEncryptedKeyChangeMessage } from '../src/message.js';
import { generateEphemeralKeyPair, generateECDHSharedKey } from '../src/crypto/ecdh.js';
import { poseidonDecrypt } from '../src/crypto/duplexSponge.js';
import { eddsaDerivePublicKey, eddsaVerify } from '../src/crypto/eddsa.js';
import { derivePrivateKey } from '../src/crypto/blake512.js';
import { unpackCommand, computeCommandHash } from '../src/command.js';

describe('buildEncryptedVoteMessage', () => {
  it('should produce 10-element encrypted message', async () => {
    const voterSeed = new Uint8Array(32); voterSeed.fill(0x01);
    const voterSk = derivePrivateKey(voterSeed);
    const voterPubKey = await eddsaDerivePublicKey(voterSk);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await (await import('../src/crypto/ecdh.js')).derivePublicKey(coordSk);

    const result = await buildEncryptedVoteMessage({
      stateIndex: 1n,
      voteOptionIndex: 1n,
      newVoteWeight: 3n,
      nonce: 1n,
      pollId: 0n,
      voterSk,
      voterPubKey,
      coordinatorPubKey: coordPubKey,
    });

    expect(result.encMessage).toHaveLength(10);
    expect(result.ephemeralPubKey[0]).toBeGreaterThan(0n);
    expect(result.ephemeralPubKey[1]).toBeGreaterThan(0n);
  });

  it('should be decryptable by coordinator', async () => {
    const voterSeed = new Uint8Array(32); voterSeed.fill(0x01);
    const voterSk = derivePrivateKey(voterSeed);
    const voterPubKey = await eddsaDerivePublicKey(voterSk);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await (await import('../src/crypto/ecdh.js')).derivePublicKey(coordSk);

    const result = await buildEncryptedVoteMessage({
      stateIndex: 1n,
      voteOptionIndex: 1n,
      newVoteWeight: 3n,
      nonce: 1n,
      pollId: 0n,
      voterSk,
      voterPubKey,
      coordinatorPubKey: coordPubKey,
    });

    // Coordinator decrypts
    const sharedKey = await generateECDHSharedKey(coordSk, result.ephemeralPubKey);
    // 7 elements plaintext → padded to 9 → 9 + 1 auth tag = 10
    const plaintext = await poseidonDecrypt(result.encMessage, sharedKey, 0n, 7);

    // Unpack command
    const cmd = unpackCommand(plaintext[0]);
    expect(cmd.stateIndex).toBe(1n);
    expect(cmd.voteOptionIndex).toBe(1n);
    expect(cmd.newVoteWeight).toBe(3n);
    expect(cmd.nonce).toBe(1n);
    expect(cmd.pollId).toBe(0n);
  });

  it('should contain valid EdDSA signature', async () => {
    const voterSeed = new Uint8Array(32); voterSeed.fill(0x01);
    const voterSk = derivePrivateKey(voterSeed);
    const voterPubKey = await eddsaDerivePublicKey(voterSk);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await (await import('../src/crypto/ecdh.js')).derivePublicKey(coordSk);

    const result = await buildEncryptedVoteMessage({
      stateIndex: 1n,
      voteOptionIndex: 1n,
      newVoteWeight: 3n,
      nonce: 1n,
      pollId: 0n,
      voterSk,
      voterPubKey,
      coordinatorPubKey: coordPubKey,
    });

    // Coordinator decrypts
    const sharedKey = await generateECDHSharedKey(coordSk, result.ephemeralPubKey);
    const plaintext = await poseidonDecrypt(result.encMessage, sharedKey, 0n, 7);

    // plaintext[3] = salt, plaintext[4..6] = signature (R8x, R8y, S)
    const salt = plaintext[3];
    const sig = { R8: [plaintext[4], plaintext[5]] as [bigint, bigint], S: plaintext[6] };

    // Recompute command hash
    const cmdHash = await computeCommandHash(1n, voterPubKey[0], voterPubKey[1], 3n, salt);

    // Verify signature
    const valid = await eddsaVerify(cmdHash, sig, voterPubKey);
    expect(valid).toBe(true);
  });

  it('should produce different messages each time (random ephemeral key)', async () => {
    const voterSeed = new Uint8Array(32); voterSeed.fill(0x01);
    const voterSk = derivePrivateKey(voterSeed);
    const voterPubKey = await eddsaDerivePublicKey(voterSk);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await (await import('../src/crypto/ecdh.js')).derivePublicKey(coordSk);

    const params = {
      stateIndex: 1n, voteOptionIndex: 1n, newVoteWeight: 1n,
      nonce: 1n, pollId: 0n, voterSk, voterPubKey, coordinatorPubKey: coordPubKey,
    };

    const r1 = await buildEncryptedVoteMessage(params);
    const r2 = await buildEncryptedVoteMessage(params);

    // Ephemeral keys should differ
    expect(r1.ephemeralPubKey[0]).not.toBe(r2.ephemeralPubKey[0]);
  });
});

describe('buildEncryptedKeyChangeMessage', () => {
  it('should produce valid key change message', async () => {
    const currentSeed = new Uint8Array(32); currentSeed.fill(0x01);
    const currentSk = derivePrivateKey(currentSeed);

    const newSeed = new Uint8Array(32); newSeed.fill(0x03);
    const newSk = derivePrivateKey(newSeed);
    const newPubKey = await eddsaDerivePublicKey(newSk);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await (await import('../src/crypto/ecdh.js')).derivePublicKey(coordSk);

    const result = await buildEncryptedKeyChangeMessage({
      stateIndex: 1n,
      nonce: 2n,
      pollId: 0n,
      currentSk,
      newPubKey,
      coordinatorPubKey: coordPubKey,
    });

    expect(result.encMessage).toHaveLength(10);

    // Coordinator decrypts
    const sharedKey = await generateECDHSharedKey(coordSk, result.ephemeralPubKey);
    const plaintext = await poseidonDecrypt(result.encMessage, sharedKey, 0n, 7);

    const cmd = unpackCommand(plaintext[0]);
    expect(cmd.voteOptionIndex).toBe(0n); // key change
    expect(cmd.newVoteWeight).toBe(0n); // key change
    expect(cmd.nonce).toBe(2n);

    // New public key should be in plaintext
    expect(plaintext[1]).toBe(newPubKey[0]);
    expect(plaintext[2]).toBe(newPubKey[1]);
  });

  it('should be signed with current key (not new key)', async () => {
    const currentSeed = new Uint8Array(32); currentSeed.fill(0x01);
    const currentSk = derivePrivateKey(currentSeed);
    const currentPubKey = await eddsaDerivePublicKey(currentSk);

    const newSeed = new Uint8Array(32); newSeed.fill(0x03);
    const newSk = derivePrivateKey(newSeed);
    const newPubKey = await eddsaDerivePublicKey(newSk);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await (await import('../src/crypto/ecdh.js')).derivePublicKey(coordSk);

    const result = await buildEncryptedKeyChangeMessage({
      stateIndex: 1n,
      nonce: 2n,
      pollId: 0n,
      currentSk,
      newPubKey,
      coordinatorPubKey: coordPubKey,
    });

    const sharedKey = await generateECDHSharedKey(coordSk, result.ephemeralPubKey);
    const plaintext = await poseidonDecrypt(result.encMessage, sharedKey, 0n, 7);

    const salt = plaintext[3];
    const sig = { R8: [plaintext[4], plaintext[5]] as [bigint, bigint], S: plaintext[6] };

    // cmdHash uses newPubKey (the key being changed to)
    const cmdHash = await computeCommandHash(1n, newPubKey[0], newPubKey[1], 0n, salt);

    // But signed with CURRENT key
    const validWithCurrent = await eddsaVerify(cmdHash, sig, currentPubKey);
    expect(validWithCurrent).toBe(true);

    // NOT valid with new key
    const validWithNew = await eddsaVerify(cmdHash, sig, newPubKey);
    expect(validWithNew).toBe(false);
  });

  it('should have 10-element encMessage array', async () => {
    const currentSeed = new Uint8Array(32); currentSeed.fill(0x01);
    const currentSk = derivePrivateKey(currentSeed);

    const newSeed = new Uint8Array(32); newSeed.fill(0x03);
    const newSk = derivePrivateKey(newSeed);
    const newPubKey = await eddsaDerivePublicKey(newSk);

    const coordSeed = new Uint8Array(32); coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await (await import('../src/crypto/ecdh.js')).derivePublicKey(coordSk);

    const result = await buildEncryptedKeyChangeMessage({
      stateIndex: 1n,
      nonce: 1n,
      pollId: 0n,
      currentSk,
      newPubKey,
      coordinatorPubKey: coordPubKey,
    });

    expect(result.encMessage.length).toBe(10);
    // All elements should be bigints
    for (const el of result.encMessage) {
      expect(typeof el).toBe('bigint');
    }
  });
});
