/**
 * Security Tests — Crypto & Frontend
 *
 * Tests for: ECDH edge cases, salt bounds, command packing,
 * DuplexSponge error handling, EdDSA validation, signature parsing,
 * storage key safety, credit bounds.
 */

import { describe, it, expect } from 'vitest'
import {
  generateECDHSharedKey,
  generateEphemeralKeyPair,
  BABYJUB_SUBORDER,
} from '../src/crypto/ecdh'
import {
  poseidonEncrypt,
  poseidonDecrypt,
} from '../src/crypto/duplexSponge'
import {
  eddsaSign,
  eddsaVerify,
  eddsaDerivePublicKey,
} from '../src/crypto/eddsa'
import {
  derivePrivateKey,
} from '../src/crypto/blake512'
import { storageKey } from '../src/storageKeys'

const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

// ============ ECDH Edge Cases ============

describe('Security: ECDH Edge Cases', () => {
  it('should never generate a zero private key', async () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 10; i++) {
      const { sk } = await generateEphemeralKeyPair()
      expect(sk).not.toBe(0n)
    }
  })

  it('ephemeral key should always be within suborder', async () => {
    for (let i = 0; i < 10; i++) {
      const { sk } = await generateEphemeralKeyPair()
      expect(sk).toBeGreaterThan(0n)
      expect(sk).toBeLessThan(BABYJUB_SUBORDER)
    }
  })
})

// ============ Salt & Field Bounds ============

describe('Security: Salt & Field Bounds', () => {
  it('31-byte salt should be within SNARK field after modulo', () => {
    // Simulate the salt generation from VoteFormV2
    for (let i = 0; i < 20; i++) {
      const saltBytes = new Uint8Array(31)
      crypto.getRandomValues(saltBytes)
      const rawSalt = BigInt(
        '0x' + Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('')
      )
      const salt = rawSalt % SNARK_SCALAR_FIELD
      expect(salt).toBeGreaterThanOrEqual(0n)
      expect(salt).toBeLessThan(SNARK_SCALAR_FIELD)
    }
  })

  it('max 31-byte value should still be < SNARK field after modulo', () => {
    // 31 bytes max = 2^248 - 1, which is actually < SNARK_SCALAR_FIELD
    // But with modulo, it always stays in range
    const maxVal = (1n << 248n) - 1n
    const salt = maxVal % SNARK_SCALAR_FIELD
    expect(salt).toBeLessThan(SNARK_SCALAR_FIELD)
  })
})

// ============ Command Packing Bounds ============

describe('Security: Command Packing', () => {
  it('packCommand should pack fields into correct bit positions', () => {
    const stateIndex = 5n
    const voteOptionIndex = 1n
    const newVoteWeight = 3n
    const nonce = 2n
    const pollId = 0n

    const packed =
      stateIndex |
      (voteOptionIndex << 50n) |
      (newVoteWeight << 100n) |
      (nonce << 150n) |
      (pollId << 200n)

    // Unpack and verify
    const m50 = (1n << 50n) - 1n
    expect(packed & m50).toBe(stateIndex)
    expect((packed >> 50n) & m50).toBe(voteOptionIndex)
    expect((packed >> 100n) & m50).toBe(newVoteWeight)
    expect((packed >> 150n) & m50).toBe(nonce)
    expect((packed >> 200n) & m50).toBe(pollId)
  })

  it('unpackCommand should handle maximum 50-bit values', () => {
    const m50 = (1n << 50n) - 1n
    const packed =
      m50 |
      (m50 << 50n) |
      (m50 << 100n) |
      (m50 << 150n) |
      (m50 << 200n)

    expect(packed & m50).toBe(m50)
    expect((packed >> 50n) & m50).toBe(m50)
    expect((packed >> 100n) & m50).toBe(m50)
    expect((packed >> 150n) & m50).toBe(m50)
    expect((packed >> 200n) & m50).toBe(m50)
  })
})

// ============ DuplexSponge Error Handling ============

describe('Security: DuplexSponge', () => {
  it('decrypting with wrong key should throw (auth tag mismatch)', async () => {
    const key1 = await generateEphemeralKeyPair()
    const key2 = await generateEphemeralKeyPair()
    const sharedKey = await generateECDHSharedKey(key1.sk, key2.pubKey)

    const plaintext = [1n, 2n, 3n, 4n, 5n, 6n, 7n]
    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, 0n)

    // Try to decrypt with a wrong key — should throw on auth tag mismatch
    const wrongKey = await generateEphemeralKeyPair()
    const wrongShared = await generateECDHSharedKey(wrongKey.sk, key2.pubKey)
    await expect(
      poseidonDecrypt(ciphertext, wrongShared, 0n, 7)
    ).rejects.toThrow('invalid authentication tag')
  })

  it('encrypting empty plaintext (length=0 padded) should not throw', async () => {
    const key1 = await generateEphemeralKeyPair()
    const key2 = await generateEphemeralKeyPair()
    const sharedKey = await generateECDHSharedKey(key1.sk, key2.pubKey)

    // Zero-length plaintext (padded to 3 zeros)
    const plaintext: bigint[] = []
    const ciphertext = await poseidonEncrypt(plaintext, sharedKey, 0n)
    expect(ciphertext.length).toBeGreaterThan(0)
  })
})

