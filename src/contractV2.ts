/**
 * MACI V2 Contract Configuration
 *
 * Separated contracts: MACI → Poll → MessageProcessor → Tally
 * No reveal functions. Encrypted messages only.
 */

// V2 Contract addresses (to be updated after deployment)
export const MACI_V2_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
export const POLL_V2_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
export const MESSAGE_PROCESSOR_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
export const TALLY_V2_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// V2 Phases (4-phase, no Reveal)
export enum V2Phase {
  Voting = 'voting',
  Merging = 'merging',
  Processing = 'processing',
  Finalized = 'finalized',
}

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
    type: 'event',
    name: 'PollDeployed',
    inputs: [
      { name: 'pollId', type: 'uint256', indexed: true },
      { name: 'pollAddr', type: 'address', indexed: false },
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
