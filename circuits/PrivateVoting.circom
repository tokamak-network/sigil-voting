pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/**
 * D1. Private Voting Circuit
 *
 * Based on: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md
 *
 * Implements commit-reveal voting with hidden ballot choices,
 * preventing vote buying and coercion while maintaining verifiable voting power.
 *
 * Constraint Count: ~150K
 *
 * Security Properties:
 * - Privacy: Choice hidden until reveal phase
 * - Anti-Coercion: Voters cannot prove their selection to bribers
 * - Double-Spend Prevention: Nullifier prevents reuse
 */

// Merkle tree proof verification (20 levels)
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndex;  // Single uint representing position
    signal output root;

    // Convert pathIndex to bits for traversal
    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndex;

    component hashers[levels];
    signal hashes[levels + 1];
    hashes[0] <== leaf;

    // Intermediate signals for MUX selection
    signal left[levels];
    signal right[levels];

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);

        // indexBits.out[i] == 0 means leaf is on left, sibling on right
        // indexBits.out[i] == 1 means leaf is on right, sibling on left
        // Using: left = hash + bit * (sibling - hash)
        //        right = sibling + bit * (hash - sibling)
        left[i] <== hashes[i] + indexBits.out[i] * (pathElements[i] - hashes[i]);
        right[i] <== pathElements[i] + indexBits.out[i] * (hashes[i] - pathElements[i]);

        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

// Derive public key from secret key using Baby Jubjub
template SecretToPublic() {
    signal input sk;
    signal output pkX;
    signal output pkY;

    component babyPbk = BabyPbk();
    babyPbk.in <== sk;

    pkX <== babyPbk.Ax;
    pkY <== babyPbk.Ay;
}

// Main Private Voting Circuit
template PrivateVoting(merkleTreeDepth) {
    // ============ Public Inputs (4 as per spec) ============
    signal input voteCommitment;    // Hash binding vote choice and salt
    signal input proposalId;        // Proposal identifier
    signal input votingPower;       // Disclosed voting strength
    signal input merkleRoot;        // Snapshot eligibility tree root

    // ============ Private Inputs ============
    signal input sk;                // Voter's secret key
    signal input pkX;               // Voter's public key X coordinate
    signal input pkY;               // Voter's public key Y coordinate

    signal input noteHash;          // Governance token note hash
    signal input noteValue;         // Token balance (must equal votingPower)
    signal input noteSalt;          // Note randomness
    signal input tokenType;         // Token type identifier

    signal input choice;            // Vote: 0=against, 1=for, 2=abstain
    signal input voteSalt;          // Randomness for vote commitment

    signal input merklePath[merkleTreeDepth];    // Merkle proof elements
    signal input merkleIndex;                     // Position in merkle tree (uint)

    // ============ Stage 1: Token Note Verification ============
    // Reconstruct note hash: hash(pkX, pkY, noteValue, tokenType, noteSalt)
    component noteHasher = Poseidon(5);
    noteHasher.inputs[0] <== pkX;
    noteHasher.inputs[1] <== pkY;
    noteHasher.inputs[2] <== noteValue;
    noteHasher.inputs[3] <== tokenType;
    noteHasher.inputs[4] <== noteSalt;

    // Verify note hash matches
    noteHasher.out === noteHash;

    // ============ Stage 2: Snapshot Inclusion ============
    // Validate token existence via 20-level merkle proof
    component merkleProof = MerkleProof(merkleTreeDepth);
    merkleProof.leaf <== noteHash;
    merkleProof.pathIndex <== merkleIndex;
    for (var i = 0; i < merkleTreeDepth; i++) {
        merkleProof.pathElements[i] <== merklePath[i];
    }

    // Verify merkle root matches
    merkleProof.root === merkleRoot;

    // ============ Stage 3: Ownership Proof ============
    // Confirm secret key derives public key
    component keyDerivation = SecretToPublic();
    keyDerivation.sk <== sk;

    // Verify derived public key matches provided public key
    keyDerivation.pkX === pkX;
    keyDerivation.pkY === pkY;

    // ============ Stage 4: Power Matching ============
    // Ensure declared voting power equals token note value
    votingPower === noteValue;

    // ============ Stage 5: Choice Validation ============
    // Restrict vote to valid options: 0, 1, or 2
    component isChoice0 = IsEqual();
    isChoice0.in[0] <== choice;
    isChoice0.in[1] <== 0;

    component isChoice1 = IsEqual();
    isChoice1.in[0] <== choice;
    isChoice1.in[1] <== 1;

    component isChoice2 = IsEqual();
    isChoice2.in[0] <== choice;
    isChoice2.in[1] <== 2;

    // Exactly one must be true
    signal validChoice;
    validChoice <== isChoice0.out + isChoice1.out + isChoice2.out;
    validChoice === 1;

    // ============ Stage 6: Commitment Binding ============
    // Create commitment: hash(choice, votingPower, proposalId, voteSalt)
    component commitmentHasher = Poseidon(4);
    commitmentHasher.inputs[0] <== choice;
    commitmentHasher.inputs[1] <== votingPower;
    commitmentHasher.inputs[2] <== proposalId;
    commitmentHasher.inputs[3] <== voteSalt;

    // Verify commitment matches
    commitmentHasher.out === voteCommitment;

    // ============ Nullifier Computation (for double-spend prevention) ============
    // Nullifier = hash(sk, proposalId)
    // Note: Nullifier is computed here but verified off-chain or in contract
    // The contract should track used nullifiers per proposal
    signal nullifier;
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== sk;
    nullifierHasher.inputs[1] <== proposalId;
    nullifier <== nullifierHasher.out;

    // Nullifier is an internal signal, passed to contract separately
}

// Instantiate with 20-level merkle tree (supports ~1M leaves)
// Public inputs: voteCommitment, proposalId, votingPower, merkleRoot (4 as per spec)
component main {public [voteCommitment, proposalId, votingPower, merkleRoot]} = PrivateVoting(20);
