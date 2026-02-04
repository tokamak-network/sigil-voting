// PrivateVoting Contract Configuration
export const PRIVATE_VOTING_ADDRESS = '0x583e8926F8701a196F182c449dF7BAc4782EF784' as const

export const PRIVATE_VOTING_ABI = [
  {
    type: 'function',
    name: 'createProposal',
    inputs: [
      { name: '_title', type: 'string' },
      { name: '_description', type: 'string' },
      { name: '_duration', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'submitVoteCommitment',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_commitment', type: 'bytes32' },
      { name: '_votingPower', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getProposal',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'proposer', type: 'address' },
      { name: 'startTime', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'totalVoters', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getVoteCommitment',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_voter', type: 'address' },
    ],
    outputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'votingPower', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'hasVoted', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'hasVoted',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_voter', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
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
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'proposer', type: 'address', indexed: true },
      { name: 'startTime', type: 'uint256', indexed: false },
      { name: 'endTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'VoteCommitted',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'voter', type: 'address', indexed: true },
      { name: 'commitment', type: 'bytes32', indexed: false },
      { name: 'votingPower', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const
