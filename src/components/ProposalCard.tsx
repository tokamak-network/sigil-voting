import type { Proposal } from '../types'
import { getPhaseLabel, getPhaseColor, getTimeRemaining } from '../utils'

interface ProposalCardProps {
  proposal: Proposal
  onClick: () => void
}

export function ProposalCard({ proposal, onClick }: ProposalCardProps) {
  return (
    <div className="proposal-card" onClick={onClick}>
      <div className="proposal-card-header">
        <span className={`proposal-phase ${getPhaseColor(proposal.phase)}`}>
          {getPhaseLabel(proposal.phase)}
        </span>
        {proposal.phase !== 'ended' && (
          <span className="proposal-countdown">
            {proposal.phase === 'commit' ? getTimeRemaining(proposal.endTime) : getTimeRemaining(proposal.revealEndTime)}
          </span>
        )}
      </div>
      <h3 className="proposal-title">{proposal.title}</h3>
      <div className="proposal-stats">
        <span>📝 {proposal.totalCommitments} committed</span>
        {proposal.phase !== 'commit' && (
          <span>✅ {proposal.revealedVotes} revealed</span>
        )}
      </div>
    </div>
  )
}
