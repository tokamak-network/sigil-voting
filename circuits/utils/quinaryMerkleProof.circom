pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * Quinary (5-ary) Merkle Proof Verification
 *
 * Each node has 5 children, hashed with Poseidon(5).
 * path_index[i] = 0..4 indicates the position of the node at level i.
 * path_elements[i][4] = the 4 sibling nodes at level i.
 *
 * The prover must arrange path_elements such that:
 *   path_elements[i][0..3] = siblings in order, skipping the leaf's position.
 *   i.e., [child_0, ..., child_{idx-1}, child_{idx+1}, ..., child_4]
 *
 * Replacing binary MerkleProof for MACI quinary trees.
 */
template QuinaryMerkleProof(depth) {
    signal input leaf;
    signal input path_index[depth];      // 0-4 position at each level
    signal input path_elements[depth][4]; // 4 siblings at each level
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
        // children[j] = isPos[j] ? hashes[i] : path_elements[i][j or j-1]
        //
        // Simplified: prover provides path_elements in adjusted order
        // path_elements[i][j] corresponds to position j when j < path_index,
        // and position j+1 when j >= path_index.
        // So: children[j] = isPos[j] * hashes[i] + (1 - isPos[j]) * path_elements[i][min(j, 3)]
        for (var j = 0; j < 4; j++) {
            children[i][j] <== isPos[i][j] * (hashes[i] - path_elements[i][j]) + path_elements[i][j];
        }
        // Position 4: sibling index is 3
        children[i][4] <== isPos[i][4] * (hashes[i] - path_elements[i][3]) + path_elements[i][3];

        hashers[i].inputs[0] <== children[i][0];
        hashers[i].inputs[1] <== children[i][1];
        hashers[i].inputs[2] <== children[i][2];
        hashers[i].inputs[3] <== children[i][3];
        hashers[i].inputs[4] <== children[i][4];

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[depth];
}
