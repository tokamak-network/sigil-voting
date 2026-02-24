#!/usr/bin/env tsx
/**
 * Seed realistic governance proposals on Sepolia for demo/testing.
 * Usage: npx tsx scripts/seed-proposals.ts
 */

import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  const vars: Record<string, string> = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim();
    }
  }
  return (k: string) => process.env[k] || vars[k] || '';
}

const get = loadEnv();
const config = JSON.parse(readFileSync(resolve(ROOT, 'src/config.json'), 'utf8')).v2;

const MACI_ABI = parseAbi([
  'function deployPoll(string _title, uint256 _duration, uint256 _coordinatorPubKeyX, uint256 _coordinatorPubKeyY, address _mpVerifier, address _tallyVerifier, address _vkRegistry, uint8 _messageTreeDepth)',
  'function nextPollId() view returns (uint256)',
  'event DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)',
]);

// ─── Proposals ────────────────────────────────────────────────────

const PROPOSALS = [
  {
    title: '[EMERGENCY] Pause Lending Pool — Oracle Price Deviation Detected',
    description:
      'Summary\n' +
      'Chainlink ETH/USD price feed is reporting a 12% deviation from the TWAP over the last 30 minutes. ' +
      'This proposal triggers an emergency pause on the lending pool to prevent potential liquidation cascades.\n\n' +
      'Background\n' +
      'At 14:32 UTC, monitoring bots detected the ETH/USD oracle price spiking to $4,280 while CEX spot prices remained around $3,810. ' +
      'Similar anomalies in May 2024 led to $2.1M in bad debt on Aave V2.\n\n' +
      'Actions\n' +
      '• Pause all new borrows and liquidations\n' +
      '• Withdrawals and repayments remain enabled\n' +
      '• Risk team to publish a post-mortem within 48 hours\n' +
      '• Pool resumes automatically once the guardian multisig confirms oracle integrity\n\n' +
      'This is a time-sensitive vote. 5-minute voting window.',
    durationMin: 5,
  },
  {
    title: '[TEMP CHECK] Should the DAO explore L2 deployment on Base?',
    description:
      'Temperature Check\n' +
      'This is a non-binding signal vote to gauge community sentiment on deploying our protocol to Base (Coinbase L2).\n\n' +
      'Context\n' +
      'Base has grown to $7.2B TVL as of Q1 2026. Several peer protocols (Aerodrome, Moonwell) have seen 3-5x user growth after Base deployment. ' +
      'Our current Ethereum-only deployment limits accessibility due to high gas costs averaging $8-15 per vote transaction.\n\n' +
      'Key Considerations\n' +
      '• Base gas costs: ~$0.01-0.03 per transaction\n' +
      '• Coinbase user onramp: 110M+ verified users with direct bridge\n' +
      '• Risk: liquidity fragmentation across chains\n' +
      '• Risk: additional smart contract surface area to audit\n\n' +
      'If this temp check passes with >60% approval, a formal proposal with technical spec and budget will follow.\n\n' +
      'Vote FOR to signal interest in Base deployment.\n' +
      'Vote AGAINST to keep the protocol Ethereum-only for now.',
    durationMin: 60,
  },
  {
    title: 'Increase staking rewards from 4.5% to 6.2% APR for Q2 2026',
    description:
      'Proposal\n' +
      'Adjust the staking reward rate from the current 4.5% APR to 6.2% APR, effective for Q2 2026 (April 1 – June 30).\n\n' +
      'Rationale\n' +
      'Staking participation has declined from 62% to 41% over the past quarter. Competing protocols now offer 5.8-7.1% APR, ' +
      'making our rate uncompetitive. The decline in staked tokens has reduced protocol security and governance participation.\n\n' +
      'Financial Impact\n' +
      '• Additional emissions: ~380,000 tokens over 90 days\n' +
      '• Current treasury runway: 18 months → projected 16.5 months\n' +
      '• Expected staking increase: 41% → 55-60% (based on elasticity modeling)\n\n' +
      'Implementation\n' +
      'Update the RewardsDistributor.rewardRate parameter via the timelock executor. No contract upgrade needed.\n\n' +
      'Monitoring\n' +
      'If staking ratio does not reach 50% within 30 days, the rate will be reviewed in an interim proposal.',
    durationMin: 60 * 24 * 2, // 2 days
  },
  {
    title: 'Onboard USDT as collateral with conservative risk parameters',
    description:
      'Proposal\n' +
      'List Tether USDT as a borrowable and collateral asset on the protocol with the following risk parameters:\n\n' +
      'Proposed Parameters\n' +
      '• Loan-to-Value (LTV): 75%\n' +
      '• Liquidation Threshold: 80%\n' +
      '• Liquidation Bonus: 5%\n' +
      '• Reserve Factor: 20%\n' +
      '• Supply Cap: 10M USDT\n' +
      '• Borrow Cap: 8M USDT\n' +
      '• Interest Rate Model: Stable rate, optimal utilization at 90%\n\n' +
      'Rationale\n' +
      'USDT remains the most traded stablecoin by volume ($52B daily). Many users hold USDT as their primary stablecoin and have requested ' +
      'native support rather than relying on DEX swaps to USDC. Adding USDT is expected to attract $3-5M in new deposits within the first month.\n\n' +
      'Risk Analysis\n' +
      'Conservative parameters account for USDT\'s centralized custody risk. The supply cap limits protocol exposure. ' +
      'Chainlink USDT/USD oracle (8 decimal, 1h heartbeat) will be used for pricing.\n\n' +
      'References\n' +
      '• Chaos Labs risk assessment: forum.example.com/t/usdt-risk-report\n' +
      '• Gauntlet simulation results: forum.example.com/t/usdt-gauntlet',
    durationMin: 60 * 24 * 3, // 3 days
  },
  {
    title: 'Fund DevRel team — 120,000 USDC for 6-month developer program',
    description:
      'Proposal\n' +
      'Allocate 120,000 USDC from the DAO treasury to fund a Developer Relations program for July–December 2026.\n\n' +
      'Team & Budget\n' +
      '• 1 DevRel Lead (full-time): 48,000 USDC\n' +
      '• 2 Developer Advocates (part-time): 36,000 USDC\n' +
      '• Hackathon sponsorships (3 events): 18,000 USDC\n' +
      '• Documentation & tutorial bounties: 12,000 USDC\n' +
      '• Travel & conference budget: 6,000 USDC\n\n' +
      'Deliverables\n' +
      '• 12 technical tutorials and integration guides\n' +
      '• 3 hackathon partnerships (ETHGlobal, Devcon, local events)\n' +
      '• SDK improvements based on developer feedback\n' +
      '• Monthly developer community calls (recorded, published)\n' +
      '• Grow active developer count from 23 to 80+\n\n' +
      'Accountability\n' +
      'Monthly progress reports posted to the governance forum. ' +
      'Funds distributed in 3 tranches (40/30/30) with milestone gates. ' +
      'Unspent funds returned to treasury at program end.\n\n' +
      'The team has delivered the SDK v0.3.0 release and 4 integration guides to date.',
    durationMin: 60 * 24 * 4, // 4 days
  },
  {
    title: 'Adopt veTokenomics — migrate from single staking to vote-escrowed model',
    description:
      'Proposal\n' +
      'Migrate the protocol\'s governance and staking model from simple token staking to a vote-escrowed (ve) tokenomics system, ' +
      'modeled after Curve\'s veCRV with protocol-specific modifications.\n\n' +
      'How It Works\n' +
      '• Users lock tokens for 1 week to 4 years\n' +
      '• Longer lock = more voting power (linear decay)\n' +
      '• veToken holders receive protocol revenue share (currently going to treasury)\n' +
      '• veToken is non-transferable and non-tradable\n' +
      '• Early unlock with 50% penalty (penalty distributed to remaining lockers)\n\n' +
      'Why veTokenomics?\n' +
      '1. Aligns long-term holders with governance decisions\n' +
      '2. Reduces sell pressure — 67% of circulating supply on CEXes currently\n' +
      '3. Revenue sharing creates sustainable yield independent of emissions\n' +
      '4. Proven model: Curve, Balancer, Frax, Velodrome all use variations\n\n' +
      'Technical Scope\n' +
      '• New contracts: VotingEscrow.sol, FeeDistributor.sol, GaugeController.sol\n' +
      '• Frontend: lock/extend/withdraw UI, dashboard showing lock stats\n' +
      '• Migration: 30-day transition period, old stakers can migrate or withdraw\n' +
      '• Audit: 2 independent audits before mainnet deployment\n\n' +
      'Timeline\n' +
      '• Development: 10 weeks\n' +
      '• Testnet: 3 weeks\n' +
      '• Audit: 4 weeks (2 parallel audits)\n' +
      '• Migration: 4 weeks\n' +
      '• Total: ~5 months from approval\n\n' +
      'Budget\n' +
      '• Smart contract development: 80,000 USDC\n' +
      '• Audits (Spearbit + OtterSec): 150,000 USDC\n' +
      '• Frontend development: 30,000 USDC\n' +
      '• Total: 260,000 USDC\n\n' +
      'This is a major protocol change. A 7-day voting period ensures adequate time for community review.',
    durationMin: 60 * 24 * 7, // 7 days
  },
];

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const pk = get('PRIVATE_KEY');
  if (!pk) {
    console.error('ERROR: PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const rpcUrl = get('SEPOLIA_RPC_URL') || 'https://ethereum-sepolia-rpc.publicnode.com';
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });

  const maciAddr = config.maci as `0x${string}`;
  const startPollId = await publicClient.readContract({ address: maciAddr, abi: MACI_ABI, functionName: 'nextPollId' });

  console.log(`\nDeployer: ${account.address}`);
  console.log(`MACI: ${maciAddr}`);
  console.log(`Current nextPollId: ${startPollId}`);
  console.log(`Creating ${PROPOSALS.length} proposals...\n`);

  const results: { pollId: number; title: string; description: string }[] = [];

  for (let i = 0; i < PROPOSALS.length; i++) {
    const p = PROPOSALS[i];
    const durationSec = BigInt(p.durationMin * 60);
    let durationLabel: string;
    if (p.durationMin < 60) durationLabel = `${p.durationMin} min`;
    else if (p.durationMin < 1440) durationLabel = `${p.durationMin / 60} hour`;
    else durationLabel = `${p.durationMin / 1440} days`;

    console.log(`[${i + 1}/${PROPOSALS.length}] "${p.title}"`);
    console.log(`   Duration: ${durationLabel}`);

    const hash = await walletClient.writeContract({
      address: maciAddr,
      abi: MACI_ABI,
      functionName: 'deployPoll',
      args: [
        `${p.title}\n\n${p.description}`,
        durationSec,
        BigInt(config.coordinatorPubKeyX),
        BigInt(config.coordinatorPubKeyY),
        config.msgProcessorVerifier as `0x${string}`,
        config.tallyVerifier as `0x${string}`,
        config.vkRegistry as `0x${string}`,
        2,
      ],
      gas: 15_000_000n,
    });

    console.log(`   Tx: ${hash.slice(0, 14)}... waiting...`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`deployPoll reverted for proposal ${i + 1}`);

    let pollId = -1;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: MACI_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === 'DeployPoll') {
          pollId = Number((decoded.args as { pollId: bigint }).pollId);
          break;
        }
      } catch { /* skip */ }
    }
    if (pollId < 0) throw new Error('DeployPoll event not found');

    console.log(`   ✓ Poll #${pollId} created\n`);
    results.push({ pollId, title: p.title, description: p.description });
  }

  console.log('═══════════════════════════════════════');
  console.log('All proposals created! Title + description stored on-chain.\n');
  for (const r of results) {
    console.log(`  Poll #${r.pollId}: ${r.title}`);
  }
  console.log('\n═══════════════════════════════════════');
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
