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
 *   CIRCUIT_MODE            — 'dev' or 'prod' (default: 'dev')
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

const POLL_CHECK_INTERVAL = 10_000; // 10s between checks

// Circuit mode: 'prod' or 'dev' (from env or default)
const CIRCUIT_MODE = process.env.CIRCUIT_MODE ?? 'dev';
const IS_PROD = CIRCUIT_MODE === 'prod';

// Tree params: dev (depth=2, batch=2) or prod (depth=4, batch=5)
const STATE_TREE_DEPTH = IS_PROD ? 4 : 2;
const BATCH_SIZE = IS_PROD ? 5 : 2;
const TALLY_BATCH_SIZE = IS_PROD ? 5 : 2;
const MAX_VOTE_OPTIONS = IS_PROD ? 25 : 25; // 5^voteOptionTreeDepth (depth=2 for both)
const TALLY_NUM_OPTIONS = 25; // 5^voteOptionTreeDepth = 5^2 = 25 (same for dev and prod)

const MP_WASM = IS_PROD
  ? resolve(PROJECT_ROOT, 'circuits/build_prod/MessageProcessor_prod_js/MessageProcessor_prod.wasm')
  : resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_js/MessageProcessor.wasm');
const MP_ZKEY = IS_PROD
  ? resolve(PROJECT_ROOT, 'circuits/build_prod/MessageProcessor_prod_final.zkey')
  : resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_final.zkey');
const TV_WASM = IS_PROD
  ? resolve(PROJECT_ROOT, 'circuits/build_prod/TallyVotes_prod_js/TallyVotes_prod.wasm')
  : resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_js/TallyVotes.wasm');
const TV_ZKEY = IS_PROD
  ? resolve(PROJECT_ROOT, 'circuits/build_prod/TallyVotes_prod_final.zkey')
  : resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_final.zkey');

// ─── Load Configuration ───────────────────────────────────────────────

interface Config {
  privateKey: string;
  coordinatorSk: bigint;
  rpcUrl: string;
  maciAddress: string;
  deployBlock: number;
}

export function loadConfig(): Config {
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
  const maciAddress = IS_PROD ? configJson.prod?.maci : configJson.v2?.maci;
  if (!maciAddress) throw new Error(`MACI address not found in config.json (mode=${CIRCUIT_MODE})`);

  return {
    privateKey: privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
    coordinatorSk: BigInt(`0x${coordKey.replace(/^0x/, '')}`),
    rpcUrl,
    maciAddress,
    deployBlock: configJson.deployBlock || 0,
  };
}

// ─── ABIs (coordinator needs merge/process/tally functions) ───────────

export const MACI_ABI = [
  'function nextPollId() view returns (uint256)',
  'function polls(uint256) view returns (address)',
  'function numSignUps() view returns (uint256)',
  'function resetStateAqMerge()',
  'event SignUp(uint256 indexed stateIndex, uint256 indexed pubKeyX, uint256 pubKeyY, uint256 voiceCreditBalance, uint256 timestamp)',
  'event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)',
];

export const POLL_ABI = [
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
  'function numSignUpsAtDeployment() view returns (uint256)',
  'event MessagePublished(uint256 indexed messageIndex, uint256[10] encMessage, uint256 encPubKeyX, uint256 encPubKeyY)',
];

const MP_ABI = [
  'function processMessages(uint256 _newStateCommitment, uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC)',
  'function processingComplete() view returns (bool)',
  'function completeProcessing()',
  'function currentStateCommitment() view returns (uint256)',
];

export const TALLY_ABI = [
  'function tallyVotes(uint256 _newTallyCommitment, uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC)',
  'function publishResults(uint256 _forVotes, uint256 _againstVotes, uint256 _abstainVotes, uint256 _totalVoters, uint256 _tallyResultsRoot, uint256 _totalSpent, uint256 _perOptionSpentRoot)',
  'function tallyVerified() view returns (bool)',
  'function tallyCommitment() view returns (uint256)',
];

// ─── Crypto Adapter ───────────────────────────────────────────────────

