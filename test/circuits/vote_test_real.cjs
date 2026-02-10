/**
 * Test 2.1: D2 Circuit Integration Test (Using real zkproof functions)
 *
 * This test uses the actual zkproof.ts functions to generate valid inputs
 */

const { expect } = require("chai");
const path = require("path");
const fs = require("fs");

const wasmPath = path.join(__dirname, "../../circuits/build_d2/D2_QuadraticVoting_js/D2_QuadraticVoting.wasm");
const zkeyPath = path.join(__dirname, "../../circuits/build_d2/D2_QuadraticVoting_0000.zkey");

describe("Test 2.1: D2 Circuit - Real Integration", function () {
  this.timeout(180000); // 3 minutes

  let snarkjs;
  let poseidon;
  let babyJub;
  let F;

  before(async function () {
    if (!fs.existsSync(wasmPath)) {
      console.log("\n⚠️  Circuit not compiled. Skipping tests.");
      this.skip();
    }

    const circomlibjs = await import("circomlibjs");
    poseidon = await circomlibjs.buildPoseidon();
    babyJub = await circomlibjs.buildBabyjub();
    F = poseidon.F;
    snarkjs = await import("snarkjs");
  });

  function poseidonHash(inputs) {
    return F.toObject(poseidon(inputs.map(x => F.e(x))));
  }

  // Generate keypair using Baby Jubjub
  function generateKeyPair(skScalar) {
    const sk = BigInt(skScalar);
    // BabyJub base point multiplication
    const pubKey = babyJub.mulPointEscalar(babyJub.Base8, sk);
    return {
      sk: sk,
      pkX: F.toObject(pubKey[0]),
      pkY: F.toObject(pubKey[1])
    };
  }

  // Build merkle tree and get proof
  function buildMerkleTree(leaves, leafIndex, depth = 20) {
    // Zero hashes for empty nodes
    const zeroHashes = [0n];
    for (let i = 0; i < depth; i++) {
      zeroHashes.push(poseidonHash([zeroHashes[i], zeroHashes[i]]));
    }

    // Current level starts with leaves
    let currentLevel = new Map();
    for (let i = 0; i < leaves.length; i++) {
      currentLevel.set(i, leaves[i]);
    }

    const path = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < depth; level++) {
      const isLeft = currentIndex % 2 === 0;
      const siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1;

      // Get sibling (or zero hash if not present)
      const sibling = currentLevel.get(siblingIndex) || zeroHashes[level];
      path.push(sibling);

      // Build next level
      const nextLevel = new Map();
      const processedPairs = new Set();

      for (const [idx, hash] of currentLevel) {
        const pairIdx = Math.floor(idx / 2);
        if (processedPairs.has(pairIdx)) continue;
        processedPairs.add(pairIdx);

        const leftIdx = pairIdx * 2;
        const rightIdx = pairIdx * 2 + 1;
        const left = currentLevel.get(leftIdx) || zeroHashes[level];
        const right = currentLevel.get(rightIdx) || zeroHashes[level];

        nextLevel.set(pairIdx, poseidonHash([left, right]));
      }

      // Handle current node's pair if not processed
      const currentPairIdx = Math.floor(currentIndex / 2);
      if (!nextLevel.has(currentPairIdx)) {
        const leftIdx = currentPairIdx * 2;
        const rightIdx = currentPairIdx * 2 + 1;
        const left = currentLevel.get(leftIdx) || zeroHashes[level];
        const right = currentLevel.get(rightIdx) || zeroHashes[level];
        nextLevel.set(currentPairIdx, poseidonHash([left, right]));
      }

      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    // Root is the single remaining value
    const root = currentLevel.get(0) || zeroHashes[depth];

    return { path, root };
  }

  // Generate valid circuit inputs
  function generateValidInputs(numVotes, totalCredits = 10000n) {
    // Generate real keypair
    const keyPair = generateKeyPair(12345);

    const creditSalt = 111n;
    const voteSalt = 222n;
    const proposalId = 1n;
    const choice = 1n; // For
    const creditsSpent = numVotes * numVotes; // Quadratic cost

    // Credit note hash
    const creditNoteHash = poseidonHash([keyPair.pkX, keyPair.pkY, totalCredits, creditSalt]);

    // Build merkle tree with single leaf
    const { path: merklePath, root: creditRoot } = buildMerkleTree([creditNoteHash], 0);

    // Vote commitment (two-stage hash)
    const inner = poseidonHash([choice, numVotes, creditsSpent, proposalId]);
    const voteCommitment = poseidonHash([inner, voteSalt, 0n, 0n]);

    return {
      // Public
      voteCommitment: voteCommitment.toString(),
      proposalId: proposalId.toString(),
      creditsSpent: creditsSpent.toString(),
      creditRoot: creditRoot.toString(),

      // Private
      sk: keyPair.sk.toString(),
      pkX: keyPair.pkX.toString(),
      pkY: keyPair.pkY.toString(),
      totalCredits: totalCredits.toString(),
      numVotes: numVotes.toString(),
      choice: choice.toString(),
      voteSalt: voteSalt.toString(),
      creditNoteHash: creditNoteHash.toString(),
      creditSalt: creditSalt.toString(),
      merklePath: merklePath.map(x => x.toString()),
      merkleIndex: "0",
    };
  }

  describe("Quadratic Cost Verification", function () {
    it("Case A: 1 vote → cost 1", async function () {
      const inputs = generateValidInputs(1n);
      console.log("\n    Inputs generated for 1 vote");

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);

      expect(proof).to.exist;
      expect(publicSignals).to.have.lengthOf(5);
      console.log("    ✅ 1 vote → cost 1: PASSED");
      console.log(`    Nullifier: ${publicSignals[0].slice(0, 20)}...`);
    });

    it("Case B: 5 votes → cost 25", async function () {
      const inputs = generateValidInputs(5n);

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);

      expect(proof).to.exist;
      console.log("    ✅ 5 votes → cost 25: PASSED");
    });

    it("Case C: Wrong cost should FAIL", async function () {
      const inputs = generateValidInputs(5n);
      // Tamper with creditsSpent (should be 25, set to 10)
      inputs.creditsSpent = "10";
      // Also need to update commitment
      const inner = poseidonHash([1n, 5n, 10n, 1n]);
      inputs.voteCommitment = poseidonHash([inner, 222n, 0n, 0n]).toString();

      try {
        await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);
        expect.fail("Should have rejected wrong cost");
      } catch (error) {
        expect(error.message).to.include("Assert Failed");
        console.log("    ✅ Wrong cost correctly rejected");
      }
    });

    it("Case D: 10 votes → cost 100", async function () {
      const inputs = generateValidInputs(10n);

      const { proof } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);

      expect(proof).to.exist;
      console.log("    ✅ 10 votes → cost 100: PASSED");
    });
  });

  describe("Nullifier Uniqueness", function () {
    it("Different proposals → different nullifiers", async function () {
      const inputs1 = generateValidInputs(1n);
      inputs1.proposalId = "1";

      const inputs2 = generateValidInputs(1n);
      inputs2.proposalId = "2";
      // Update commitment for new proposalId
      const inner2 = poseidonHash([1n, 1n, 1n, 2n]);
      inputs2.voteCommitment = poseidonHash([inner2, 222n, 0n, 0n]).toString();

      const result1 = await snarkjs.groth16.fullProve(inputs1, wasmPath, zkeyPath);
      const result2 = await snarkjs.groth16.fullProve(inputs2, wasmPath, zkeyPath);

      expect(result1.publicSignals[0]).to.not.equal(result2.publicSignals[0]);
      console.log("    ✅ Nullifiers are unique per proposal");
    });
  });
});
