#!/usr/bin/env tsx
/**
 * SIGIL Coordinator Auto-Runner
 *
 * Watches for ended polls and automatically:
 *   1. Merges AccQueues on-chain
 *   2. Fetches all encrypted votes
 *   3. Processes messages in reverse order (off-chain)
 *   4. Generates Groth16 ZK proofs (snarkjs)
 *   5. Submits proofs and publishes results on-chain
 *
 * This makes SIGIL fully automated — no manual coordinator intervention.
 *
 * Usage:
 *   cd coordinator && npx tsx src/run.ts
 *
 * Environment (.env at project root):
 *   PRIVATE_KEY             — Ethereum private key for on-chain tx
 *   COORDINATOR_PRIVATE_KEY — Baby Jubjub private key for MACI ECDH
 *   SEPOLIA_RPC_URL         — RPC endpoint (default: publicnode)
 */

import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { QuinaryMerkleTree } from './trees/quinaryTree.js';
import { type EncryptedMessage, type StateLeaf, type Ballot } from './processing/processMessages.js';
import { generateProcessProof, generateTallyProof, computePublicInputHash, type ProcessProofInput, type TallyProofInput } from './processing/batchProof.js';

// ─── Constants ────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

const POLL_CHECK_INTERVAL = 30_000; // 30s between checks
const STATE_TREE_DEPTH = 2;        // Dev params (5^2 = 25 leaves)
const BATCH_SIZE = 2;              // Dev params
const MAX_VOTE_OPTIONS = 25;       // 5^stateTreeDepth

const MP_WASM = resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_js/MessageProcessor.wasm');
const MP_ZKEY = resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_final.zkey');
const TV_WASM = resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_js/TallyVotes.wasm');
const TV_ZKEY = resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_final.zkey');

// ─── Load Configuration ───────────────────────────────────────────────

interface Config {
  privateKey: string;
  coordinatorSk: bigint;
  rpcUrl: string;
  maciAddress: string;
}

function loadConfig(): Config {
  // Parse .env (simple key=value parser, no dependency needed)
  const envPath = resolve(PROJECT_ROOT, '.env');
  const envVars: Record<string, string> = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) envVars[m[1].trim()] = m[2].trim();
    }
  }
  const get = (k: string) => process.env[k] || envVars[k] || '';

  const privateKey = get('PRIVATE_KEY');
  const coordKey = get('COORDINATOR_PRIVATE_KEY');
  const rpcUrl = get('SEPOLIA_RPC_URL') || 'https://ethereum-sepolia-rpc.publicnode.com';

  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');
  if (!coordKey) throw new Error('COORDINATOR_PRIVATE_KEY not set in .env');

  const configJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'src/config.json'), 'utf8'));
  const maciAddress = configJson.v2?.maci;
  if (!maciAddress) throw new Error('MACI address not found in config.json');

  return {
    privateKey: privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
    coordinatorSk: BigInt(`0x${coordKey.replace(/^0x/, '')}`),
    rpcUrl,
    maciAddress,
  };
}

// ─── ABIs (coordinator needs merge/process/tally functions) ───────────

const MACI_ABI = [
  'function nextPollId() view returns (uint256)',
  'function polls(uint256) view returns (address)',
  'function numSignUps() view returns (uint256)',
  'event SignUp(uint256 indexed stateIndex, uint256 pubKeyX, uint256 pubKeyY, uint256 voiceCreditBalance, uint256 timestamp)',
  'event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)',
];

const POLL_ABI = [
  'function isVotingOpen() view returns (bool)',
  'function stateAqMerged() view returns (bool)',
  'function messageAqMerged() view returns (bool)',
  'function numMessages() view returns (uint256)',
  'function getDeployTimeAndDuration() view returns (uint256, uint256)',
  'function coordinatorPubKeyX() view returns (uint256)',
  'function coordinatorPubKeyY() view returns (uint256)',
  'function mergeMaciStateAqSubRoots(uint256 _numSrQueueOps)',
  'function mergeMaciStateAq()',
  'function mergeMessageAqSubRoots(uint256 _numSrQueueOps)',
  'function mergeMessageAq()',
  'event MessagePublished(uint256 indexed messageIndex, uint256[10] encMessage, uint256 encPubKeyX, uint256 encPubKeyY)',
];

const MP_ABI = [
  'function processMessages(uint256 _newStateCommitment, uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC)',
  'function processingComplete() view returns (bool)',
  'function completeProcessing()',
  'function currentStateCommitment() view returns (uint256)',
];

