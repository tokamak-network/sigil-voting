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
  const winner = forVotes > againstVotes ? '찬성' : againstVotes > forVotes ? '반대' : '동률'

  return (
    <div className="uv-result">
      <div className="uv-result-header">
        <span className="uv-result-icon">📊</span>
        <span>투표 종료</span>
      </div>

      <div className="uv-result-summary">
        <div className="uv-result-winner">
          결과: <strong>{winner}</strong>
        </div>
      </div>

      <div className="uv-result-bars">
        <div className="uv-result-bar-container">
          <div className="uv-result-bar-label">
            <span>찬성</span>
            <span>{forVotes}표 ({forPercent}%)</span>
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
            <span>반대</span>
            <span>{againstVotes}표 ({againstPercent}%)</span>
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
          <span className="uv-result-stat-label">참여</span>
          <span className="uv-result-stat-value">{totalCommitments}명</span>
        </div>
        <div className="uv-result-stat">
          <span className="uv-result-stat-label">공개</span>
          <span className="uv-result-stat-value">{revealedVotes}명</span>
        </div>
      </div>

      {myVote && (
        <div className="uv-result-my-vote">
          <span className="uv-result-my-vote-label">내 투표:</span>
          <span className="uv-result-my-vote-value">
            {myVote.choice === CHOICE_FOR ? '찬성' : '반대'} {Number(myVote.numVotes)}표
            {isRevealed ? ' (공개 완료)' : ' (미공개)'}
          </span>
        </div>
      )}
    </div>
  )
}
