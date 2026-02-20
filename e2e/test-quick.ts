#!/usr/bin/env tsx
/**
 * Quick E2E test using the EXISTING V6 MACI on Sepolia.
 * Creates a poll, signs up, votes, waits for coordinator auto-processing, checks results.
 *
 * Usage: cd <project-root> && npx tsx e2e/test-quick.ts
 */

import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// @ts-expect-error
import { buildBabyjub, buildEddsa, buildPoseidon } from 'circomlibjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// ─── Config ──────────────────────────────────────────────────────────

function loadConfig() {
  const envPath = resolve(PROJECT_ROOT, '.env');
  const envVars: Record<string, string> = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) envVars[m[1].trim()] = m[2].trim();
    }
  }
  const get = (k: string) => process.env[k] || envVars[k] || '';

  const configJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'src/config.json'), 'utf8'));
  const v2 = configJson.v2;

  return {
    privateKey: (() => { const pk = get('PRIVATE_KEY'); return pk.startsWith('0x') ? pk : `0x${pk}`; })(),
    coordinatorSk: BigInt(`0x${get('COORDINATOR_PRIVATE_KEY').replace(/^0x/, '')}`),
    rpcUrl: get('SEPOLIA_RPC_URL') || 'https://ethereum-sepolia-rpc.publicnode.com',
    maciAddress: v2.maci,
    deployBlock: configJson.deployBlock || 0,
    mpVerifier: v2.msgProcessorVerifier,
    tallyVerifier: v2.tallyVerifier,
    vkRegistry: v2.vkRegistry,
    coordPubKeyX: BigInt(v2.coordinatorPubKeyX),
    coordPubKeyY: BigInt(v2.coordinatorPubKeyY),
    token: v2.token || v2.tonToken,
  };
}

// ─── ABIs ────────────────────────────────────────────────────────────

const MACI_ABI = [
  'function signUp(uint256 _pubKeyX, uint256 _pubKeyY, bytes _signUpGatekeeperData, bytes _initialVoiceCreditProxyData)',
  'function deployPoll(string _title, uint256 _duration, uint256 _coordinatorPubKeyX, uint256 _coordinatorPubKeyY, address _mpVerifier, address _tallyVerifier, address _vkRegistry, uint8 _messageTreeDepth)',
  'function nextPollId() view returns (uint256)',
  'function numSignUps() view returns (uint256)',
  'function polls(uint256) view returns (address)',
  'event SignUp(uint256 indexed stateIndex, uint256 indexed pubKeyX, uint256 pubKeyY, uint256 voiceCreditBalance, uint256 timestamp)',
  'event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)',
];

const POLL_ABI = [
  'function publishMessage(uint256[10] _encMessage, uint256 _encPubKeyX, uint256 _encPubKeyY)',
  'function isVotingOpen() view returns (bool)',
  'function numMessages() view returns (uint256)',
  'function getDeployTimeAndDuration() view returns (uint256, uint256)',
  'event MessagePublished(uint256 indexed messageIndex, uint256[10] encMessage, uint256 encPubKeyX, uint256 encPubKeyY)',
];

const TALLY_ABI = [
  'function tallyVerified() view returns (bool)',
  'function forVotes() view returns (uint256)',
  'function againstVotes() view returns (uint256)',
  'function totalVoters() view returns (uint256)',
];

// ─── Crypto helpers ──────────────────────────────────────────────────

