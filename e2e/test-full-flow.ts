#!/usr/bin/env tsx
/**
 * SIGIL E2E Test: Full MACI Voting Flow on Sepolia
 *
 * Tests the complete pipeline:
 *   Phase 0: Pre-checks (env, circuit files, balances)
 *   Phase 1: Create test wallets + fund them
 *   Phase 2: Deploy a new Poll via MACI
 *   Phase 3: Register 3 voters (signUp)
 *   Phase 4: Cast 3 votes (2 FOR, 1 AGAINST)
 *   Phase 5: Wait for voting period to end
 *   Phase 6: Coordinator processes (merge, prove, tally)
 *   Phase 7: Verify on-chain results
 *
 * Usage:
 *   cd <project-root> && npx tsx e2e/test-full-flow.ts
 *
 * Requires:
 *   .env with PRIVATE_KEY + COORDINATOR_PRIVATE_KEY
 *   Circuit files in circuits/build_maci/
 *   Deployer wallet: ≥0.3 ETH + ≥300 TON on Sepolia
 */

import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ─── Helpers ──────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function pass(phase: string) {
  console.log(`\n  ✅ ${phase} — PASS\n`);
}

function fail(phase: string, reason: string): never {
  console.error(`\n  ❌ ${phase} — FAIL: ${reason}\n`);
  process.exit(1);
}

async function waitForTx(tx: ethers.TransactionResponse, label: string): Promise<ethers.TransactionReceipt> {
  log(`  Waiting for tx: ${label} (${tx.hash.slice(0, 10)}...)`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) fail(label, `Transaction reverted: ${tx.hash}`);
  return receipt!;
}

// ─── Phase 0: Pre-checks ─────────────────────────────────────────────

interface Config {
  privateKey: string;
  coordinatorSk: bigint;
  rpcUrl: string;
  maciAddress: string;
  deployBlock: number;
  mpVerifier: string;
  tallyVerifier: string;
  vkRegistry: string;
  tonToken: string;
  coordPubKeyX: bigint;
  coordPubKeyY: bigint;
}

function loadE2EConfig(): Config {
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

  if (!privateKey) fail('Phase 0', 'PRIVATE_KEY not set in .env');
  if (!coordKey) fail('Phase 0', 'COORDINATOR_PRIVATE_KEY not set in .env');

  const configJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'src/config.json'), 'utf8'));
  const v2 = configJson.v2;
  if (!v2?.maci) fail('Phase 0', 'MACI address not found in config.json');

  return {
    privateKey: privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
    coordinatorSk: BigInt(`0x${coordKey.replace(/^0x/, '')}`),
    rpcUrl,
    maciAddress: v2.maci,
    deployBlock: configJson.deployBlock || 0,
    mpVerifier: v2.msgProcessorVerifier,
    tallyVerifier: v2.tallyVerifier,
    vkRegistry: v2.vkRegistry,
    tonToken: v2.tonToken,
    coordPubKeyX: BigInt(v2.coordinatorPubKeyX),
    coordPubKeyY: BigInt(v2.coordinatorPubKeyY),
  };
}

// ─── ABIs ─────────────────────────────────────────────────────────────

const MACI_ABI = [
  'function signUp(uint256 _pubKeyX, uint256 _pubKeyY, bytes _signUpGatekeeperData, bytes _initialVoiceCreditProxyData)',
  'function deployPoll(string _title, uint256 _duration, uint256 _coordinatorPubKeyX, uint256 _coordinatorPubKeyY, address _mpVerifier, address _tallyVerifier, address _vkRegistry, uint8 _messageTreeDepth)',
  'function nextPollId() view returns (uint256)',
  'function numSignUps() view returns (uint256)',
  'function polls(uint256) view returns (address)',
  'function owner() view returns (address)',
  'event SignUp(uint256 indexed stateIndex, uint256 pubKeyX, uint256 pubKeyY, uint256 voiceCreditBalance, uint256 timestamp)',
  'event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)',
];

