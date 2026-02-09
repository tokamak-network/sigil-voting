export type Page = 'landing' | 'proposals' | 'proposal-detail' | 'create-proposal' | 'quadratic-voting'
export type ProposalPhase = 'commit' | 'reveal' | 'ended'
export type ProposalStatus = 'active' | 'reveal' | 'passed' | 'defeated'

export interface Proposal {
  id: string
  title: string
  description: string
  proposer: string
  merkleRoot: bigint
  endTime: Date
  revealEndTime: Date
  forVotes: number
  againstVotes: number
  abstainVotes: number
  totalCommitments: number
  revealedVotes: number
  phase: ProposalPhase
  status: ProposalStatus
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}
