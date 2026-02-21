/**
 * MACI V2 Contract Configuration
 *
 * Separated contracts: MACI → Poll → MessageProcessor → Tally
 * No reveal functions. Encrypted messages only.
 */

import config from './config.json';

// V2 Contract addresses (loaded from config.json)
const v2 = (config as any).v2 || {};
export const MACI_DEPLOY_BLOCK = BigInt((config as any).deployBlock || 0);
export const MACI_V2_ADDRESS = (v2.maci || '0x0000000000000000000000000000000000000000') as `0x${string}`;
/** @deprecated Use useVoiceCreditToken() hook instead — reads token address from voiceCreditProxy on-chain */
export const TOKEN_ADDRESS = (v2.token || v2.tonToken || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const DEPLOYER_ADDRESS = ((config as any).deployer || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const VOICE_CREDIT_PROXY_ADDRESS = (v2.voiceCreditProxy || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const MSG_PROCESSOR_VERIFIER_ADDRESS = (v2.msgProcessorVerifier || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const TALLY_VERIFIER_ADDRESS = (v2.tallyVerifier || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const VK_REGISTRY_ADDRESS = (v2.vkRegistry || '0x0000000000000000000000000000000000000000') as `0x${string}`;

// Default coordinator keys (from config.json, overridden by on-chain values when poll exists)
export const DEFAULT_COORD_PUB_KEY_X = BigInt(v2.coordinatorPubKeyX || '111');
export const DEFAULT_COORD_PUB_KEY_Y = BigInt(v2.coordinatorPubKeyY || '222');

// Poll/MP/Tally are deployed dynamically via MACI.deployPoll()
export const POLL_V2_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;
export const MESSAGE_PROCESSOR_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;
export const TALLY_V2_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

// V2 Phases (5-phase, no Reveal)
export const V2Phase = {
  Voting: 'voting',
  Merging: 'merging',
  Processing: 'processing',
  Finalized: 'finalized',
  Failed: 'failed',
  NoVotes: 'noVotes',
} as const;
export type V2Phase = (typeof V2Phase)[keyof typeof V2Phase];

// MACI ABI
export const MACI_ABI = [
  {
    type: 'function',
    name: 'signUp',
    inputs: [
      { name: '_pubKeyX', type: 'uint256' },
      { name: '_pubKeyY', type: 'uint256' },
      { name: '_signUpGatekeeperData', type: 'bytes' },
      { name: '_initialVoiceCreditProxyData', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deployPoll',
    inputs: [
      { name: '_title', type: 'string' },
      { name: '_duration', type: 'uint256' },
      { name: '_coordinatorPubKeyX', type: 'uint256' },
      { name: '_coordinatorPubKeyY', type: 'uint256' },
      { name: '_mpVerifier', type: 'address' },
      { name: '_tallyVerifier', type: 'address' },
      { name: '_vkRegistry', type: 'address' },
      { name: '_messageTreeDepth', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'numSignUps',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nextPollId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'polls',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'SignUp',
    inputs: [
      { name: 'stateIndex', type: 'uint256', indexed: true },
      { name: 'pubKeyX', type: 'uint256', indexed: true },
      { name: 'pubKeyY', type: 'uint256', indexed: false },
      { name: 'voiceCreditBalance', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'canCreatePoll',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'proposalGateCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'proposalGates',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'threshold', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'addProposalGate',
    inputs: [
      { name: '_token', type: 'address' },
      { name: '_threshold', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: '_newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'DeployPoll',
    inputs: [
      { name: 'pollId', type: 'uint256', indexed: true },
      { name: 'pollAddr', type: 'address', indexed: false },
      { name: 'messageProcessorAddr', type: 'address', indexed: false },
      { name: 'tallyAddr', type: 'address', indexed: false },
    ],
  },
] as const;

// VoiceCreditProxy ABI
export const VOICE_CREDIT_PROXY_ABI = [
  {
    type: 'function',
    name: 'creditAmount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getVoiceCredits',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Poll ABI
export const POLL_ABI = [
  {
    type: 'function',
    name: 'publishMessage',
    inputs: [
      { name: '_encMessage', type: 'uint256[10]' },
      { name: '_encPubKeyX', type: 'uint256' },
      { name: '_encPubKeyY', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'coordinatorPubKeyX',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'coordinatorPubKeyY',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isVotingOpen',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'stateAqMerged',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'messageAqMerged',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'numMessages',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDeployTimeAndDuration',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'title',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'MessagePublished',
    inputs: [
      { name: 'messageIndex', type: 'uint256', indexed: true },
      { name: 'encMessage', type: 'uint256[10]', indexed: false },
      { name: 'encPubKeyX', type: 'uint256', indexed: false },
      { name: 'encPubKeyY', type: 'uint256', indexed: false },
    ],
  },
] as const;

// MessageProcessor ABI
export const MESSAGE_PROCESSOR_ABI = [
  {
    type: 'function',
    name: 'processMessages',
    inputs: [
      { name: '_newStateCommitment', type: 'uint256' },
      { name: '_pA', type: 'uint256[2]' },
      { name: '_pB', type: 'uint256[2][2]' },
      { name: '_pC', type: 'uint256[2]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'processingComplete',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'currentStateCommitment',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Tally ABI
// ERC20VoiceCreditProxy ABI (read token address + decimals from proxy)
export const ERC20_VOICE_CREDIT_PROXY_ABI = [
  {
    type: 'function',
    name: 'token',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tokenDecimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getVoiceCredits',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Standard ERC20 ABI (read symbol/name/decimals/balanceOf from any ERC20)
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// Governance: Delegation Registry
export const DELEGATION_REGISTRY_ADDRESS = (v2.delegationRegistry || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const DELEGATION_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'delegate',
    inputs: [{ name: '_to', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'undelegate',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getDelegate',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getDelegators',
    inputs: [{ name: '_delegate', type: 'address' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isDelegating',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'Delegated',
    inputs: [
      { name: 'delegator', type: 'address', indexed: true },
      { name: 'delegate', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'Undelegated',
    inputs: [
      { name: 'delegator', type: 'address', indexed: true },
      { name: 'delegate', type: 'address', indexed: true },
    ],
  },
] as const;

// Governance: Timelock Executor
export const TIMELOCK_EXECUTOR_ADDRESS = (v2.timelockExecutor || '0x0000000000000000000000000000000000000000') as `0x${string}`;

export const TIMELOCK_EXECUTOR_ABI = [
  {
    type: 'function',
    name: 'registerExecution',
    inputs: [
      { name: '_pollId', type: 'uint256' },
      { name: '_tallyAddr', type: 'address' },
      { name: '_target', type: 'address' },
      { name: '_callData', type: 'bytes' },
      { name: '_timelockDelay', type: 'uint256' },
      { name: '_quorum', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'schedule',
    inputs: [{ name: '_pollId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [{ name: '_pollId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancel',
    inputs: [{ name: '_pollId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getExecution',
    inputs: [{ name: '_pollId', type: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'tallyAddr', type: 'address' },
      { name: 'target', type: 'address' },
      { name: 'callData', type: 'bytes' },
      { name: 'timelockDelay', type: 'uint256' },
      { name: 'quorum', type: 'uint256' },
      { name: 'scheduledAt', type: 'uint256' },
      { name: 'state', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'canSchedule',
    inputs: [{ name: '_pollId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'canExecute',
    inputs: [{ name: '_pollId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getState',
    inputs: [{ name: '_pollId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

export const TALLY_ABI = [
  {
    type: 'function',
    name: 'tallyVotes',
    inputs: [
      { name: '_newTallyCommitment', type: 'uint256' },
      { name: '_pA', type: 'uint256[2]' },
      { name: '_pB', type: 'uint256[2][2]' },
      { name: '_pC', type: 'uint256[2]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'publishResults',
    inputs: [
      { name: '_forVotes', type: 'uint256' },
      { name: '_againstVotes', type: 'uint256' },
      { name: '_abstainVotes', type: 'uint256' },
      { name: '_totalVoters', type: 'uint256' },
      { name: '_tallyResultsRoot', type: 'uint256' },
      { name: '_totalSpent', type: 'uint256' },
      { name: '_perOptionSpentRoot', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'tallyVerified',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'forVotes',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'againstVotes',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'abstainVotes',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalVoters',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;