interface CryptoKit {
  poseidon: any;
  F: any;
  eddsa: any;
  babyJub: any;
  hash: (...inputs: bigint[]) => bigint;
  ecdh: (sk: bigint, pub: [bigint, bigint]) => bigint[];
  decrypt: (ct: bigint[], key: bigint[], nonce: bigint) => bigint[] | null;
  encrypt: (pt: bigint[], key: bigint[], nonce: bigint) => bigint[];
  verifyEdDSA: (msg: bigint, sig: { R8: bigint[]; S: bigint }, pk: bigint[]) => boolean;
  hashStateLeaf: (l: StateLeaf) => bigint;
  hashBallot: (b: Ballot) => bigint;
  hashCommand: (c: Command) => bigint;
  unpackCommand: (packed: bigint) => Command;
  quinaryTreeRoot: (leaves: bigint[]) => bigint;
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

export async function initCrypto(): Promise<CryptoKit> {
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
    // (0,0) is not on Baby Jubjub curve — padding messages use this.
    // Circuit handles via Mux1 substitution; here we return dummy key
    // so decryption fails auth tag → message treated as invalid.
    if (pub[0] === 0n && pub[1] === 0n) {
      return [0n, 0n];
    }
    const pt = [F.e(pub[0]), F.e(pub[1])];
    const shared = babyJub.mulPointEscalar(pt, sk);
    return [BigInt(F.toString(shared[0])), BigInt(F.toString(shared[1]))];
  }

  // Poseidon DuplexSponge decryption (t=4, rate=3)
  // Must match src/crypto/duplexSponge.ts poseidonEncrypt exactly
  const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const TWO128 = 2n ** 128n;

  // Full Poseidon permutation via circomlibjs 3-arg form:
  // poseidon([s1,s2,s3], s0, 4) constructs state [s0,s1,s2,s3], permutes, returns all 4
  function poseidonPerm(state: bigint[]): bigint[] {
    const inputs = state.slice(1).map(s => F.e(s));
    const initState = F.e(state[0]);
    const result = poseidon(inputs, initState, 4);
    return result.map((r: any) => BigInt(F.toString(r)));
  }

  function duplexDecrypt(ct: bigint[], key: bigint[], nonce: bigint): bigint[] | null {
    // ct format: [encrypted[0..N-2], authTag] where N = ct.length
    // MACI messages: plaintext length = 7, padded to 9, + 1 auth tag = 10 elements
    const tag = ct[ct.length - 1];
    const encrypted = ct.slice(0, -1);
    const length = 7; // MACI command plaintext length

    // Initial state must match poseidonEncrypt: [0, key[0], key[1], nonce + length * 2^128]
    let state: bigint[] = [
      0n,
      key[0],
      key[1],
      (nonce + BigInt(length) * TWO128) % SNARK_FIELD,
    ];

    const plaintext: bigint[] = [];

    for (let i = 0; i < encrypted.length; i += 3) {
      // Permute
      state = poseidonPerm(state);

      // Recover plaintext: pt = ct - state (mod p) at rate positions [1,2,3]
      const p0 = (encrypted[i] - state[1] + SNARK_FIELD) % SNARK_FIELD;
      const p1 = (encrypted[i + 1] - state[2] + SNARK_FIELD) % SNARK_FIELD;
      const p2 = (encrypted[i + 2] - state[3] + SNARK_FIELD) % SNARK_FIELD;
      plaintext.push(p0, p1, p2);

      // Set state rate portion to ciphertext values (for next permutation)
      state[1] = encrypted[i];
      state[2] = encrypted[i + 1];
      state[3] = encrypted[i + 2];
    }

    // Verify authentication tag
    state = poseidonPerm(state);
    if (state[1] !== tag) {
      log(`  ⚠ DuplexSponge auth tag mismatch (message corrupted or wrong key)`);
      return null;
    }

    return plaintext.slice(0, length);
  }

  function duplexEncrypt(pt: bigint[], key: bigint[], nonce: bigint): bigint[] {
    const length = pt.length;
    const padded = [...pt];
    while (padded.length % 3 !== 0) padded.push(0n);

    let state: bigint[] = [
      0n,
      key[0],
      key[1],
      (nonce + BigInt(length) * TWO128) % SNARK_FIELD,
    ];

    const ciphertext: bigint[] = [];

    for (let i = 0; i < padded.length; i += 3) {
      state = poseidonPerm(state);
      const c0 = (padded[i] + state[1]) % SNARK_FIELD;
      const c1 = (padded[i + 1] + state[2]) % SNARK_FIELD;
      const c2 = (padded[i + 2] + state[3]) % SNARK_FIELD;
      ciphertext.push(c0, c1, c2);
      state[1] = c0;
      state[2] = c1;
      state[3] = c2;
    }

    // Auth tag
    state = poseidonPerm(state);
    ciphertext.push(state[1]);
    return ciphertext;
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
    // Must match circuit: Poseidon(stateIndex, newPubKeyX, newPubKeyY, newVoteWeight, salt)
    // NOT the packed version — circuit unpacks first then hashes individual fields
    return hash(c.stateIndex, c.newPubKeyX, c.newPubKeyY, c.newVoteWeight, c.salt);
  }

