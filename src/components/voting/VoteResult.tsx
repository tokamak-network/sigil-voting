import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { getD2VoteForReveal, type D2VoteData, CHOICE_FOR } from '../../zkproof'

interface VoteResultProps {
  proposalId: number
  forVotes: number
  againstVotes: number
  totalCommitments: number
  revealedVotes: number
}

export function VoteResult({
  proposalId,
  forVotes,
  againstVotes,
  totalCommitments,
  revealedVotes,
}: VoteResultProps) {
  const { address } = useAccount()
  const [myVote, setMyVote] = useState<D2VoteData | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)

  useEffect(() => {
    if (address) {
      const stored = getD2VoteForReveal(BigInt(proposalId), address)
      setMyVote(stored)

      const revealedKey = `zk-d2-revealed-${address.toLowerCase()}-${proposalId}`
      setIsRevealed(localStorage.getItem(revealedKey) === 'true')
    }
  }, [address, proposalId])

  const totalVotes = forVotes + againstVotes
  const forPercent = totalVotes > 0 ? Math.round((forVotes / totalVotes) * 100) : 0
  const againstPercent = totalVotes > 0 ? Math.round((againstVotes / totalVotes) * 100) : 0
  const winner = forVotes > againstVotes ? 'For' : againstVotes > forVotes ? 'Against' : 'Tie'

  return (
    <div className="uv-result">
      <div className="uv-result-header">
        <span className="uv-result-icon">📊</span>
        <span>Vote Ended</span>
      </div>

      <div className="uv-result-summary">
        <div className="uv-result-winner">
          Result: <strong>{winner}</strong>
        </div>
      </div>

      <div className="uv-result-bars">
        <div className="uv-result-bar-container">
          <div className="uv-result-bar-label">
            <span>For</span>
            <span>{forVotes} votes ({forPercent}%)</span>
          </div>
          <div className="uv-result-bar">
            <div
              className="uv-result-bar-fill uv-result-bar-for"
              style={{ width: `${forPercent}%` }}
            />
          </div>
        </div>

        <div className="uv-result-bar-container">
          <div className="uv-result-bar-label">
            <span>Against</span>
            <span>{againstVotes} votes ({againstPercent}%)</span>
          </div>
          <div className="uv-result-bar">
            <div
              className="uv-result-bar-fill uv-result-bar-against"
              style={{ width: `${againstPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="uv-result-stats">
        <div className="uv-result-stat">
          <span className="uv-result-stat-label">Voted</span>
          <span className="uv-result-stat-value">{totalCommitments}</span>
        </div>
        <div className="uv-result-stat">
          <span className="uv-result-stat-label">Revealed</span>
          <span className="uv-result-stat-value">{revealedVotes}</span>
        </div>
      </div>

      {myVote && (
        <div className="uv-result-my-vote">
          <span className="uv-result-my-vote-label">My vote:</span>
          <span className="uv-result-my-vote-value">
            {myVote.choice === CHOICE_FOR ? 'For' : 'Against'} {Number(myVote.numVotes)} votes
            {isRevealed ? ' (Revealed)' : ' (Not revealed)'}
          </span>
        </div>
      )}
    </div>
  )
}
