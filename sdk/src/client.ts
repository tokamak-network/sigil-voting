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
import type {
  Poll, PollStatus, PollResults, VoteChoice, VoteReceipt,
  SignUpResult, VoteOptions, KeyChangeResult,
  ExecutionState,
} from './types.js';
import type { SigilStorage } from './storage.js';
import { createDefaultStorage } from './storage.js';
import { createStorageKeys, type StorageKeys } from './storageKeys.js';
import { KeyManager } from './keyManager.js';
import { buildEncryptedVoteMessage, buildEncryptedKeyChangeMessage } from './message.js';
import { eddsaDerivePublicKey } from './crypto/eddsa.js';
import { derivePrivateKey } from './crypto/blake512.js';

export interface SigilConfig {
  /** MACI contract address */
  maciAddress: string;
  /** Ethers provider */
  provider: ethers.Provider;
  /** Ethers signer (for write operations) */
  signer?: ethers.Signer;
  /** Coordinator public key [X, Y] — defaults to on-chain value */
  coordinatorPubKey?: [bigint, bigint];
  /** Custom storage backend (defaults to localStorage or MemoryStorage) */
  storage?: SigilStorage;
  /** TimelockExecutor contract address */
  timelockExecutorAddress?: string;
  /** DelegationRegistry contract address */
  delegationRegistryAddress?: string;
}