  function unpackCommandFn(packed: bigint): Command {
    const m50 = (1n << 50n) - 1n;
    const cmd: Command = {
      stateIndex: packed & m50,
      voteOptionIndex: (packed >> 50n) & m50,
      newVoteWeight: (packed >> 100n) & m50,
      nonce: (packed >> 150n) & m50,
      pollId: (packed >> 200n) & m50,
      newPubKeyX: 0n,
      newPubKeyY: 0n,
      salt: 0n,
    };

    // Range validation: clamp out-of-bounds values to prevent undefined behavior
    if (cmd.voteOptionIndex >= BigInt(MAX_VOTE_OPTIONS)) {
      log(`  ⚠ unpackCommand: voteOptionIndex ${cmd.voteOptionIndex} out of range (max ${MAX_VOTE_OPTIONS}), clamping to 0`);
      cmd.voteOptionIndex = 0n;
    }
    if (cmd.nonce >= (1n << 50n)) {
      log(`  ⚠ unpackCommand: nonce ${cmd.nonce} out of range, clamping to 0`);
      cmd.nonce = 0n;
    }

    return cmd;
  }

  // Compute root of a quinary tree from leaves (e.g., 25 leaves → depth 2)
  // 5 leaves per node, hashed with Poseidon(5)
  function quinaryTreeRoot(leaves: bigint[]): bigint {
    let level = [...leaves];
    while (level.length > 1) {
      const next: bigint[] = [];
      for (let i = 0; i < level.length; i += 5) {
        const children = level.slice(i, i + 5);
        while (children.length < 5) children.push(0n);
        next.push(hash(...children));
      }
      level = next;
    }
    return level[0] ?? 0n;
  }

  return {
    poseidon, F, eddsa, babyJub,
    hash, ecdh: ecdhFn, decrypt: duplexDecrypt, encrypt: duplexEncrypt,
    verifyEdDSA: verifyEdDSAFn,
    hashStateLeaf: hashStateLeafFn,
    hashBallot: hashBallotFn,
    hashCommand: hashCommandFn,
    unpackCommand: unpackCommandFn,
    quinaryTreeRoot,
  };
}

// ─── Poll Processing Pipeline ─────────────────────────────────────────

export interface PollAddresses {
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

  const stateM = await retryRpc(() => pollRead.stateAqMerged());
  const msgM = await retryRpc(() => pollRead.messageAqMerged());

  if (!stateM) {
    try {
      log('  Merging State AccQueue sub-roots...');
      const tx1 = await poll.mergeMaciStateAqSubRoots(0);
      await tx1.wait();
    } catch (e) {
      log(`  State sub-roots: ${(e as Error).message?.includes('Already') ? 'already merged' : (e as Error).message?.slice(0, 80)}`);
    }
    try {
      log('  Merging State AccQueue...');
      const tx2 = await poll.mergeMaciStateAq();
      await tx2.wait();
      log('  State AccQueue merged');
    } catch (e) {
      log(`  State AQ merge: ${(e as Error).message?.slice(0, 80)}`);
    }
  } else {
    log('  State AccQueue: already merged');
  }

  if (!msgM) {
    try {
      log('  Merging Message AccQueue sub-roots...');
      const tx3 = await poll.mergeMessageAqSubRoots(0);
      await tx3.wait();
    } catch (e) {
      log(`  Message sub-roots: ${(e as Error).message?.includes('Already') ? 'already merged' : (e as Error).message?.slice(0, 80)}`);
    }
    try {
      log('  Merging Message AccQueue...');
      const tx4 = await poll.mergeMessageAq();
      await tx4.wait();
      log('  Message AccQueue merged');
    } catch (e) {
      log(`  Message AQ merge: ${(e as Error).message?.slice(0, 80)}`);
    }
  } else {
    log('  Message AccQueue: already merged');
  }
}