const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const TWO128 = 2n ** 128n;

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  ═══════════════════════════════════════');
  console.log('  Quick E2E: Existing V6 MACI on Sepolia');
  console.log('  ═══════════════════════════════════════\n');

  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const deployer = new ethers.Wallet(config.privateKey, provider);

  log(`MACI: ${config.maciAddress}`);
  log(`Deployer: ${deployer.address}`);

  const bal = await provider.getBalance(deployer.address);
  log(`Balance: ${ethers.formatEther(bal)} ETH`);

  // Init crypto
  log('Initializing crypto...');
  const babyJub = await buildBabyjub();
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();
  const F = babyJub.F;
  const Fp = poseidon.F;

  function poseidonPerm(state: bigint[]): bigint[] {
    const inputs = state.slice(1).map((s) => Fp.e(s));
    const initState = Fp.e(state[0]);
    const result = poseidon(inputs, initState, 4);
    return result.map((r: any) => BigInt(Fp.toString(r)));
  }

  function duplexEncrypt(plaintext: bigint[], key: [bigint, bigint], nonce: bigint): bigint[] {
    const length = plaintext.length;
    const padded = [...plaintext];
    while (padded.length % 3 !== 0) padded.push(0n);
    let state: bigint[] = [0n, key[0], key[1], (nonce + BigInt(length) * TWO128) % SNARK_FIELD];
    const ciphertext: bigint[] = [];
    for (let i = 0; i < padded.length; i += 3) {
      state = poseidonPerm(state);
      const c0 = (padded[i] + state[1]) % SNARK_FIELD;
      const c1 = (padded[i + 1] + state[2]) % SNARK_FIELD;
      const c2 = (padded[i + 2] + state[3]) % SNARK_FIELD;
      ciphertext.push(c0, c1, c2);
      state[1] = c0; state[2] = c1; state[3] = c2;
    }
    state = poseidonPerm(state);
    ciphertext.push(state[1]);
    return ciphertext;
  }

  function poseidonHash(...inputs: bigint[]): bigint {
    const h = poseidon(inputs.map((x) => Fp.e(x)));
    return BigInt(Fp.toString(h));
  }

  function packCommand(stateIdx: bigint, voteOpt: bigint, weight: bigint, nonce: bigint, pollIdN: bigint): bigint {
    return stateIdx | (voteOpt << 50n) | (weight << 100n) | (nonce << 150n) | (pollIdN << 200n);
  }

  // ── Step 1: Deploy Poll (2 min duration) ───────────────
  log('Step 1: Creating poll (2 min duration)...');
  const maci = new ethers.Contract(config.maciAddress, MACI_ABI, deployer);

  const deployTx = await maci.deployPoll(
    'Quick E2E Test',
    90, // 1.5 minutes (minimum safe for signUp + vote)
    config.coordPubKeyX,
    config.coordPubKeyY,
    config.mpVerifier,
    config.tallyVerifier,
    config.vkRegistry,
    2,
    { gasLimit: 15_000_000 },
  );
  const deployReceipt = await deployTx.wait();
  if (!deployReceipt || deployReceipt.status === 0) throw new Error('deployPoll reverted');

  // Parse DeployPoll event
  let pollId = -1, pollAddr = '', mpAddr = '', tallyAddr = '';
  for (const logEntry of deployReceipt.logs) {
    try {
      const parsed = maci.interface.parseLog({ topics: logEntry.topics as string[], data: logEntry.data });
      if (parsed?.name === 'DeployPoll') {
        pollId = Number(parsed.args.pollId);
        pollAddr = parsed.args.pollAddr;
        mpAddr = parsed.args.messageProcessorAddr;
        tallyAddr = parsed.args.tallyAddr;
        break;
      }
    } catch { /* skip */ }
  }
  if (pollId < 0) throw new Error('DeployPoll event not found');

  log(`  Poll ${pollId} deployed: ${pollAddr}`);
  log(`  Tally: ${tallyAddr}`);

  // ── Step 2: Sign up voter (use derived wallet to avoid double-signup) ──
  log('Step 2: Signing up voter...');

  // Derive a fresh test wallet
  const voterSeed = ethers.solidityPackedKeccak256(['string', 'uint256'], ['quick-e2e-voter-wallet', pollId]);
  const voter = new ethers.Wallet(voterSeed, provider);
  log(`  Voter wallet: ${voter.address}`);

  // Fund voter with ETH
  const voterBal = await provider.getBalance(voter.address);
  if (voterBal < ethers.parseEther('0.01')) {
    log('  Funding voter with 0.02 ETH...');
    const fundTx = await deployer.sendTransaction({ to: voter.address, value: ethers.parseEther('0.02') });
    await fundTx.wait();
    log('  Funded with ETH!');
  }

  // Transfer tokens for voice credits (ERC20VoiceCreditProxy requires token balance)
  const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)'];
  const tokenContract = new ethers.Contract(config.token, ERC20_ABI, deployer);
  const voterTokenBal = await tokenContract.balanceOf(voter.address);
  if (voterTokenBal < ethers.parseEther('10')) {
    log('  Transferring 100 tokens for voice credits...');
    const tokenTx = await tokenContract.transfer(voter.address, ethers.parseEther('100'));
    await tokenTx.wait();
    log('  Funded with 100 tokens (= 100 voice credits)!');
  }

  // Generate EdDSA keypair deterministically
  const seedBytes = ethers.getBytes(
    ethers.solidityPackedKeccak256(['string', 'uint256'], ['quick-e2e-voter', pollId])
  );
  const skBuf = Buffer.from(seedBytes);
  const pubKeyRaw = eddsa.prv2pub(skBuf);
  const pubKey: [bigint, bigint] = [
    BigInt(F.toString(pubKeyRaw[0])),
    BigInt(F.toString(pubKeyRaw[1])),
  ];

  const maciVoter = new ethers.Contract(config.maciAddress, MACI_ABI, voter);
  const signUpTx = await maciVoter.signUp(pubKey[0], pubKey[1], '0x', '0x', { gasLimit: 500_000 });
  const signUpReceipt = await signUpTx.wait();
  if (!signUpReceipt || signUpReceipt.status === 0) throw new Error('signUp reverted');

  let stateIndex = 1;
  for (const logEntry of signUpReceipt.logs) {
    try {
      const parsed = maci.interface.parseLog({ topics: logEntry.topics as string[], data: logEntry.data });
      if (parsed?.name === 'SignUp') {
        stateIndex = Number(parsed.args.stateIndex);
        break;
      }
    } catch { /* skip */ }
  }
  log(`  Registered: stateIndex=${stateIndex}`);

  // ── Step 3: Cast vote (FOR) ────────────────────────────
  log('Step 3: Casting vote (FOR)...');

  // Ephemeral keypair
  const ephSeedBytes = ethers.getBytes(
    ethers.solidityPackedKeccak256(['string', 'uint256', 'uint256'], ['quick-e2e-eph', pollId, Date.now()])
  );
  let ephSk = 0n;
  for (let j = 0; j < 31; j++) ephSk = (ephSk << 8n) | BigInt(ephSeedBytes[j]);
  const subOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
  ephSk = ephSk % subOrder;

  const ephPubRaw = babyJub.mulPointEscalar(babyJub.Base8, ephSk);
  const ephPubKey: [bigint, bigint] = [BigInt(F.toString(ephPubRaw[0])), BigInt(F.toString(ephPubRaw[1]))];

  // ECDH
  const sharedPt = babyJub.mulPointEscalar([F.e(config.coordPubKeyX), F.e(config.coordPubKeyY)], ephSk);
  const sharedKey: [bigint, bigint] = [BigInt(F.toString(sharedPt[0])), BigInt(F.toString(sharedPt[1]))];

  // Pack command: stateIndex, choice=1(FOR), weight=1, nonce=1, pollId
  const packed = packCommand(BigInt(stateIndex), 1n, 1n, 1n, BigInt(pollId));

  // Random salt
  const saltBytes = ethers.randomBytes(31);
  let salt = 0n;
  for (let j = 0; j < 31; j++) salt = (salt << 8n) | BigInt(saltBytes[j]);

  // cmdHash = poseidon(stateIndex, pubKeyX, pubKeyY, weight, salt)
  const cmdHash = poseidonHash(BigInt(stateIndex), pubKey[0], pubKey[1], 1n, salt);

  // EdDSA sign
  const sig = eddsa.signPoseidon(skBuf, F.e(cmdHash));
  const sigR8: [bigint, bigint] = [BigInt(F.toString(sig.R8[0])), BigInt(F.toString(sig.R8[1]))];
  const sigS: bigint = sig.S;

  // Encrypt
  const plaintext = [packed, pubKey[0], pubKey[1], salt, sigR8[0], sigR8[1], sigS];
  const ciphertext = duplexEncrypt(plaintext, sharedKey, 0n);

  const encMessage: bigint[] = new Array(10).fill(0n);
  for (let j = 0; j < Math.min(ciphertext.length, 10); j++) encMessage[j] = ciphertext[j];

  // Submit on-chain (use voter wallet, not deployer)
  const poll = new ethers.Contract(pollAddr, POLL_ABI, voter);
  const voteTx = await poll.publishMessage(encMessage, ephPubKey[0], ephPubKey[1], { gasLimit: 500_000 });
  const voteReceipt = await voteTx.wait();
  if (!voteReceipt || voteReceipt.status === 0) throw new Error('publishMessage reverted');

  const numMsgs = await poll.numMessages();
  log(`  Vote submitted! numMessages: ${numMsgs.toString()}`);

  // ── Step 4: Wait for voting period to end ──────────────
  log('Step 4: Waiting for voting period to end...');
  const [deployTime, duration] = await poll.getDeployTimeAndDuration();
  const endTime = Number(deployTime) + Number(duration);
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTime - now;

  if (remaining > 0) {
    log(`  ${remaining}s remaining... waiting`);
    await new Promise((r) => setTimeout(r, (remaining + 10) * 1000));
  }

  const isOpen = await poll.isVotingOpen();
  if (isOpen) {
    log('  Still open, waiting 30s more...');
    await new Promise((r) => setTimeout(r, 30_000));
  }
  log('  Voting period ended!');

  // ── Step 5: Wait for coordinator to process ────────────
  log('Step 5: Waiting for coordinator to process (up to 3 min)...');
  const tallyContract = new ethers.Contract(tallyAddr, TALLY_ABI, provider);

  let verified = false;
  for (let attempt = 0; attempt < 18; attempt++) { // 18 * 10s = 3 min max
    try {
      verified = await tallyContract.tallyVerified();
      if (verified) break;
    } catch { /* not yet */ }
    log(`  Attempt ${attempt + 1}/18: not yet finalized. Waiting 10s...`);
    await new Promise((r) => setTimeout(r, 10_000));
  }

  if (!verified) {
    log('  ⚠ Coordinator did not finalize within 3 min. Checking manually...');
    const forV = await tallyContract.forVotes().catch(() => 0n);
    const agV = await tallyContract.againstVotes().catch(() => 0n);
    log(`  Current tally: FOR=${forV}, AGAINST=${agV}`);
    throw new Error('Tally not verified within timeout');
  }

  // ── Step 6: Check results ──────────────────────────────
  log('Step 6: Checking on-chain results...');
  const forVotes = await tallyContract.forVotes();
  const againstVotes = await tallyContract.againstVotes();
  const totalVoters = await tallyContract.totalVoters();

  log(`  FOR: ${forVotes}, AGAINST: ${againstVotes}, VOTERS: ${totalVoters}`);

  if (forVotes === 1n && againstVotes === 0n) {
    console.log('\n  ╔═══════════════════════════════════════╗');
    console.log('  ║   E2E SUCCESS! Results verified!       ║');
    console.log(`  ║   Poll ${pollId}: FOR=1, AGAINST=0           ║`);
    console.log('  ╚═══════════════════════════════════════╝\n');
  } else {
    console.log(`\n  ⚠ Unexpected results: FOR=${forVotes}, AGAINST=${againstVotes}\n`);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err.message || err);
  process.exit(1);
});
