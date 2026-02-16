/**
 * Core types for @sigil/sdk
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