const POLL_ABI = [
  'function publishMessage(uint256[10] _encMessage, uint256 _encPubKeyX, uint256 _encPubKeyY)',
  'function isVotingOpen() view returns (bool)',
  'function numMessages() view returns (uint256)',
  'function getDeployTimeAndDuration() view returns (uint256, uint256)',
  'function coordinatorPubKeyX() view returns (uint256)',
  'function coordinatorPubKeyY() view returns (uint256)',
  'function stateAqMerged() view returns (bool)',
  'function messageAqMerged() view returns (bool)',
  'function mergeMaciStateAqSubRoots(uint256 _numSrQueueOps)',
  'function mergeMaciStateAq()',
  'function mergeMessageAqSubRoots(uint256 _numSrQueueOps)',
  'function mergeMessageAq()',
  'event MessagePublished(uint256 indexed messageIndex, uint256[10] encMessage, uint256 encPubKeyX, uint256 encPubKeyY)',
];

const TALLY_ABI = [
  'function tallyVerified() view returns (bool)',
  'function forVotes() view returns (uint256)',
  'function againstVotes() view returns (uint256)',
  'function abstainVotes() view returns (uint256)',
  'function totalVoters() view returns (uint256)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║   SIGIL E2E Test: Full MACI Voting Flow   ║');
  console.log('  ║   Sepolia Testnet                          ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');

  // ── Phase 0: Pre-checks ──────────────────────────────
  log('Phase 0: Pre-checks...');

  const config = loadE2EConfig();
  log(`  MACI: ${config.maciAddress}`);
  log(`  RPC: ${config.rpcUrl}`);

  // Circuit files
  const circuitFiles = [
    'circuits/build_maci/MessageProcessor_js/MessageProcessor.wasm',
    'circuits/build_maci/MessageProcessor_final.zkey',
    'circuits/build_maci/TallyVotes_js/TallyVotes.wasm',
    'circuits/build_maci/TallyVotes_final.zkey',
  ];
  for (const f of circuitFiles) {
    const full = resolve(PROJECT_ROOT, f);
    if (!existsSync(full)) fail('Phase 0', `Circuit file not found: ${f}`);
  }
  log('  Circuit files: all present');

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const deployer = new ethers.Wallet(config.privateKey, provider);
  log(`  Deployer: ${deployer.address}`);

  // Check ETH balance
  const ethBal = await provider.getBalance(deployer.address);
  const ethBalNum = parseFloat(ethers.formatEther(ethBal));
  log(`  ETH balance: ${ethBalNum.toFixed(4)} ETH`);
  if (ethBalNum < 0.3) fail('Phase 0', `Insufficient ETH: ${ethBalNum} (need >= 0.3)`);

  // Check TON balance
  const ton = new ethers.Contract(config.tonToken, ERC20_ABI, deployer);
  const tonBal = await ton.balanceOf(deployer.address);
  const tonBalNum = parseFloat(ethers.formatEther(tonBal));
  log(`  TON balance: ${tonBalNum.toFixed(2)} TON`);
  if (tonBalNum < 300) fail('Phase 0', `Insufficient TON: ${tonBalNum} (need >= 300)`);

  // Check MACI contract
  const maci = new ethers.Contract(config.maciAddress, MACI_ABI, deployer);
  const owner = await maci.owner();
  log(`  MACI owner: ${owner}`);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    fail('Phase 0', `Deployer is not MACI owner. Owner=${owner}, Deployer=${deployer.address}`);
  }

  pass('Phase 0: Pre-checks');

  // ── Phase 1: Create test wallets ─────────────────────
  log('Phase 1: Creating test wallets...');

  // Use HDNode to derive child wallets deterministically from deployer key
  const wallets: ethers.Wallet[] = [];
  const walletNames = ['Alice', 'Bob', 'Charlie'];

  for (let i = 0; i < 3; i++) {
    // Derive deterministic keys from deployer key + index
    const seed = ethers.solidityPackedKeccak256(['bytes32', 'uint256'], [config.privateKey, i + 1000]);
    const wallet = new ethers.Wallet(seed, provider);
    wallets.push(wallet);
    log(`  ${walletNames[i]}: ${wallet.address}`);
  }

  // Fund wallets with ETH and TON
  for (let i = 0; i < 3; i++) {
    const bal = await provider.getBalance(wallets[i].address);
    if (bal < ethers.parseEther('0.03')) {
      const tx = await deployer.sendTransaction({
        to: wallets[i].address,
        value: ethers.parseEther('0.05'),
      });
      await waitForTx(tx, `Fund ${walletNames[i]} ETH`);
    } else {
      log(`  ${walletNames[i]}: already has ${ethers.formatEther(bal)} ETH`);
    }

    const tonBalance = await ton.balanceOf(wallets[i].address);
    if (tonBalance < ethers.parseEther('50')) {
      const tx = await ton.transfer(wallets[i].address, ethers.parseEther('100'));
      await waitForTx(tx, `Fund ${walletNames[i]} TON`);
    } else {
      log(`  ${walletNames[i]}: already has ${ethers.formatEther(tonBalance)} TON`);
    }
  }

  pass('Phase 1: Test wallets ready');

  // ── Phase 2: Deploy Poll ─────────────────────────────
  log('Phase 2: Deploying new Poll...');

  const pollDuration = 120; // 2 minutes for E2E test
  const prevPollId = Number(await maci.nextPollId());
  log(`  Current nextPollId: ${prevPollId}`);

  const deployTx = await maci.deployPoll(
    'E2E Test Poll',
    pollDuration,
    config.coordPubKeyX,
    config.coordPubKeyY,
    config.mpVerifier,
    config.tallyVerifier,
    config.vkRegistry,
    2, // messageTreeDepth
  );
  const deployReceipt = await waitForTx(deployTx, 'deployPoll');

  // Extract poll addresses from DeployPoll event
  const deployLog = deployReceipt.logs.find((l) => {
    try {
      const parsed = maci.interface.parseLog({ topics: l.topics as string[], data: l.data });
      return parsed?.name === 'DeployPoll';
    } catch { return false; }
  });

  if (!deployLog) fail('Phase 2', 'DeployPoll event not found in receipt');

  const parsedDeploy = maci.interface.parseLog({
    topics: deployLog!.topics as string[],
    data: deployLog!.data,
  })!;

  const pollId = Number(parsedDeploy.args.pollId);
  const pollAddr = parsedDeploy.args.pollAddr;
  const mpAddr = parsedDeploy.args.messageProcessorAddr;
  const tallyAddr = parsedDeploy.args.tallyAddr;

  log(`  Poll ID: ${pollId}`);
  log(`  Poll address: ${pollAddr}`);
  log(`  MessageProcessor: ${mpAddr}`);
  log(`  Tally: ${tallyAddr}`);

  // Verify voting is open
  const poll = new ethers.Contract(pollAddr, POLL_ABI, provider);
  const isOpen = await poll.isVotingOpen();
  if (!isOpen) fail('Phase 2', 'Poll voting is not open after deployment');

  pass('Phase 2: Poll deployed');

  // ── Phase 3: Register 3 voters ───────────────────────
  log('Phase 3: Registering voters...');

  // Initialize crypto for MACI key generation
  const { buildBabyjub, buildEddsa } = await import('circomlibjs');
  const babyJub = await buildBabyjub();
  const eddsa = await buildEddsa();
  const F = babyJub.F;

  interface VoterInfo {
    wallet: ethers.Wallet;
    sk: bigint;
    pubKey: [bigint, bigint];
    stateIndex: number;
    name: string;
  }

  const voters: VoterInfo[] = [];

  for (let i = 0; i < 3; i++) {
    // Generate MACI keypair from deterministic seed
    const seedBytes = ethers.getBytes(
      ethers.solidityPackedKeccak256(['string', 'uint256'], [`maci-e2e-voter-${i}`, pollId])
    );

    // Derive BabyJubjub private key: take first 31 bytes mod subgroup order
    let sk = 0n;
    for (let j = 0; j < 31; j++) {
      sk = (sk << 8n) | BigInt(seedBytes[j]);
    }
    // BabyJubjub subgroup order
    const subOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
    sk = sk % subOrder;

    // Derive public key
    const pubKeyRaw = babyJub.mulPointEscalar(babyJub.Base8, sk);
    const pubKey: [bigint, bigint] = [
      BigInt(F.toString(pubKeyRaw[0])),
      BigInt(F.toString(pubKeyRaw[1])),
    ];

    // signUp on MACI
    const maciWithSigner = new ethers.Contract(config.maciAddress, MACI_ABI, wallets[i]);
    const signUpTx = await maciWithSigner.signUp(pubKey[0], pubKey[1], '0x', '0x');
    const signUpReceipt = await waitForTx(signUpTx, `signUp ${walletNames[i]}`);

    // Extract stateIndex from SignUp event
    const signUpLog = signUpReceipt.logs.find((l) => {
      try {
        const parsed = maci.interface.parseLog({ topics: l.topics as string[], data: l.data });
        return parsed?.name === 'SignUp';
      } catch { return false; }
    });

    let stateIndex = i + 1; // default 1-indexed
    if (signUpLog) {
      const parsed = maci.interface.parseLog({
        topics: signUpLog.topics as string[],
        data: signUpLog.data,
      });
      stateIndex = Number(parsed!.args.stateIndex);
    }

    voters.push({ wallet: wallets[i], sk, pubKey, stateIndex, name: walletNames[i] });
    log(`  ${walletNames[i]}: stateIndex=${stateIndex}, pubKey=(${pubKey[0].toString().slice(0, 10)}..., ${pubKey[1].toString().slice(0, 10)}...)`);
  }

  // Verify numSignUps
  const numSignUps = Number(await maci.numSignUps());
  log(`  numSignUps: ${numSignUps}`);
  if (numSignUps < 3) fail('Phase 3', `Expected at least 3 signups, got ${numSignUps}`);

  pass('Phase 3: 3 voters registered');

  // ── Phase 4: Cast votes ──────────────────────────────
  log('Phase 4: Casting votes...');

  // Build crypto modules for voting
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const Fp = poseidon.F;

  // ECDH + DuplexSponge encryption
  function ecdhSharedKey(sk: bigint, pub: [bigint, bigint]): [bigint, bigint] {
    const pt = [F.e(pub[0]), F.e(pub[1])];
    const shared = babyJub.mulPointEscalar(pt, sk);
    return [BigInt(F.toString(shared[0])), BigInt(F.toString(shared[1]))];
  }

  function poseidonHash(...inputs: bigint[]): bigint {
    const h = poseidon(inputs.map((x) => Fp.e(x)));
    return BigInt(Fp.toString(h));
  }

  // Poseidon DuplexSponge encryption (must match coordinator's decryption)
  const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const TWO128 = 2n ** 128n;

  function poseidonPerm(state: bigint[]): bigint[] {
    const inputs = state.slice(1).map((s) => Fp.e(s));
    const initState = Fp.e(state[0]);
    const result = poseidon(inputs, initState, 4);
    return result.map((r: any) => BigInt(Fp.toString(r)));
  }

  function duplexEncrypt(plaintext: bigint[], key: [bigint, bigint], nonce: bigint): bigint[] {
    const length = plaintext.length;
    // Pad to multiple of 3 (rate)
    const padded = [...plaintext];
    while (padded.length % 3 !== 0) padded.push(0n);

    // Initial state: [0, key[0], key[1], nonce + length * 2^128]
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

      // Set state rate to ciphertext values
      state[1] = c0;
      state[2] = c1;
      state[3] = c2;
    }

    // Auth tag
    state = poseidonPerm(state);
    ciphertext.push(state[1]);

    return ciphertext;
  }

  // EdDSA sign (using circomlibjs eddsa)
  function eddsaSign(msg: bigint, sk: bigint): { R8: [bigint, bigint]; S: bigint } {
    // circomlibjs eddsa.signPoseidon expects Buffer privKey and F element msg
    // We need to convert our bigint sk to a Buffer
    const skBuf = Buffer.alloc(32);
    let v = sk;
    for (let i = 31; i >= 0; i--) {
      skBuf[i] = Number(v & 0xFFn);
      v >>= 8n;
    }
    const sig = eddsa.signPoseidon(skBuf, F.e(msg));
    return {
      R8: [BigInt(F.toString(sig.R8[0])), BigInt(F.toString(sig.R8[1]))],
      S: sig.S,
    };
  }

  function packCommand(stateIndex: bigint, voteOptionIndex: bigint, newVoteWeight: bigint, nonce: bigint, pollIdN: bigint): bigint {
    return stateIndex | (voteOptionIndex << 50n) | (newVoteWeight << 100n) | (nonce << 150n) | (pollIdN << 200n);
  }

  // Vote plan: Alice=FOR(1), Bob=FOR(1), Charlie=AGAINST(0)
  const voteChoices = [1, 1, 0]; // choice indices
  const voteWeights = [1, 1, 1]; // all weight 1

  for (let i = 0; i < 3; i++) {
    const voter = voters[i];

    // Generate ephemeral keypair for ECDH
    const ephSeedBytes = ethers.getBytes(
      ethers.solidityPackedKeccak256(['string', 'uint256', 'uint256'], [`e2e-eph-${i}`, pollId, Date.now()])
    );
    let ephSk = 0n;
    for (let j = 0; j < 31; j++) {
      ephSk = (ephSk << 8n) | BigInt(ephSeedBytes[j]);
    }
    const subOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
    ephSk = ephSk % subOrder;

    const ephPubKeyRaw = babyJub.mulPointEscalar(babyJub.Base8, ephSk);
    const ephPubKey: [bigint, bigint] = [
      BigInt(F.toString(ephPubKeyRaw[0])),
      BigInt(F.toString(ephPubKeyRaw[1])),
    ];

    // ECDH shared key with coordinator
    const sharedKey = ecdhSharedKey(ephSk, [config.coordPubKeyX, config.coordPubKeyY]);

    // Pack command
    const packed = packCommand(
      BigInt(voter.stateIndex),
      BigInt(voteChoices[i]),
      BigInt(voteWeights[i]),
      1n, // nonce = 1 (first vote)
      BigInt(pollId),
    );

    // Random salt
    const saltBytes = ethers.randomBytes(31);
    let salt = 0n;
    for (let j = 0; j < 31; j++) {
      salt = (salt << 8n) | BigInt(saltBytes[j]);
    }

    // Compute cmdHash = poseidon(packed, pubKeyX, pubKeyY, salt) — must match coordinator
    const cmdHash = poseidonHash(packed, voter.pubKey[0], voter.pubKey[1], salt);

    // EdDSA sign
    const sig = eddsaSign(cmdHash, voter.sk);

    // Compose plaintext: [packed, pubKeyX, pubKeyY, salt, R8x, R8y, S]
    const plaintext = [
      packed,
      voter.pubKey[0],
      voter.pubKey[1],
      salt,
      sig.R8[0],
      sig.R8[1],
      sig.S,
    ];

    // Encrypt with DuplexSponge
    const ciphertext = duplexEncrypt(plaintext, sharedKey, 0n);

    // Pad to 10 fields
    const encMessage: bigint[] = new Array(10).fill(0n);
    for (let j = 0; j < Math.min(ciphertext.length, 10); j++) {
      encMessage[j] = ciphertext[j];
    }

    // Submit on-chain
    const pollWithSigner = new ethers.Contract(pollAddr, POLL_ABI, voter.wallet);
    const voteTx = await pollWithSigner.publishMessage(encMessage, ephPubKey[0], ephPubKey[1]);
    await waitForTx(voteTx, `Vote: ${voter.name} → ${voteChoices[i] === 1 ? 'FOR' : 'AGAINST'}`);
    log(`  ${voter.name}: voted ${voteChoices[i] === 1 ? 'FOR' : 'AGAINST'} (weight=${voteWeights[i]})`);
  }

  // Verify numMessages
  const numMsgs = Number(await poll.numMessages());
  log(`  numMessages: ${numMsgs}`);
  if (numMsgs < 3) fail('Phase 4', `Expected 3 messages, got ${numMsgs}`);

  pass('Phase 4: 3 votes cast (2 FOR, 1 AGAINST)');

  // ── Phase 5: Wait for voting period to end ───────────
  log('Phase 5: Waiting for voting period to end...');

  const [deployTime, duration] = await poll.getDeployTimeAndDuration();
  const endTime = Number(deployTime) + Number(duration);
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTime - now;

  if (remaining > 0) {
    log(`  Voting ends in ${remaining}s. Waiting...`);
    // Add 5s buffer for block timestamp to catch up
    await new Promise((r) => setTimeout(r, (remaining + 5) * 1000));
  }

  // Verify voting is closed
  const isOpenAfter = await poll.isVotingOpen();
  if (isOpenAfter) {
    log('  Voting still open after wait, adding 30s buffer...');
    await new Promise((r) => setTimeout(r, 30_000));
    const isOpenFinal = await poll.isVotingOpen();
    if (isOpenFinal) fail('Phase 5', 'Voting still open after extended wait');
  }

  pass('Phase 5: Voting period ended');

  // ── Phase 6: Coordinator processing ──────────────────
  log('Phase 6: Coordinator processing...');
  log('  (merge → process → prove → tally → publish)');

  // Import and run the coordinator's processPoll
  const { processPoll, initCrypto } = await import('../coordinator/src/run.js');

  const crypto = await initCrypto();
  const coordSigner = new ethers.Wallet(config.privateKey, provider);
  const maciForCoord = new ethers.Contract(config.maciAddress, MACI_ABI, provider);

  await processPoll(
    pollId,
    { poll: pollAddr, mp: mpAddr, tally: tallyAddr },
    maciForCoord,
    provider,
    coordSigner,
    config.coordinatorSk,
    crypto,
    config.deployBlock,
  );

  pass('Phase 6: Coordinator processing complete');

  // ── Phase 7: Verify results ──────────────────────────
  log('Phase 7: Verifying on-chain results...');

  const tallyContract = new ethers.Contract(tallyAddr, TALLY_ABI, provider);

  const tallyVerified = await tallyContract.tallyVerified();
  log(`  tallyVerified: ${tallyVerified}`);
  if (!tallyVerified) fail('Phase 7', 'tallyVerified() returned false');

  const forVotes = await tallyContract.forVotes();
  const againstVotes = await tallyContract.againstVotes();
  const abstainVotes = await tallyContract.abstainVotes();

  log(`  Results: FOR=${forVotes}, AGAINST=${againstVotes}, ABSTAIN=${abstainVotes}`);

  // Expected: 2 FOR (Alice + Bob), 1 AGAINST (Charlie), 0 ABSTAIN
  if (forVotes !== 2n) fail('Phase 7', `Expected forVotes=2, got ${forVotes}`);
  if (againstVotes !== 1n) fail('Phase 7', `Expected againstVotes=1, got ${againstVotes}`);
  if (abstainVotes !== 0n) fail('Phase 7', `Expected abstainVotes=0, got ${abstainVotes}`);

  pass('Phase 7: Results verified');

  // ── Summary ──────────────────────────────────────────
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║   🎉 ALL PHASES PASSED — E2E SUCCESS!     ║');
  console.log('  ╠═══════════════════════════════════════════╣');
  console.log(`  ║   Poll ID: ${String(pollId).padEnd(30)}║`);
  console.log(`  ║   Poll:    ${pollAddr.slice(0, 28)}...  ║`);
  console.log(`  ║   FOR: 2  AGAINST: 1  ABSTAIN: 0         ║`);
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
