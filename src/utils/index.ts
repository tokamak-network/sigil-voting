import type { Proposal, ProposalPhase } from '../types'
import type { VoteChoice } from '../zkproof'
import { CHOICE_FOR, CHOICE_AGAINST, CHOICE_ABSTAIN } from '../contract'

export const shortenAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)

export const getTimeRemaining = (endTime: Date) => {
  const now = new Date()
  const diff = endTime.getTime() - now.getTime()
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h left`
  return `${hours}h left`
}

export const getPhaseLabel = (phase: ProposalPhase) => {
  switch (phase) {
    case 'commit': return 'Commit Phase'
    case 'reveal': return 'Reveal Phase'
    case 'ended': return 'Ended'
  }
}

export const getPhaseColor = (phase: ProposalPhase) => {
  switch (phase) {
    case 'commit': return 'phase-commit'
    case 'reveal': return 'phase-reveal'
    case 'ended': return 'phase-ended'
  }
}

export const getVotePercentages = (proposal: Proposal) => {
  const total = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes
  if (total === 0) return { for: 0, against: 0, abstain: 0 }
  return {
    for: Math.round((proposal.forVotes / total) * 100),
    against: Math.round((proposal.againstVotes / total) * 100),
    abstain: Math.round((proposal.abstainVotes / total) * 100)
  }
}

export const getChoiceLabel = (choice: VoteChoice | null) => {
  if (choice === CHOICE_FOR) return 'For'
  if (choice === CHOICE_AGAINST) return 'Against'
  if (choice === CHOICE_ABSTAIN) return 'Abstain'
  return 'None'
}