// Minimal ABIs for SDK operations
const MACI_ABI = [
  'function signUp(uint256 _pubKeyX, uint256 _pubKeyY, bytes _signUpGatekeeperData, bytes _initialVoiceCreditProxyData)',
  'function nextPollId() view returns (uint256)',
  'function polls(uint256) view returns (address)',
  'function numSignUps() view returns (uint256)',
  'event SignUp(uint256 indexed _stateIndex, uint256 indexed _pubKeyX, uint256 indexed _pubKeyY, uint256 _voiceCreditBalance, uint256 _timestamp)',
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

const TIMELOCK_EXECUTOR_ABI = [
  'function registerExecution(uint256 pollId, address tallyAddr, address target, bytes callData, uint256 delay, uint256 quorum)',
  'function schedule(uint256 pollId)',
  'function execute(uint256 pollId)',
  'function cancel(uint256 pollId)',
  'function getExecution(uint256 pollId) view returns (address creator, address tallyAddr, address target, bytes callData, uint256 timelockDelay, uint256 quorum, uint256 scheduledAt, uint8 state)',
  'function getState(uint256 pollId) view returns (uint8)',
  'function canSchedule(uint256 pollId) view returns (bool)',
  'function canExecute(uint256 pollId) view returns (bool)',
];

const DELEGATION_REGISTRY_ABI = [
  'function delegate(address _to)',
  'function undelegate()',
  'function getDelegate(address _user) view returns (address)',
  'function getDelegators(address _delegate) view returns (address[])',
  'function isDelegating(address _user) view returns (bool)',
];

const MACI_KEY_MESSAGE = 'SIGIL Voting Key v1';

export class SigilClient {
  private provider: ethers.Provider;
  private signer?: ethers.Signer;
  private maci: ethers.Contract;
  private maciAddress: string;
  private coordinatorPubKeyOverride?: [bigint, bigint];
  private coordinatorPubKeyCache = new Map<number, [bigint, bigint]>();
  private keyManager: KeyManager;
  private storageKeys: StorageKeys;
  private storage: SigilStorage;
  private timelockExecutorAddress?: string;
  private delegationRegistryAddress?: string;

  constructor(config: SigilConfig) {
    this.provider = config.provider;
    this.signer = config.signer;
    this.maciAddress = config.maciAddress;
    this.coordinatorPubKeyOverride = config.coordinatorPubKey;
    this.maci = new ethers.Contract(config.maciAddress, MACI_ABI, config.signer ?? config.provider);
    this.storage = config.storage ?? createDefaultStorage();
    this.storageKeys = createStorageKeys(config.maciAddress);
    this.keyManager = new KeyManager(this.storage, this.storageKeys);
    this.timelockExecutorAddress = config.timelockExecutorAddress;
    this.delegationRegistryAddress = config.delegationRegistryAddress;
  }

  /** Get total number of deployed polls */
  async getPollCount(): Promise<number> {
    return Number(await this.maci.nextPollId());
  }

  /** Get all polls with their status */
  async getPolls(): Promise<Poll[]> {
    const count = await this.getPollCount();
    if (count === 0) return [];

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
   * Register a user for MACI voting.
   *
   * Generates a Baby Jubjub EdDSA keypair from a wallet signature and
   * registers on-chain via MACI.signUp().
   *
   * @param signatureHex - Optional pre-signed message hex (0x-prefixed).
   *   If not provided, the signer will be prompted to sign MACI_KEY_MESSAGE.
   */
  async signUp(signatureHex?: string): Promise<SignUpResult> {
    if (!this.signer) throw new Error('Signer required for signUp');

    const address = await this.signer.getAddress();

    // Check if already registered
    if (this.keyManager.isSignedUp(address)) {
      const stateIndex = this.keyManager.getStateIndex(address, 0);
      const kp = await this.keyManager.loadKeypair(address, 0);
      if (kp) {
        return { txHash: '', stateIndex, pubKey: kp.pubKey };
      }
    }

    // Get or request signature for key derivation
    let sigBytes: Uint8Array;
    if (signatureHex) {
      sigBytes = hexToBytes(signatureHex);
    } else {
      const sig = await this.signer.signMessage(MACI_KEY_MESSAGE);
      sigBytes = hexToBytes(sig);
    }

    // Derive EdDSA keypair from signature
    const sk = derivePrivateKey(sigBytes);
    const pubKey = await eddsaDerivePublicKey(sk);

    // Call MACI.signUp on-chain
    const tx = await this.maci.signUp(
      pubKey[0],
      pubKey[1],
      '0x',
      '0x',
    );
    const receipt = await tx.wait();

    // Parse SignUp event to get stateIndex
    let stateIndex = 1;
    for (const log of receipt.logs) {
      try {
        const parsed = this.maci.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed && parsed.name === 'SignUp') {
          stateIndex = Number(parsed.args._stateIndex);
          break;
        }
      } catch { /* skip non-matching logs */ }
    }

    // Store keypair and mark as registered
    this.storage.setItem(this.storageKeys.sk(address), sk.toString());
    this.storage.setItem(
      this.storageKeys.pk(address),
      JSON.stringify([pubKey[0].toString(), pubKey[1].toString()]),
    );
    this.keyManager.markSignedUp(address, stateIndex);

    return { txHash: receipt.hash, stateIndex, pubKey };
  }

  /**
   * Cast a vote.
   *
   * Auto-registers if the user hasn't signed up yet.
   * Auto-changes key on re-vote for MACI anti-collusion.
   * Encrypts the vote with the coordinator's public key.
   * Uses quadratic cost: numVotes² credits.
   *
   * @param pollId — Which proposal to vote on
   * @param choice — 'for', 'against', or 'abstain'
   * @param numVotes — Number of votes (cost = numVotes²)
   * @param options — Additional options
   * @returns Vote receipt with tx hash
   */
  async vote(
    pollId: number,
    choice: VoteChoice,
    numVotes: number = 1,
    options: VoteOptions = {},
  ): Promise<VoteReceipt> {
    if (!this.signer) throw new Error('Signer required for voting');

    const address = await this.signer.getAddress();
    const { autoRegister = true, autoKeyChange = true } = options;
    const creditsSpent = numVotes * numVotes;

    // Auto-register if needed
    if (!this.keyManager.isSignedUp(address) && autoRegister) {
      await this.signUp();
    }

    if (!this.keyManager.isSignedUp(address)) {
      throw new Error('User not registered. Call signUp() first.');
    }

    // Get coordinator pub key
    const coordPubKey = await this.getCoordinatorPubKey(pollId);

    // Get current keypair
    const kp = await this.keyManager.getOrCreateKeypair(address, pollId);
    let voteSk = kp.sk;
    let votePubKey = kp.pubKey;

    // Auto key change on re-vote
    const nonce = this.keyManager.getNonce(address, pollId);
    const isReVote = nonce > 1;

    if (isReVote && autoKeyChange) {
      const kcResult = await this.changeKeyInternal(pollId, address, voteSk, coordPubKey);
      voteSk = kcResult.newSk;
      votePubKey = kcResult.newPubKey;
    }

    // Map choice to number
    const choiceMap: Record<VoteChoice, number> = { against: 0, for: 1, abstain: 2 };
    const choiceNum = choiceMap[choice];

    // Build encrypted vote message
    const stateIndex = BigInt(this.keyManager.getStateIndex(address, pollId));
    const currentNonce = BigInt(this.keyManager.getNonce(address, pollId));

    const { encMessage, ephemeralPubKey } = await buildEncryptedVoteMessage({
      stateIndex,
      voteOptionIndex: BigInt(choiceNum),
      newVoteWeight: BigInt(numVotes),
      nonce: currentNonce,
      pollId: BigInt(pollId),
      voterSk: voteSk,
      voterPubKey: votePubKey,
      coordinatorPubKey: coordPubKey,
    });

    // Get poll contract address
    const pollAddr = await this.maci.polls(pollId);
    const poll = new ethers.Contract(pollAddr, POLL_ABI, this.signer);

    // Submit on-chain
    const tx = await poll.publishMessage(encMessage, ephemeralPubKey[0], ephemeralPubKey[1]);
    const receipt = await tx.wait();

    // Update nonce
    this.keyManager.incrementNonce(address, pollId);

    return {
      txHash: receipt.hash,
      pollId,
      choice,
      numVotes,
      creditsSpent,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Change EdDSA key for MACI anti-collusion.
   *
   * Generates a new random keypair, submits a key change message,
   * and stores the new key. Previous votes signed with the old key
   * become invalid (MACI processes messages in reverse order).
   */
  async changeKey(pollId: number): Promise<KeyChangeResult> {
    if (!this.signer) throw new Error('Signer required for changeKey');

    const address = await this.signer.getAddress();
    const coordPubKey = await this.getCoordinatorPubKey(pollId);

    const kp = await this.keyManager.getOrCreateKeypair(address, pollId);

    const result = await this.changeKeyInternal(pollId, address, kp.sk, coordPubKey);

    return {
      txHash: result.txHash,
      newPubKey: result.newPubKey,
    };
  }

  /**
   * Internal key change implementation (shared by vote re-vote and explicit changeKey).
   */
  private async changeKeyInternal(
    pollId: number,
    address: string,
    currentSk: bigint,
    coordinatorPubKey: [bigint, bigint],
  ): Promise<{ txHash: string; newSk: bigint; newPubKey: [bigint, bigint] }> {
    // Generate new keypair
    const newKp = await this.keyManager.generateNewKeypair(address, pollId);

    const stateIndex = BigInt(this.keyManager.getStateIndex(address, pollId));
    const nonce = BigInt(this.keyManager.getNonce(address, pollId));

    const { encMessage, ephemeralPubKey } = await buildEncryptedKeyChangeMessage({
      stateIndex,
      nonce,
      pollId: BigInt(pollId),
      currentSk,
      newPubKey: newKp.pubKey,
      coordinatorPubKey,
    });

    // Get poll contract
    const pollAddr = await this.maci.polls(pollId);
    const poll = new ethers.Contract(pollAddr, POLL_ABI, this.signer!);

    // Submit on-chain
    const tx = await poll.publishMessage(encMessage, ephemeralPubKey[0], ephemeralPubKey[1]);
    const receipt = await tx.wait();

    // Increment nonce (key changes use the shared counter)
    this.keyManager.incrementNonce(address, pollId);

    return {
      txHash: receipt.hash,
      newSk: newKp.sk,
      newPubKey: newKp.pubKey,
    };
  }

  /**
   * Get coordinator public key, fetching from chain if not cached.
   */
  private async getCoordinatorPubKey(pollId: number): Promise<[bigint, bigint]> {
    if (this.coordinatorPubKeyOverride) return this.coordinatorPubKeyOverride;

    const cached = this.coordinatorPubKeyCache.get(pollId);
    if (cached) return cached;

    const pollAddr = await this.maci.polls(pollId);
    const poll = new ethers.Contract(pollAddr, POLL_ABI, this.provider);
    const [x, y] = await Promise.all([
      poll.coordinatorPubKeyX(),
      poll.coordinatorPubKeyY(),
    ]);

    const key: [bigint, bigint] = [BigInt(x), BigInt(y)];
    this.coordinatorPubKeyCache.set(pollId, key);
    return key;
  }

  // ============ Governance: Timelock Execution ============

  /** Register an on-chain execution target for a poll */
  async registerExecution(
    pollId: number,
    tallyAddr: string,
    target: string,
    callData: string,
    delay: number,
    quorum: number,
  ): Promise<string> {
    if (!this.timelockExecutorAddress) throw new Error('timelockExecutorAddress not configured');
    if (!this.signer) throw new Error('Signer required');
    const executor = new ethers.Contract(this.timelockExecutorAddress, TIMELOCK_EXECUTOR_ABI, this.signer);
    const tx = await executor.registerExecution(pollId, tallyAddr, target, callData, BigInt(delay), BigInt(quorum));
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Schedule execution after tally verification */
  async schedule(pollId: number): Promise<string> {
    if (!this.timelockExecutorAddress) throw new Error('timelockExecutorAddress not configured');
    if (!this.signer) throw new Error('Signer required');
    const executor = new ethers.Contract(this.timelockExecutorAddress, TIMELOCK_EXECUTOR_ABI, this.signer);
    const tx = await executor.schedule(pollId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Execute after timelock expires */
  async execute(pollId: number): Promise<string> {
    if (!this.timelockExecutorAddress) throw new Error('timelockExecutorAddress not configured');
    if (!this.signer) throw new Error('Signer required');
    const executor = new ethers.Contract(this.timelockExecutorAddress, TIMELOCK_EXECUTOR_ABI, this.signer);
    const tx = await executor.execute(pollId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Cancel a registered/scheduled execution */
  async cancelExecution(pollId: number): Promise<string> {
    if (!this.timelockExecutorAddress) throw new Error('timelockExecutorAddress not configured');
    if (!this.signer) throw new Error('Signer required');
    const executor = new ethers.Contract(this.timelockExecutorAddress, TIMELOCK_EXECUTOR_ABI, this.signer);
    const tx = await executor.cancel(pollId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Get execution state for a poll */
  async getExecutionState(pollId: number): Promise<ExecutionState> {
    if (!this.timelockExecutorAddress) throw new Error('timelockExecutorAddress not configured');
    const executor = new ethers.Contract(this.timelockExecutorAddress, TIMELOCK_EXECUTOR_ABI, this.provider);
    const stateNum = Number(await executor.getState(pollId));
    const stateMap: ExecutionState[] = ['none', 'registered', 'scheduled', 'executed', 'cancelled'];
    return stateMap[stateNum] ?? 'none';
  }

  // ============ Governance: Delegation ============

  /** Delegate voting power to another address */
  async delegate(to: string): Promise<string> {
    if (!this.delegationRegistryAddress) throw new Error('delegationRegistryAddress not configured');
    if (!this.signer) throw new Error('Signer required');
    const registry = new ethers.Contract(this.delegationRegistryAddress, DELEGATION_REGISTRY_ABI, this.signer);
    const tx = await registry.delegate(to);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Remove delegation */
  async undelegate(): Promise<string> {
    if (!this.delegationRegistryAddress) throw new Error('delegationRegistryAddress not configured');
    if (!this.signer) throw new Error('Signer required');
    const registry = new ethers.Contract(this.delegationRegistryAddress, DELEGATION_REGISTRY_ABI, this.signer);
    const tx = await registry.undelegate();
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Get delegate for an address (defaults to signer if voter not specified) */
  async getDelegate(voter?: string): Promise<string> {
    if (!this.delegationRegistryAddress) throw new Error('delegationRegistryAddress not configured');
    const registry = new ethers.Contract(this.delegationRegistryAddress, DELEGATION_REGISTRY_ABI, this.provider);
    const addr = voter ?? (this.signer ? await this.signer.getAddress() : undefined);
    if (!addr) throw new Error('No address provided');
    return await registry.getDelegate(addr);
  }

  /** Check if an address is delegating */
  async isDelegating(voter?: string): Promise<boolean> {
    if (!this.delegationRegistryAddress) throw new Error('delegationRegistryAddress not configured');
    const registry = new ethers.Contract(this.delegationRegistryAddress, DELEGATION_REGISTRY_ABI, this.provider);
    const addr = voter ?? (this.signer ? await this.signer.getAddress() : undefined);
    if (!addr) throw new Error('No address provided');
    return await registry.isDelegating(addr);
  }

  /** Access the internal key manager (for advanced use) */
  getKeyManager(): KeyManager {
    return this.keyManager;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const matches = clean.match(/.{2}/g);
  if (!matches) throw new Error('Invalid hex string');
  return new Uint8Array(matches.map(h => parseInt(h, 16)));
}
