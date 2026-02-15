/**
 * MACI V2 Contract Configuration
 *
 * Separated contracts: MACI → Poll → MessageProcessor → Tally
 * No reveal functions. Encrypted messages only.
 */

import config from './config.json';

// V2 Contract addresses (loaded from config.json)
const v2 = (config as any).v2 || {};
export const MACI_V2_ADDRESS = (v2.maci || '0x0000000000000000000000000000000000000000') as `0x${string}`;
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

// V2 Phases (4-phase, no Reveal)
export const V2Phase = {
  Voting: 'voting',
  Merging: 'merging',
  Processing: 'processing',
  Finalized: 'finalized',
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
      { name: '_verifier', type: 'address' },
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
      { name: 'pubKeyX', type: 'uint256', indexed: false },
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
      { name: '_tallyResultsHash', type: 'uint256' },
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
