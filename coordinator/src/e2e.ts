#!/usr/bin/env tsx
/**
 * SIGIL E2E Test — Sepolia V9 (Security Hardening)
 *
 * Full flow: Deploy Poll → SignUp → Vote → Wait → Coordinator auto-tally → Verify
 *
 * Usage:
 *   cd coordinator && npx tsx src/e2e.ts
 *
 * Requires .env: PRIVATE_KEY, COORDINATOR_PRIVATE_KEY, SEPOLIA_RPC_URL
 */

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadConfig,
  initCrypto,
  MACI_ABI,
  POLL_ABI,
  TALLY_ABI,
  processPoll,
  type PollAddresses,
} from './run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

const POLL_DURATION = 120; // 2 minutes — short for E2E testing

// Extended ABI for E2E (includes signUp + deployPoll)
const E2E_MACI_ABI = [
  ...MACI_ABI,
  'function signUp(uint256 _pubKeyX, uint256 _pubKeyY, bytes _signUpGatekeeperData, bytes _initialVoiceCreditProxyData)',
  'function deployPoll(string _title, uint256 _duration, uint256 _coordinatorPubKeyX, uint256 _coordinatorPubKeyY, address _mpVerifier, address _tallyVerifier, address _vkRegistry, uint8 _messageTreeDepth) returns (uint256 pollId)',
  'event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)',
];

