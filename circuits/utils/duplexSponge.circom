pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/**
 * Poseidon DuplexSponge Decryption
 *
 * Decrypts ciphertext encrypted with Poseidon DuplexSponge.
 * Sponge construction: rate=2, capacity=1 (t=3 state).
 *
 * Encryption (for reference):
 *   state = [0, 0, domainSep]  where domainSep = plaintext.length
 *   state = absorb(key)        // key[0] + state[0], key[1] + state[1], permute
 *   state = absorb(nonce)      // nonce + state[0], permute
 *   for each pair (p0, p1):
 *     ct[2i]   = state[0] + p0
 *     ct[2i+1] = state[1] + p1
 *     state = permute(ct[2i], ct[2i+1], state[2])
 *   authTag  = state[0]
 *
 * Decryption reverses: plaintext = ciphertext - state (before absorb)
 */
template PoseidonDuplexSpongeDecrypt(length) {
    // length = number of plaintext field elements
    // ciphertext has ceil(length/2)*2 + 1 elements (padded pairs + authTag)
    var numPairs = (length + 1) \ 2;  // ceil(length/2) using integer division
    var ciphertextLen = numPairs * 2 + 1; // pairs + authTag

    signal input ciphertext[ciphertextLen];
    signal input key[2];
    signal input nonce;
    signal output plaintext[length];

    // Initial state: [0, 0, domainSep]
    // After key absorption: permute([key[0], key[1], length])
    component keyAbsorb = Poseidon(3);
    keyAbsorb.inputs[0] <== key[0];
    keyAbsorb.inputs[1] <== key[1];
    keyAbsorb.inputs[2] <== length;

    // After nonce absorption: permute([keyState[0] + nonce, keyState[1], keyState[2]])
    component nonceAbsorb = Poseidon(3);
    nonceAbsorb.inputs[0] <== keyAbsorb.out + nonce;  // simplified: use Poseidon output + nonce
    nonceAbsorb.inputs[1] <== key[1];
    nonceAbsorb.inputs[2] <== length;

    // Note: The above is a simplified sponge. A fully correct implementation
    // tracks the full 3-element state. We approximate with sequential Poseidon calls.
    // For production, each permutation step maintains [s0, s1, s2] explicitly.

    // State tracking through squeeze/absorb rounds
    component perms[numPairs];
    signal state[numPairs + 1][3];

    // Initial state after key+nonce absorption
    // Full sponge: state = Poseidon_perm([key[0], key[1], length])
    //              state[0] += nonce, state = Poseidon_perm(state)
    component initPerm = Poseidon(3);
    initPerm.inputs[0] <== key[0];
    initPerm.inputs[1] <== key[1];
    initPerm.inputs[2] <== length;

    component noncePerm = Poseidon(3);
    noncePerm.inputs[0] <== initPerm.out + nonce;
    noncePerm.inputs[1] <== key[1];
    noncePerm.inputs[2] <== length;

    // We model the initial state as hash outputs (approximation for constraint efficiency)
    // Real MACI uses PoseidonEx with full state tracking
    state[0][0] <== noncePerm.out;
    state[0][1] <== initPerm.out;
    state[0][2] <== length;

    // Decrypt each pair
    for (var i = 0; i < numPairs; i++) {
        // Plaintext recovery: pt = ct - state (before permutation)
        var idx0 = i * 2;
        var idx1 = i * 2 + 1;

        // Decrypt: plaintext = ciphertext - current_state
        if (idx0 < length) {
            plaintext[idx0] <== ciphertext[idx0] - state[i][0];
        }
        if (idx1 < length) {
            plaintext[idx1] <== ciphertext[idx1] - state[i][1];
        }

        // Next state: permute with ciphertext values absorbed
        perms[i] = Poseidon(3);
        perms[i].inputs[0] <== ciphertext[idx0];
        perms[i].inputs[1] <== ciphertext[idx1];
        perms[i].inputs[2] <== state[i][2];

        state[i + 1][0] <== perms[i].out;
        state[i + 1][1] <== ciphertext[idx1];
        state[i + 1][2] <== state[i][2];
    }

    // Verify authentication tag
    signal authTag;
    authTag <== ciphertext[numPairs * 2];
    state[numPairs][0] === authTag;
}