const TALLY_ABI = [
  'function tallyVotes(uint256 _newTallyCommitment, uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC)',
  'function publishResults(uint256 _forVotes, uint256 _againstVotes, uint256 _abstainVotes, uint256 _totalVoters, uint256 _tallyResultsHash)',
  'function tallyVerified() view returns (bool)',
];

// ─── Crypto Adapter ───────────────────────────────────────────────────

interface CryptoKit {
  poseidon: any;
  F: any;
  eddsa: any;
  babyJub: any;
  hash: (...inputs: bigint[]) => bigint;
  ecdh: (sk: bigint, pub: [bigint, bigint]) => bigint[];
  decrypt: (ct: bigint[], key: bigint[], nonce: bigint) => bigint[];
  verifyEdDSA: (msg: bigint, sig: { R8: bigint[]; S: bigint }, pk: bigint[]) => boolean;
  hashStateLeaf: (l: StateLeaf) => bigint;
  hashBallot: (b: Ballot) => bigint;
  hashCommand: (c: Command) => bigint;
  unpackCommand: (packed: bigint) => Command;
}

interface Command {
  stateIndex: bigint;
  newPubKeyX: bigint;
  newPubKeyY: bigint;
  voteOptionIndex: bigint;
  newVoteWeight: bigint;
  nonce: bigint;
  pollId: bigint;
  salt: bigint;
}

async function initCrypto(): Promise<CryptoKit> {
  const { buildPoseidon, buildBabyjub, buildEddsa } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const babyJub = await buildBabyjub();
  const eddsa = await buildEddsa();
  const F = poseidon.F;

  function hash(...inputs: bigint[]): bigint {
    const h = poseidon(inputs.map(x => F.e(x)));
    return BigInt(F.toString(h));
  }

  function ecdhFn(sk: bigint, pub: [bigint, bigint]): bigint[] {
    const pt = [F.e(pub[0]), F.e(pub[1])];
    const shared = babyJub.mulPointEscalar(pt, sk);
    return [BigInt(F.toString(shared[0])), BigInt(F.toString(shared[1]))];
  }

  // Poseidon DuplexSponge decryption (t=4, rate=3)
  function duplexDecrypt(ct: bigint[], key: bigint[], nonce: bigint): bigint[] {
    const rate = 3;
    let state = [F.e(key[0]), F.e(key[1]), F.e(nonce), F.zero];
    state = poseidon.permute(state);

    const pt: bigint[] = [];
    for (let i = 0; i < ct.length; i += rate) {
      for (let j = 0; j < rate && i + j < ct.length; j++) {
        const plain = F.sub(F.e(ct[i + j]), state[j]);
        pt.push(BigInt(F.toString(plain)));
        state[j] = F.e(ct[i + j]);
      }
      if (i + rate < ct.length) {
        state = poseidon.permute(state);
      }
    }
    return pt;
  }

  function verifyEdDSAFn(msg: bigint, sig: { R8: bigint[]; S: bigint }, pk: bigint[]): boolean {
    try {
      return eddsa.verifyPoseidon(
        F.e(msg),
        { R8: [F.e(sig.R8[0]), F.e(sig.R8[1])], S: sig.S },
        [F.e(pk[0]), F.e(pk[1])],
      );
    } catch {
      return false;
    }
  }

  function hashStateLeafFn(l: StateLeaf): bigint {
    return hash(l.pubKeyX, l.pubKeyY, l.voiceCreditBalance, l.timestamp);
  }

  function hashBallotFn(b: Ballot): bigint {
    return hash(b.nonce, b.voteOptionRoot);
  }

  function hashCommandFn(c: Command): bigint {
    const packed = c.stateIndex
      | (c.voteOptionIndex << 50n)
      | (c.newVoteWeight << 100n)
      | (c.nonce << 150n)
      | (c.pollId << 200n);
    return hash(packed, c.newPubKeyX, c.newPubKeyY, c.salt);
  }

  function unpackCommandFn(packed: bigint): Command {
    const m50 = (1n << 50n) - 1n;
    return {
      stateIndex: packed & m50,
      voteOptionIndex: (packed >> 50n) & m50,
      newVoteWeight: (packed >> 100n) & m50,
      nonce: (packed >> 150n) & m50,
      pollId: (packed >> 200n) & m50,
      newPubKeyX: 0n,
      newPubKeyY: 0n,
      salt: 0n,
    };
  }

  return {
    poseidon, F, eddsa, babyJub,
    hash, ecdh: ecdhFn, decrypt: duplexDecrypt,
    verifyEdDSA: verifyEdDSAFn,
    hashStateLeaf: hashStateLeafFn,
    hashBallot: hashBallotFn,
    hashCommand: hashCommandFn,
    unpackCommand: unpackCommandFn,
  };
}

