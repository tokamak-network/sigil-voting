/**
 * Test 2.1: Circuit Logic Tests
 *
 * TDD Phase: RED - These tests verify the D2 Quadratic Voting circuit
 *
 * Test Cases:
 * - Case A: 1 vote → cost 1 → PASS
 * - Case B: 5 votes → cost 25 → PASS
 * - Case C: 5 votes → cost 10 → FAIL (wrong cost)
 * - Case D: Nullifier reuse → FAIL (handled at contract level)
 */

const { expect } = require("chai");
const path = require("path");
const fs = require("fs");

// Paths
const wasmPath = path.join(__dirname, "../../circuits/build_d2/D2_QuadraticVoting_js/D2_QuadraticVoting.wasm");
const zkeyPath = path.join(__dirname, "../../circuits/build_d2/D2_QuadraticVoting_0000.zkey");

describe("Test 2.1: D2 Quadratic Voting Circuit", function () {
  this.timeout(120000); // 2 minutes for proof generation

  let poseidon;
  let F;
  let snarkjs;

  before(async function () {
    // Check if circuit is compiled
    if (!fs.existsSync(wasmPath)) {
      console.log("\n⚠️  Circuit WASM not found at:", wasmPath);
      console.log("   Run: cd circuits && ./compile_d2.sh");
      this.skip();
    }
    if (!fs.existsSync(zkeyPath)) {
      console.log("\n⚠️  zkey not found at:", zkeyPath);
      console.log("   Run trusted setup first.");
      this.skip();
    }

    const circomlibjs = await import("circomlibjs");
    poseidon = await circomlibjs.buildPoseidon();
    F = poseidon.F;
    snarkjs = await import("snarkjs");
  });

  // Helper to compute poseidon hash
  function poseidonHash(inputs) {
    return F.toObject(poseidon(inputs.map(x => F.e(x))));
  }

  // Generate test inputs for the circuit
  function generateTestInputs(numVotes, creditsSpent, totalCredits = 10000n) {
    const sk = 12345n; // Secret key

    // Derive public key (simplified - in real code use babyjubjub)
    const pkX = 1234567890n;
    const pkY = 9876543210n;

    const creditSalt = 111n;
    const voteSalt = 222n;
    const proposalId = 1n;
    const choice = 1n; // For

    // Credit note hash = poseidon(pkX, pkY, totalCredits, creditSalt)
    const creditNoteHash = poseidonHash([pkX, pkY, totalCredits, creditSalt]);

    // Merkle path (simplified - single leaf tree)
    const merklePath = Array(20).fill(0n);
    const merkleIndex = 0n;

    // Credit root (for single leaf, root = leaf)
    const creditRoot = creditNoteHash;

    // Vote commitment: inner = hash(choice, numVotes, creditsSpent, proposalId)
    const inner = poseidonHash([choice, numVotes, creditsSpent, proposalId]);
    // commitment = hash(inner, voteSalt, 0, 0)
    const voteCommitment = poseidonHash([inner, voteSalt, 0n, 0n]);

    return {
      // Public inputs
      voteCommitment: voteCommitment.toString(),
      proposalId: proposalId.toString(),
      creditsSpent: creditsSpent.toString(),
      creditRoot: creditRoot.toString(),

      // Private inputs
      sk: sk.toString(),
      pkX: pkX.toString(),
      pkY: pkY.toString(),
      totalCredits: totalCredits.toString(),
      numVotes: numVotes.toString(),
      choice: choice.toString(),
      voteSalt: voteSalt.toString(),
      creditNoteHash: creditNoteHash.toString(),
      creditSalt: creditSalt.toString(),
      merklePath: merklePath.map(x => x.toString()),
      merkleIndex: merkleIndex.toString(),
    };
  }

  describe("Case A: 1 vote → cost 1", function () {
    it("should generate valid proof for 1 vote with cost 1", async function () {
      const inputs = generateTestInputs(1n, 1n); // 1 vote, cost = 1^2 = 1

      try {
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
          inputs,
          wasmPath,
          zkeyPath
        );

        expect(proof).to.exist;
        expect(publicSignals).to.have.lengthOf(5); // nullifier + 4 public inputs
        console.log("    ✅ Case A PASSED: 1 vote → cost 1");
      } catch (error) {
        console.log("    ❌ Case A FAILED:", error.message);
        throw error;
      }
    });
  });

  describe("Case B: 5 votes → cost 25", function () {
    it("should generate valid proof for 5 votes with cost 25", async function () {
      const inputs = generateTestInputs(5n, 25n); // 5 votes, cost = 5^2 = 25

      try {
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
          inputs,
          wasmPath,
          zkeyPath
        );

        expect(proof).to.exist;
        expect(publicSignals).to.have.lengthOf(5);
        console.log("    ✅ Case B PASSED: 5 votes → cost 25");
      } catch (error) {
        console.log("    ❌ Case B FAILED:", error.message);
        throw error;
      }
    });
  });

  describe("Case C: 5 votes → cost 10 (SHOULD FAIL)", function () {
    it("should FAIL to generate proof for wrong cost", async function () {
      const inputs = generateTestInputs(5n, 10n); // 5 votes, wrong cost = 10 (should be 25)

      try {
        await snarkjs.groth16.fullProve(
          inputs,
          wasmPath,
          zkeyPath
        );

        // If we get here, the test should fail
        console.log("    ❌ Case C FAILED: Should have rejected wrong cost");
        expect.fail("Circuit should have rejected wrong cost");
      } catch (error) {
        // Expected to fail
        expect(error.message).to.include("Assert Failed");
        console.log("    ✅ Case C PASSED: Correctly rejected wrong cost");
      }
    });
  });

  describe("Case D: Nullifier uniqueness", function () {
    it("should generate different nullifiers for different proposals", async function () {
      const inputs1 = generateTestInputs(1n, 1n);
      inputs1.proposalId = "1";

      const inputs2 = generateTestInputs(1n, 1n);
      inputs2.proposalId = "2";
      // Also need to update voteCommitment for new proposalId
      const inner2 = poseidonHash([1n, 1n, 1n, 2n]); // choice, numVotes, creditsSpent, proposalId
      inputs2.voteCommitment = poseidonHash([inner2, 222n, 0n, 0n]).toString();

      try {
        const result1 = await snarkjs.groth16.fullProve(inputs1, wasmPath, zkeyPath);
        const result2 = await snarkjs.groth16.fullProve(inputs2, wasmPath, zkeyPath);

        const nullifier1 = result1.publicSignals[0];
        const nullifier2 = result2.publicSignals[0];

        expect(nullifier1).to.not.equal(nullifier2);
        console.log("    ✅ Case D PASSED: Different nullifiers for different proposals");
        console.log(`       Nullifier 1: ${nullifier1.slice(0, 20)}...`);
        console.log(`       Nullifier 2: ${nullifier2.slice(0, 20)}...`);
      } catch (error) {
        console.log("    ❌ Case D FAILED:", error.message);
        throw error;
      }
    });
  });

  describe("Quadratic Cost Verification", function () {
    it("should verify cost = numVotes^2 for various values", async function () {
      const testCases = [
        { votes: 1n, expectedCost: 1n },
        { votes: 2n, expectedCost: 4n },
        { votes: 3n, expectedCost: 9n },
        { votes: 10n, expectedCost: 100n },
      ];

      for (const tc of testCases) {
        const inputs = generateTestInputs(tc.votes, tc.expectedCost);

        try {
          const { proof } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);
          expect(proof).to.exist;
          console.log(`    ✅ ${tc.votes} votes → cost ${tc.expectedCost}: PASSED`);
        } catch (error) {
          console.log(`    ❌ ${tc.votes} votes → cost ${tc.expectedCost}: FAILED`);
          throw error;
        }
      }
    });
  });
});
