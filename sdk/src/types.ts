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

export type TallyStatus = 'missing' | 'pending' | 'finalized';

export interface ResultsStatus {
  status: TallyStatus;
  tallyAddress?: string;
  results?: PollResults;
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

export type ExecutionState = 'none' | 'registered' | 'scheduled' | 'executed' | 'cancelled';

export interface ExecutionInfo {
  pollId: number;
  creator: string;
  target: string;
  callData: string;
  timelockDelay: number;
  quorum: number;
  scheduledAt: number;
  state: ExecutionState;
}

export interface DelegationInfo {
  delegator: string;
  delegate: string;
  isDelegating: boolean;
}
