pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";

/**
 * Unpack Command
 *
 * MACI commands are packed into a single field element for encryption.
 * This template unpacks the binary-packed command into individual fields.
 *
 * Packed layout (from LSB):
 *   stateIndex:       50 bits  [0..49]
 *   newPubKeyX:       (separate signal, not packed)
 *   newPubKeyY:       (separate signal, not packed)
 *   voteOptionIndex:  50 bits  [50..99]
 *   newVoteWeight:    50 bits  [100..149]
 *   nonce:            50 bits  [150..199]
 *   pollId:           50 bits  [200..249]
 *   salt:             (separate signal, not packed)
 *
 * The packed command fits in a single field element (250 bits < 253 bit field).
 * newPubKey and salt are passed as separate plaintext fields after decryption.
 */
template UnpackCommand() {
    signal input packedCommand;
    signal output stateIndex;
    signal output voteOptionIndex;
    signal output newVoteWeight;
    signal output nonce;
    signal output pollId;

    // Decompose packed command into 250 bits
    component bits = Num2Bits(250);
    bits.in <== packedCommand;

    // Extract stateIndex: bits [0..49]
    component stateIndexNum = Bits2Num(50);
    for (var i = 0; i < 50; i++) {
        stateIndexNum.in[i] <== bits.out[i];
    }
    stateIndex <== stateIndexNum.out;

    // Extract voteOptionIndex: bits [50..99]
    component voteOptNum = Bits2Num(50);
    for (var i = 0; i < 50; i++) {
        voteOptNum.in[i] <== bits.out[50 + i];
    }
    voteOptionIndex <== voteOptNum.out;

    // Extract newVoteWeight: bits [100..149]
    component weightNum = Bits2Num(50);
    for (var i = 0; i < 50; i++) {
        weightNum.in[i] <== bits.out[100 + i];
    }
    newVoteWeight <== weightNum.out;

    // Extract nonce: bits [150..199]
    component nonceNum = Bits2Num(50);
    for (var i = 0; i < 50; i++) {
        nonceNum.in[i] <== bits.out[150 + i];
    }
    nonce <== nonceNum.out;

    // Extract pollId: bits [200..249]
    component pollIdNum = Bits2Num(50);
    for (var i = 0; i < 50; i++) {
        pollIdNum.in[i] <== bits.out[200 + i];
    }
    pollId <== pollIdNum.out;
}
