pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/escalarmulany.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/gates.circom";

include "utils/quinaryMerkleProof.circom";
include "utils/sha256Hasher.circom";
include "utils/unpackCommand.circom";
include "utils/duplexSponge.circom";

/**
 * MACI MessageProcessor Circuit
 *
 * Verifies correct state transitions from encrypted vote messages.
 * Key properties:
 *   1. In-circuit DuplexSponge decryption (no trust assumption)
 *   2. Reverse processing: messages[0] = last submitted message (MACI core)
 *   3. Index 0 routing: invalid messages apply to blank leaf at index 0
 *   4. SHA256-compressed public inputs (gas efficiency)
 *   5. Quinary (5-ary) Merkle trees
 *   6. EdDSA-Poseidon signature verification
 *
 * SHA256 matches on-chain MessageProcessor contract:
 *   sha256(currentStateCommitment, newStateCommitment, inputMessageRoot, numMessages)
 *
 * Parameters:
 *   stateTreeDepth       - Quinary state tree depth
 *   messageTreeDepth     - Quinary message tree depth
 *   voteOptionTreeDepth  - Vote option tree depth
 *   batchSize            - Number of messages per batch
 */
template MessageProcessor(
    stateTreeDepth,
    messageTreeDepth,
    voteOptionTreeDepth,
    batchSize
) {
    // ============ Public Input (SHA256 compressed) ============
    signal input inputHash;

    // ============ SHA256 hash values (matching on-chain contract) ============
    signal input currentStateCommitment;  // contract's stored value (0 for first batch)
    signal input numMessages;             // from Poll.numMessages()

    // ============ Private Inputs (roots for Merkle proofs) ============
    signal input inputStateRoot;
    signal input outputStateRoot;
    signal input inputBallotRoot;
    signal input outputBallotRoot;
    signal input inputMessageRoot;
    signal input numSignUps;              // for indexCheck (stateIndex < numSignUps)

    // ============ Private Inputs (per message) ============
    signal input messages[batchSize][10];        // Encrypted message (10 fields)
    signal input encPubKeys[batchSize][2];       // Ephemeral public keys
    signal input coordinatorSk;                  // Coordinator secret key

    // Message nonces for DuplexSponge decryption (per message)
    signal input msgNonces[batchSize];

    signal input stateLeaves[batchSize][4];      // [pkX, pkY, balance, timestamp]
    signal input ballots[batchSize][2];          // [nonce, voteOptionRoot]
    signal input ballotVoteWeights[batchSize];   // Current vote weight for the option

    signal input stateProofs[batchSize][stateTreeDepth][5];
    signal input statePathIndices[batchSize][stateTreeDepth];
    signal input ballotProofs[batchSize][stateTreeDepth][5];
    signal input ballotPathIndices[batchSize][stateTreeDepth];
    signal input msgProofs[batchSize][messageTreeDepth][5];
    signal input msgPathIndices[batchSize][messageTreeDepth];

    // ============ 1. SHA256 Public Input Verification ============
    // Compute newStateCommitment in-circuit
    component newStateCommit = Poseidon(2);
    newStateCommit.inputs[0] <== outputStateRoot;
    newStateCommit.inputs[1] <== outputBallotRoot;

    // SHA256: 4 values matching MessageProcessor.sol
    component sha256Hasher = Sha256Hasher(4);
    sha256Hasher.inputs[0] <== currentStateCommitment;
    sha256Hasher.inputs[1] <== newStateCommit.out;
    sha256Hasher.inputs[2] <== inputMessageRoot;
    sha256Hasher.inputs[3] <== numMessages;

    sha256Hasher.out === inputHash;

    // ============ 2. Coordinator Key Derivation ============
    component coordPubKey = BabyPbk();
    coordPubKey.in <== coordinatorSk;

    // ============ 3. Per-message processing ============
    // messages[0] = last submitted (MACI reverse processing)

    signal currentStateRoot[batchSize + 1];
    signal currentBallotRoot[batchSize + 1];
    currentStateRoot[0] <== inputStateRoot;
    currentBallotRoot[0] <== inputBallotRoot;

    // -- All component/signal declarations (outside loop) --

    // Padding detection (zero encPubKey = padding message) — must be BEFORE ECDH
    component encKeyIsZero[batchSize];

    // Mux to replace (0,0) with coordinator pubkey for safe ECDH
    component encPubXMux[batchSize];
    component encPubYMux[batchSize];

    // ECDH: scalar mul coordinator_sk * encPubKey
    component ecdhMul[batchSize];
    component skBits[batchSize];

    // In-circuit DuplexSponge decryption
    component decrypt[batchSize];

    // Command unpacking
    component unpack[batchSize];

    // Command hash for EdDSA
    component cmdHash[batchSize];

    // EdDSA verification
    component sigVerify[batchSize];

    // Validity checks
    component indexCheck[batchSize];
    component nonceCheck[batchSize];
    component validityAnd[batchSize];

    // Mux for index 0 routing
    component targetIndexMux[batchSize];

    // State leaf hashing
    component stateLeafHash[batchSize];
    component newStateLeafHash[batchSize];

    // Ballot hashing
    component ballotHash[batchSize];
    component newBallotHash[batchSize];

    // Merkle proofs
    component stateIncBefore[batchSize];
    component stateIncAfter[batchSize];
    component ballotIncBefore[batchSize];
    component ballotIncAfter[batchSize];
    component msgInclusion[batchSize];
    component msgLeafHash1[batchSize];
    component msgLeafHash2[batchSize];
    component msgFinalHash[batchSize];

    // Mux components for valid/invalid branching
    component pkXMux[batchSize];
    component pkYMux[batchSize];
    component balMux[batchSize];
    component nonceMux[batchSize];

    // Intermediate signals
    signal currentWeightSq[batchSize];
    signal newWeightSq[batchSize];
    signal newBalance[batchSize];
    signal finalPkX[batchSize];
    signal finalPkY[batchSize];
    signal finalBalance[batchSize];
    signal newNonce[batchSize];

    for (var i = 0; i < batchSize; i++) {
        // ---- 3.0 Padding Detection (MUST be before ECDH) ----
        // Detect padding messages: encPubKey == [0, 0] means padding
        encKeyIsZero[i] = IsEqual();
        encKeyIsZero[i].in[0] <== encPubKeys[i][0] + encPubKeys[i][1];
        encKeyIsZero[i].in[1] <== 0;

        // ---- 3.0.1 Safe encPubKey for ECDH ----
        // (0,0) is NOT on Baby Jubjub → EscalarMulAny will fail
        // Replace with coordinator pubkey for padding messages (valid curve point)
        encPubXMux[i] = Mux1();
        encPubXMux[i].c[0] <== encPubKeys[i][0];    // s=0: real encPubKey (normal)
        encPubXMux[i].c[1] <== coordPubKey.Ax;       // s=1: coordinator key (padding)
        encPubXMux[i].s <== encKeyIsZero[i].out;

        encPubYMux[i] = Mux1();
        encPubYMux[i].c[0] <== encPubKeys[i][1];
        encPubYMux[i].c[1] <== coordPubKey.Ay;
        encPubYMux[i].s <== encKeyIsZero[i].out;

        // ---- 3.1 ECDH Key Exchange ----
        // Compute shared key: coordinatorSk * safeEncPubKey[i]
        // For padding: uses coordPubKey (produces valid but irrelevant shared key)
        skBits[i] = Num2Bits(253);
        skBits[i].in <== coordinatorSk;

        ecdhMul[i] = EscalarMulAny(253);
        for (var b = 0; b < 253; b++) {
            ecdhMul[i].e[b] <== skBits[i].out[b];
        }
        ecdhMul[i].p[0] <== encPubXMux[i].out;
        ecdhMul[i].p[1] <== encPubYMux[i].out;

        // ---- 3.2 In-Circuit DuplexSponge Decryption ----
        // Plaintext: 7 fields [packedCmd, newPubKeyX, newPubKeyY, salt, sigR8x, sigR8y, sigS]
        // Ciphertext: 10 fields (7 padded to 9, 3 blocks of 3, + 1 auth tag)
        decrypt[i] = PoseidonDuplexSpongeDecrypt(7);
        for (var j = 0; j < 10; j++) {
            decrypt[i].ciphertext[j] <== messages[i][j];
        }
        decrypt[i].key[0] <== ecdhMul[i].out[0];
        decrypt[i].key[1] <== ecdhMul[i].out[1];
        decrypt[i].nonce <== msgNonces[i];
        decrypt[i].enabled <== 1 - encKeyIsZero[i].out; // Skip auth tag for padding

        // Decrypted plaintext fields:
        // decrypt[i].plaintext[0] = packedCommand
        // decrypt[i].plaintext[1] = newPubKeyX
        // decrypt[i].plaintext[2] = newPubKeyY
        // decrypt[i].plaintext[3] = salt
        // decrypt[i].plaintext[4] = sigR8x
        // decrypt[i].plaintext[5] = sigR8y
        // decrypt[i].plaintext[6] = sigS

        // ---- 3.3 Unpack Command ----
        unpack[i] = UnpackCommand();
        unpack[i].packedCommand <== decrypt[i].plaintext[0];

        // ---- 3.4 Command Hash (for EdDSA verification) ----
        cmdHash[i] = Poseidon(5);
        cmdHash[i].inputs[0] <== unpack[i].stateIndex;
        cmdHash[i].inputs[1] <== decrypt[i].plaintext[1]; // newPubKeyX
        cmdHash[i].inputs[2] <== decrypt[i].plaintext[2]; // newPubKeyY
        cmdHash[i].inputs[3] <== unpack[i].newVoteWeight;
        cmdHash[i].inputs[4] <== decrypt[i].plaintext[3]; // salt

        // ---- 3.5 EdDSA Signature Verification ----
        // encKeyIsZero already computed above (before DuplexSponge)
        sigVerify[i] = EdDSAPoseidonVerifier();
        sigVerify[i].enabled <== 1 - encKeyIsZero[i].out;
        sigVerify[i].Ax <== stateLeaves[i][0]; // Current pubKey X
        sigVerify[i].Ay <== stateLeaves[i][1]; // Current pubKey Y
        sigVerify[i].R8x <== decrypt[i].plaintext[4]; // sigR8x
        sigVerify[i].R8y <== decrypt[i].plaintext[5]; // sigR8y
        sigVerify[i].S <== decrypt[i].plaintext[6];   // sigS
        sigVerify[i].M <== cmdHash[i].out;

        // ---- 3.6 Validity Checks ----

        // Check: stateIndex < numSignUps
        indexCheck[i] = LessThan(50);
        indexCheck[i].in[0] <== unpack[i].stateIndex;
        indexCheck[i].in[1] <== numSignUps;

        // Check: nonce === ballot.nonce + 1
        nonceCheck[i] = IsEqual();
        nonceCheck[i].in[0] <== unpack[i].nonce;
        nonceCheck[i].in[1] <== ballots[i][0] + 1;

        // Combined validity
        validityAnd[i] = AND();
        validityAnd[i].a <== indexCheck[i].out;
        validityAnd[i].b <== nonceCheck[i].out;

        // ---- 3.7 Index 0 Routing (MACI Core) ----
        // invalid → index 0 (blank leaf); valid → actual stateIndex
        targetIndexMux[i] = Mux1();
        targetIndexMux[i].c[0] <== 0;
        targetIndexMux[i].c[1] <== unpack[i].stateIndex;
        targetIndexMux[i].s <== validityAnd[i].out;

        // ---- 3.8 State Leaf Verification ----
        stateLeafHash[i] = Poseidon(4);
        stateLeafHash[i].inputs[0] <== stateLeaves[i][0]; // pkX
        stateLeafHash[i].inputs[1] <== stateLeaves[i][1]; // pkY
        stateLeafHash[i].inputs[2] <== stateLeaves[i][2]; // balance
        stateLeafHash[i].inputs[3] <== stateLeaves[i][3]; // timestamp

        // Verify state leaf is in current state tree
        stateIncBefore[i] = QuinaryMerkleProof(stateTreeDepth);
        stateIncBefore[i].leaf <== stateLeafHash[i].out;
        for (var d = 0; d < stateTreeDepth; d++) {
            stateIncBefore[i].path_index[d] <== statePathIndices[i][d];
            for (var s = 0; s < 5; s++) {
                stateIncBefore[i].path_elements[d][s] <== stateProofs[i][d][s];
            }
        }
        stateIncBefore[i].root === currentStateRoot[i];

        // ---- 3.9 State Update ----
        // Voice credit: newBalance = balance + currentWeight^2 - newWeight^2
        currentWeightSq[i] <== ballotVoteWeights[i] * ballotVoteWeights[i];
        newWeightSq[i] <== unpack[i].newVoteWeight * unpack[i].newVoteWeight;
        newBalance[i] <== stateLeaves[i][2] + currentWeightSq[i] - newWeightSq[i];

        // Mux: valid → new values; invalid → keep original
        pkXMux[i] = Mux1();
        pkXMux[i].c[0] <== stateLeaves[i][0];
        pkXMux[i].c[1] <== decrypt[i].plaintext[1]; // newPubKeyX
        pkXMux[i].s <== validityAnd[i].out;
        finalPkX[i] <== pkXMux[i].out;

        pkYMux[i] = Mux1();
        pkYMux[i].c[0] <== stateLeaves[i][1];
        pkYMux[i].c[1] <== decrypt[i].plaintext[2]; // newPubKeyY
        pkYMux[i].s <== validityAnd[i].out;
        finalPkY[i] <== pkYMux[i].out;

        balMux[i] = Mux1();
        balMux[i].c[0] <== stateLeaves[i][2];
        balMux[i].c[1] <== newBalance[i];
        balMux[i].s <== validityAnd[i].out;
        finalBalance[i] <== balMux[i].out;

        // New state leaf hash
        newStateLeafHash[i] = Poseidon(4);
        newStateLeafHash[i].inputs[0] <== finalPkX[i];
        newStateLeafHash[i].inputs[1] <== finalPkY[i];
        newStateLeafHash[i].inputs[2] <== finalBalance[i];
        newStateLeafHash[i].inputs[3] <== stateLeaves[i][3]; // timestamp unchanged

        // Updated state root
        stateIncAfter[i] = QuinaryMerkleProof(stateTreeDepth);
        stateIncAfter[i].leaf <== newStateLeafHash[i].out;
        for (var d = 0; d < stateTreeDepth; d++) {
            stateIncAfter[i].path_index[d] <== statePathIndices[i][d];
            for (var s = 0; s < 5; s++) {
                stateIncAfter[i].path_elements[d][s] <== stateProofs[i][d][s];
            }
        }
        currentStateRoot[i + 1] <== stateIncAfter[i].root;

        // ---- 3.10 Ballot Update ----
        ballotHash[i] = Poseidon(2);
        ballotHash[i].inputs[0] <== ballots[i][0]; // nonce
        ballotHash[i].inputs[1] <== ballots[i][1]; // voteOptionRoot

        ballotIncBefore[i] = QuinaryMerkleProof(stateTreeDepth);
        ballotIncBefore[i].leaf <== ballotHash[i].out;
        for (var d = 0; d < stateTreeDepth; d++) {
            ballotIncBefore[i].path_index[d] <== ballotPathIndices[i][d];
            for (var s = 0; s < 5; s++) {
                ballotIncBefore[i].path_elements[d][s] <== ballotProofs[i][d][s];
            }
        }
        ballotIncBefore[i].root === currentBallotRoot[i];

        // Nonce update: valid → nonce+1; invalid → keep
        nonceMux[i] = Mux1();
        nonceMux[i].c[0] <== ballots[i][0];
        nonceMux[i].c[1] <== ballots[i][0] + 1;
        nonceMux[i].s <== validityAnd[i].out;
        newNonce[i] <== nonceMux[i].out;

        newBallotHash[i] = Poseidon(2);
        newBallotHash[i].inputs[0] <== newNonce[i];
        newBallotHash[i].inputs[1] <== ballots[i][1]; // voteOptionRoot (simplified)

        ballotIncAfter[i] = QuinaryMerkleProof(stateTreeDepth);
        ballotIncAfter[i].leaf <== newBallotHash[i].out;
        for (var d = 0; d < stateTreeDepth; d++) {
            ballotIncAfter[i].path_index[d] <== ballotPathIndices[i][d];
            for (var s = 0; s < 5; s++) {
                ballotIncAfter[i].path_elements[d][s] <== ballotProofs[i][d][s];
            }
        }
        currentBallotRoot[i + 1] <== ballotIncAfter[i].root;

        // ---- 3.11 Message Inclusion ----
        // Hash message the same way as Poll.hashMessageAndEncPubKey
        msgLeafHash1[i] = Poseidon(5);
        msgLeafHash1[i].inputs[0] <== messages[i][0];
        msgLeafHash1[i].inputs[1] <== messages[i][1];
        msgLeafHash1[i].inputs[2] <== messages[i][2];
        msgLeafHash1[i].inputs[3] <== messages[i][3];
        msgLeafHash1[i].inputs[4] <== messages[i][4];

        msgLeafHash2[i] = Poseidon(5);
        msgLeafHash2[i].inputs[0] <== messages[i][5];
        msgLeafHash2[i].inputs[1] <== messages[i][6];
        msgLeafHash2[i].inputs[2] <== messages[i][7];
        msgLeafHash2[i].inputs[3] <== messages[i][8];
        msgLeafHash2[i].inputs[4] <== messages[i][9];

        msgFinalHash[i] = Poseidon(4);
        msgFinalHash[i].inputs[0] <== msgLeafHash1[i].out;
        msgFinalHash[i].inputs[1] <== msgLeafHash2[i].out;
        msgFinalHash[i].inputs[2] <== encPubKeys[i][0];
        msgFinalHash[i].inputs[3] <== encPubKeys[i][1];

        msgInclusion[i] = QuinaryMerkleProof(messageTreeDepth);
        msgInclusion[i].leaf <== msgFinalHash[i].out;
        for (var d = 0; d < messageTreeDepth; d++) {
            msgInclusion[i].path_index[d] <== msgPathIndices[i][d];
            for (var s = 0; s < 5; s++) {
                msgInclusion[i].path_elements[d][s] <== msgProofs[i][d][s];
            }
        }
        // Conditional: skip message inclusion check for padding messages
        (msgInclusion[i].root - inputMessageRoot) * (1 - encKeyIsZero[i].out) === 0;
    }

    // ============ 4. Final Root Verification ============
    currentStateRoot[batchSize] === outputStateRoot;
    currentBallotRoot[batchSize] === outputBallotRoot;
}

// Default: small parameters for testing/compilation
// Production: stateTreeDepth=10, messageTreeDepth=10, voteOptionTreeDepth=3, batchSize=5
component main {public [inputHash]} = MessageProcessor(2, 2, 2, 2);
