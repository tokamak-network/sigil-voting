/**
 * D2 Quadratic Voting Integration Test
 *
 * Scenario:
 * 1. Deploy ZkVotingFinal contract
 * 2. Alice gets 1,000 test tokens via mintTestTokens
 * 3. Alice casts 10 votes (quadratic cost = 10^2 = 100 tokens)
 * 4. Verify: Transaction succeeds AND Alice's balance = 900
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");

// Poseidon hash implementation (matching circomlib)
const { buildPoseidon } = require("circomlibjs");

// Baby JubJub utilities
const { buildBabyjub } = require("circomlibjs");

describe("D2 Quadratic Voting Integration", function () {
  this.timeout(120000); // 2 minutes for proof generation

  let zkVotingFinal;
  let verifierD1, verifierD2, poseidonT5;
  let alice;
  let poseidon;
  let babyjub;

  // Circuit files
  const WASM_PATH = path.join(__dirname, "../circuits/build_d2/D2_QuadraticVoting_js/D2_QuadraticVoting.wasm");
  const ZKEY_PATH = path.join(__dirname, "../circuits/build_d2/D2_QuadraticVoting_final.zkey");

  // Test constants
  const TREE_DEPTH = 20;
  const NUM_VOTES = 10n;
  const EXPECTED_COST = 100n; // 10^2 = 100
  const INITIAL_TOKENS = 1000n;
  const EXPECTED_REMAINING = 900n; // 1000 - 100

  before(async function () {
    console.log("\n=== Setting up D2 Integration Test ===\n");

    // Check circuit files exist
    if (!fs.existsSync(WASM_PATH)) {
      throw new Error(`WASM file not found: ${WASM_PATH}`);
    }
    if (!fs.existsSync(ZKEY_PATH)) {
      throw new Error(`ZKEY file not found: ${ZKEY_PATH}`);
    }

    // Initialize crypto libraries
    poseidon = await buildPoseidon();
    babyjub = await buildBabyjub();

    // Get signers
    [alice] = await ethers.getSigners();
    console.log("Alice address:", alice.address);
  });

  it("should deploy all contracts", async function () {
    console.log("\n--- Step 1: Deploying contracts ---");

    // Deploy VerifierD1 (dummy, not used in this test)
    const VerifierD1 = await ethers.getContractFactory("contracts/Groth16Verifier.sol:Groth16Verifier");
    verifierD1 = await VerifierD1.deploy();
    await verifierD1.waitForDeployment();
    console.log("VerifierD1 deployed");

    // Deploy VerifierD2
    const VerifierD2 = await ethers.getContractFactory("contracts/Groth16VerifierD2.sol:Groth16Verifier");
    verifierD2 = await VerifierD2.deploy();
    await verifierD2.waitForDeployment();
    console.log("VerifierD2 deployed");

    // Deploy PoseidonT5 library
    const PoseidonT5 = await ethers.getContractFactory("PoseidonT5");
    poseidonT5 = await PoseidonT5.deploy();
    await poseidonT5.waitForDeployment();
    console.log("PoseidonT5 deployed");

    // Deploy ZkVotingFinal
    const ZkVotingFinal = await ethers.getContractFactory("ZkVotingFinal", {
      libraries: {
        PoseidonT5: await poseidonT5.getAddress(),
      },
    });
    zkVotingFinal = await ZkVotingFinal.deploy(
      await verifierD1.getAddress(),
      await verifierD2.getAddress()
    );
    await zkVotingFinal.waitForDeployment();
    console.log("ZkVotingFinal deployed at:", await zkVotingFinal.getAddress());

    expect(await zkVotingFinal.getAddress()).to.be.properAddress;
  });

  it("should mint 1000 test tokens to Alice", async function () {
    console.log("\n--- Step 2: Minting 1000 tokens to Alice ---");

    const tx = await zkVotingFinal.connect(alice).mintTestTokens(INITIAL_TOKENS);
    await tx.wait();

    const balance = await zkVotingFinal.getAvailableCredits(alice.address);
    console.log("Alice's initial balance:", balance.toString());

    expect(balance).to.equal(INITIAL_TOKENS);
  });

  it("should allow Alice to cast 10 votes with ZK proof (cost: 100 credits)", async function () {
    console.log("\n--- Step 3: Alice casts 10 votes ---");

    // Generate Alice's key pair
    const sk = BigInt("0x" + Buffer.from(ethers.randomBytes(31)).toString("hex"));
    const F = babyjub.F;
    const pkRaw = babyjub.mulPointEscalar(babyjub.Base8, sk);
    const pkX = F.toObject(pkRaw[0]);
    const pkY = F.toObject(pkRaw[1]);
    console.log("Generated Alice's key pair");

    // Create credit note
    const totalCredits = INITIAL_TOKENS;
    const creditSalt = BigInt("0x" + Buffer.from(ethers.randomBytes(31)).toString("hex"));

    const creditNoteHashInputs = [pkX, pkY, totalCredits, creditSalt].map(x => F.e(x));
    const creditNoteHash = F.toObject(poseidon(creditNoteHashInputs));
    console.log("Credit note hash:", creditNoteHash.toString().slice(0, 20) + "...");

    // Register credit note
    await zkVotingFinal.registerCreditNote(creditNoteHash);
    console.log("Registered credit note");

    // Build simple Merkle tree (single leaf)
    const emptyLeaf = 0n;
    let currentHash = creditNoteHash;
    const merklePath = [];
    const merkleIndex = 0n;

    for (let i = 0; i < TREE_DEPTH; i++) {
      merklePath.push(emptyLeaf);
      const left = currentHash;
      const right = emptyLeaf;
      currentHash = F.toObject(poseidon([F.e(left), F.e(right)]));
    }

    const creditRoot = currentHash;
    console.log("Credit root:", creditRoot.toString().slice(0, 20) + "...");

    // Register credit root
    await zkVotingFinal.registerCreditRoot(creditRoot);
    console.log("Registered credit root");

    // Create D2 proposal
    const votingDuration = 3600; // 1 hour
    const revealDuration = 3600; // 1 hour
    const tx = await zkVotingFinal.createProposalD2(
      "Test Proposal",
      "Testing quadratic voting",
      creditRoot,
      votingDuration,
      revealDuration
    );
    await tx.wait();
    console.log("Created D2 proposal");

    const proposalId = 1n;
    const choice = 1n; // FOR
    const numVotes = NUM_VOTES;
    const creditsSpent = EXPECTED_COST;
    const voteSalt = BigInt("0x" + Buffer.from(ethers.randomBytes(31)).toString("hex"));

    // Compute two-stage commitment (matches contract)
    const innerInputs = [choice, numVotes, creditsSpent, proposalId].map(x => F.e(x));
    const innerHash = F.toObject(poseidon(innerInputs));
    const commitInputs = [innerHash, voteSalt, 0n, 0n].map(x => F.e(x));
    const voteCommitment = F.toObject(poseidon(commitInputs));
    console.log("Vote commitment:", voteCommitment.toString().slice(0, 20) + "...");

    // Prepare circuit inputs
    const circuitInputs = {
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

    console.log("\nGenerating ZK proof (this may take a moment)...");
    const startTime = Date.now();

    // Generate proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      WASM_PATH,
      ZKEY_PATH
    );

    const proofTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Proof generated in ${proofTime}s`);

    // Public signals order: [nullifier, voteCommitment, proposalId, creditsSpent, creditRoot]
    const nullifier = BigInt(publicSignals[0]);
    console.log("Nullifier:", nullifier.toString().slice(0, 20) + "...");

    // Verify proof matches expected public signals
    expect(BigInt(publicSignals[1])).to.equal(voteCommitment);
    expect(BigInt(publicSignals[2])).to.equal(proposalId);
    expect(BigInt(publicSignals[3])).to.equal(creditsSpent);
    expect(BigInt(publicSignals[4])).to.equal(creditRoot);

    // Format proof for Solidity verifier
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const calldataArr = JSON.parse("[" + calldata + "]");

    const pA = calldataArr[0];
    const pB = calldataArr[1];
    const pC = calldataArr[2];

    console.log("\nCalling castVoteD2...");

    // Call castVoteD2
    const voteTx = await zkVotingFinal.connect(alice).castVoteD2(
      proposalId,
      voteCommitment,
      numVotes,
      creditsSpent,
      nullifier,
      pA,
      pB,
      pC
    );
    await voteTx.wait();

    console.log("Vote cast successfully!");

    // Verify balance after voting
    const remainingBalance = await zkVotingFinal.getAvailableCredits(alice.address);
    console.log("\n--- Step 4: Verifying balance ---");
    console.log("Initial balance:", INITIAL_TOKENS.toString());
    console.log("Credits spent:", EXPECTED_COST.toString());
    console.log("Remaining balance:", remainingBalance.toString());
    console.log("Expected remaining:", EXPECTED_REMAINING.toString());

    expect(remainingBalance).to.equal(EXPECTED_REMAINING);
    console.log("\n✅ TEST PASSED: Balance correctly reduced from 1000 to 900");
  });
});
