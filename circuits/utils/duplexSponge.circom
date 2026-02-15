pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

/**
 * Poseidon DuplexSponge Decryption
 *
 * Compatible with @zk-kit/poseidon-cipher and MACI maci-crypto.
 * Uses PoseidonEx(3, 4) for full t=4 state permutation.
 *
 * Sponge construction (t=4, rate=3, capacity=1):
 *   1. Initial state = [0, key[0], key[1], nonce + length * 2^128]
 *   2. For each 3-element block:
 *      - Permute state via PoseidonEx(3, 4)
 *      - Decrypt: pt[j] = ct[j] - state[j+1]  (j = 0,1,2)
 *      - Absorb: state[j+1] = ct[j]  (for next permutation)
 *   3. Final permute, verify authTag == state[1]
 *
 * Circom equivalent of: @zk-kit/poseidon-cipher poseidonDecrypt()
 */
template PoseidonDuplexSpongeDecrypt(length) {
    // Pad to multiple of 3 (rate = 3)
    var numBlocks = (length + 2) \ 3;   // ceil(length / 3)
    var paddedLen = numBlocks * 3;
    var ciphertextLen = paddedLen + 1;   // padded blocks + 1 auth tag

    signal input ciphertext[ciphertextLen];
    signal input key[2];
    signal input nonce;
    signal output plaintext[length];

    // 2^128 for domain separation
    var TWO128 = 340282366920938463463374607431768211456;

    // ============ Initial State ============
    // state = [0, key[0], key[1], nonce + length * 2^128]
    //
    // Note: the initial state[3] encodes both nonce and plaintext length
    // for domain separation, matching @zk-kit/poseidon-cipher.

    signal initState3;
    initState3 <== nonce + length * TWO128;

    // ============ Block Processing ============
    // Each block: permute → decrypt 3 elements → absorb ciphertext

    component perms[numBlocks];

    // State after each permutation: perms[i].out[0..3]
    // Before first permutation, state = [0, key[0], key[1], initState3]

    // Decrypted (including padding) — we'll slice to `length` at the end
    signal decrypted[paddedLen];

    for (var i = 0; i < numBlocks; i++) {
        // Permute state
        perms[i] = PoseidonEx(3, 4);

        if (i == 0) {
            // First block: initial state
            perms[i].initialState <== 0;
            perms[i].inputs[0] <== key[0];
            perms[i].inputs[1] <== key[1];
            perms[i].inputs[2] <== initState3;
        } else {
            // Subsequent blocks: state = [perms[i-1].out[0], ct[prev_0], ct[prev_1], ct[prev_2]]
            // After absorb: rate portion (state[1..3]) is set to ciphertext values
            perms[i].initialState <== perms[i - 1].out[0];
            perms[i].inputs[0] <== ciphertext[(i - 1) * 3];
            perms[i].inputs[1] <== ciphertext[(i - 1) * 3 + 1];
            perms[i].inputs[2] <== ciphertext[(i - 1) * 3 + 2];
        }

        // Decrypt: pt[j] = ct[j] - permuted_state[j+1]
        for (var j = 0; j < 3; j++) {
            decrypted[i * 3 + j] <== ciphertext[i * 3 + j] - perms[i].out[j + 1];
        }
    }

    // ============ Padding Verification ============
    // Padded elements must be 0
    for (var i = length; i < paddedLen; i++) {
        decrypted[i] === 0;
    }

    // ============ Auth Tag Verification ============
    // Final permutation with last block's ciphertext absorbed
    component authPerm = PoseidonEx(3, 4);
    authPerm.initialState <== perms[numBlocks - 1].out[0];
    authPerm.inputs[0] <== ciphertext[(numBlocks - 1) * 3];
    authPerm.inputs[1] <== ciphertext[(numBlocks - 1) * 3 + 1];
    authPerm.inputs[2] <== ciphertext[(numBlocks - 1) * 3 + 2];

    // Auth tag is the last element of ciphertext, must equal state[1] after final permute
    authPerm.out[1] === ciphertext[paddedLen];

    // ============ Output ============
    for (var i = 0; i < length; i++) {
        plaintext[i] <== decrypted[i];
    }
}

/**
 * Poseidon DuplexSponge Encryption (for testing/verification)
 *
 * Same sponge construction as decryption, but in encrypt direction.
 */
template PoseidonDuplexSpongeEncrypt(length) {
    var numBlocks = (length + 2) \ 3;
    var paddedLen = numBlocks * 3;
    var ciphertextLen = paddedLen + 1;

    signal input plaintext[length];
    signal input key[2];
    signal input nonce;
    signal output ciphertext[ciphertextLen];

    var TWO128 = 340282366920938463463374607431768211456;

    signal initState3;
    initState3 <== nonce + length * TWO128;

    // Pad plaintext with zeros
    signal padded[paddedLen];
    for (var i = 0; i < length; i++) {
        padded[i] <== plaintext[i];
    }
    for (var i = length; i < paddedLen; i++) {
        padded[i] <== 0;
    }

    component perms[numBlocks];

    // After permutation, state[1..3] + plaintext[0..2] = ciphertext[0..2]
    // Then absorb: state[1..3] = ciphertext[0..2] for next block

    for (var i = 0; i < numBlocks; i++) {
        perms[i] = PoseidonEx(3, 4);

        if (i == 0) {
            perms[i].initialState <== 0;
            perms[i].inputs[0] <== key[0];
            perms[i].inputs[1] <== key[1];
            perms[i].inputs[2] <== initState3;
        } else {
            // State after absorb: [perms[i-1].out[0], ct[prev_0], ct[prev_1], ct[prev_2]]
            perms[i].initialState <== perms[i - 1].out[0];
            perms[i].inputs[0] <== ciphertext[(i - 1) * 3];
            perms[i].inputs[1] <== ciphertext[(i - 1) * 3 + 1];
            perms[i].inputs[2] <== ciphertext[(i - 1) * 3 + 2];
        }

        // Encrypt: ct[j] = state[j+1] + pt[j]
        for (var j = 0; j < 3; j++) {
            ciphertext[i * 3 + j] <== perms[i].out[j + 1] + padded[i * 3 + j];
        }
    }

    // Auth tag: final permute with last ciphertext absorbed
    component authPerm = PoseidonEx(3, 4);
    authPerm.initialState <== perms[numBlocks - 1].out[0];
    authPerm.inputs[0] <== ciphertext[(numBlocks - 1) * 3];
    authPerm.inputs[1] <== ciphertext[(numBlocks - 1) * 3 + 1];
    authPerm.inputs[2] <== ciphertext[(numBlocks - 1) * 3 + 2];

    ciphertext[paddedLen] <== authPerm.out[1];
}
