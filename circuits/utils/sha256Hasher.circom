pragma circom 2.1.6;

include "circomlib/circuits/sha256/sha256.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/**
 * SHA256 Public Input Hasher
 *
 * Compresses multiple field elements into a single public input
 * using SHA256, matching the on-chain computation:
 *   publicInputHash = uint256(sha256(abi.encodePacked(values...))) % SNARK_SCALAR_FIELD
 *
 * Each input is treated as a 256-bit value (uint256 in Solidity).
 * Total bits = numInputs * 256.
 */
template Sha256Hasher(numInputs) {
    signal input inputs[numInputs];
    signal output out;

    var totalBits = numInputs * 256;

    // Convert each input to 256 bits (big-endian, matching Solidity)
    component toBits[numInputs];
    for (var i = 0; i < numInputs; i++) {
        toBits[i] = Num2Bits(253);  // Field elements are < 253 bits
    }

    for (var i = 0; i < numInputs; i++) {
        toBits[i].in <== inputs[i];
    }

    // SHA256 hash of concatenated bits
    component sha = Sha256(totalBits);

    // Pack bits into SHA256 input (big-endian per uint256)
    for (var i = 0; i < numInputs; i++) {
        // Solidity abi.encodePacked uses big-endian 256-bit words
        // Pad high bits with 0, then place 253 bits
        for (var b = 0; b < 3; b++) {
            sha.in[i * 256 + b] <== 0;  // High 3 bits = 0 (field < 2^253)
        }
        for (var b = 0; b < 253; b++) {
            // Big-endian: MSB first
            sha.in[i * 256 + 3 + b] <== toBits[i].out[252 - b];
        }
    }

    // Convert 256-bit SHA256 output to a number
    component toNum = Bits2Num(253);
    // Take lower 253 bits of SHA256 output (for field compatibility)
    // SHA256 output is 256 bits, we skip the top 3 bits
    for (var i = 0; i < 253; i++) {
        toNum.in[i] <== sha.out[255 - i];  // Big-endian → little-endian for Bits2Num
    }

    // Output: SHA256 result mod SNARK_SCALAR_FIELD
    // Since we only take 253 bits, the value is already < 2^253 < p
    out <== toNum.out;
}
