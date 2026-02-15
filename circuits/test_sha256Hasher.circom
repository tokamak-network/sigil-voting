pragma circom 2.1.6;

include "utils/sha256Hasher.circom";

// Test with 4 inputs (same as TallyVotes)
component main = Sha256Hasher(4);
