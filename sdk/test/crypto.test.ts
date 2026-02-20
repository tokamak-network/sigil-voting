/**
 * SDK Crypto Module Tests
 *
 * Tests for: ECDH, Poseidon DuplexSponge, EdDSA-Poseidon, BLAKE512
 */

import { describe, it, expect } from 'vitest';
import {
  generateECDHSharedKey,
  generateEphemeralKeyPair,
  derivePublicKey,
  BABYJUB_SUBORDER,
} from '../src/crypto/ecdh.js';
import {
  poseidonEncrypt,
  poseidonDecrypt,
} from '../src/crypto/duplexSponge.js';
import {
  eddsaSign,
  eddsaVerify,
  eddsaDerivePublicKey,
} from '../src/crypto/eddsa.js';
import {
  derivePrivateKey,
  generateRandomPrivateKey,
} from '../src/crypto/blake512.js';

// ============ ECDH Tests ============

describe('ECDH (Baby Jubjub)', () => {
  it('should generate ephemeral key pair with valid pubkey', async () => {
    const { sk, pubKey } = await generateEphemeralKeyPair();
    expect(sk).toBeGreaterThan(0n);
    expect(sk).toBeLessThan(BABYJUB_SUBORDER);
    expect(pubKey[0]).toBeGreaterThan(0n);
    expect(pubKey[1]).toBeGreaterThan(0n);
  });

  it('should derive same shared key from both sides', async () => {
    const alice = await generateEphemeralKeyPair();
    const bob = await generateEphemeralKeyPair();

    const sharedA = await generateECDHSharedKey(alice.sk, bob.pubKey);
    const sharedB = await generateECDHSharedKey(bob.sk, alice.pubKey);

    expect(sharedA[0]).toBe(sharedB[0]);
    expect(sharedA[1]).toBe(sharedB[1]);
  });

  it('should derive consistent public key from secret key', async () => {
    const { sk, pubKey } = await generateEphemeralKeyPair();
    const derived = await derivePublicKey(sk);
    expect(derived[0]).toBe(pubKey[0]);
    expect(derived[1]).toBe(pubKey[1]);
  });

  it('should produce different shared keys for different keypairs', async () => {
    const alice = await generateEphemeralKeyPair();
    const bob = await generateEphemeralKeyPair();
    const charlie = await generateEphemeralKeyPair();

    const sharedAB = await generateECDHSharedKey(alice.sk, bob.pubKey);
    const sharedAC = await generateECDHSharedKey(alice.sk, charlie.pubKey);

    expect(sharedAB[0] === sharedAC[0] && sharedAB[1] === sharedAC[1]).toBe(false);
  });
});

// ============ Poseidon DuplexSponge Tests ============

describe('Poseidon DuplexSponge Encryption (t=4, rate=3)', () => {
  it('should encrypt and decrypt single element', async () => {
    const plaintext = [42n];
    const sharedKey = [12345n, 67890n];
    const nonce = 1n;

    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);
    const decrypted = await poseidonDecrypt(ciphertext, sharedKey, nonce, plaintext.length);

    expect(decrypted).toEqual(plaintext);
  });

  it('should encrypt and decrypt 3 elements (exact block)', async () => {
    const plaintext = [100n, 200n, 300n];
    const sharedKey = [11111n, 22222n];
    const nonce = 2n;

    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);
    expect(ciphertext.length).toBe(3 + 1);
    const decrypted = await poseidonDecrypt(ciphertext, sharedKey, nonce, plaintext.length);

    expect(decrypted).toEqual(plaintext);
  });

  it('should encrypt and decrypt multiple elements with padding', async () => {
    const plaintext = [100n, 200n, 300n, 400n];
    const sharedKey = [67890n, 13579n];
    const nonce = 2n;

    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);
    expect(ciphertext.length).toBe(7);
    const decrypted = await poseidonDecrypt(ciphertext, sharedKey, nonce, plaintext.length);

    expect(decrypted).toEqual(plaintext);
  });

  it('should encrypt and decrypt 7 elements', async () => {
    const plaintext = [1n, 2n, 3n, 4n, 5n, 6n, 7n];
    const sharedKey = [99999n, 88888n];
    const nonce = 3n;

    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);
    expect(ciphertext.length).toBe(10);
    const decrypted = await poseidonDecrypt(ciphertext, sharedKey, nonce, plaintext.length);

    expect(decrypted).toEqual(plaintext);
  });

  it('should produce different ciphertext for different nonces', async () => {
    const plaintext = [42n];
    const sharedKey = [12345n, 67890n];

    const ct1 = await poseidonEncrypt(plaintext, sharedKey, 1n);
    const ct2 = await poseidonEncrypt(plaintext, sharedKey, 2n);

    expect(ct1).not.toEqual(ct2);
  });

  it('should fail decryption with wrong key', async () => {
    const plaintext = [42n];
    const sharedKey = [12345n, 67890n];
    const wrongKey = [54321n, 9876n];
    const nonce = 1n;

    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);

    await expect(
      poseidonDecrypt(ciphertext, wrongKey, nonce, plaintext.length),
    ).rejects.toThrow('invalid authentication tag');
  });

  it('should work with ECDH-derived shared key', async () => {
    const alice = await generateEphemeralKeyPair();
    const bob = await generateEphemeralKeyPair();

    const sharedKey = await generateECDHSharedKey(alice.sk, bob.pubKey);
    const plaintext = [1n, 2n, 3n, 4n, 5n];
    const nonce = 0n;

    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, nonce);

    const sharedKeyBob = await generateECDHSharedKey(bob.sk, alice.pubKey);
    const decrypted = await poseidonDecrypt(ciphertext, sharedKeyBob, nonce, plaintext.length);

    expect(decrypted).toEqual(plaintext);
  });
});

