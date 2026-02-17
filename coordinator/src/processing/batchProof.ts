/**
 * Batch ZKP Generation
 *
 * Generates Groth16 proofs for message processing and vote tallying
 * using snarkjs. Creates circuit inputs and generates proofs from
 * .wasm and .zkey files.
 *
 * IMPORTANT: Circuit input names MUST match the signal names in the .circom files exactly.
 * - MessageProcessor.circom: does in-circuit DuplexSponge decryption (no cmd* inputs)
 * - TallyVotes.circom: batch-based tally with full private inputs
 */

export interface ProofResult {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
}

// ─── MessageProcessor Proof ──────────────────────────────────────────

export interface ProcessProofInput {
  wasmPath: string;
  zkeyPath: string;
  // Public input (SHA256 compressed)
  inputHash: bigint;
  // Values inside SHA256 hash
  inputStateRoot: bigint;
  outputStateRoot: bigint;
  inputBallotRoot: bigint;
  outputBallotRoot: bigint;
  inputMessageRoot: bigint;
  coordinatorPubKeyHash: bigint;
  batchStartIndex: bigint;
  batchEndIndex: bigint;
  // Per-message private inputs
  messages: bigint[][];       // [batchSize][10]
  encPubKeys: bigint[][];     // [batchSize][2]
  coordinatorSk: bigint;
  msgNonces: bigint[];        // [batchSize] — DuplexSponge nonces
  stateLeaves: bigint[][];    // [batchSize][4]
  ballots: bigint[][];        // [batchSize][2]
  ballotVoteWeights: bigint[];// [batchSize]
  stateProofs: bigint[][][];  // [batchSize][depth][4]
  statePathIndices: bigint[][]; // [batchSize][depth]
  ballotProofs: bigint[][][]; // [batchSize][depth][4]
  ballotPathIndices: bigint[][]; // [batchSize][depth]
  msgProofs: bigint[][][];    // [batchSize][depth][4]
  msgPathIndices: bigint[][];  // [batchSize][depth]
}

export async function generateProcessProof(input: ProcessProofInput): Promise<ProofResult> {
  const snarkjs = await import('snarkjs');

  // Circuit input names must exactly match MessageProcessor.circom signal names
  const circuitInputs = {
    inputHash: input.inputHash.toString(),
    inputStateRoot: input.inputStateRoot.toString(),
    outputStateRoot: input.outputStateRoot.toString(),
    inputBallotRoot: input.inputBallotRoot.toString(),
    outputBallotRoot: input.outputBallotRoot.toString(),
    inputMessageRoot: input.inputMessageRoot.toString(),
    coordinatorPubKeyHash: input.coordinatorPubKeyHash.toString(),
    batchStartIndex: input.batchStartIndex.toString(),
    batchEndIndex: input.batchEndIndex.toString(),
    messages: input.messages.map((m) => m.map((v) => v.toString())),
    encPubKeys: input.encPubKeys.map((pk) => pk.map((v) => v.toString())),
    coordinatorSk: input.coordinatorSk.toString(),
    msgNonces: input.msgNonces.map((v) => v.toString()),
    stateLeaves: input.stateLeaves.map((sl) => sl.map((v) => v.toString())),
    ballots: input.ballots.map((b) => b.map((v) => v.toString())),
    ballotVoteWeights: input.ballotVoteWeights.map((v) => v.toString()),
    stateProofs: input.stateProofs.map((p) => p.map((l) => l.map((v) => v.toString()))),
    statePathIndices: input.statePathIndices.map((pi) => pi.map((v) => v.toString())),
    ballotProofs: input.ballotProofs.map((p) => p.map((l) => l.map((v) => v.toString()))),
    ballotPathIndices: input.ballotPathIndices.map((pi) => pi.map((v) => v.toString())),
    msgProofs: input.msgProofs.map((p) => p.map((l) => l.map((v) => v.toString()))),
    msgPathIndices: input.msgPathIndices.map((pi) => pi.map((v) => v.toString())),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    input.wasmPath,
    input.zkeyPath,
  );

  return { proof, publicSignals };
}