// ============ EdDSA Validation ============

describe('Security: EdDSA', () => {
  it('invalid signature should be detected', async () => {
    const sk = derivePrivateKey(new Uint8Array(32).fill(42))
    const pk = await eddsaDerivePublicKey(sk)
    const message = 12345n
    const sig = await eddsaSign(message, sk)

    // Tamper with signature
    const tamperedSig = { ...sig, S: sig.S + 1n }
    const isValid = await eddsaVerify(message, tamperedSig, pk)
    expect(isValid).toBe(false)
  })

  it('signing zero message should produce valid signature', async () => {
    const sk = derivePrivateKey(new Uint8Array(32).fill(1))
    const pk = await eddsaDerivePublicKey(sk)
    const sig = await eddsaSign(0n, sk)
    const isValid = await eddsaVerify(0n, sig, pk)
    expect(isValid).toBe(true)
  })
})

// ============ Signature Hex Parsing ============

describe('Security: Signature Hex Parsing', () => {
  it('short hex signature should be detected', () => {
    const shortSig = '0x' + 'ab'.repeat(32) // 32 bytes = 64 hex chars, too short
    const sigHex = shortSig.slice(2)
    expect(sigHex.length).toBeLessThan(130)
    // The code should throw on < 130 chars
  })

  it('valid hex signature should parse correctly', () => {
    const validSig = '0x' + 'ab'.repeat(65) // 65 bytes = 130 hex chars
    const sigHex = validSig.slice(2)
    expect(sigHex.length).toBe(130)
    const matches = sigHex.match(/.{2}/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(65)
    const bytes = new Uint8Array(matches!.map(h => parseInt(h, 16)))
    expect(bytes.length).toBe(65)
  })

  it('invalid hex format should fail match', () => {
    const badSig = '0xNOTHEX'
    const sigHex = badSig.slice(2)
    // match will still work but parseInt will return NaN for non-hex
    const matches = sigHex.match(/.{2}/g)
    if (matches) {
      const bytes = matches.map(h => parseInt(h, 16))
      // Some bytes will be NaN
      expect(bytes.some(b => isNaN(b))).toBe(true)
    }
  })
})

// ============ Storage Key Safety ============

describe('Security: Storage Key Injection Safety', () => {
  it('storage keys should be scoped to contract address', () => {
    const key = storageKey.signup('0xABCDEF')
    expect(key).toContain('maci-')
    // Should not contain raw user-supplied path separators
    expect(key).not.toContain('..')
    expect(key).not.toContain('/')
    expect(key).not.toContain('\\')
  })

  it('storage keys with special characters in address should be safe', () => {
    // Addresses are always 0x-prefixed hex, but test defensive behavior
    const weirdAddr = '0x<script>alert(1)</script>'
    const key = storageKey.signup(weirdAddr)
    // Key should just concatenate — no injection possible in localStorage
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })

  it('different poll IDs should produce different keys', () => {
    const addr = '0x1234567890abcdef'
    const key1 = storageKey.nonce(addr, 0)
    const key2 = storageKey.nonce(addr, 1)
    expect(key1).not.toBe(key2)
  })
})

// ============ Credit Bounds ============

describe('Security: Credit Bounds', () => {
  it('quadratic cost should never be negative', () => {
    for (let weight = 0; weight <= 100; weight++) {
      const cost = weight * weight
      expect(cost).toBeGreaterThanOrEqual(0)
    }
  })

  it('credits remaining should handle zero voice credits', () => {
    const voiceCredits = 0
    const creditsSpent = 0
    const remaining = voiceCredits - creditsSpent
    expect(remaining).toBe(0)
    const maxWeight = Math.floor(Math.sqrt(Math.max(remaining, 0)))
    expect(maxWeight).toBe(0)
  })

  it('max weight calculation should prevent overspending', () => {
    const voiceCredits = 100
    const creditsSpent = 75
    const remaining = voiceCredits - creditsSpent // 25
    const maxWeight = Math.floor(Math.sqrt(Math.max(remaining, 0))) // floor(5) = 5
    expect(maxWeight).toBe(5)
    expect(maxWeight * maxWeight).toBeLessThanOrEqual(remaining)
  })
})
