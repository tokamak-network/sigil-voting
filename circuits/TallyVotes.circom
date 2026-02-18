pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

include "utils/quinaryMerkleProof.circom";
include "utils/sha256Hasher.circom";

/**
 * MACI TallyVotes Circuit
 *
 * Verifies correct vote aggregation from finalized state/ballot trees.
 * For each voter in a batch:
 *   1. Verify state leaf inclusion in state tree (Quinary Merkle)
 *   2. Verify ballot inclusion and extract per-option vote weights
 *   3. Accumulate tallies: newTally[option] = currentTally[option] + voteWeight
 *   4. Compute tally commitment: poseidon_3(tallyResultsRoot, totalSpent, perOptionSpentRoot)
 *   5. Verify SHA256-compressed public input matches on-chain hash
 *
 * SHA256 matches on-chain Tally contract:
 *   sha256(stateCommitment, prevTallyCommitment, newTallyCommitment)
 *
 * Parameters:
 *   stateTreeDepth       - Quinary state tree depth
 *   voteOptionTreeDepth  - Vote option tree depth
 *   batchSize            - Number of voters per tally batch
 */
template TallyVotes(
    stateTreeDepth,
    voteOptionTreeDepth,
    batchSize
) {
    var numVoteOptions = 5 ** voteOptionTreeDepth;

    // ============ Public Input (SHA256 compressed) ============
    signal input inputHash;

    // ============ SHA256 hash values (matching on-chain Tally contract) ============
    signal input stateCommitment;
    signal input tallyCommitment;
    signal input newTallyCommitment;

    // ============ Private Inputs ============
    signal input batchNum;  // for isBatchZero check (not in SHA256)

    signal input stateLeaves[batchSize][4];
    signal input ballotNonces[batchSize];
    signal input voteWeights[batchSize][numVoteOptions];
    signal input voteOptionRoots[batchSize];

    signal input stateProofs[batchSize][stateTreeDepth][5];
    signal input statePathIndices[batchSize][stateTreeDepth];

    signal input currentTally[numVoteOptions];
    signal input newTally[numVoteOptions];

    signal input currentTotalSpent;
    signal input newTotalSpent;

    signal input currentPerOptionSpent[numVoteOptions];
    signal input newPerOptionSpent[numVoteOptions];

    signal input currentTallyResultsRoot;
    signal input newTallyResultsRoot;
    signal input currentPerOptionSpentRoot;
    signal input newPerOptionSpentRoot;

    // ============ 1. SHA256 Public Input Verification ============
    // 3 values matching Tally.sol
    component sha256Hasher = Sha256Hasher(3);
    sha256Hasher.inputs[0] <== stateCommitment;
    sha256Hasher.inputs[1] <== tallyCommitment;
    sha256Hasher.inputs[2] <== newTallyCommitment;

    sha256Hasher.out === inputHash;

    // ============ 2. Verify previous tally commitment ============
    component prevTallyCommitHash = Poseidon(3);
    prevTallyCommitHash.inputs[0] <== currentTallyResultsRoot;
    prevTallyCommitHash.inputs[1] <== currentTotalSpent;
    prevTallyCommitHash.inputs[2] <== currentPerOptionSpentRoot;

    component isBatchZero = IsEqual();
    isBatchZero.in[0] <== batchNum;
    isBatchZero.in[1] <== 0;

    signal expectedPrevCommitment;
    expectedPrevCommitment <== (1 - isBatchZero.out) * prevTallyCommitHash.out;
    signal actualPrevCommitment;
    actualPrevCommitment <== (1 - isBatchZero.out) * tallyCommitment;
    expectedPrevCommitment === actualPrevCommitment;

    // ============ 3. Process each voter in batch ============

    // All declarations outside loop
    component stateLeafHash[batchSize];
    component stateInclusion[batchSize];
    component ballotHasher[batchSize];

    signal voterSpent[batchSize];
    signal partialSpent[batchSize][numVoteOptions + 1];
    signal weightSq[batchSize][numVoteOptions];

    for (var i = 0; i < batchSize; i++) {
        // 3.1 Hash state leaf
        stateLeafHash[i] = Poseidon(4);
        stateLeafHash[i].inputs[0] <== stateLeaves[i][0];
        stateLeafHash[i].inputs[1] <== stateLeaves[i][1];
        stateLeafHash[i].inputs[2] <== stateLeaves[i][2];
        stateLeafHash[i].inputs[3] <== stateLeaves[i][3];

        // 3.2 Verify state leaf inclusion (Quinary Merkle)
        stateInclusion[i] = QuinaryMerkleProof(stateTreeDepth);
        stateInclusion[i].leaf <== stateLeafHash[i].out;
        for (var d = 0; d < stateTreeDepth; d++) {
            stateInclusion[i].path_index[d] <== statePathIndices[i][d];
            for (var s = 0; s < 5; s++) {
                stateInclusion[i].path_elements[d][s] <== stateProofs[i][d][s];
            }
        }

        // 3.3 Verify ballot hash
        ballotHasher[i] = Poseidon(2);
        ballotHasher[i].inputs[0] <== ballotNonces[i];
        ballotHasher[i].inputs[1] <== voteOptionRoots[i];

        // 3.4 Compute spent voice credits: sum(weight^2) for all options
        partialSpent[i][0] <== 0;
        for (var j = 0; j < numVoteOptions; j++) {
            weightSq[i][j] <== voteWeights[i][j] * voteWeights[i][j];
            partialSpent[i][j + 1] <== partialSpent[i][j] + weightSq[i][j];
        }
        voterSpent[i] <== partialSpent[i][numVoteOptions];
    }

    // ============ 4. Accumulate Tallies ============
    signal intermediateNewTally[numVoteOptions][batchSize + 1];
    signal intermediatePerOptionSpent[numVoteOptions][batchSize + 1];
    signal optWeightSq[numVoteOptions][batchSize];

    for (var j = 0; j < numVoteOptions; j++) {
        intermediateNewTally[j][0] <== currentTally[j];
        intermediatePerOptionSpent[j][0] <== currentPerOptionSpent[j];

        for (var i = 0; i < batchSize; i++) {
            intermediateNewTally[j][i + 1] <== intermediateNewTally[j][i] + voteWeights[i][j];

            optWeightSq[j][i] <== voteWeights[i][j] * voteWeights[i][j];
            intermediatePerOptionSpent[j][i + 1] <== intermediatePerOptionSpent[j][i] + optWeightSq[j][i];
        }

        intermediateNewTally[j][batchSize] === newTally[j];
        intermediatePerOptionSpent[j][batchSize] === newPerOptionSpent[j];
    }

    // ============ 5. Total Spent Voice Credits ============
    signal totalSpentAccum[batchSize + 1];
    totalSpentAccum[0] <== currentTotalSpent;
    for (var i = 0; i < batchSize; i++) {
        totalSpentAccum[i + 1] <== totalSpentAccum[i] + voterSpent[i];
    }
    totalSpentAccum[batchSize] === newTotalSpent;

    // ============ 6. New Tally Commitment ============
    component newCommitment = Poseidon(3);
    newCommitment.inputs[0] <== newTallyResultsRoot;
    newCommitment.inputs[1] <== newTotalSpent;
    newCommitment.inputs[2] <== newPerOptionSpentRoot;

    newCommitment.out === newTallyCommitment;
}

// Default: small parameters for testing
// Production: stateTreeDepth=10, voteOptionTreeDepth=2, batchSize=5
component main {public [inputHash]} = TallyVotes(2, 1, 2);
