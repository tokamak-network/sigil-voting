pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * Quinary (5-ary) Merkle Proof Verification
 *
 * Each node has 5 children, hashed with Poseidon(5).
 * path_index[i] = 0..4 indicates the position of the node at level i.
 * path_elements[i][5] = all 5 children at level i.
 *
 * The circuit inserts the computed hash at path_index position,
 * replacing whatever value was provided there. The other 4 positions
 * must contain the correct sibling values.
 *
 * Replacing binary MerkleProof for MACI quinary trees.
 */
template QuinaryMerkleProof(depth) {
    signal input leaf;
    signal input path_index[depth];      // 0-4 position at each level
    signal input path_elements[depth][5]; // all 5 children at each level
    signal output root;

    signal hashes[depth + 1];
    hashes[0] <== leaf;

    // Declare all components and signals outside the loop
    component hashers[depth];
    component eqChecks[depth][5];
    signal isPos[depth][5];
    signal children[depth][5];

    for (var i = 0; i < depth; i++) {
        hashers[i] = Poseidon(5);

        // For each of the 5 positions, check if it matches path_index
        for (var j = 0; j < 5; j++) {
            eqChecks[i][j] = IsEqual();
            eqChecks[i][j].in[0] <== path_index[i];
            eqChecks[i][j].in[1] <== j;
            isPos[i][j] <== eqChecks[i][j].out;
        }

        // Build children array: insert hashes[i] at path_index position
        // children[j] = isPos[j] ? hashes[i] : path_elements[i][j]
        for (var j = 0; j < 5; j++) {
            children[i][j] <== isPos[i][j] * (hashes[i] - path_elements[i][j]) + path_elements[i][j];
        }

        hashers[i].inputs[0] <== children[i][0];
        hashers[i].inputs[1] <== children[i][1];
        hashers[i].inputs[2] <== children[i][2];
        hashers[i].inputs[3] <== children[i][3];
        hashers[i].inputs[4] <== children[i][4];

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[depth];
}