function log(msg: string) {
  console.log(`[E2E ${new Date().toLocaleTimeString()}] ${msg}`);
}

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║   SIGIL E2E Test — Sepolia V9          ║');
  console.log('  ║   등록 → 투표 → 자동집계 → 결과검증     ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  // ── 1. Load config & crypto ──
  const config = loadConfig();
  log(`MACI: ${config.maciAddress}`);
  log(`RPC: ${config.rpcUrl}`);

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);
  log(`Wallet: ${signer.address}`);

  const balance = await provider.getBalance(signer.address);
  log(`Balance: ${ethers.formatEther(balance)} ETH`);

  log('Initializing crypto...');
  const crypto = await initCrypto();
  log('Crypto ready.');

  const configJson = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'src/config.json'), 'utf8'));

  // ── 2. Generate voter EdDSA keypair ──
  // Use circomlibjs eddsa for Baby Jubjub keypair
  const voterSeed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(voterSeed);
  const voterPubRaw = crypto.eddsa.prv2pub(voterSeed);
  const voterPubKeyX = BigInt(crypto.F.toString(voterPubRaw[0]));
  const voterPubKeyY = BigInt(crypto.F.toString(voterPubRaw[1]));
  log(`Voter pubkey: [${voterPubKeyX.toString().slice(0, 20)}..., ${voterPubKeyY.toString().slice(0, 20)}...]`);

  const maci = new ethers.Contract(config.maciAddress, E2E_MACI_ABI, signer);

  // ── 3. Transfer TON tokens to voter (self) for voice credits ──
  const tonAddress = configJson.v2?.tonToken;
  if (tonAddress) {
    const erc20Abi = [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ];
    const ton = new ethers.Contract(tonAddress, erc20Abi, provider);
    const tonBalance = await ton.balanceOf(signer.address);
    const decimals = await ton.decimals();
    log(`TON balance: ${ethers.formatUnits(tonBalance, decimals)} TON`);
    if (tonBalance === 0n) {
      log('⚠ WARNING: No TON tokens — voice credits will be 0, vote will be ignored!');
    }
  }

  // ── 4. Sign up voter on MACI ──
  log('Signing up voter...');
  const signUpTx = await maci.signUp(
    voterPubKeyX,
    voterPubKeyY,
    '0x', // gatekeeper data (FreeForAll)
    '0x', // voice credit proxy data
  );
  const signUpReceipt = await signUpTx.wait();
  log(`SignUp tx: ${signUpReceipt.hash}`);

  // Parse SignUp event to get stateIndex
  const signUpLog = signUpReceipt.logs.find((l: any) => {
    try {
      return maci.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === 'SignUp';
    } catch { return false; }
  });
  const signUpEvent = signUpLog ? maci.interface.parseLog({ topics: signUpLog.topics as string[], data: signUpLog.data }) : null;
  const stateIndex = signUpEvent ? Number(signUpEvent.args.stateIndex) : 1;
  const voiceCredits = signUpEvent ? Number(signUpEvent.args.voiceCreditBalance) : 0;
  log(`Voter stateIndex: ${stateIndex}, voiceCredits: ${voiceCredits}`);

  if (voiceCredits === 0) {
    log('✗ FATAL: voiceCredits = 0 — vote will be invalid. Need TON tokens!');
    process.exit(1);
  }

  // ── 5. Deploy a Poll ──
  log(`Deploying Poll (duration=${POLL_DURATION}s)...`);

  const coordPubKeyX = BigInt(configJson.v2.coordinatorPubKeyX);
  const coordPubKeyY = BigInt(configJson.v2.coordinatorPubKeyY);

  const deployPollTx = await maci.deployPoll(
    'E2E Test V9 — Security Hardening',
    POLL_DURATION,
    coordPubKeyX,
    coordPubKeyY,
    configJson.v2.msgProcessorVerifier,
    configJson.v2.tallyVerifier,
    configJson.v2.vkRegistry,
    2, // messageTreeDepth
  );
  const deployReceipt = await deployPollTx.wait();
  log(`DeployPoll tx: ${deployReceipt.hash}`);

  // Parse DeployPoll event
  const deployLog = deployReceipt.logs.find((l: any) => {
    try {
      return maci.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === 'DeployPoll';
    } catch { return false; }
  });
  const deployEvent = deployLog ? maci.interface.parseLog({ topics: deployLog.topics as string[], data: deployLog.data }) : null;
  if (!deployEvent) {
    log('✗ FATAL: DeployPoll event not found');
    process.exit(1);
  }

  const pollId = Number(deployEvent.args.pollId);
  const pollAddress = deployEvent.args.pollAddr;
  const mpAddress = deployEvent.args.messageProcessorAddr;
  const tallyAddress = deployEvent.args.tallyAddr;
  log(`Poll ${pollId} deployed:`);
  log(`  Poll: ${pollAddress}`);
  log(`  MP:   ${mpAddress}`);
  log(`  Tally: ${tallyAddress}`);

  // ── 6. Encrypt & publish a FOR vote ──
  log('Preparing encrypted vote (FOR, weight=1)...');

  const SNARK_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

  // Generate ephemeral keypair for ECDH
  const ephSeed = new Uint8Array(32);
  globalThis.crypto.getRandomValues(ephSeed);
  let ephSk = 0n;
  for (let i = 0; i < 32; i++) ephSk = (ephSk << 8n) | BigInt(ephSeed[i]);
  const BABYJUB_SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;
  ephSk = ephSk % BABYJUB_SUBORDER;
  if (ephSk === 0n) ephSk = 1n;

  const ephPubRaw = crypto.babyJub.mulPointEscalar(crypto.babyJub.Base8, ephSk);
  const ephPubKeyX = BigInt(crypto.F.toString(ephPubRaw[0]));
  const ephPubKeyY = BigInt(crypto.F.toString(ephPubRaw[1]));

  // ECDH shared key with coordinator
  const sharedKey = crypto.ecdh(ephSk, [coordPubKeyX, coordPubKeyY]);

  // Vote command
  const voteOptionIndex = 1n; // FOR
  const newVoteWeight = 1n;
  const nonce = 1n;
  const saltBytes = new Uint8Array(31);
  globalThis.crypto.getRandomValues(saltBytes);
  let salt = 0n;
  for (let i = 0; i < 31; i++) salt = (salt << 8n) | BigInt(saltBytes[i]);
  salt = salt % SNARK_FIELD;

  // Pack command: stateIndex | (voteOptionIndex << 50) | (newVoteWeight << 100) | (nonce << 150) | (pollId << 200)
  const packed = BigInt(stateIndex) |
    (voteOptionIndex << 50n) |
    (newVoteWeight << 100n) |
    (nonce << 150n) |
    (BigInt(pollId) << 200n);

  // EdDSA sign: Poseidon(stateIndex, newPubKeyX, newPubKeyY, newVoteWeight, salt)
  const cmdHash = crypto.hash(BigInt(stateIndex), voterPubKeyX, voterPubKeyY, newVoteWeight, salt);

  const sigRaw = crypto.eddsa.signPoseidon(voterSeed, crypto.F.e(cmdHash));
  const sig = {
    R8: [BigInt(crypto.F.toString(sigRaw.R8[0])), BigInt(crypto.F.toString(sigRaw.R8[1]))],
    S: sigRaw.S,
  };

  // Plaintext: [packed, newPubKeyX, newPubKeyY, salt, R8[0], R8[1], S]
  const plaintext = [packed, voterPubKeyX, voterPubKeyY, salt, sig.R8[0], sig.R8[1], sig.S];

  // Encrypt with DuplexSponge
  const ciphertext = crypto.encrypt(plaintext, sharedKey, 0n);
  log(`Ciphertext: ${ciphertext.length} elements`);

  // Publish message on-chain
  const poll = new ethers.Contract(pollAddress, [
    'function publishMessage(uint256[10] calldata _encMessage, uint256 _encPubKeyX, uint256 _encPubKeyY) external',
  ], signer);

  // Pad ciphertext to exactly 10 elements
  const encMessage = [...ciphertext];
  while (encMessage.length < 10) encMessage.push(0n);

  const publishTx = await poll.publishMessage(encMessage.slice(0, 10), ephPubKeyX, ephPubKeyY);
  const publishReceipt = await publishTx.wait();
  log(`Vote published! tx: ${publishReceipt.hash}`);

  // ── 7. Wait for voting to end ──
  const pollRead = new ethers.Contract(pollAddress, POLL_ABI, provider);
  const [deployTime, duration] = await pollRead.getDeployTimeAndDuration();
  const endTime = Number(deployTime) + Number(duration);
  const now = Math.floor(Date.now() / 1000);
  const waitSecs = endTime - now;

  if (waitSecs > 0) {
    log(`Waiting ${waitSecs}s for voting to end (+ on-chain confirmation)...`);
    const interval = setInterval(() => {
      const remaining = endTime - Math.floor(Date.now() / 1000);
      if (remaining > 0) {
        process.stdout.write(`\r  ⏳ ${remaining}s remaining...   `);
      }
    }, 5000);

    await new Promise(r => setTimeout(r, (waitSecs + 10) * 1000)); // +10s buffer
    clearInterval(interval);
    console.log('');
  }

  // Wait until isVotingOpen() returns false ON-CHAIN (block timestamp must pass endTime)
  log('Confirming voting ended on-chain...');
  for (let attempt = 0; attempt < 30; attempt++) {
    const isOpen = await pollRead.isVotingOpen();
    if (!isOpen) {
      log('Voting confirmed closed on-chain!');
      break;
    }
    if (attempt === 29) {
      log('✗ FATAL: Voting still open after 5 minutes of waiting');
      process.exit(1);
    }
    log(`  Still open on-chain (block timestamp behind). Waiting 10s... (attempt ${attempt + 1}/30)`);
    await new Promise(r => setTimeout(r, 10_000));
  }

  // ── 8. Process poll (merge → prove → tally → publish) ──
  const addrs: PollAddresses = { poll: pollAddress, mp: mpAddress, tally: tallyAddress };
  const maciRead = new ethers.Contract(config.maciAddress, MACI_ABI, provider);

  log('Starting coordinator processing...');
  await processPoll(pollId, addrs, maciRead, provider, signer, config.coordinatorSk, crypto, config.deployBlock);

  // ── 9. Verify results on-chain ──
  log('\n═══ VERIFYING RESULTS ═══');

  const tallyRead = new ethers.Contract(tallyAddress, TALLY_ABI, provider);
  try {
    const verified = await tallyRead.tallyVerified();
    log(`Tally verified: ${verified}`);

    const tallyResultsAbi = [
      'function totalVoters() view returns (uint256)',
      'function forVotes() view returns (uint256)',
      'function againstVotes() view returns (uint256)',
      'function abstainVotes() view returns (uint256)',
    ];
    const tallyResults = new ethers.Contract(tallyAddress, tallyResultsAbi, provider);

    const [forVotes, againstVotes, abstainVotes, totalVoters] = await Promise.all([
      tallyResults.forVotes(),
      tallyResults.againstVotes(),
      tallyResults.abstainVotes(),
      tallyResults.totalVoters(),
    ]);

    log(`Results: FOR=${forVotes} AGAINST=${againstVotes} ABSTAIN=${abstainVotes} (${totalVoters} voter(s))`);

    // Verify: should be FOR=1 (we voted for option 1 with weight 1)
    if (Number(forVotes) >= 1 && verified) {
      log('');
      log('  ╔═══════════════════════════════════════════╗');
      log('  ║   ✓ E2E TEST PASSED — V9 VERIFIED!        ║');
      log('  ║   온체인 Groth16 검증 성공                  ║');
      log('  ╚═══════════════════════════════════════════╝');
      log('');
    } else {
      log('  ✗ E2E FAILED: unexpected results');
    }
  } catch (err) {
    log(`Verification error: ${(err as Error).message?.slice(0, 100)}`);
  }

  // Print summary
  log('');
  log('═══ SUMMARY ═══');
  log(`MACI:  ${config.maciAddress}`);
  log(`Poll:  ${pollAddress} (ID: ${pollId})`);
  log(`MP:    ${mpAddress}`);
  log(`Tally: ${tallyAddress}`);
  log(`Voter: stateIndex=${stateIndex}, voiceCredits=${voiceCredits}`);

  process.exit(0);
}

main().catch(err => {
  console.error('E2E FATAL:', (err as Error).message?.slice(0, 200));
  process.exit(1);
});