/** Step 2: Fetch on-chain events */
async function fetchEvents(
  maciContract: ethers.Contract,
  pollAddr: string,
  provider: ethers.Provider,
  deployBlock: number,
): Promise<{ stateLeaves: StateLeaf[]; messages: EncryptedMessage[] }> {
  // SignUp events (from deploy block to avoid RPC block range limit)
  const suFilter = maciContract.filters.SignUp();
  const suEvents = await retryRpc(() => maciContract.queryFilter(suFilter, deployBlock));
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
  const msgEvents = await retryRpc(() => pollContract.queryFilter(msgFilter, deployBlock));
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
): Promise<{ newStateRoot: bigint; newBallotRoot: bigint; stateMap: Map<number, StateLeaf>; ballotMap: Map<number, Ballot>; stateTree: QuinaryMerkleTree; ballotTree: QuinaryMerkleTree }> {
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

  // Track state commitment across batches (matches contract's stored value)
  // Contract initializes currentStateCommitment = 0, updated after each batch
  let currentStateCommitmentTracker = 0n;

  let batchCount = 0;
  for (let bi = 0; bi < reversed.length; bi += BATCH_SIZE) {
    const batch = reversed.slice(bi, bi + BATCH_SIZE);
    batchCount++;

    log(`  Batch ${batchCount}: messages ${batch.map(m => m.messageIndex).join(', ')}`);

    // Capture BEFORE roots
    const inputStateRoot = stateTree.root;
    const inputBallotRoot = ballotTree.root;
    const inputMessageRoot = msgTree.root;

    // Prepare batch circuit inputs (matching MessageProcessor.circom signals)
    const batchMsgs: bigint[][] = [];
    const batchEncPubKeys: bigint[][] = [];
    const batchMsgNonces: bigint[] = [];
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

      // Auth tag failure → treat as invalid message
      let decryptFailed = false;
      const pt = plaintext ?? [0n, 0n, 0n, 0n, 0n, 0n, 0n];
      if (!plaintext) {
        decryptFailed = true;
        log(`    msg[${msg.messageIndex}]: decryption failed (auth tag mismatch)`);
      }

      // Unpack command
      const cmd = crypto.unpackCommand(pt[0] ?? 0n);
      cmd.newPubKeyX = pt[1] ?? 0n;
      cmd.newPubKeyY = pt[2] ?? 0n;
      cmd.salt = pt[3] ?? 0n;

      const sig = {
        R8: [pt[4] ?? 0n, pt[5] ?? 0n],
        S: pt[6] ?? 0n,
      };

      const stateIdx = Number(cmd.stateIndex);

      // Get CURRENT state leaf and Merkle proof BEFORE update
      const currentLeaf = stateMap.get(stateIdx) ?? { ...blank };
      const stateProof = stateTree.getProof(stateIdx);
      const ballotProof = ballotTree.getProof(stateIdx);
      const msgProof = msgTree.getProof(msg.messageIndex);

      const currentBallot = ballotMap.get(stateIdx) ?? { ...blankBallot, votes: [...blankBallot.votes] };

      // Collect circuit inputs (the circuit decrypts in-circuit, no cmd* needed)
      batchMsgs.push(msg.data);
      batchEncPubKeys.push([msg.encPubKeyX, msg.encPubKeyY]);
      batchMsgNonces.push(0n); // DuplexSponge nonce (always 0 in our protocol)
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
      let isValid = !decryptFailed;

      // 5a. Signature check
      const cmdHash = crypto.hashCommand(cmd);
      const sigOk = crypto.verifyEdDSA(cmdHash, sig, [currentLeaf.pubKeyX, currentLeaf.pubKeyY]);
      if (!sigOk) { isValid = false; if (batch[mi]) log(`    [DEBUG] sig FAIL: stateIdx=${stateIdx} cmdHash=${cmdHash.toString().slice(0,20)}... leaf.pk=[${currentLeaf.pubKeyX.toString().slice(0,15)}..., ${currentLeaf.pubKeyY.toString().slice(0,15)}...]`); }

      // 5b. Range check
      const rangeOk = stateIdx < numSignUps && stateIdx > 0;
      if (!rangeOk) { isValid = false; if (batch[mi]) log(`    [DEBUG] range FAIL: stateIdx=${stateIdx} numSignUps=${numSignUps}`); }

      // 5c. Nonce check
      const nonceOk = cmd.nonce === currentBallot.nonce + 1n;
      if (!nonceOk) { isValid = false; if (batch[mi]) log(`    [DEBUG] nonce FAIL: cmd.nonce=${cmd.nonce} expected=${currentBallot.nonce + 1n}`); }

      // 5d. Credit check
      const currentWeight = currentBallot.votes[voteOptIdx] ?? 0n;
      const creditChange = currentWeight * currentWeight - cmd.newVoteWeight * cmd.newVoteWeight;
      const creditOk = currentLeaf.voiceCreditBalance + creditChange >= 0n;
      if (!creditOk) { isValid = false; if (batch[mi]) log(`    [DEBUG] credit FAIL: balance=${currentLeaf.voiceCreditBalance} change=${creditChange}`); }

      // 5e. Vote option range
      const voteOptOk = voteOptIdx < MAX_VOTE_OPTIONS && voteOptIdx >= 0;
      if (!voteOptOk) { isValid = false; if (batch[mi]) log(`    [DEBUG] voteOpt FAIL: idx=${voteOptIdx} max=${MAX_VOTE_OPTIONS}`); }

      if (batch[mi] && !decryptFailed) {
        log(`    [DEBUG] msg[${msg.messageIndex}] checks: sig=${sigOk} range=${rangeOk} nonce=${nonceOk} credit=${creditOk} voteOpt=${voteOptOk} → ${isValid ? 'VALID' : 'INVALID'}`);
        log(`    [DEBUG] cmd: stateIdx=${cmd.stateIndex} voteOpt=${cmd.voteOptionIndex} weight=${cmd.newVoteWeight} nonce=${cmd.nonce} pollId=${cmd.pollId}`);
      }

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

    // Compute newStateCommitment = Poseidon(outputStateRoot, outputBallotRoot)
    const newStateCommitment = crypto.hash(outputStateRoot, outputBallotRoot);

    // SHA256: 4 values matching MessageProcessor.sol contract
    const inputHash = await computePublicInputHash([
      currentStateCommitmentTracker,
      newStateCommitment,
      inputMessageRoot,
      BigInt(messages.length),
    ]);

    // Generate processMessages proof
    log(`  Generating processMessages proof (batch ${batchCount})...`);
    try {
      const proofInput: ProcessProofInput = {
        wasmPath: MP_WASM,
        zkeyPath: MP_ZKEY,
        inputHash,
        currentStateCommitment: currentStateCommitmentTracker,
        numMessages: BigInt(messages.length),
        inputStateRoot,
        outputStateRoot,
        inputBallotRoot,
        outputBallotRoot,
        inputMessageRoot,
        numSignUps: BigInt(numSignUps),
        messages: batchMsgs,
        encPubKeys: batchEncPubKeys,
        coordinatorSk,
        msgNonces: batchMsgNonces,
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

      // Update state commitment tracker (matches contract's currentStateCommitment)
      currentStateCommitmentTracker = newStateCommitment;
    } catch (err) {
      // Sanitize: only log error type and short message, never raw stack or secrets
      const errType = (err as Error).constructor?.name ?? 'Error';
      const errMsg = (err as Error).message?.slice(0, 80)?.replace(/0x[a-fA-F0-9]{40,}/g, '[REDACTED]') ?? 'unknown';
      log(`  Proof generation/submission failed: [${errType}] ${errMsg}`);
      log(`  Off-chain processing continues (results will be available for manual submission)`);
      // Still update tracker for next batch's circuit input
      currentStateCommitmentTracker = newStateCommitment;
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
    stateTree,
    ballotTree,
  };
}

/** Step 6-7: Tally votes and publish results (batch-based with full circuit inputs) */
async function tallyAndPublish(
  pollId: number,
  addrs: PollAddresses,
  numSignUps: number,
  stateMap: Map<number, StateLeaf>,
  ballotMap: Map<number, Ballot>,
  stateTree: QuinaryMerkleTree,
  newStateRoot: bigint,
  newBallotRoot: bigint,
  signer: ethers.Wallet,
  crypto: CryptoKit,
): Promise<void> {
  log('  [6/7] Tallying votes...');

  const stateCommitment = crypto.hash(newStateRoot, newBallotRoot);
  const numBatches = Math.ceil(numSignUps / TALLY_BATCH_SIZE);

  // Running accumulators
  let currentTally = new Array(TALLY_NUM_OPTIONS).fill(0n) as bigint[];
  let currentTotalSpent = 0n;
  let currentPerOptionSpent = new Array(TALLY_NUM_OPTIONS).fill(0n) as bigint[];
  let currentTallyResultsRoot = crypto.quinaryTreeRoot(currentTally);
  let currentPerOptionSpentRoot = crypto.quinaryTreeRoot(currentPerOptionSpent);
  let prevTallyCommitment = 0n; // First batch has no previous

  const blank: StateLeaf = { pubKeyX: 0n, pubKeyY: 0n, voiceCreditBalance: 2n ** 32n, timestamp: 0n };

  for (let batchNum = 0; batchNum < numBatches; batchNum++) {
    const batchStart = batchNum * TALLY_BATCH_SIZE;

    const batchStateLeaves: bigint[][] = [];
    const batchBallotNonces: bigint[] = [];
    const batchVoteWeights: bigint[][] = [];
    const batchVoteOptionRoots: bigint[] = [];
    const batchStateProofs: bigint[][][] = [];
    const batchStatePathIndices: bigint[][] = [];

    const newTally = [...currentTally];
    let newTotalSpent = currentTotalSpent;
    const newPerOptionSpent = [...currentPerOptionSpent];

    for (let i = 0; i < TALLY_BATCH_SIZE; i++) {
      const voterIdx = batchStart + i;

      if (voterIdx < numSignUps) {
        const leaf = stateMap.get(voterIdx) ?? blank;
        const defaultBallot: Ballot = { nonce: 0n, votes: new Array<bigint>(MAX_VOTE_OPTIONS).fill(0n), voteOptionRoot: 0n };
        const ballot = ballotMap.get(voterIdx) ?? defaultBallot;

        batchStateLeaves.push([leaf.pubKeyX, leaf.pubKeyY, leaf.voiceCreditBalance, leaf.timestamp]);
        batchBallotNonces.push(ballot.nonce);
        batchVoteWeights.push(ballot.votes.slice(0, TALLY_NUM_OPTIONS));
        batchVoteOptionRoots.push(ballot.voteOptionRoot);

        const proof = stateTree.getProof(voterIdx);
        batchStateProofs.push(proof.pathElements);
        batchStatePathIndices.push(proof.pathIndices.map(BigInt));

        // Accumulate vote weights (skip index 0 blank leaf for voter count)
        for (let j = 0; j < TALLY_NUM_OPTIONS; j++) {
          const weight = ballot.votes[j] ?? 0n;
          newTally[j] += weight;
          const spent = weight * weight;
          newPerOptionSpent[j] += spent;
          newTotalSpent += spent;
        }
      } else {
        // Padding: use blank values with valid Merkle proof
        batchStateLeaves.push([blank.pubKeyX, blank.pubKeyY, blank.voiceCreditBalance, blank.timestamp]);
        batchBallotNonces.push(0n);
        batchVoteWeights.push(new Array(TALLY_NUM_OPTIONS).fill(0n));
        batchVoteOptionRoots.push(0n);

        const proof = stateTree.getProof(0); // Use blank leaf proof
        batchStateProofs.push(proof.pathElements);
        batchStatePathIndices.push(proof.pathIndices.map(BigInt));
      }
    }

    const newTallyResultsRoot = crypto.quinaryTreeRoot(newTally);
    const newPerOptionSpentRoot = crypto.quinaryTreeRoot(newPerOptionSpent);
    const newTallyCommitment = crypto.hash(newTallyResultsRoot, newTotalSpent, newPerOptionSpentRoot);

    // SHA256: 3 values matching Tally.sol contract
    const inputHash = await computePublicInputHash([
      stateCommitment, prevTallyCommitment, newTallyCommitment,
    ]);

    log(`  Tally batch ${batchNum + 1}/${numBatches}: generating proof...`);
    try {
      const tallyInput: TallyProofInput = {
        wasmPath: TV_WASM,
        zkeyPath: TV_ZKEY,
        inputHash,
        stateCommitment,
        tallyCommitment: prevTallyCommitment,
        newTallyCommitment,
        batchNum: BigInt(batchNum),
        stateLeaves: batchStateLeaves,
        ballotNonces: batchBallotNonces,
        voteWeights: batchVoteWeights,
        voteOptionRoots: batchVoteOptionRoots,
        stateProofs: batchStateProofs,
        statePathIndices: batchStatePathIndices,
        currentTally,
        newTally,
        currentTotalSpent,
        newTotalSpent,
        currentPerOptionSpent,
        newPerOptionSpent,
        currentTallyResultsRoot,
        newTallyResultsRoot,
        currentPerOptionSpentRoot,
        newPerOptionSpentRoot,
      };

      const proofResult = await generateTallyProof(tallyInput);
      const { pi_a, pi_b, pi_c } = proofResult.proof;
      const pA: [bigint, bigint] = [BigInt(pi_a[0]), BigInt(pi_a[1])];
      const pB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(pi_b[0][1]), BigInt(pi_b[0][0])],
        [BigInt(pi_b[1][1]), BigInt(pi_b[1][0])],
      ];
      const pC: [bigint, bigint] = [BigInt(pi_c[0]), BigInt(pi_c[1])];

      const tallyContract = new ethers.Contract(addrs.tally, TALLY_ABI, signer);
      const tx = await tallyContract.tallyVotes(newTallyCommitment, pA, pB, pC);
      await tx.wait();
      log(`  Tally batch ${batchNum + 1} proof submitted`);
    } catch (err) {
      const errMsg = (err as Error).message?.slice(0, 80)?.replace(/0x[a-fA-F0-9]{40,}/g, '[REDACTED]') ?? 'unknown';
      log(`  Tally batch ${batchNum + 1} failed: ${errMsg}`);
    }

    // Update running accumulators for next batch
    currentTally = newTally;
    currentTotalSpent = newTotalSpent;
    currentPerOptionSpent = newPerOptionSpent;
    currentTallyResultsRoot = newTallyResultsRoot;
    currentPerOptionSpentRoot = newPerOptionSpentRoot;
    prevTallyCommitment = newTallyCommitment;
  }

  // Final results
  const againstVotes = currentTally[0] ?? 0n;
  const forVotes = currentTally[1] ?? 0n;
  const abstainVotes = currentTally[2] ?? 0n;

  // Read numSignUpsAtDeployment from Poll contract to cap totalVoters
  // Tally.publishResults() reverts with VoterCountExceedsSignups if totalVoters > numSignUpsAtDeployment
  // This happens when users sign up AFTER poll deployment (auto-registration on first vote)
  const pollContract = new ethers.Contract(addrs.poll, POLL_ABI, signer.provider);
  const numSignUpsAtDeploy = Number(await retryRpc(() => pollContract.numSignUpsAtDeployment()));
  const totalVoters = Math.min(numSignUps - 1, numSignUpsAtDeploy); // Exclude blank leaf, cap at deployment count

  log(`  Results: FOR=${forVotes}, AGAINST=${againstVotes}, ABSTAIN=${abstainVotes}, voters=${totalVoters} (allSignUps=${numSignUps - 1}, atDeployment=${numSignUpsAtDeploy})`);

  // Publish results on-chain
  log('  [7/7] Publishing results on-chain...');
  try {
    const tallyContract = new ethers.Contract(addrs.tally, TALLY_ABI, signer);
    const tx = await tallyContract.publishResults(
      forVotes,
      againstVotes,
      abstainVotes,
      BigInt(totalVoters),
      currentTallyResultsRoot,
      currentTotalSpent,
      currentPerOptionSpentRoot,
    );
    await tx.wait();
    log(`  Results published! FOR=${forVotes} AGAINST=${againstVotes} ABSTAIN=${abstainVotes}`);
  } catch (err) {
    const errMsg = (err as Error).message?.slice(0, 80)?.replace(/0x[a-fA-F0-9]{40,}/g, '[REDACTED]') ?? 'unknown';
    log(`  publishResults failed: ${errMsg}`);
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

async function retryRpc<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message ?? '';
      const isRetryable = msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('network') || msg.includes('rate limit');
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = 1000 * 2 ** attempt;
      log(`  RPC error (attempt ${attempt + 1}/${maxRetries}): ${msg.slice(0, 80)}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('retryRpc: unreachable');
}

export async function processPoll(
  pollId: number,
  addrs: PollAddresses,
  maci: ethers.Contract,
  provider: ethers.JsonRpcProvider,
  signer: ethers.Wallet,
  coordinatorSk: bigint,
  crypto: CryptoKit,
  deployBlock: number,
): Promise<void> {
  log(`\n  ★ Processing Poll ${pollId}`);

  // Step 1: Merge
  log('  [1/7] AccQueue merge...');
  await mergeAccQueues(addrs.poll, signer);

  // Step 2: Fetch events
  log('  [2/7] Fetching on-chain events...');
  const { stateLeaves, messages } = await fetchEvents(maci, addrs.poll, provider, deployBlock);
  log(`  Found ${stateLeaves.length} signups, ${messages.length} messages`);

  // Skip if no real votes (only padding message exists)
  if (stateLeaves.length === 0) {
    log('  ⚠ No voters signed up — skipping processing (nothing to tally)');
    return;
  }

  // Check if all messages are padding (encPubKey = 0,0)
  const realMessages = messages.filter(m => m.encPubKeyX !== 0n || m.encPubKeyY !== 0n);
  if (realMessages.length === 0) {
    log('  ⚠ No real votes — only padding messages. Skipping processing.');
    return;
  }

  // Initialize trees (needed for both message processing and tally)
  const initTrees = async () => {
    const stTree = new QuinaryMerkleTree(STATE_TREE_DEPTH);
    await stTree.init();
    const blTree = new QuinaryMerkleTree(STATE_TREE_DEPTH);
    await blTree.init();

    const blank: StateLeaf = { pubKeyX: 0n, pubKeyY: 0n, voiceCreditBalance: 2n ** 32n, timestamp: 0n };
    const blankBallot: Ballot = { nonce: 0n, votes: new Array(MAX_VOTE_OPTIONS).fill(0n), voteOptionRoot: 0n };

    const stMap = new Map<number, StateLeaf>();
    const blMap = new Map<number, Ballot>();

    stMap.set(0, blank);
    stTree.insert(0, crypto.hashStateLeaf(blank));
    blMap.set(0, blankBallot);
    blTree.insert(0, crypto.hashBallot(blankBallot));

    for (let i = 0; i < stateLeaves.length; i++) {
      stMap.set(i + 1, { ...stateLeaves[i] });
      stTree.insert(i + 1, crypto.hashStateLeaf(stateLeaves[i]));
      const ballot: Ballot = { nonce: 0n, votes: new Array(MAX_VOTE_OPTIONS).fill(0n), voteOptionRoot: 0n };
      blMap.set(i + 1, ballot);
      blTree.insert(i + 1, crypto.hashBallot(ballot));
    }

    return { stateTree: stTree, ballotTree: blTree, stateMap: stMap, ballotMap: blMap };
  };

  const numSignUps = stateLeaves.length + 1; // Including blank

  if (messages.length === 0) {
    log('  No messages to process. Skipping to tally with zero results...');
    const { stateTree, ballotTree, stateMap, ballotMap } = await initTrees();
    await tallyAndPublish(pollId, addrs, numSignUps, stateMap, ballotMap, stateTree, stateTree.root, ballotTree.root, signer, crypto);
    return;
  }

  // Steps 3-5: Process + prove
  log('  [3/7] Reconstructing state...');
  const { stateMap, ballotMap, stateTree, newStateRoot, newBallotRoot } = await processAndSubmitProofs(
    pollId, addrs, stateLeaves, messages, coordinatorSk, signer, crypto,
  );

  // Steps 6-7: Tally + publish
  await tallyAndPublish(pollId, addrs, numSignUps, stateMap, ballotMap, stateTree, newStateRoot, newBallotRoot, signer, crypto);

  // Reset State AccQueue merge state so future signups are possible
  // Retry up to 3 times (5s interval) since this is critical for system health
  let resetSuccess = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const maciWithSigner = maci.connect(signer) as ethers.Contract;
      const resetTx = await maciWithSigner.resetStateAqMerge();
      await resetTx.wait();
      log('  State AccQueue merge reset (new signups enabled)');
      resetSuccess = true;
      break;
    } catch (err) {
      const errMsg = (err as Error).message?.slice(0, 80) ?? 'unknown';
      log(`  ⚠ resetStateAqMerge attempt ${attempt}/3 failed: ${errMsg}`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  if (!resetSuccess) {
    log('  ✗ CRITICAL: resetStateAqMerge failed after 3 attempts — new signups will be blocked!');
    process.exit(1);
  }

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
  log(`Circuit mode: ${CIRCUIT_MODE} (depth=${STATE_TREE_DEPTH}, batch=${BATCH_SIZE}, maxVoters=${5 ** STATE_TREE_DEPTH - 1})`);
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
  let deployEvents = await retryRpc(() => maci.queryFilter(deployFilter, config.deployBlock));
  let lastDeployFetch = Date.now();

  // Track processed polls to avoid re-processing
  const processedPolls = new Set<number>();
  // Track polls that permanently failed (e.g. EdDSA sig mismatch) — stop retrying
  const failedPolls = new Map<number, number>(); // pollId → failCount
  const MAX_RETRIES = 2;

  while (true) {
    try {
      const nextPollId = Number(await retryRpc(() => maci.nextPollId()));
      if (nextPollId === 0) {
        log('No polls deployed yet. Waiting...');
      } else {
        // Refresh deploy events periodically
        if (Date.now() - lastDeployFetch > 60_000) {
          deployEvents = await retryRpc(() => maci.queryFilter(deployFilter, config.deployBlock));
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
          const fc = failedPolls.get(i) ?? 0;
          if (fc >= MAX_RETRIES) continue; // permanently failed, stop retrying

          const addrs = pollMap.get(i);
          if (!addrs) {
            log(`  Poll ${i}: no deploy event (skipping)`);
            continue;
          }

          const poll = new ethers.Contract(addrs.poll, POLL_ABI, provider);

          const isOpen = await retryRpc(() => poll.isVotingOpen());
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
            await processPoll(i, addrs, maci, provider, signer, config.coordinatorSk, crypto, config.deployBlock);
            processedPolls.add(i);
          } catch (err) {
            const newCount = (failedPolls.get(i) ?? 0) + 1;
            failedPolls.set(i, newCount);
            if (newCount >= MAX_RETRIES) {
              log(`  ✗ Poll ${i} permanently failed (${newCount}/${MAX_RETRIES}): ${(err as Error).message?.slice(0, 120)}`);
              log(`    → Will not retry. Create a new poll to continue.`);
            } else {
              log(`  ✗ Poll ${i} failed (${newCount}/${MAX_RETRIES}): ${(err as Error).message?.slice(0, 150)}`);
            }
          }
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message ?? '';
      log(`Loop error: ${errMsg.slice(0, 100)}`);
      if (errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT')) {
        log('Network error detected. Waiting 10s before retry...');
        await new Promise(r => setTimeout(r, 10_000));
        continue;
      }
    }

    log(`\nNext check in ${POLL_CHECK_INTERVAL / 1000}s...\n`);
    await new Promise(r => setTimeout(r, POLL_CHECK_INTERVAL));
  }
}

// Only auto-run when executed directly (not when imported as a module)
const isDirectRun = process.argv[1]?.endsWith('run.ts') || process.argv[1]?.endsWith('run.js');
if (isDirectRun) {
  main().catch(err => {
    // Sanitize fatal errors — never log raw stack or private keys
    const errMsg = (err as Error).message?.slice(0, 120)?.replace(/0x[a-fA-F0-9]{40,}/g, '[REDACTED]') ?? 'unknown';
    console.error(`Fatal error: ${errMsg}`);
    process.exit(1);
  });
}
