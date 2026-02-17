pragma circom 2.1.6;

include "circomlib/circuits/sha256/sha256.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/**
 * SHA256 Public Input Hasher
 *
 * Compresses multiple field elements into a single public input
 * using SHA256, matching the on-chain computation:
 *   publicInputHash = sha256(abi.encodePacked(values...)) & ((1 << 253) - 1)
 *
 * Each input is treated as a 256-bit value (uint256 in Solidity).
 * Total bits = numInputs * 256.
 *
 * NOTE: Field elements (Poseidon outputs) can be up to ~254 bits.
 *       We use Num2Bits(254) to handle all valid field elements.
 *       Output is masked to 253 bits for guaranteed field compatibility.
 */
template Sha256Hasher(numInputs) {
    signal input inputs[numInputs];
    signal output out;

    var totalBits = numInputs * 256;

    // Convert each input to 254 bits (field elements < 2^254)
    component toBits[numInputs];
    for (var i = 0; i < numInputs; i++) {
        toBits[i] = Num2Bits(254);
    }

    for (var i = 0; i < numInputs; i++) {
        toBits[i].in <== inputs[i];
    }

    // SHA256 hash of concatenated bits
    component sha = Sha256(totalBits);

    // Pack bits into SHA256 input (big-endian per uint256)
    for (var i = 0; i < numInputs; i++) {
        // Solidity abi.encodePacked uses big-endian 256-bit words
        // Pad high 2 bits with 0, then place 254 bits
        for (var b = 0; b < 2; b++) {
            sha.in[i * 256 + b] <== 0;  // High 2 bits = 0 (field < 2^254)
        }
        for (var b = 0; b < 254; b++) {
            // Big-endian: MSB first
            sha.in[i * 256 + 2 + b] <== toBits[i].out[253 - b];
        }
    }

    // Convert SHA256 output to field element (lower 253 bits)
    component toNum = Bits2Num(253);
    // Take lower 253 bits of SHA256 output (guaranteed < p)
    for (var i = 0; i < 253; i++) {
        toNum.in[i] <== sha.out[255 - i];  // Big-endian → little-endian for Bits2Num
    }

    out <== toNum.out;
}
