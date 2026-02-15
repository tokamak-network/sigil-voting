pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Test circuit for tally commitment: poseidon_3(votesRoot, totalSpent, perOptionSpent)
template TestTallyCommitment() {
    signal input tallyResultsRoot;
    signal input totalSpent;
    signal input perOptionSpentRoot;
    signal output commitment;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== tallyResultsRoot;
    hasher.inputs[1] <== totalSpent;
    hasher.inputs[2] <== perOptionSpentRoot;

    commitment <== hasher.out;
}

component main = TestTallyCommitment();
