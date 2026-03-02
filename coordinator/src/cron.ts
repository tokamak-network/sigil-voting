#!/usr/bin/env tsx
/**
 * SIGIL Coordinator Cron — One-shot mode for GitHub Actions
 *
 * Checks all polls across ALL MACI deployments (v2 + prod), processes any
 * that need processing, then exits.
 *
 * Supports multiple coordinator keys:
 *   COORDINATOR_PRIVATE_KEY_V2   — Baby Jubjub key for v2 deployment
 *   COORDINATOR_PRIVATE_KEY_PROD — Baby Jubjub key for prod deployment
 *   COORDINATOR_PRIVATE_KEY      — fallback (used if deployment-specific key not set)
 *
 * Designed for cron-style execution (GitHub Actions, crontab, etc.)
 *
 * Usage:
 *   cd coordinator && npx tsx src/cron.ts
 *
 * Environment:
 *   PRIVATE_KEY                  — Ethereum private key for on-chain tx
 *   COORDINATOR_PRIVATE_KEY      — Baby Jubjub private key (fallback)
 *   COORDINATOR_PRIVATE_KEY_V2   — Baby Jubjub private key for v2 deployment
 *   COORDINATOR_PRIVATE_KEY_PROD — Baby Jubjub private key for prod deployment
 *   SEPOLIA_RPC_URL              — RPC endpoint (default: publicnode)
 */

import { ethers } from 'ethers';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  loadConfig,
  initCrypto,
  processPoll,
  chunkedQueryFilter,
  MACI_ABI,
  POLL_ABI,
  TALLY_ABI,
  type PollAddresses,
  type CoordinatorKeyEntry,
} from './run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

const MP_WASM = resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_js/MessageProcessor.wasm');
const MP_ZKEY = resolve(PROJECT_ROOT, 'circuits/build_maci/MessageProcessor_final.zkey');
const TV_WASM = resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_js/TallyVotes.wasm');
const TV_ZKEY = resolve(PROJECT_ROOT, 'circuits/build_maci/TallyVotes_final.zkey');

const MP_COMPLETE_ABI = ['function processingComplete() view returns (bool)'] as const;

/** Max retry attempts for stuck polls before giving up */
const STUCK_POLL_MAX_RETRIES = 2;

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * Classify errors as TRANSIENT (network, gas, nonce) or PERMANENT (contract logic, key mismatch).
 * Matches classification logic in run.ts for consistency.
 */
function classifyErrorCategory(error: Error): 'TRANSIENT' | 'PERMANENT' {
  const msg = error.message?.toLowerCase() ?? '';

  // TRANSIENT errors (network, RPC, gas estimation)
  if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enotfound')) {
    return 'TRANSIENT';
  }
  if (msg.includes('network') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'TRANSIENT';
  }
  if (msg.includes('nonce') || msg.includes('replacement fee too low') || msg.includes('already known')) {
    return 'TRANSIENT';
  }
  if (msg.includes('gas required exceeds allowance') || msg.includes('insufficient funds')) {
    return 'TRANSIENT';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'TRANSIENT';
  }

  // PERMANENT errors (contract logic, key mismatch, invalid proofs)
  if (msg.includes('execution reverted') || msg.includes('revert')) {
    // AccQueue merge reverts are often transient (race conditions)
    if (msg.includes('accqueue') || msg.includes('merge')) {
      return 'TRANSIENT';
    }
    return 'PERMANENT';
  }
  if (msg.includes('invalid proof') || msg.includes('proof verification failed')) {
    return 'PERMANENT';
  }
  if (msg.includes('key mismatch') || msg.includes('coordinator')) {
    return 'PERMANENT';
  }
  if (msg.includes('signature') || msg.includes('eddsa')) {
    return 'PERMANENT';
  }

  // Default: treat unknown errors as TRANSIENT (conservative approach)
  return 'TRANSIENT';
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

/**
 * Find the correct coordinator key for a poll by matching on-chain coordinator
 * public key against derived keys from all available coordinator secrets.
 */
function findMatchingKey(
  onChainPubKeyX: string,
  onChainPubKeyY: string,
  coordinatorKeys: CoordinatorKeyEntry[],
  crypto: Awaited<ReturnType<typeof initCrypto>>,
): CoordinatorKeyEntry | null {
  for (const keyEntry of coordinatorKeys) {
    const pk = crypto.babyJub.mulPointEscalar(crypto.babyJub.Base8, keyEntry.coordinatorSk);
    const derivedX = BigInt(crypto.F.toObject(pk[0])).toString();
    const derivedY = BigInt(crypto.F.toObject(pk[1])).toString();
    if (derivedX === onChainPubKeyX && derivedY === onChainPubKeyY) {
      return keyEntry;
    }
  }
  return null;
}

interface PollInfo {
  pollId: number;
  addrs: PollAddresses;
  maciAddress: string;
  deploymentId: string;
}

