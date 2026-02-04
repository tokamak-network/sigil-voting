// PrivateVoting Contract Configuration (Commit-Reveal)
export const PRIVATE_VOTING_ADDRESS = '0x738afdD6a99f0f10e8F3AaA1297e1eccc34F5AA2' as const

export const PRIVATE_VOTING_ABI = [
  {
    type: 'function',
    name: 'commitVote',
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
    name: 'revealVote',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_choice', type: 'uint8' },
      { name: '_salt', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createProposal',
    inputs: [
      { name: '_title', type: 'string' },
      { name: '_description', type: 'string' },
      { name: '_votingDuration', type: 'uint256' },
      { name: '_revealDuration', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
      { name: 'endTime', type: 'uint256' },
      { name: 'revealEndTime', type: 'uint256' },
      { name: 'forVotes', type: 'uint256' },
      { name: 'againstVotes', type: 'uint256' },
      { name: 'abstainVotes', type: 'uint256' },
      { name: 'totalVoters', type: 'uint256' },
      { name: 'revealedVoters', type: 'uint256' },
      { name: 'phase', type: 'uint8' },
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
      { name: 'revealed', type: 'bool' },
      { name: 'revealedChoice', type: 'uint8' },
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
    name: 'hasRevealed',
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
    type: 'function',
    name: 'getProposalVoters',
    inputs: [{ name: '_proposalId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'proposer', type: 'address', indexed: true },
      { name: 'endTime', type: 'uint256', indexed: false },
      { name: 'revealEndTime', type: 'uint256', indexed: false },
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
    ],
  },
  {
    type: 'event',
    name: 'VoteRevealed',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: true },
      { name: 'voter', type: 'address', indexed: true },
      { name: 'choice', type: 'uint8', indexed: false },
      { name: 'votingPower', type: 'uint256', indexed: false },
    ],
  },
] as const
