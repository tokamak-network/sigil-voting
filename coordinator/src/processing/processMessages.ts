/**
 * MACI Message Processing (Reverse Order)
 *
 * Core MACI logic:
 *   1. Messages are processed in REVERSE order (last submitted first)
 *   2. Invalid messages are routed to index 0 (blank leaf)
 *   3. Decryption uses Poseidon DuplexSponge (not CTR)
 *   4. EdDSA-Poseidon signature verification
 *   5. Key Change support via newPubKey fields
 */

import type { QuinaryMerkleTree } from '../trees/quinaryTree.js';

// Re-use crypto modules from src/crypto
// In production, import from shared package

export interface EncryptedMessage {
  data: bigint[];       // 10 field elements (DuplexSponge encrypted)
  encPubKeyX: bigint;
  encPubKeyY: bigint;
  messageIndex: number;
}

export interface Command {
  stateIndex: bigint;
  newPubKeyX: bigint;
  newPubKeyY: bigint;
  voteOptionIndex: bigint;
  newVoteWeight: bigint;
  nonce: bigint;
  pollId: bigint;
  salt: bigint;
}

export interface StateLeaf {
  pubKeyX: bigint;
  pubKeyY: bigint;
  voiceCreditBalance: bigint;
  timestamp: bigint;
}

export interface Ballot {
  nonce: bigint;
  votes: bigint[];       // per vote option
  voteOptionRoot: bigint;
}

export interface ProcessResult {
  newStateRoot: bigint;
  newBallotRoot: bigint;
  processedCount: number;
  invalidCount: number;
}

export interface ProcessBatchInput {
  coordinatorSk: bigint;
  messages: EncryptedMessage[];
  stateTree: QuinaryMerkleTree;
  ballotTree: QuinaryMerkleTree;
  numSignUps: number;
  maxVoteOptions: number;
  ecdh: (sk: bigint, pubKey: [bigint, bigint]) => bigint[];
  decrypt: (ciphertext: bigint[], key: bigint[], nonce: bigint) => bigint[];
  verifyEdDSA: (msg: bigint, sig: { R8: bigint[], S: bigint }, pubKey: bigint[]) => boolean;
  hashStateLeaf: (leaf: StateLeaf) => bigint;
  hashBallot: (ballot: Ballot) => bigint;
  hashCommand: (cmd: Command) => bigint;
  unpackCommand: (packed: bigint) => Command;
}

/**
 * Process all messages in REVERSE order (MACI core)
 *
 * Key Change defense: reverse processing ensures the LAST message
 * from a user takes priority. If a user submits a key change after
 * being coerced, the key change invalidates all prior messages signed
 * with the old key.
 */
export async function processMessages(input: ProcessBatchInput): Promise<ProcessResult> {
  const {
    coordinatorSk,
    messages,
    stateTree,
    ballotTree,
    numSignUps,
    maxVoteOptions,
    ecdh,
    decrypt,
    verifyEdDSA,
    hashStateLeaf,
    hashBallot,
    hashCommand,
    unpackCommand,
  } = input;

  // ★★★ MACI CORE: Reverse processing (last message first) ★★★
  const reversed = [...messages].reverse();

  let processedCount = 0;
  let invalidCount = 0;

  // Track state leaves and ballots in memory
  const stateLeaves = new Map<number, StateLeaf>();
  const ballots = new Map<number, Ballot>();

  for (const msg of reversed) {
    // 1. ECDH: shared key = coordinatorSk * encPubKey
    const sharedKey = ecdh(coordinatorSk, [msg.encPubKeyX, msg.encPubKeyY]);

    // 2. Poseidon DuplexSponge decryption
    const plaintext = decrypt(msg.data, sharedKey, BigInt(msg.messageIndex));

    // 3. Unpack command
    const command = unpackCommand(plaintext[0]);
    command.newPubKeyX = plaintext[1];
    command.newPubKeyY = plaintext[2];
    command.salt = plaintext[3];

    const signature = {
      R8: [plaintext[4], plaintext[5]],
      S: plaintext[6],
    };

    // 4. Get current state leaf
    const stateIndex = Number(command.stateIndex);
    let stateLeaf = stateLeaves.get(stateIndex);
    if (!stateLeaf) {
      // Load from tree (would need deserialization in production)
      stateLeaf = {
        pubKeyX: 0n,
        pubKeyY: 0n,
        voiceCreditBalance: 0n,
        timestamp: 0n,
      };
    }

    let ballot = ballots.get(stateIndex);
    if (!ballot) {
      ballot = {
        nonce: 0n,
        votes: new Array(maxVoteOptions).fill(0n),
        voteOptionRoot: 0n,
      };
    }

    // 5. Validity checks
    let isValid = true;

    // 5a. EdDSA signature verification
    const cmdHash = hashCommand(command);
    const validSig = verifyEdDSA(cmdHash, signature, [stateLeaf.pubKeyX, stateLeaf.pubKeyY]);
    if (!validSig) isValid = false;

    // 5b. State index range
    if (stateIndex >= numSignUps || stateIndex <= 0) isValid = false;

    // 5c. Nonce check
    if (command.nonce !== ballot.nonce + 1n) isValid = false;

    // 5d. Voice credit balance check
    const voteOptIdx = Number(command.voteOptionIndex);
    const currentWeight = ballot.votes[voteOptIdx] ?? 0n;
    const newWeight = command.newVoteWeight;
    const creditChange = currentWeight * currentWeight - newWeight * newWeight;
    if (stateLeaf.voiceCreditBalance + creditChange < 0n) isValid = false;

    // 5e. Vote option range
    if (voteOptIdx >= maxVoteOptions || voteOptIdx < 0) isValid = false;

    // 6. Apply state transition
    if (isValid) {
      // Key Change support
      stateLeaf.pubKeyX = command.newPubKeyX;
      stateLeaf.pubKeyY = command.newPubKeyY;

      // Update balance
      stateLeaf.voiceCreditBalance += creditChange;

      // Update ballot
      ballot.votes[voteOptIdx] = newWeight;
      ballot.nonce += 1n;

      // Update trees
      stateLeaves.set(stateIndex, stateLeaf);
      ballots.set(stateIndex, ballot);

      stateTree.update(stateIndex, hashStateLeaf(stateLeaf));
      ballotTree.update(stateIndex, hashBallot(ballot));

      processedCount++;
    } else {
      // ★ Invalid: route to index 0 (blank leaf)
      // Apply command to blank leaf at index 0 (no real effect)
      const blankLeaf = stateLeaves.get(0) ?? {
        pubKeyX: 0n,
        pubKeyY: 0n,
        voiceCreditBalance: 0n,
        timestamp: 0n,
      };
      stateTree.update(0, hashStateLeaf(blankLeaf));
      ballotTree.update(0, hashBallot(ballots.get(0) ?? {
        nonce: 0n,
        votes: new Array(maxVoteOptions).fill(0n),
        voteOptionRoot: 0n,
      }));

      invalidCount++;
    }
  }

  return {
    newStateRoot: stateTree.root,
    newBallotRoot: ballotTree.root,
    processedCount,
    invalidCount,
  };
}
