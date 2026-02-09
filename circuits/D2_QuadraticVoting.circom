pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

/**
 * D2. Quadratic Voting Circuit
 *
 * Implements quadratic voting where vote cost = numVotes^2
 * This prevents whale domination by making each additional vote exponentially expensive.
 *
 * Example:
 * - 1 vote  = 1 credit
 * - 10 votes = 100 credits
 * - 100 votes = 10,000 credits
 *
 * Security Properties:
 * - Privacy: Choice hidden until reveal phase
 * - Anti-Whale: Quadratic cost prevents vote buying at scale
 * - Double-Spend Prevention: Nullifier prevents reuse
 */

// Merkle tree proof verification (20 levels)
template MerkleProofD2(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndex;
    signal output root;

    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndex;

    component hashers[levels];
    signal hashes[levels + 1];
    hashes[0] <== leaf;

    signal left[levels];
    signal right[levels];

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);
        left[i] <== hashes[i] + indexBits.out[i] * (pathElements[i] - hashes[i]);
        right[i] <== pathElements[i] + indexBits.out[i] * (hashes[i] - pathElements[i]);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

// Derive public key from secret key using Baby Jubjub
template SecretToPublicD2() {
    signal input sk;
    signal output pkX;
    signal output pkY;

    component babyPbk = BabyPbk();
    babyPbk.in <== sk;

    pkX <== babyPbk.Ax;
    pkY <== babyPbk.Ay;
}

// Main Quadratic Voting Circuit
template QuadraticVoting(TREE_DEPTH) {
    // ============ Public Inputs (4 as per spec) ============
    signal input voteCommitment;    // Hash binding vote choice and parameters
    signal input proposalId;        // Proposal identifier
    signal input creditsSpent;      // Quadratic cost (numVotes^2)
    signal input creditRoot;        // Merkle root of credit balances

    // ============ Private Inputs ============
    signal input sk;                // Voter's secret key
    signal input pkX;               // Voter's public key X coordinate
    signal input pkY;               // Voter's public key Y coordinate

    signal input totalCredits;      // User's total credit balance
    signal input numVotes;          // Number of votes to cast
    signal input choice;            // Vote: 0=against, 1=for, 2=abstain
    signal input voteSalt;          // Randomness for vote commitment

    signal input creditNoteHash;    // Credit note hash
    signal input creditSalt;        // Credit note randomness

    signal input merklePath[TREE_DEPTH];
    signal input merkleIndex;

    // ============ Stage 1: Credit Note Verification ============
    // Reconstruct credit note hash: hash(pkX, pkY, totalCredits, creditSalt)
    component creditNote = Poseidon(4);
    creditNote.inputs[0] <== pkX;
    creditNote.inputs[1] <== pkY;
    creditNote.inputs[2] <== totalCredits;
    creditNote.inputs[3] <== creditSalt;

    // Verify credit note hash matches
    creditNote.out === creditNoteHash;

    // ============ Stage 2: Merkle Proof (Snapshot Inclusion) ============
    component merkle = MerkleProofD2(TREE_DEPTH);
    merkle.leaf <== creditNoteHash;
    merkle.pathIndex <== merkleIndex;
    for (var i = 0; i < TREE_DEPTH; i++) {
        merkle.pathElements[i] <== merklePath[i];
    }

    // Verify merkle root matches
    merkle.root === creditRoot;

    // ============ Stage 3: Ownership Proof ============
    component ownership = SecretToPublicD2();
    ownership.sk <== sk;

    // Verify derived public key matches provided public key
    ownership.pkX === pkX;
    ownership.pkY === pkY;

    // ============ Stage 4: QUADRATIC COST CALCULATION ============
    // THIS IS THE CORE ANTI-WHALE MECHANISM
    // Cost grows quadratically: 1 vote = 1 credit, 10 votes = 100 credits
    signal voteCost;
    voteCost <== numVotes * numVotes;

    // ============ Stage 5: Balance Check ============
    // Ensure user has enough credits for the quadratic cost
    component costCheck = LessEqThan(64);
    costCheck.in[0] <== voteCost;
    costCheck.in[1] <== totalCredits;
    costCheck.out === 1;

    // Verify declared creditsSpent equals actual quadratic cost
    creditsSpent === voteCost;

    // ============ Stage 6: Choice Validation ============
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

    signal validChoice;
    validChoice <== isChoice0.out + isChoice1.out + isChoice2.out;
    validChoice === 1;

    // ============ Stage 7: Commitment Binding ============
    // Create commitment: hash(choice, numVotes, creditsSpent, proposalId, voteSalt)
    component commit = Poseidon(5);
    commit.inputs[0] <== choice;
    commit.inputs[1] <== numVotes;
    commit.inputs[2] <== creditsSpent;
    commit.inputs[3] <== proposalId;
    commit.inputs[4] <== voteSalt;

    // Verify commitment matches
    commit.out === voteCommitment;

    // ============ Nullifier Computation ============
    // Nullifier = hash(sk, proposalId) - prevents double voting
    signal output nullifier;
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== sk;
    nullifierHasher.inputs[1] <== proposalId;
    nullifier <== nullifierHasher.out;
}

// Instantiate with 20-level merkle tree (supports ~1M leaves)
// Public signals: voteCommitment, proposalId, creditsSpent, creditRoot (4 inputs) + nullifier (1 output) = 5 total
component main {public [voteCommitment, proposalId, creditsSpent, creditRoot]} = QuadraticVoting(20);