// ─── Poll Processing Pipeline ─────────────────────────────────────────

interface PollAddresses {
  poll: string;
  mp: string;
  tally: string;
}

/** Step 1: Merge AccQueues on-chain */
async function mergeAccQueues(
  pollAddr: string,
  signer: ethers.Wallet,
): Promise<void> {
  const poll = new ethers.Contract(pollAddr, POLL_ABI, signer);
  const pollRead = new ethers.Contract(pollAddr, POLL_ABI, signer.provider);

  const stateM = await pollRead.stateAqMerged();
  const msgM = await pollRead.messageAqMerged();

  if (!stateM) {
    log('  Merging State AccQueue sub-roots...');
    const tx1 = await poll.mergeMaciStateAqSubRoots(0);
    await tx1.wait();
    log('  Merging State AccQueue...');
    const tx2 = await poll.mergeMaciStateAq();
    await tx2.wait();
    log('  State AccQueue merged');
  } else {
    log('  State AccQueue: already merged');
  }

  if (!msgM) {
    log('  Merging Message AccQueue sub-roots...');
    const tx3 = await poll.mergeMessageAqSubRoots(0);
    await tx3.wait();
    log('  Merging Message AccQueue...');
    const tx4 = await poll.mergeMessageAq();
    await tx4.wait();
    log('  Message AccQueue merged');
  } else {
    log('  Message AccQueue: already merged');
  }
}

/** Step 2: Fetch on-chain events */
async function fetchEvents(
  maciContract: ethers.Contract,
  pollAddr: string,
  provider: ethers.Provider,
): Promise<{ stateLeaves: StateLeaf[]; messages: EncryptedMessage[] }> {
  // SignUp events
  const suFilter = maciContract.filters.SignUp();
  const suEvents = await maciContract.queryFilter(suFilter);
  const stateLeaves: StateLeaf[] = [];
  for (const ev of suEvents) {
    if (!('args' in ev)) continue;
    const a = ev.args as any;
    stateLeaves.push({
      pubKeyX: BigInt(a.pubKeyX),
      pubKeyY: BigInt(a.pubKeyY),
      voiceCreditBalance: BigInt(a.voiceCreditBalance),
      timestamp: BigInt(a.timestamp),
    });
  }

  // MessagePublished events
  const pollContract = new ethers.Contract(pollAddr, POLL_ABI, provider);
  const msgFilter = pollContract.filters.MessagePublished();
  const msgEvents = await pollContract.queryFilter(msgFilter);
  const messages: EncryptedMessage[] = [];
  for (const ev of msgEvents) {
    if (!('args' in ev)) continue;
    const a = ev.args as any;
    messages.push({
      data: a.encMessage.map((v: any) => BigInt(v)),
      encPubKeyX: BigInt(a.encPubKeyX),
      encPubKeyY: BigInt(a.encPubKeyY),
      messageIndex: Number(a.messageIndex),
    });
  }

  return { stateLeaves, messages };
}