// ============ EdDSA-Poseidon Tests ============

describe('EdDSA-Poseidon Signatures', () => {
  it('should sign and verify a message', async () => {
    const sk = 123456789n;
    const message = 42n;

    const signature = await eddsaSign(message, sk);
    const pubKey = await eddsaDerivePublicKey(sk);

    const valid = await eddsaVerify(message, signature, pubKey);
    expect(valid).toBe(true);
  });

  it('should fail verification with wrong message', async () => {
    const sk = 123456789n;
    const message = 42n;
    const wrongMessage = 43n;

    const signature = await eddsaSign(message, sk);
    const pubKey = await eddsaDerivePublicKey(sk);

    const valid = await eddsaVerify(wrongMessage, signature, pubKey);
    expect(valid).toBe(false);
  });

  it('should fail verification with wrong public key', async () => {
    const sk1 = 123456789n;
    const sk2 = 987654321n;
    const message = 42n;

    const signature = await eddsaSign(message, sk1);
    const wrongPubKey = await eddsaDerivePublicKey(sk2);

    const valid = await eddsaVerify(message, signature, wrongPubKey);
    expect(valid).toBe(false);
  });

  it('should produce consistent public key', async () => {
    const sk = 123456789n;
    const pk1 = await eddsaDerivePublicKey(sk);
    const pk2 = await eddsaDerivePublicKey(sk);

    expect(pk1[0]).toBe(pk2[0]);
    expect(pk1[1]).toBe(pk2[1]);
  });

  it('should produce different signatures for different messages', async () => {
    const sk = 123456789n;
    const sig1 = await eddsaSign(1n, sk);
    const sig2 = await eddsaSign(2n, sk);

    expect(sig1.R8[0]).not.toBe(sig2.R8[0]);
  });
});

// ============ BLAKE512 Key Derivation Tests ============

describe('BLAKE512 Key Derivation', () => {
  it('should derive valid Baby Jubjub scalar from seed', () => {
    const seed = new Uint8Array(32);
    seed[0] = 1;

    const sk = derivePrivateKey(seed);
    expect(sk).toBeGreaterThan(0n);
    expect(sk).toBeLessThan(BABYJUB_SUBORDER);
  });

  it('should derive same key from same seed', () => {
    const seed = new Uint8Array(32);
    seed[0] = 42;

    const sk1 = derivePrivateKey(seed);
    const sk2 = derivePrivateKey(seed);

    expect(sk1).toBe(sk2);
  });

  it('should derive different keys from different seeds', () => {
    const seed1 = new Uint8Array(32);
    seed1[0] = 1;
    const seed2 = new Uint8Array(32);
    seed2[0] = 2;

    const sk1 = derivePrivateKey(seed1);
    const sk2 = derivePrivateKey(seed2);

    expect(sk1).not.toBe(sk2);
  });

  it('should generate random private key in valid range', () => {
    const sk = generateRandomPrivateKey();
    expect(sk).toBeGreaterThan(0n);
    expect(sk).toBeLessThan(BABYJUB_SUBORDER);
  });

  it('should work end-to-end: BLAKE512 → keypair → ECDH', async () => {
    const seed = new Uint8Array(32);
    seed.fill(0xab);
    const sk = derivePrivateKey(seed);

    const pubKey = await derivePublicKey(sk);
    expect(pubKey[0]).toBeGreaterThan(0n);
    expect(pubKey[1]).toBeGreaterThan(0n);

    const other = await generateEphemeralKeyPair();
    const shared1 = await generateECDHSharedKey(sk, other.pubKey);
    const shared2 = await generateECDHSharedKey(other.sk, pubKey);

    expect(shared1[0]).toBe(shared2[0]);
    expect(shared1[1]).toBe(shared2[1]);
  });
});

// ============ Integration Test ============

describe('Full MACI Crypto Pipeline', () => {
  it('should complete full encrypt-sign-verify-decrypt flow', async () => {
    const voterSeed = new Uint8Array(32);
    voterSeed.fill(0x01);
    const voterSk = derivePrivateKey(voterSeed);

    const coordSeed = new Uint8Array(32);
    coordSeed.fill(0x02);
    const coordSk = derivePrivateKey(coordSeed);
    const coordPubKey = await derivePublicKey(coordSk);

    const commandHash = 123456n;
    const signature = await eddsaSign(commandHash, voterSk);
    const voterEddsaPk = await eddsaDerivePublicKey(voterSk);

    const ephemeral = await generateEphemeralKeyPair();
    const sharedKey = await generateECDHSharedKey(ephemeral.sk, coordPubKey);

    const message = [
      commandHash,
      signature.R8[0],
      signature.R8[1],
      signature.S,
    ];
    const nonce = 0n;
    const encrypted = await poseidonEncrypt(message, sharedKey, nonce);

    const coordSharedKey = await generateECDHSharedKey(coordSk, ephemeral.pubKey);
    expect(coordSharedKey[0]).toBe(sharedKey[0]);
    expect(coordSharedKey[1]).toBe(sharedKey[1]);

    const decrypted = await poseidonDecrypt(encrypted, coordSharedKey, nonce, message.length);
    expect(decrypted).toEqual(message);

    const recoveredSig = {
      R8: [decrypted[1], decrypted[2]] as [bigint, bigint],
      S: decrypted[3],
    };
    const valid = await eddsaVerify(decrypted[0], recoveredSig, voterEddsaPk);
    expect(valid).toBe(true);
  });
});
