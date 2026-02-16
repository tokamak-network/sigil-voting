/**
 * SigilClient — Main SDK entry point
 *
 * Usage:
 *   const sigil = new SigilClient({
 *     maciAddress: '0x70e5...',
 *     provider: new ethers.JsonRpcProvider('...'),
 *     signer: wallet,
 *   });
 *
 *   // List proposals
 *   const polls = await sigil.getPolls();
 *
 *   // Vote (auto-registers if needed)
 *   await sigil.vote(0, 'for', 3); // 3 votes = 9 credits
 *
 *   // Get results (after finalization)
 *   const results = await sigil.getResults(0);
 */

import { ethers } from 'ethers';
import type { Poll, PollStatus, PollResults, VoteChoice, VoteReceipt } from './types.js';

export interface SigilConfig {
  /** MACI contract address */
  maciAddress: string;
  /** Ethers provider */
  provider: ethers.Provider;
  /** Ethers signer (for write operations) */
  signer?: ethers.Signer;
  /** Coordinator public key [X, Y] — defaults to on-chain value */
  coordinatorPubKey?: [bigint, bigint];
}

// Minimal ABIs for SDK operations
const MACI_ABI = [
  'function signUp(uint256 _pubKeyX, uint256 _pubKeyY, bytes _signUpGatekeeperData, bytes _initialVoiceCreditProxyData)',
  'function nextPollId() view returns (uint256)',
  'function polls(uint256) view returns (address)',
  'function numSignUps() view returns (uint256)',
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
];

const TALLY_ABI = [
  'function tallyVerified() view returns (bool)',
  'function forVotes() view returns (uint256)',
  'function againstVotes() view returns (uint256)',
  'function abstainVotes() view returns (uint256)',
  'function totalVoters() view returns (uint256)',
];

export class SigilClient {
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private maci: ethers.Contract;
  private maciAddress: string;
  private coordinatorPubKey?: [bigint, bigint];

  constructor(config: SigilConfig) {
    this.provider = config.provider;
    this.signer = config.signer;
    this.maciAddress = config.maciAddress;
    this.coordinatorPubKey = config.coordinatorPubKey;
    this.maci = new ethers.Contract(config.maciAddress, MACI_ABI, config.signer ?? config.provider);
  }

  /** Get total number of deployed polls */
  async getPollCount(): Promise<number> {
    return Number(await this.maci.nextPollId());
  }

  /** Get all polls with their status */
  async getPolls(): Promise<Poll[]> {
    const count = await this.getPollCount();
    if (count === 0) return [];

    // Fetch DeployPoll events for MP/Tally addresses
    const filter = this.maci.filters.DeployPoll();
    const events = await this.maci.queryFilter(filter);
    const tallyMap = new Map<number, string>();
    for (const ev of events) {
      if ('args' in ev) {
        const a = ev.args as any;
        tallyMap.set(Number(a.pollId), a.tallyAddr);
      }
    }

    const polls: Poll[] = [];
    for (let i = 0; i < count; i++) {
      const pollAddr = await this.maci.polls(i);
      if (pollAddr === ethers.ZeroAddress) continue;

      const poll = new ethers.Contract(pollAddr, POLL_ABI, this.provider);
      const [isOpen, timePair, numMsgs] = await Promise.all([
        poll.isVotingOpen(),
        poll.getDeployTimeAndDuration(),
        poll.numMessages(),
      ]);

      let status: PollStatus = 'active';
      if (!isOpen) {
        status = 'processing';
        const tallyAddr = tallyMap.get(i);
        if (tallyAddr && tallyAddr !== ethers.ZeroAddress) {
          try {
            const tally = new ethers.Contract(tallyAddr, TALLY_ABI, this.provider);
            if (await tally.tallyVerified()) status = 'finalized';
          } catch { /* skip */ }
        }
        // Check if still merging
        try {
          const stateM = await poll.stateAqMerged();
          const msgM = await poll.messageAqMerged();
          if (!stateM || !msgM) status = 'merging';
        } catch { /* skip */ }
      }

      polls.push({
        id: i,
        address: pollAddr,
        title: `Proposal #${i + 1}`,
        status,
        deployTime: Number(timePair[0]),
        duration: Number(timePair[1]),
        numMessages: Number(numMsgs),
        numSignUps: Number(await this.maci.numSignUps()),
      });
    }

    return polls;
  }

  /** Get a single poll by ID */
  async getPoll(pollId: number): Promise<Poll | null> {
    const polls = await this.getPolls();
    return polls.find(p => p.id === pollId) ?? null;
  }

  /** Get finalized results for a poll */
  async getResults(pollId: number): Promise<PollResults | null> {
    const filter = this.maci.filters.DeployPoll();
    const events = await this.maci.queryFilter(filter);

    let tallyAddr: string | undefined;
    for (const ev of events) {
      if ('args' in ev) {
        const a = ev.args as any;
        if (Number(a.pollId) === pollId) {
          tallyAddr = a.tallyAddr;
          break;
        }
      }
    }

    if (!tallyAddr || tallyAddr === ethers.ZeroAddress) return null;

    const tally = new ethers.Contract(tallyAddr, TALLY_ABI, this.provider);
    const isFinalized = await tally.tallyVerified();

    if (!isFinalized) return null;

    const [forVotes, againstVotes, abstainVotes, totalVoters] = await Promise.all([
      tally.forVotes(),
      tally.againstVotes(),
      tally.abstainVotes(),
      tally.totalVoters(),
    ]);

    return {
      forVotes: BigInt(forVotes),
      againstVotes: BigInt(againstVotes),
      abstainVotes: BigInt(abstainVotes),
      totalVoters: BigInt(totalVoters),
      isFinalized: true,
    };
  }

  /**
   * Cast a vote
   *
   * Auto-registers if the user hasn't signed up yet.
   * Encrypts the vote with the coordinator's public key.
   * Uses quadratic cost: numVotes² credits.
   *
   * @param pollId — Which proposal to vote on
   * @param choice — 'for', 'against', or 'abstain'
   * @param numVotes — Number of votes (cost = numVotes²)
   * @returns Vote receipt with tx hash
   */
  async vote(pollId: number, choice: VoteChoice, numVotes: number = 1): Promise<VoteReceipt> {
    if (!this.signer) throw new Error('Signer required for voting');

    // TODO: Implement full vote flow:
    // 1. Auto-register (signUp) if not already
    // 2. Generate EdDSA keypair (Baby Jubjub)
    // 3. Pack command (stateIndex, voteOption, weight, nonce, pollId, salt)
    // 4. Sign with EdDSA
    // 5. Encrypt with DuplexSponge (ECDH shared key with coordinator)
    // 6. Call publishMessage on Poll contract

    const choiceMap = { against: 0, for: 1, abstain: 2 };
    const creditsSpent = numVotes * numVotes;

    throw new Error(
      'SDK vote() not yet implemented. Use the SIGIL web app at https://sigil.vote or ' +
      'integrate the React components from @sigil/widget.'
    );

    // Placeholder return (unreachable)
    return {
      txHash: '',
      pollId,
      choice,
      numVotes,
      creditsSpent,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Register a user for MACI voting
   *
   * Generates a Baby Jubjub EdDSA keypair and registers on-chain.
   * Called automatically by vote() if the user isn't registered.
   */
  async signUp(): Promise<{ txHash: string; stateIndex: number }> {
    if (!this.signer) throw new Error('Signer required for signUp');

    // TODO: Implement signUp with real EdDSA keypair generation
    throw new Error('SDK signUp() not yet implemented. Use the SIGIL web app.');
  }
}
