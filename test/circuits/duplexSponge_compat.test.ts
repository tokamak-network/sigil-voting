/**
 * DuplexSponge Cross-Compatibility Test
 *
 * Verifies that TypeScript encryption (src/crypto/duplexSponge.ts)
 * produces ciphertext that the Circom circuit (circuits/utils/duplexSponge.circom)
 * can correctly decrypt.
 *
 * This is the critical Phase 6 verification: TS encrypt → circom decrypt roundtrip.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
// @ts-expect-error - circom_tester doesn't have types
import { wasm as circomTester } from 'circom_tester'

import { poseidonEncrypt } from '../../src/crypto/duplexSponge'

const CIRCUITS_DIR = path.join(__dirname, '../../circuits')

describe('DuplexSponge TS↔Circom Compatibility', () => {
  it('should decrypt in circom what TS encrypted (7 elements)', async () => {
    const circuit = await circomTester(
      path.join(CIRCUITS_DIR, 'test_duplexSponge.circom'),
      { include: [path.join(CIRCUITS_DIR, 'node_modules')] },
    )

    const plaintext = [100n, 200n, 300n, 400n, 500n, 600n, 700n]
    const key: [bigint, bigint] = [12345n, 67890n]
    const nonce = 1n

    const ciphertext = await poseidonEncrypt(plaintext, key, nonce)
    expect(ciphertext.length).toBe(10) // 7 → pad to 9 (3 blocks) + 1 auth tag

    const input = {
      ciphertext: ciphertext.map((v) => v.toString()),
      key: key.map((v) => v.toString()),
      nonce: nonce.toString(),
    }

    const witness = await circuit.calculateWitness(input, true)
    await circuit.checkConstraints(witness)

    // Verify outputs match original plaintext
    await circuit.assertOut(witness, {
      plaintext: plaintext.map((v) => v.toString()),
    })
  }, 60000)

  it('should decrypt single element', async () => {
    const circuit = await circomTester(
      path.join(CIRCUITS_DIR, 'test_duplexSponge_1.circom'),
      { include: [path.join(CIRCUITS_DIR, 'node_modules')] },
    )

    const plaintext = [42n]
    const key: [bigint, bigint] = [99999n, 88888n]
    const nonce = 0n

    const ciphertext = await poseidonEncrypt(plaintext, key, nonce)
    expect(ciphertext.length).toBe(4) // 1 → pad to 3 (1 block) + 1 auth tag

    const input = {
      ciphertext: ciphertext.map((v) => v.toString()),
      key: key.map((v) => v.toString()),
      nonce: nonce.toString(),
    }

    const witness = await circuit.calculateWitness(input, true)
    await circuit.checkConstraints(witness)

    await circuit.assertOut(witness, {
      plaintext: ['42'],
    })
  }, 60000)

  it('should decrypt 3 elements (exact block)', async () => {
    const circuit = await circomTester(
      path.join(CIRCUITS_DIR, 'test_duplexSponge_3.circom'),
      { include: [path.join(CIRCUITS_DIR, 'node_modules')] },
    )

    const plaintext = [111n, 222n, 333n]
    const key: [bigint, bigint] = [54321n, 12345n]
    const nonce = 5n

    const ciphertext = await poseidonEncrypt(plaintext, key, nonce)
    expect(ciphertext.length).toBe(4) // 3 elements = 1 block + 1 auth tag

    const input = {
      ciphertext: ciphertext.map((v) => v.toString()),
      key: key.map((v) => v.toString()),
      nonce: nonce.toString(),
    }

    const witness = await circuit.calculateWitness(input, true)
    await circuit.checkConstraints(witness)

    await circuit.assertOut(witness, {
      plaintext: plaintext.map((v) => v.toString()),
    })
  }, 60000)

  it('should fail with wrong key (auth tag mismatch)', async () => {
    const circuit = await circomTester(
      path.join(CIRCUITS_DIR, 'test_duplexSponge.circom'),
      { include: [path.join(CIRCUITS_DIR, 'node_modules')] },
    )

    const plaintext = [100n, 200n, 300n, 400n, 500n, 600n, 700n]
    const correctKey: [bigint, bigint] = [12345n, 67890n]
    const wrongKey: [bigint, bigint] = [54321n, 9876n]
    const nonce = 1n

    const ciphertext = await poseidonEncrypt(plaintext, correctKey, nonce)

    const input = {
      ciphertext: ciphertext.map((v) => v.toString()),
      key: wrongKey.map((v) => v.toString()),
      nonce: nonce.toString(),
    }

    // Should fail constraint check (auth tag mismatch)
    await expect(circuit.calculateWitness(input, true)).rejects.toThrow()
  }, 60000)
})