// ─── TallyVotes Proof ────────────────────────────────────────────────

export interface TallyProofInput {
  wasmPath: string;
  zkeyPath: string;
  // Public input (SHA256 compressed)
  inputHash: bigint;
  // Values inside SHA256 hash
  stateCommitment: bigint;
  tallyCommitment: bigint;
  newTallyCommitment: bigint;
  batchNum: bigint;
  // Private inputs (per voter in batch)
  stateLeaves: bigint[][];      // [batchSize][4]
  ballotNonces: bigint[];       // [batchSize]
  voteWeights: bigint[][];      // [batchSize][numVoteOptions]
  voteOptionRoots: bigint[];    // [batchSize]
  stateProofs: bigint[][][];    // [batchSize][depth][4]
  statePathIndices: bigint[][]; // [batchSize][depth]
  // Tally accumulators
  currentTally: bigint[];       // [numVoteOptions]
  newTally: bigint[];           // [numVoteOptions]
  currentTotalSpent: bigint;
  newTotalSpent: bigint;
  currentPerOptionSpent: bigint[];  // [numVoteOptions]
  newPerOptionSpent: bigint[];      // [numVoteOptions]
  currentTallyResultsRoot: bigint;
  newTallyResultsRoot: bigint;
  currentPerOptionSpentRoot: bigint;
  newPerOptionSpentRoot: bigint;
}

export async function generateTallyProof(input: TallyProofInput): Promise<ProofResult> {
  const snarkjs = await import('snarkjs');

  // Circuit input names must exactly match TallyVotes.circom signal names
  const circuitInputs = {
    inputHash: input.inputHash.toString(),
    stateCommitment: input.stateCommitment.toString(),
    tallyCommitment: input.tallyCommitment.toString(),
    newTallyCommitment: input.newTallyCommitment.toString(),
    batchNum: input.batchNum.toString(),
    stateLeaves: input.stateLeaves.map((sl) => sl.map((v) => v.toString())),
    ballotNonces: input.ballotNonces.map((v) => v.toString()),
    voteWeights: input.voteWeights.map((vw) => vw.map((v) => v.toString())),
    voteOptionRoots: input.voteOptionRoots.map((v) => v.toString()),
    stateProofs: input.stateProofs.map((p) => p.map((l) => l.map((v) => v.toString()))),
    statePathIndices: input.statePathIndices.map((pi) => pi.map((v) => v.toString())),
    currentTally: input.currentTally.map((v) => v.toString()),
    newTally: input.newTally.map((v) => v.toString()),
    currentTotalSpent: input.currentTotalSpent.toString(),
    newTotalSpent: input.newTotalSpent.toString(),
    currentPerOptionSpent: input.currentPerOptionSpent.map((v) => v.toString()),
    newPerOptionSpent: input.newPerOptionSpent.map((v) => v.toString()),
    currentTallyResultsRoot: input.currentTallyResultsRoot.toString(),
    newTallyResultsRoot: input.newTallyResultsRoot.toString(),
    currentPerOptionSpentRoot: input.currentPerOptionSpentRoot.toString(),
    newPerOptionSpentRoot: input.newPerOptionSpentRoot.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    input.wasmPath,
    input.zkeyPath,
  );

  return { proof, publicSignals };
}

// ─── SHA256 Public Input Hash ────────────────────────────────────────

export async function computePublicInputHash(values: bigint[]): Promise<bigint> {
  const { createHash } = await import('crypto');
  const hash = createHash('sha256');

  for (const value of values) {
    // abi.encodePacked: 32 bytes per uint256
    const buf = Buffer.alloc(32);
    let v = value;
    for (let i = 31; i >= 0; i--) {
      buf[i] = Number(v & 0xFFn);
      v >>= 8n;
    }
    hash.update(buf);
  }

  const digest = hash.digest();
  let result = 0n;
  for (let i = 0; i < 32; i++) {
    result = (result << 8n) | BigInt(digest[i]);
  }

  // Take lower 253 bits (matching in-circuit Sha256Hasher which uses Bits2Num(253))
  return result & ((1n << 253n) - 1n);
}