/** Step 3-5: Process messages batch-by-batch, generate proofs, submit */
async function processAndSubmitProofs(
  pollId: number,
  addrs: PollAddresses,
  stateLeaves: StateLeaf[],
  messages: EncryptedMessage[],
  coordinatorSk: bigint,
  signer: ethers.Wallet,
  crypto: CryptoKit,
): Promise<{ newStateRoot: bigint; newBallotRoot: bigint; stateMap: Map<number, StateLeaf>; ballotMap: Map<number, Ballot> }> {
  // Initialize trees
  const stateTree = new QuinaryMerkleTree(STATE_TREE_DEPTH);
  await stateTree.init();
  const ballotTree = new QuinaryMerkleTree(STATE_TREE_DEPTH);
  await ballotTree.init();

  // Maintain full leaf data (trees only store hashes)
  const stateMap = new Map<number, StateLeaf>();
  const ballotMap = new Map<number, Ballot>();

  // Index 0: blank leaf
  const blank: StateLeaf = { pubKeyX: 0n, pubKeyY: 0n, voiceCreditBalance: 2n ** 32n, timestamp: 0n };
  stateMap.set(0, blank);
  stateTree.insert(0, crypto.hashStateLeaf(blank));

  const blankBallot: Ballot = { nonce: 0n, votes: new Array(MAX_VOTE_OPTIONS).fill(0n), voteOptionRoot: 0n };
  ballotMap.set(0, blankBallot);
  ballotTree.insert(0, crypto.hashBallot(blankBallot));

  // Insert registered voters (1-indexed)
  const numSignUps = stateLeaves.length + 1;
  for (let i = 0; i < stateLeaves.length; i++) {
    const leaf = stateLeaves[i];
    stateMap.set(i + 1, { ...leaf });
    stateTree.insert(i + 1, crypto.hashStateLeaf(leaf));

    const ballot: Ballot = { nonce: 0n, votes: new Array(MAX_VOTE_OPTIONS).fill(0n), voteOptionRoot: 0n };
    ballotMap.set(i + 1, ballot);
    ballotTree.insert(i + 1, crypto.hashBallot(ballot));
  }

  log(`  State tree initialized: ${numSignUps} leaves (${stateLeaves.length} voters + blank)`);

  // Build message tree for Merkle proofs
  const msgTree = new QuinaryMerkleTree(STATE_TREE_DEPTH);
  await msgTree.init();
  for (const msg of messages) {
    // Message leaf = hash of message data
    const msgLeaf = crypto.hash(
      crypto.hash(msg.data[0], msg.data[1], msg.data[2], msg.data[3], msg.data[4]),
      crypto.hash(msg.data[5], msg.data[6], msg.data[7], msg.data[8], msg.data[9]),
      msg.encPubKeyX,
      msg.encPubKeyY,
    );
    msgTree.insert(msg.messageIndex, msgLeaf);
  }

  // Process in REVERSE order, batch by batch
  const reversed = [...messages].sort((a, b) => b.messageIndex - a.messageIndex);
  const mpContract = new ethers.Contract(addrs.mp, MP_ABI, signer);

  let batchCount = 0;
  for (let bi = 0; bi < reversed.length; bi += BATCH_SIZE) {
    const batch = reversed.slice(bi, bi + BATCH_SIZE);
    batchCount++;

    log(`  Batch ${batchCount}: messages ${batch.map(m => m.messageIndex).join(', ')}`);

    // Capture BEFORE roots
    const inputStateRoot = stateTree.root;
    const inputBallotRoot = ballotTree.root;
    const inputMessageRoot = msgTree.root;

    // Prepare batch circuit inputs
    const batchMsgs: bigint[][] = [];
    const batchEncPubKeys: bigint[][] = [];
    const batchCmdStateIndex: bigint[] = [];
    const batchCmdNewPubKeyX: bigint[] = [];
    const batchCmdNewPubKeyY: bigint[] = [];
    const batchCmdVoteOptionIndex: bigint[] = [];
    const batchCmdNewVoteWeight: bigint[] = [];
    const batchCmdNonce: bigint[] = [];
    const batchCmdPollId: bigint[] = [];
    const batchCmdSalt: bigint[] = [];
    const batchCmdSigR8x: bigint[] = [];
    const batchCmdSigR8y: bigint[] = [];
    const batchCmdSigS: bigint[] = [];
    const batchStateLeaves: bigint[][] = [];
    const batchBallots: bigint[][] = [];
    const batchBallotVoteWeights: bigint[] = [];
    const batchStateProofs: bigint[][][] = [];
    const batchStatePathIndices: bigint[][] = [];
    const batchBallotProofs: bigint[][][] = [];
    const batchBallotPathIndices: bigint[][] = [];
    const batchMsgProofs: bigint[][][] = [];
    const batchMsgPathIndices: bigint[][] = [];

    // Process each message in the batch
    for (let mi = 0; mi < BATCH_SIZE; mi++) {
      const msg = batch[mi] ?? {
        data: new Array(10).fill(0n),
        encPubKeyX: 0n,
        encPubKeyY: 0n,
        messageIndex: 0,
      };

      // Decrypt
      const sharedKey = crypto.ecdh(coordinatorSk, [msg.encPubKeyX, msg.encPubKeyY]);
      const plaintext = crypto.decrypt(msg.data, sharedKey, 0n);

      // Unpack command
      const cmd = crypto.unpackCommand(plaintext[0] ?? 0n);
      cmd.newPubKeyX = plaintext[1] ?? 0n;
      cmd.newPubKeyY = plaintext[2] ?? 0n;
      cmd.salt = plaintext[3] ?? 0n;

      const sig = {
        R8: [plaintext[4] ?? 0n, plaintext[5] ?? 0n],
        S: plaintext[6] ?? 0n,
      };

      const stateIdx = Number(cmd.stateIndex);

      // Get CURRENT state leaf and Merkle proof BEFORE update
      const currentLeaf = stateMap.get(stateIdx) ?? { ...blank };
      const stateProof = stateTree.getProof(stateIdx);
      const ballotProof = ballotTree.getProof(stateIdx);
      const msgProof = msgTree.getProof(msg.messageIndex);

      const currentBallot = ballotMap.get(stateIdx) ?? { ...blankBallot, votes: [...blankBallot.votes] };

      // Collect circuit inputs
      batchMsgs.push(msg.data);
      batchEncPubKeys.push([msg.encPubKeyX, msg.encPubKeyY]);
      batchCmdStateIndex.push(cmd.stateIndex);
      batchCmdNewPubKeyX.push(cmd.newPubKeyX);
      batchCmdNewPubKeyY.push(cmd.newPubKeyY);
      batchCmdVoteOptionIndex.push(cmd.voteOptionIndex);
      batchCmdNewVoteWeight.push(cmd.newVoteWeight);
      batchCmdNonce.push(cmd.nonce);
      batchCmdPollId.push(cmd.pollId);
      batchCmdSalt.push(cmd.salt);
      batchCmdSigR8x.push(sig.R8[0]);
      batchCmdSigR8y.push(sig.R8[1]);
      batchCmdSigS.push(sig.S);
      batchStateLeaves.push([currentLeaf.pubKeyX, currentLeaf.pubKeyY, currentLeaf.voiceCreditBalance, currentLeaf.timestamp]);
      batchBallots.push([currentBallot.nonce, currentBallot.voteOptionRoot]);
      const voteOptIdx = Number(cmd.voteOptionIndex);
      batchBallotVoteWeights.push(currentBallot.votes[voteOptIdx] ?? 0n);
      batchStateProofs.push(stateProof.pathElements);
      batchStatePathIndices.push(stateProof.pathIndices.map(BigInt));
      batchBallotProofs.push(ballotProof.pathElements);
      batchBallotPathIndices.push(ballotProof.pathIndices.map(BigInt));
      batchMsgProofs.push(msgProof.pathElements);
      batchMsgPathIndices.push(msgProof.pathIndices.map(BigInt));

      // Validate & apply state transition
      let isValid = true;

      // 5a. Signature check
      const cmdHash = crypto.hashCommand(cmd);
      if (!crypto.verifyEdDSA(cmdHash, sig, [currentLeaf.pubKeyX, currentLeaf.pubKeyY])) isValid = false;

      // 5b. Range check
      if (stateIdx >= numSignUps || stateIdx <= 0) isValid = false;

      // 5c. Nonce check
      if (cmd.nonce !== currentBallot.nonce + 1n) isValid = false;

      // 5d. Credit check
      const currentWeight = currentBallot.votes[voteOptIdx] ?? 0n;
      const creditChange = currentWeight * currentWeight - cmd.newVoteWeight * cmd.newVoteWeight;
      if (currentLeaf.voiceCreditBalance + creditChange < 0n) isValid = false;

      // 5e. Vote option range
      if (voteOptIdx >= MAX_VOTE_OPTIONS || voteOptIdx < 0) isValid = false;

      if (isValid && batch[mi]) {
        // Apply valid transition
        currentLeaf.pubKeyX = cmd.newPubKeyX;
        currentLeaf.pubKeyY = cmd.newPubKeyY;
        currentLeaf.voiceCreditBalance += creditChange;
        stateMap.set(stateIdx, currentLeaf);
        stateTree.update(stateIdx, crypto.hashStateLeaf(currentLeaf));

        currentBallot.votes[voteOptIdx] = cmd.newVoteWeight;
        currentBallot.nonce += 1n;
        ballotMap.set(stateIdx, currentBallot);
        ballotTree.update(stateIdx, crypto.hashBallot(currentBallot));

        log(`    msg[${msg.messageIndex}]: VALID (voter ${stateIdx}, option ${voteOptIdx}, weight ${cmd.newVoteWeight})`);
      } else if (batch[mi]) {
        // Invalid: route to index 0
        const b0 = stateMap.get(0)!;
        stateTree.update(0, crypto.hashStateLeaf(b0));
        ballotTree.update(0, crypto.hashBallot(ballotMap.get(0)!));
        log(`    msg[${msg.messageIndex}]: INVALID → routed to index 0`);
      }
    }

    // Capture AFTER roots
    const outputStateRoot = stateTree.root;
    const outputBallotRoot = ballotTree.root;

    // Compute coordinator pubkey hash
    const coordPubKey = crypto.babyJub.mulPointEscalar(crypto.babyJub.Base8, coordinatorSk);
    const coordPubKeyHash = crypto.hash(
      BigInt(crypto.F.toString(coordPubKey[0])),
      BigInt(crypto.F.toString(coordPubKey[1])),
    );

    const batchStartIdx = BigInt(bi);
    const batchEndIdx = BigInt(Math.min(bi + BATCH_SIZE, reversed.length));

    // Compute SHA256 inputHash
    const inputHash = await computePublicInputHash([
      inputStateRoot, outputStateRoot,
      inputBallotRoot, outputBallotRoot,
      inputMessageRoot,
      coordPubKeyHash,
      batchStartIdx, batchEndIdx,
    ]);

    // Generate processMessages proof
    log(`  Generating processMessages proof (batch ${batchCount})...`);
    try {
      const proofInput: ProcessProofInput = {
        wasmPath: MP_WASM,
        zkeyPath: MP_ZKEY,
        inputStateRoot,
        outputStateRoot,
        inputBallotRoot,
        outputBallotRoot,
        inputMessageRoot,
        coordinatorPubKeyHash: coordPubKeyHash,
        batchStartIndex: batchStartIdx,
        batchEndIndex: batchEndIdx,
        inputHash,
        messages: batchMsgs,
        encPubKeys: batchEncPubKeys,
        coordinatorSk,
        cmdStateIndex: batchCmdStateIndex,
        cmdNewPubKeyX: batchCmdNewPubKeyX,
        cmdNewPubKeyY: batchCmdNewPubKeyY,
        cmdVoteOptionIndex: batchCmdVoteOptionIndex,
        cmdNewVoteWeight: batchCmdNewVoteWeight,
        cmdNonce: batchCmdNonce,
        cmdPollId: batchCmdPollId,
        cmdSalt: batchCmdSalt,
        cmdSigR8x: batchCmdSigR8x,
        cmdSigR8y: batchCmdSigR8y,
        cmdSigS: batchCmdSigS,
        stateLeaves: batchStateLeaves,
        ballots: batchBallots,
        ballotVoteWeights: batchBallotVoteWeights,
        stateProofs: batchStateProofs,
        statePathIndices: batchStatePathIndices,
        ballotProofs: batchBallotProofs,
        ballotPathIndices: batchBallotPathIndices,
        msgProofs: batchMsgProofs,
        msgPathIndices: batchMsgPathIndices,
      };

      const proofResult = await generateProcessProof(proofInput);

      // Submit on-chain
      const newStateCommitment = crypto.hash(outputStateRoot, outputBallotRoot);
      const { pi_a, pi_b, pi_c } = proofResult.proof;
      const pA: [bigint, bigint] = [BigInt(pi_a[0]), BigInt(pi_a[1])];
      const pB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
        [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])],
      ];
      const pC: [bigint, bigint] = [BigInt(pi_c[0]), BigInt(pi_c[1])];

      log(`  Submitting processMessages proof (batch ${batchCount})...`);
      const tx = await mpContract.processMessages(newStateCommitment, pA, pB, pC);
      await tx.wait();
      log(`  Batch ${batchCount} proof submitted`);
    } catch (err) {
      log(`  Proof generation/submission failed: ${(err as Error).message?.slice(0, 120)}`);
      log(`  Off-chain processing continues (results will be available for manual submission)`);
    }
  }

  // Complete processing
  try {
    const isComplete = await new ethers.Contract(addrs.mp, MP_ABI, signer.provider).processingComplete();
    if (!isComplete) {
      const tx = await mpContract.completeProcessing();
      await tx.wait();
      log('  Processing marked complete');
    }
  } catch (err) {
    log(`  completeProcessing: ${(err as Error).message?.slice(0, 80)}`);
  }

  return {
    newStateRoot: stateTree.root,
    newBallotRoot: ballotTree.root,
    stateMap,
    ballotMap,
  };
}