async function main() {
  log('SIGIL Coordinator Cron — one-shot mode (multi-key)');

  // Verify circuit files exist
  for (const f of [MP_WASM, MP_ZKEY, TV_WASM, TV_ZKEY]) {
    if (!existsSync(f)) {
      log(`FATAL: Circuit file not found: ${f}`);
      process.exit(1);
    }
  }

  const config = loadConfig();
  log(`RPC: ${config.rpcUrl}`);
  log(`Coordinator keys configured: ${config.coordinatorKeys.map(k => k.deploymentId).join(', ')}`);
  log(`MACI addresses: ${config.allMaciAddresses.join(', ')}`);

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

  // Collect polls from ALL MACI deployments
  const allPolls: PollInfo[] = [];

  for (const maciAddr of config.allMaciAddresses) {
    const deploymentId = config.coordinatorKeys.find(
      k => k.maciAddress.toLowerCase() === maciAddr.toLowerCase()
    )?.deploymentId ?? 'unknown';

    log(`\nScanning MACI [${deploymentId}]: ${maciAddr}`);
    const maci = new ethers.Contract(maciAddr, MACI_ABI, provider);

    let nextPollId: number;
    try {
      nextPollId = Number(await retryRpc(() => maci.nextPollId()));
    } catch (err) {
      log(`  Failed to query nextPollId: ${(err as Error).message?.slice(0, 80)}`);
      continue;
    }

    if (nextPollId === 0) {
      log(`  No polls deployed on this MACI.`);
      continue;
    }

    // Fetch deploy events
    const deployFilter = maci.filters.DeployPoll();
    const deployEvents = await retryRpc(() => chunkedQueryFilter(maci, deployFilter, config.deployBlock));

    for (const ev of deployEvents) {
      if ('args' in ev) {
        const a = ev.args as any;
        allPolls.push({
          pollId: Number(a.pollId),
          addrs: {
            poll: a.pollAddr,
            mp: a.messageProcessorAddr,
            tally: a.tallyAddr,
          },
          maciAddress: maciAddr,
          deploymentId,
        });
      }
    }
    log(`  Found ${nextPollId} poll(s) on [${deploymentId}]`);
  }

  if (allPolls.length === 0) {
    log('\nNo polls found across any MACI deployment. Exiting.');
    return;
  }

  log(`\nTotal polls to check: ${allPolls.length}`);
  let processed = 0;
  let skipped = 0;
  let keyMismatch = 0;
  let failed = 0;
  let stuckRecovered = 0;
  let stuckFailed = 0;

  for (const pollInfo of allPolls) {
    const { pollId, addrs, maciAddress, deploymentId } = pollInfo;
    const label = `Poll ${pollId} [${deploymentId}]`;

    const poll = new ethers.Contract(addrs.poll, POLL_ABI, provider);

    // Skip if voting still open
    const isOpen = await retryRpc(() => poll.isVotingOpen());
    if (isOpen) {
      const [deployTime, duration] = await poll.getDeployTimeAndDuration();
      const endTime = Number(deployTime) + Number(duration);
      const remaining = endTime - Math.floor(Date.now() / 1000);
      log(`  ${label}: voting open (${Math.max(0, Math.floor(remaining / 60))}m remaining)`);
      skipped++;
      continue;
    }

    // Skip if already finalized
    const tally = new ethers.Contract(addrs.tally, TALLY_ABI, provider);
    try {
      const verified = await tally.tallyVerified();
      if (verified) {
        log(`  ${label}: already finalized`);
        skipped++;
        continue;
      }
    } catch {
      // not yet processed
    }

    // Check if stuck: processingComplete=true but tallyVerified=false
    const mp = new ethers.Contract(addrs.mp, MP_COMPLETE_ABI, provider);
    let isStuck = false;
    try {
      const isComplete = await mp.processingComplete();
      if (isComplete) {
        isStuck = true;
      }
    } catch {
      // processingComplete not available or not yet set
    }

    // Determine the correct coordinator key for this poll
    let onChainPubKeyX: string;
    let onChainPubKeyY: string;
    try {
      [onChainPubKeyX, onChainPubKeyY] = await Promise.all([
        poll.coordinatorPubKeyX().then((v: any) => v.toString()),
        poll.coordinatorPubKeyY().then((v: any) => v.toString()),
      ]);
    } catch (err) {
      log(`  ${label}: failed to read coordinator pubkey — ${(err as Error).message?.slice(0, 80)}`);
      failed++;
      continue;
    }

    const matchedKey = findMatchingKey(onChainPubKeyX, onChainPubKeyY, config.coordinatorKeys, crypto);

    if (!matchedKey) {
      log(`  ${label}: NO MATCHING KEY — on-chain pubkey [${onChainPubKeyX.slice(0, 20)}..., ${onChainPubKeyY.slice(0, 20)}...] does not match any configured coordinator key`);
      keyMismatch++;
      continue;
    }

    log(`  ${label}: matched key [${matchedKey.deploymentId}]`);

    // Get the MACI contract for this specific deployment
    const maci = new ethers.Contract(maciAddress, MACI_ABI, provider);

    if (isStuck) {
      // Issue 2: Stuck poll recovery — attempt to re-run tally
      log(`  ${label}: STUCK (processingComplete=true, tallyVerified=false) — attempting recovery...`);

      let recovered = false;
      for (let attempt = 1; attempt <= STUCK_POLL_MAX_RETRIES; attempt++) {
        log(`  ${label}: recovery attempt ${attempt}/${STUCK_POLL_MAX_RETRIES}`);
        try {
          const result = await processPoll(
            pollId, addrs, maci, provider, signer,
            matchedKey.coordinatorSk, crypto, config.deployBlock,
          );
          if (result === 'key_mismatch') {
            log(`  ${label}: recovery failed — key mismatch (should not happen)`);
            console.error(JSON.stringify({
              timestamp: new Date().toISOString(),
              action: 'stuckPollRecovery',
              pollId,
              errorType: 'PERMANENT',
              errorMessage: 'key mismatch during recovery',
              result: 'error',
              attempt,
              maxAttempts: STUCK_POLL_MAX_RETRIES,
            }));
            break;
          }
          log(`  ${label}: RECOVERED on attempt ${attempt}`);
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            action: 'stuckPollRecovery',
            pollId,
            result: 'success',
            attempt,
          }));
          recovered = true;
          stuckRecovered++;
          processed++;
          break;
        } catch (err) {
          const error = err as Error;
          const errMsg = error.message?.slice(0, 150)?.replace(/0x[a-fA-F0-9]{40,}/g, '[ADDR]') ?? 'unknown';
          const errorCategory = classifyErrorCategory(error);

          log(`  ${label}: recovery attempt ${attempt} FAILED (${errorCategory}) — ${errMsg}`);

          console.error(JSON.stringify({
            timestamp: new Date().toISOString(),
            action: 'stuckPollRecovery',
            pollId,
            errorType: errorCategory,
            errorMessage: errMsg,
            result: 'retry',
            attempt,
            maxAttempts: STUCK_POLL_MAX_RETRIES,
          }));

          if (attempt < STUCK_POLL_MAX_RETRIES) {
            // Exponential backoff for stuck poll recovery: 2s, 4s
            const delay = 2000 * (2 ** (attempt - 1));
            log(`  ${label}: waiting ${delay}ms before retry...`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      if (!recovered) {
        log(`  ${label}: PERMANENTLY STUCK — recovery failed after ${STUCK_POLL_MAX_RETRIES} attempts. Manual intervention required.`);
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          action: 'stuckPollRecovery',
          pollId,
          errorType: 'PERMANENT',
          errorMessage: 'recovery failed after max retries',
          result: 'error',
          attempt: STUCK_POLL_MAX_RETRIES,
          maxAttempts: STUCK_POLL_MAX_RETRIES,
        }));
        stuckFailed++;
        failed++;
      }
      continue;
    }

    // Normal processing
    log(`  ${label}: needs processing — starting...`);
    try {
      const result = await processPoll(
        pollId, addrs, maci, provider, signer,
        matchedKey.coordinatorSk, crypto, config.deployBlock,
      );
      if (result === 'key_mismatch') {
        log(`  ${label}: SKIPPED (coordinator key mismatch — unexpected after pre-check)`);
        // Structured error log
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          action: 'processPoll',
          pollId,
          errorType: 'PERMANENT',
          errorMessage: 'coordinator key mismatch',
          result: 'error',
        }));
        keyMismatch++;
      } else {
        log(`  ${label}: DONE`);
        // Structured success log
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          action: 'processPoll',
          pollId,
          result: 'success',
        }));
        processed++;
      }
    } catch (err) {
      const error = err as Error;
      const errMsg = error.message?.slice(0, 150)?.replace(/0x[a-fA-F0-9]{40,}/g, '[ADDR]') ?? 'unknown';

      // Classify error to determine if it's worth retrying later
      const errorCategory = classifyErrorCategory(error);

      log(`  ${label}: FAILED (${errorCategory}) — ${errMsg}`);

      // Structured error log
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'processPoll',
        pollId,
        errorType: errorCategory,
        errorMessage: errMsg,
        result: 'error',
      }));

      failed++;
    }
  }

  if (keyMismatch > 0) {
    log(`\n--- ${keyMismatch} poll(s) skipped due to coordinator key mismatch.`);
    log('  Ensure COORDINATOR_PRIVATE_KEY_V2 and COORDINATOR_PRIVATE_KEY_PROD are set in GitHub Actions secrets.');
  }
  if (stuckRecovered > 0) {
    log(`\n--- ${stuckRecovered} stuck poll(s) successfully recovered.`);
  }
  if (stuckFailed > 0) {
    log(`\n--- ${stuckFailed} stuck poll(s) could not be recovered (manual intervention needed).`);
  }
  log(`\nSummary: ${processed} processed, ${skipped} skipped, ${keyMismatch} key mismatch, ${failed} failed, ${allPolls.length} total`);
}

main()
  .then(() => {
    log('Cron complete.');
    process.exit(0);
  })
  .catch(err => {
    const errMsg = (err as Error).message?.slice(0, 120)?.replace(/0x[a-fA-F0-9]{40,}/g, '[REDACTED]').replace(/\/[^\s]+/g, '[PATH]') ?? 'unknown';
    console.error(`Fatal: ${errMsg}`);
    process.exit(1);
  });
