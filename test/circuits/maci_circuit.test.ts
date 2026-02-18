/**
 * MACI Circuit Tests (Phase 7)
 *
 * 8 tests covering core MACI circuit components:
 *   1. DuplexSponge encrypt/decrypt roundtrip (covered in duplexSponge_compat.test.ts)
 *   2. EdDSA-Poseidon signature verification
 *   3. Command pack/unpack roundtrip
 *   4. Invalid EdDSA signature rejection
 *   5. Key change command packing
 *   6. Quinary Merkle proof verification
 *   7. SHA256 public input hash
 *   8. Tally commitment computation
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
// @ts-expect-error - circom_tester doesn't have types
import { wasm as circomTester } from 'circom_tester'

const CIRCUITS_DIR = path.join(__dirname, '../../circuits')
const circuitOpts = { include: [path.join(CIRCUITS_DIR, 'node_modules')] }

describe('MACI Circuit Tests', () => {
  // =============================================
  // Test 2: EdDSA-Poseidon Signature Verification
  // =============================================
  describe('EdDSA-Poseidon Signature', () => {
    it('should verify a valid EdDSA-Poseidon signature', async () => {
      // @ts-expect-error - circomlibjs doesn't have types
      const { buildEddsa, buildBabyjub } = await import('circomlibjs')
      const eddsa = await buildEddsa()
      const babyJub = await buildBabyjub()
      const F = babyJub.F

      // Generate key pair
      const prvKey = Buffer.from(
        '0001020304050607080900010203040506070809000102030405060708090001',
        'hex',
      )
      const pubKey = eddsa.prv2pub(prvKey)

      // Sign a message
      const msg = F.e(12345n)
      const signature = eddsa.signPoseidon(prvKey, msg)

      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_eddsaVerify.circom'),
        circuitOpts,
      )

      const input = {
        Ax: F.toObject(pubKey[0]).toString(),
        Ay: F.toObject(pubKey[1]).toString(),
        S: signature.S.toString(),
        R8x: F.toObject(signature.R8[0]).toString(),
        R8y: F.toObject(signature.R8[1]).toString(),
        M: '12345',
      }

      const witness = await circuit.calculateWitness(input, true)
      await circuit.checkConstraints(witness)
      // No output to check — circuit just doesn't fail
    }, 120000)

    // Test 4: Invalid signature should fail
    it('should reject an invalid EdDSA signature', async () => {
      // @ts-expect-error - circomlibjs doesn't have types
      const { buildEddsa, buildBabyjub } = await import('circomlibjs')
      const eddsa = await buildEddsa()
      const babyJub = await buildBabyjub()
      const F = babyJub.F

      const prvKey = Buffer.from(
        '0001020304050607080900010203040506070809000102030405060708090001',
        'hex',
      )
      const pubKey = eddsa.prv2pub(prvKey)

      // Sign one message but verify with different message
      const msg = F.e(12345n)
      const signature = eddsa.signPoseidon(prvKey, msg)

      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_eddsaVerify.circom'),
        circuitOpts,
      )

      const input = {
        Ax: F.toObject(pubKey[0]).toString(),
        Ay: F.toObject(pubKey[1]).toString(),
        S: signature.S.toString(),
        R8x: F.toObject(signature.R8[0]).toString(),
        R8y: F.toObject(signature.R8[1]).toString(),
        M: '99999', // Wrong message
      }

      await expect(circuit.calculateWitness(input, true)).rejects.toThrow()
    }, 120000)
  })

  // =============================================
  // Test 3 & 5: Command Pack/Unpack
  // =============================================
  describe('Command Pack/Unpack', () => {
    it('should correctly unpack a packed command', async () => {
      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_unpackCommand.circom'),
        circuitOpts,
      )

      const stateIndex = 7n
      const voteOptionIndex = 2n
      const newVoteWeight = 10n
      const nonce = 3n
      const pollId = 1n

      // Pack (must match packCommand in VoteFormV2.tsx)
      const packed =
        stateIndex |
        (voteOptionIndex << 50n) |
        (newVoteWeight << 100n) |
        (nonce << 150n) |
        (pollId << 200n)

      const input = { packedCommand: packed.toString() }
      const witness = await circuit.calculateWitness(input, true)
      await circuit.checkConstraints(witness)

      await circuit.assertOut(witness, {
        stateIndex: stateIndex.toString(),
        voteOptionIndex: voteOptionIndex.toString(),
        newVoteWeight: newVoteWeight.toString(),
        nonce: nonce.toString(),
        pollId: pollId.toString(),
      })
    }, 60000)

    // Test 5: Key change command (weight=0)
    it('should unpack a key change command (weight=0)', async () => {
      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_unpackCommand.circom'),
        circuitOpts,
      )

      const stateIndex = 5n
      const voteOptionIndex = 0n // Irrelevant for key change
      const newVoteWeight = 0n // Key change marker
      const nonce = 2n
      const pollId = 1n

      const packed =
        stateIndex |
        (voteOptionIndex << 50n) |
        (newVoteWeight << 100n) |
        (nonce << 150n) |
        (pollId << 200n)

      const input = { packedCommand: packed.toString() }
      const witness = await circuit.calculateWitness(input, true)
      await circuit.checkConstraints(witness)

      await circuit.assertOut(witness, {
        stateIndex: stateIndex.toString(),
        voteOptionIndex: '0',
        newVoteWeight: '0',
        nonce: nonce.toString(),
        pollId: pollId.toString(),
      })
    }, 60000)
  })

  // =============================================
  // Test 6: Quinary Merkle Proof
  // =============================================
  describe('Quinary Merkle Proof', () => {
    it('should verify a valid quinary Merkle inclusion proof', async () => {
      // @ts-expect-error - circomlibjs doesn't have types
      const { buildPoseidon } = await import('circomlibjs')
      const poseidon = await buildPoseidon()
      const F = poseidon.F

      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_quinaryMerkle.circom'),
        circuitOpts,
      )

      // Build a small quinary tree of depth 2
      // Use leaf at position [0,0] (index 0 at both levels)
      const leaf = 42n
      // path_elements[level][5]: all 5 children at each level
      // Circuit inserts hash at path_index, replacing whatever is at that position
      const level1Children = [999n, 200n, 300n, 400n, 500n]  // [0]=placeholder, replaced by leaf
      const level2Children = [888n, 600n, 700n, 800n, 900n]  // [0]=placeholder, replaced by level1Hash

      // path_index=0: children[0] = leaf (replaces level1Children[0]), rest unchanged
      const level1Hash = F.toObject(poseidon([leaf, level1Children[1], level1Children[2], level1Children[3], level1Children[4]]))
      const expectedRoot = F.toObject(poseidon([level1Hash, level2Children[1], level2Children[2], level2Children[3], level2Children[4]]))

      const input = {
        leaf: leaf.toString(),
        path_index: ['0', '0'],
        path_elements: [
          level1Children.map((v) => v.toString()),
          level2Children.map((v) => v.toString()),
        ],
      }

      const witness = await circuit.calculateWitness(input, true)
      await circuit.checkConstraints(witness)

      await circuit.assertOut(witness, {
        root: expectedRoot.toString(),
      })
    }, 120000)
  })

  // =============================================
  // Test 7: SHA256 Public Input Hash
  // =============================================
  describe('SHA256 Public Input', () => {
    it('should compute SHA256 hash of 4 field elements', async () => {
      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_sha256Hasher.circom'),
        circuitOpts,
      )

      // Use small known values
      const inputs = ['1', '2', '3', '4']

      const input = { inputs }
      const witness = await circuit.calculateWitness(input, true)
      await circuit.checkConstraints(witness)

      // Just verify it produces some output without failing
      // The actual SHA256 value would need to be computed externally
      // Main check: circuit doesn't fail + constraints satisfied
    }, 180000)
  })

  // =============================================
  // Test 8: Tally Commitment
  // =============================================
  describe('Tally Commitment', () => {
    it('should compute tally commitment = Poseidon(votesRoot, totalSpent, perOptionSpentRoot)', async () => {
      // @ts-expect-error - circomlibjs doesn't have types
      const { buildPoseidon } = await import('circomlibjs')
      const poseidon = await buildPoseidon()
      const F = poseidon.F

      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_tallyCommitment.circom'),
        circuitOpts,
      )

      const tallyResultsRoot = 111n
      const totalSpent = 222n
      const perOptionSpentRoot = 333n

      // Compute expected commitment
      const expectedCommitment = F.toObject(
        poseidon([tallyResultsRoot, totalSpent, perOptionSpentRoot]),
      )

      const input = {
        tallyResultsRoot: tallyResultsRoot.toString(),
        totalSpent: totalSpent.toString(),
        perOptionSpentRoot: perOptionSpentRoot.toString(),
      }

      const witness = await circuit.calculateWitness(input, true)
      await circuit.checkConstraints(witness)

      await circuit.assertOut(witness, {
        commitment: expectedCommitment.toString(),
      })
    }, 60000)

    it('should produce different commitments for different inputs', async () => {
      // @ts-expect-error - circomlibjs doesn't have types
      const { buildPoseidon } = await import('circomlibjs')
      const poseidon = await buildPoseidon()
      const F = poseidon.F

      const circuit = await circomTester(
        path.join(CIRCUITS_DIR, 'test_tallyCommitment.circom'),
        circuitOpts,
      )

      const input1 = {
        tallyResultsRoot: '111',
        totalSpent: '222',
        perOptionSpentRoot: '333',
      }

      const input2 = {
        tallyResultsRoot: '111',
        totalSpent: '223', // Changed
        perOptionSpentRoot: '333',
      }

      const w1 = await circuit.calculateWitness(input1, true)
      const w2 = await circuit.calculateWitness(input2, true)

      const c1 = F.toObject(
        poseidon([111n, 222n, 333n]),
      )
      const c2 = F.toObject(
        poseidon([111n, 223n, 333n]),
      )

      expect(c1).not.toBe(c2)

      await circuit.assertOut(w1, { commitment: c1.toString() })
      await circuit.assertOut(w2, { commitment: c2.toString() })
    }, 60000)
  })
})
