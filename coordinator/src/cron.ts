#!/usr/bin/env tsx
/**
 * SIGIL Coordinator Cron — One-shot mode for GitHub Actions
 *
 * Checks all polls once, processes any that need processing, then exits.
 * Designed for cron-style execution (GitHub Actions, crontab, etc.)
 *
 * Usage:
 *   cd coordinator && npx tsx src/cron.ts
 *
 * Environment:
 *   PRIVATE_KEY             — Ethereum private key for on-chain tx
 *   COORDINATOR_PRIVATE_KEY — Baby Jubjub private key for MACI ECDH
 *   SEPOLIA_RPC_URL         — RPC endpoint (default: publicnode)
 */

import { ethers } from 'ethers';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadConfig,
  initCrypto,
  processPoll,
  MACI_ABI,
  POLL_ABI,
  TALLY_ABI,
  type PollAddresses,
} from './run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

const MP_WASM = resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_js/MessageProcessor.wasm');
const MP_ZKEY = resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_final.zkey');
const TV_WASM = resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_js/TallyVotes.wasm');
const TV_ZKEY = resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_final.zkey');

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
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

async function main() {
  log('SIGIL Coordinator Cron — one-shot mode');

  // Verify circuit files exist
  for (const f of [MP_WASM, MP_ZKEY, TV_WASM, TV_ZKEY]) {
    if (!existsSync(f)) {
      log(`FATAL: Circuit file not found: ${f}`);
      process.exit(1);
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

  if (balance < ethers.parseEther('0.001')) {
    log('WARNING: Low ETH balance. Transactions may fail.');
  }

  log('Initializing crypto...');
  const crypto = await initCrypto();
  log('Crypto ready.');

  const maci = new ethers.Contract(config.maciAddress, MACI_ABI, provider);

  const nextPollId = Number(await retryRpc(() => maci.nextPollId()));
  if (nextPollId === 0) {
    log('No polls deployed. Exiting.');
    return;
  }

  // Fetch deploy events
  const deployFilter = maci.filters.DeployPoll();
  const deployEvents = await retryRpc(() => maci.queryFilter(deployFilter, config.deployBlock));

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

  log(`Found ${nextPollId} poll(s). Checking...`);
  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < nextPollId; i++) {
    const addrs = pollMap.get(i);
    if (!addrs) {
      log(`  Poll ${i}: no deploy event (skip)`);
      skipped++;
      continue;
    }

    const poll = new ethers.Contract(addrs.poll, POLL_ABI, provider);

    // Skip if voting still open
    const isOpen = await retryRpc(() => poll.isVotingOpen());
    if (isOpen) {
      const [deployTime, duration] = await poll.getDeployTimeAndDuration();
      const endTime = Number(deployTime) + Number(duration);
      const remaining = endTime - Math.floor(Date.now() / 1000);
      log(`  Poll ${i}: voting open (${Math.max(0, Math.floor(remaining / 60))}m remaining)`);
      skipped++;
      continue;
    }

    // Skip if already finalized
    const tally = new ethers.Contract(addrs.tally, TALLY_ABI, provider);
    try {
      const verified = await tally.tallyVerified();
      if (verified) {
        log(`  Poll ${i}: already finalized`);
        skipped++;
        continue;
      }
    } catch {
      // not yet processed
    }

    // Process this poll
    log(`  Poll ${i}: needs processing — starting...`);
    try {
      await processPoll(i, addrs, maci, provider, signer, config.coordinatorSk, crypto, config.deployBlock);
      log(`  Poll ${i}: DONE`);
      processed++;
    } catch (err) {
      const errMsg = (err as Error).message?.slice(0, 150)?.replace(/0x[a-fA-F0-9]{40,}/g, '[ADDR]') ?? 'unknown';
      log(`  Poll ${i}: FAILED — ${errMsg}`);
    }
  }

  log(`\nSummary: ${processed} processed, ${skipped} skipped, ${nextPollId} total`);
}

main()
  .then(() => {
    log('Cron complete.');
    process.exit(0);
  })
  .catch(err => {
    const errMsg = (err as Error).message?.slice(0, 120)?.replace(/0x[a-fA-F0-9]{40,}/g, '[REDACTED]') ?? 'unknown';
    console.error(`Fatal: ${errMsg}`);
    process.exit(1);
  });
