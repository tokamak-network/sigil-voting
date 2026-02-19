/**
 * Crypto Module Preloader
 *
 * Loads all 6 crypto modules in parallel (ecdh, duplexSponge, eddsa, blake512, keyStore, circomlibjs)
 * and caches the result. First call: ~200ms parallel load. Subsequent calls: 0ms (cached).
 *
 * Shared by VoteFormV2, KeyManager, MACIVotingDemo to eliminate redundant dynamic imports.
 */

import type { PubKey } from './ecdh';
import type { EdDSASignature } from './eddsa';

export interface CryptoModules {
  // ecdh
  generateEphemeralKeyPair: () => Promise<{ sk: bigint; pubKey: PubKey }>;
  generateECDHSharedKey: (sk: bigint, otherPubKey: PubKey) => Promise<PubKey>;
  // duplexSponge
  poseidonEncrypt: (plaintext: bigint[], sharedKey: bigint[], nonce: bigint) => Promise<bigint[]>;
  // eddsa
  eddsaSign: (message: bigint, sk: bigint) => Promise<EdDSASignature>;
  eddsaDerivePublicKey: (sk: bigint) => Promise<[bigint, bigint]>;
  // blake512
  derivePrivateKey: (seed: Uint8Array) => bigint;
  // keyStore
  loadEncrypted: (storageKey: string, address: string) => Promise<string | null>;
  storeEncrypted: (storageKey: string, value: string, address: string) => Promise<void>;
  // circomlibjs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildPoseidon: () => Promise<any>;
  // crypto/index re-exports for signUp
  generateRandomPrivateKey: () => bigint;
  derivePrivateKeyFromSignature: (signature: Uint8Array) => bigint;
  derivePublicKey: (sk: bigint) => Promise<PubKey>;
}

let cached: CryptoModules | null = null;
let loadPromise: Promise<CryptoModules> | null = null;

/**
 * Preload all crypto modules in parallel and cache. Thread-safe (singleton promise).
 */
export async function preloadCrypto(): Promise<CryptoModules> {
  if (cached) return cached;

  if (!loadPromise) {
    loadPromise = (async () => {
      const [ecdhMod, duplexMod, eddsaMod, blake512Mod, keyStoreMod, circomlibMod] =
        await Promise.all([
          import('./ecdh'),
          import('./duplexSponge'),
          import('./eddsa'),
          import('./blake512'),
          import('./keyStore'),
          // @ts-expect-error - circomlibjs doesn't have types
          import('circomlibjs'),
        ]);

      const modules: CryptoModules = {
        generateEphemeralKeyPair: ecdhMod.generateEphemeralKeyPair,
        generateECDHSharedKey: ecdhMod.generateECDHSharedKey,
        poseidonEncrypt: duplexMod.poseidonEncrypt,
        eddsaSign: eddsaMod.eddsaSign,
        eddsaDerivePublicKey: eddsaMod.eddsaDerivePublicKey,
        derivePrivateKey: blake512Mod.derivePrivateKey,
        loadEncrypted: keyStoreMod.loadEncrypted,
        storeEncrypted: keyStoreMod.storeEncrypted,
        buildPoseidon: circomlibMod.buildPoseidon,
        generateRandomPrivateKey: blake512Mod.generateRandomPrivateKey,
        derivePrivateKeyFromSignature: blake512Mod.derivePrivateKeyFromSignature,
        derivePublicKey: ecdhMod.derivePublicKey,
      };

      cached = modules;
      return modules;
    })();
  }

  return loadPromise;
}
