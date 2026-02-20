/**
 * Core types for sigil-sdk
 */

export type VoteChoice = 'for' | 'against' | 'abstain';

export type PollStatus = 'active' | 'merging' | 'processing' | 'finalized';

export interface Poll {
  id: number;
  address: string;
  title: string;
  status: PollStatus;
  deployTime: number;
  duration: number;
  numMessages: number;
  numSignUps: number;
}

export interface PollResults {
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  totalVoters: bigint;
  isFinalized: boolean;
}

export interface VoteReceipt {
  txHash: string;
  pollId: number;
  choice: VoteChoice;
  numVotes: number;
  creditsSpent: number;
  timestamp: number;
}

export interface KeyPair {
  publicKey: [bigint, bigint];
  privateKey: bigint;
}

export interface SigilEvent {
  type: 'signup' | 'vote' | 'keychange' | 'finalized';
  pollId: number;
  txHash?: string;
  data?: Record<string, unknown>;
}

export interface SignUpResult {
  txHash: string;
  stateIndex: number;
  pubKey: [bigint, bigint];
}

export interface VoteOptions {
  /** Auto-register if not yet signed up (default: true) */
  autoRegister?: boolean;
  /** Auto key-change on re-vote for anti-collusion (default: true) */
  autoKeyChange?: boolean;
  /** Custom salt for the vote command (generated if not provided) */
  salt?: bigint;
}

export interface KeyChangeResult {
  txHash: string;
  newPubKey: [bigint, bigint];
}