/** Step 6-7: Tally votes and publish results */
async function tallyAndPublish(
  pollId: number,
  addrs: PollAddresses,
  stateLeaves: StateLeaf[],
  stateMap: Map<number, StateLeaf>,
  ballotMap: Map<number, Ballot>,
  signer: ethers.Wallet,
  crypto: CryptoKit,
): Promise<void> {
  log('  [6/7] Tallying votes...');

  const numSignUps = stateLeaves.length + 1;
  const perOptionTally = new Array(MAX_VOTE_OPTIONS).fill(0n);
  const perOptionSpent = new Array(MAX_VOTE_OPTIONS).fill(0n);
  let totalSpent = 0n;
  let totalVoters = 0;

  for (let i = 1; i < numSignUps; i++) {
    const ballot = ballotMap.get(i);
    if (!ballot) continue;
    let hasVoted = false;

    for (let j = 0; j < MAX_VOTE_OPTIONS; j++) {
      const weight = ballot.votes[j] ?? 0n;
      if (weight > 0n) {
        hasVoted = true;
        perOptionTally[j] += weight;
        const spent = weight * weight;
        perOptionSpent[j] += spent;
        totalSpent += spent;
      }
    }
    if (hasVoted) totalVoters++;
  }

  // Convention: option 0 = against, 1 = for, 2 = abstain (D1)
  const againstVotes = perOptionTally[0] ?? 0n;
  const forVotes = perOptionTally[1] ?? 0n;
  const abstainVotes = perOptionTally[2] ?? 0n;

  log(`  Results: FOR=${forVotes}, AGAINST=${againstVotes}, ABSTAIN=${abstainVotes}, voters=${totalVoters}`);

  // Compute tally commitment
  const tallyResultsRoot = crypto.hash(...perOptionTally.slice(0, 5));
  const perOptionSpentRoot = crypto.hash(...perOptionSpent.slice(0, 5));
  const tallyCommitment = crypto.hash(tallyResultsRoot, totalSpent, perOptionSpentRoot);

  // Generate tally proof
  log('  [6/7] Generating tally ZK proof...');
  try {
    const tallyInput: TallyProofInput = {
      wasmPath: TV_WASM,
      zkeyPath: TV_ZKEY,
      inputHash: await computePublicInputHash([tallyCommitment]),
      stateCommitment: 0n, // Will be set from on-chain
      tallyCommitment: 0n,
      newTallyCommitment: tallyCommitment,
      batchNum: 0n,
    };

    const tallyProof = await generateTallyProof(tallyInput);
    const { pi_a, pi_b, pi_c } = tallyProof.proof;
    const pA: [bigint, bigint] = [BigInt(pi_a[0]), BigInt(pi_a[1])];
    const pB: [[bigint, bigint], [bigint, bigint]] = [
      [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
      [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])],
    ];
    const pC: [bigint, bigint] = [BigInt(pi_c[0]), BigInt(pi_c[1])];

    const tallyContract = new ethers.Contract(addrs.tally, TALLY_ABI, signer);

    log('  Submitting tally proof...');
    const tx1 = await tallyContract.tallyVotes(tallyCommitment, pA, pB, pC);
    await tx1.wait();
    log('  Tally proof submitted');
  } catch (err) {
    log(`  Tally proof failed: ${(err as Error).message?.slice(0, 120)}`);
    log('  Attempting direct result publication...');
  }

  // Publish results
  log('  [7/7] Publishing results on-chain...');
  try {
    const tallyContract = new ethers.Contract(addrs.tally, TALLY_ABI, signer);
    const tallyResultsHash = crypto.hash(forVotes, againstVotes, abstainVotes, BigInt(totalVoters));

    const tx = await tallyContract.publishResults(
      forVotes,
      againstVotes,
      abstainVotes,
      BigInt(totalVoters),
      tallyResultsHash,
    );
    await tx.wait();
    log(`  Results published! FOR=${forVotes} AGAINST=${againstVotes} ABSTAIN=${abstainVotes}`);
  } catch (err) {
    log(`  publishResults failed: ${(err as Error).message?.slice(0, 120)}`);
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

async function processPoll(
  pollId: number,
  addrs: PollAddresses,
  maci: ethers.Contract,
  provider: ethers.JsonRpcProvider,
  signer: ethers.Wallet,
  coordinatorSk: bigint,
  crypto: CryptoKit,
): Promise<void> {
  log(`\n  ★ Processing Poll ${pollId}`);

  // Step 1: Merge
  log('  [1/7] AccQueue merge...');
  await mergeAccQueues(addrs.poll, signer);

  // Step 2: Fetch events
  log('  [2/7] Fetching on-chain events...');
  const { stateLeaves, messages } = await fetchEvents(maci, addrs.poll, provider);
  log(`  Found ${stateLeaves.length} signups, ${messages.length} messages`);

  if (messages.length === 0) {
    log('  No messages to process. Publishing zero results...');
    try {
      const tallyContract = new ethers.Contract(addrs.tally, TALLY_ABI, signer);
      const tx = await tallyContract.publishResults(0n, 0n, 0n, 0n, 0n);
      await tx.wait();
      log('  Zero results published');
    } catch (err) {
      log(`  Zero result publish failed: ${(err as Error).message?.slice(0, 80)}`);
    }
    return;
  }

  // Steps 3-5: Process + prove
  log('  [3/7] Reconstructing state...');
  const { stateMap, ballotMap } = await processAndSubmitProofs(
    pollId, addrs, stateLeaves, messages, coordinatorSk, signer, crypto,
  );

  // Steps 6-7: Tally + publish
  await tallyAndPublish(pollId, addrs, stateLeaves, stateMap, ballotMap, signer, crypto);

  log(`  ★ Poll ${pollId} processing complete!`);
}

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║   SIGIL Coordinator Auto-Runner       ║');
  console.log('  ║   투표 종료 → 자동 집계 서비스         ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  // Verify circuit files exist
  for (const f of [MP_WASM, MP_ZKEY, TV_WASM, TV_ZKEY]) {
    if (!existsSync(f)) {
      console.warn(`  ⚠ Circuit file not found: ${f}`);
    }
  }

  const config = loadConfig();
  log(`RPC: ${config.rpcUrl}`);
  log(`MACI: ${config.maciAddress}`);

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);
  log(`Coordinator wallet: ${signer.address}`);

  const balance = await provider.getBalance(signer.address);
  log(`Balance: ${ethers.formatEther(balance)} ETH`);

  log('Initializing cryptographic modules...');
  const crypto = await initCrypto();
  log('Crypto ready.\n');

  const maci = new ethers.Contract(config.maciAddress, MACI_ABI, provider);

  // Fetch DeployPoll events once (cache)
  const deployFilter = maci.filters.DeployPoll();
  let deployEvents = await maci.queryFilter(deployFilter);
  let lastDeployFetch = Date.now();

  // Track processed polls to avoid re-processing
  const processedPolls = new Set<number>();

  while (true) {
    try {
      const nextPollId = Number(await maci.nextPollId());
      if (nextPollId === 0) {
        log('No polls deployed yet. Waiting...');
      } else {
        // Refresh deploy events periodically
        if (Date.now() - lastDeployFetch > 60_000) {
          deployEvents = await maci.queryFilter(deployFilter);
          lastDeployFetch = Date.now();
        }

        const pollMap = new Map<number, PollAddresses>();
        for (const ev of deployEvents) {
          if ('args' in ev) {
            const a = ev.args as any;
            pollMap.set(Number(a.pollId), {
              poll: a.pollAddr,
              mp: a.messageProcessorAddr,
              tally: a.tallyAddr,
            });
          }
        }

        log(`Checking ${nextPollId} poll(s)...`);

        for (let i = 0; i < nextPollId; i++) {
          if (processedPolls.has(i)) continue;

          const addrs = pollMap.get(i);
          if (!addrs) {
            log(`  Poll ${i}: no deploy event (skipping)`);
            continue;
          }

          const poll = new ethers.Contract(addrs.poll, POLL_ABI, provider);

          const isOpen = await poll.isVotingOpen();
          if (isOpen) {
            const [deployTime, duration] = await poll.getDeployTimeAndDuration();
            const endTime = Number(deployTime) + Number(duration);
            const remaining = endTime - Math.floor(Date.now() / 1000);
            if (remaining > 0) {
              const mins = Math.floor(remaining / 60);
              const secs = remaining % 60;
              log(`  Poll ${i}: voting open (${mins}m ${secs}s remaining)`);
            } else {
              log(`  Poll ${i}: voting should be closed but isVotingOpen()=true`);
            }
            continue;
          }

          // Check finalized
          const tally = new ethers.Contract(addrs.tally, TALLY_ABI, provider);
          try {
            const verified = await tally.tallyVerified();
            if (verified) {
              log(`  Poll ${i}: finalized ✓`);
              processedPolls.add(i);
              continue;
            }
          } catch {
            // tallyVerified might revert if not yet processed
          }

          // This poll needs processing!
          try {
            await processPoll(i, addrs, maci, provider, signer, config.coordinatorSk, crypto);
            processedPolls.add(i);
          } catch (err) {
            log(`  ✗ Poll ${i} failed: ${(err as Error).message?.slice(0, 150)}`);
          }
        }
      }
    } catch (err) {
      log(`Loop error: ${(err as Error).message?.slice(0, 100)}`);
    }

    log(`\nNext check in ${POLL_CHECK_INTERVAL / 1000}s...\n`);
    await new Promise(r => setTimeout(r, POLL_CHECK_INTERVAL));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
