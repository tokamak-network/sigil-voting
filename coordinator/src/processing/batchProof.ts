/**
 * Batch ZKP Generation
 *
 * Generates Groth16 proofs for message processing and vote tallying
 * using snarkjs. Creates circuit inputs and generates proofs from
 * .wasm and .zkey files.
 */

export interface ProofResult {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
}

export interface ProcessProofInput {
  wasmPath: string;
  zkeyPath: string;
  inputStateRoot: bigint;
  outputStateRoot: bigint;
  inputBallotRoot: bigint;
  outputBallotRoot: bigint;
  inputMessageRoot: bigint;
  coordinatorPubKeyHash: bigint;
  batchStartIndex: bigint;
  batchEndIndex: bigint;
  inputHash: bigint;
  // Per-message private inputs
  messages: bigint[][];
  encPubKeys: bigint[][];
  coordinatorSk: bigint;
  cmdStateIndex: bigint[];
  cmdNewPubKeyX: bigint[];
  cmdNewPubKeyY: bigint[];
  cmdVoteOptionIndex: bigint[];
  cmdNewVoteWeight: bigint[];
  cmdNonce: bigint[];
  cmdPollId: bigint[];
  cmdSalt: bigint[];
  cmdSigR8x: bigint[];
  cmdSigR8y: bigint[];
  cmdSigS: bigint[];
  stateLeaves: bigint[][];
  ballots: bigint[][];
  ballotVoteWeights: bigint[];
  stateProofs: bigint[][][];
  statePathIndices: bigint[][];
  ballotProofs: bigint[][][];
  ballotPathIndices: bigint[][];
  msgProofs: bigint[][][];
  msgPathIndices: bigint[][];
}

/**
 * Generate processMessages proof
 */
export async function generateProcessProof(input: ProcessProofInput): Promise<ProofResult> {
  const snarkjs = await import('snarkjs');

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
    cmdStateIndex: input.cmdStateIndex.map((v) => v.toString()),
    cmdNewPubKeyX: input.cmdNewPubKeyX.map((v) => v.toString()),
    cmdNewPubKeyY: input.cmdNewPubKeyY.map((v) => v.toString()),
    cmdVoteOptionIndex: input.cmdVoteOptionIndex.map((v) => v.toString()),
    cmdNewVoteWeight: input.cmdNewVoteWeight.map((v) => v.toString()),
    cmdNonce: input.cmdNonce.map((v) => v.toString()),
    cmdPollId: input.cmdPollId.map((v) => v.toString()),
    cmdSalt: input.cmdSalt.map((v) => v.toString()),
    cmdSigR8x: input.cmdSigR8x.map((v) => v.toString()),
    cmdSigR8y: input.cmdSigR8y.map((v) => v.toString()),
    cmdSigS: input.cmdSigS.map((v) => v.toString()),
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

export interface TallyProofInput {
  wasmPath: string;
  zkeyPath: string;
  inputHash: bigint;
  stateCommitment: bigint;
  tallyCommitment: bigint;
  newTallyCommitment: bigint;
  batchNum: bigint;
  // Private inputs omitted for brevity - similar structure to TallyVotes circuit
}

/**
 * Generate tallyVotes proof
 */
export async function generateTallyProof(input: TallyProofInput): Promise<ProofResult> {
  const snarkjs = await import('snarkjs');

  const circuitInputs = {
    inputHash: input.inputHash.toString(),
    stateCommitment: input.stateCommitment.toString(),
    tallyCommitment: input.tallyCommitment.toString(),
    newTallyCommitment: input.newTallyCommitment.toString(),
    batchNum: input.batchNum.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    input.wasmPath,
    input.zkeyPath,
  );

  return { proof, publicSignals };
}

/**
 * Compute SHA256 public input hash (matching on-chain computation)
 */
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

  // mod SNARK_SCALAR_FIELD
  const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  return result % SNARK_SCALAR_FIELD;
}
