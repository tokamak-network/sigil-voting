/**
 * D1 Private Voting Contract Configuration
 *
 * Based on: https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md
 */

// Contract addresses (Sepolia Testnet) - Updated with Poseidon hash support
export const PRIVATE_VOTING_ADDRESS = '0xC4e1D6f22633224Df80245c71cf86118E7399f93' as const
export const VERIFIER_ADDRESS = '0x6BA110D76df5aAB3501dca0cc52f64f46BC1eB4f' as const

// Vote choices matching spec
export const CHOICE_AGAINST = 0n
export const CHOICE_FOR = 1n
export const CHOICE_ABSTAIN = 2n

export const PRIVATE_VOTING_ABI = [
  // Constructor
  {
    type: 'constructor',
    inputs: [{ name: '_verifier', type: 'address' }],
    stateMutability: 'nonpayable',
  },

  // Admin Functions
  {
    type: 'function',
    name: 'registerMerkleRoot',
    inputs: [{ name: '_merkleRoot', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // Proposal Functions
  {
    type: 'function',
    name: 'createProposal',
    inputs: [
      { name: '_title', type: 'string' },
      { name: '_description', type: 'string' },
      { name: '_merkleRoot', type: 'uint256' },
      { name: '_votingDuration', type: 'uint256' },
      { name: '_revealDuration', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },

  // Voting Functions
  {
    type: 'function',
    name: 'commitVote',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_commitment', type: 'uint256' },
      { name: '_votingPower', type: 'uint256' },
      { name: '_nullifier', type: 'uint256' },
      { name: '_pA', type: 'uint256[2]' },
      { name: '_pB', type: 'uint256[2][2]' },
      { name: '_pC', type: 'uint256[2]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'revealVote',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_nullifier', type: 'uint256' },
      { name: '_choice', type: 'uint256' },
      { name: '_voteSalt', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // View Functions
  {
    type: 'function',
    name: 'getProposal',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'proposer', type: 'address' },
      { name: 'merkleRoot', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'revealEndTime', type: 'uint256' },
      { name: 'forVotes', type: 'uint256' },
      { name: 'againstVotes', type: 'uint256' },
      { name: 'abstainVotes', type: 'uint256' },
      { name: 'totalCommitments', type: 'uint256' },
      { name: 'revealedVotes', type: 'uint256' },
      { name: 'phase', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getCommitment',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_nullifier', type: 'uint256' },
    ],
    outputs: [
      { name: 'commitment', type: 'uint256' },
      { name: 'votingPower', type: 'uint256' },
      { name: 'revealed', type: 'bool' },
      { name: 'revealedChoice', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isNullifierUsed',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_nullifier', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isMerkleRootValid',
    inputs: [{ name: '_merkleRoot', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPhase',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'proposalCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getMerkleRoots',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },

  // Events
  {
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'proposer', type: 'address', indexed: true },
      { name: 'merkleRoot', type: 'uint256', indexed: false },
      { name: 'endTime', type: 'uint256', indexed: false },
      { name: 'revealEndTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MerkleRootRegistered',
    inputs: [
      { name: 'merkleRoot', type: 'uint256', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'VoteCommitted',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'nullifier', type: 'uint256', indexed: true },
      { name: 'commitment', type: 'uint256', indexed: false },
      { name: 'votingPower', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'VoteRevealed',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'nullifier', type: 'uint256', indexed: true },
      { name: 'choice', type: 'uint256', indexed: false },
      { name: 'votingPower', type: 'uint256', indexed: false },
    ],
  },

  // Errors
  { type: 'error', name: 'ProposalNotFound', inputs: [] },
  { type: 'error', name: 'NotInCommitPhase', inputs: [] },
  { type: 'error', name: 'NotInRevealPhase', inputs: [] },
  { type: 'error', name: 'NullifierAlreadyUsed', inputs: [] },
  { type: 'error', name: 'InvalidProof', inputs: [] },
  { type: 'error', name: 'InvalidMerkleRoot', inputs: [] },
  { type: 'error', name: 'InvalidChoice', inputs: [] },
  { type: 'error', name: 'AlreadyRevealed', inputs: [] },
  { type: 'error', name: 'CommitmentNotFound', inputs: [] },
  { type: 'error', name: 'InvalidReveal', inputs: [] },
  { type: 'error', name: 'ZeroVotingPower', inputs: [] },
] as const
