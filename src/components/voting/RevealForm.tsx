import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { getD2VoteForReveal, type D2VoteData, CHOICE_FOR } from '../../zkproof'
import { FingerprintLoader } from '../FingerprintLoader'
import config from '../../config.json'

const ZK_VOTING_FINAL_ADDRESS = (config.contracts.zkVotingFinal || '0x0000000000000000000000000000000000000000') as `0x${string}`

const ZK_VOTING_REVEAL_ABI = [
  { type: 'function', name: 'revealVoteD2', inputs: [{ name: '_proposalId', type: 'uint256' }, { name: '_nullifier', type: 'uint256' }, { name: '_choice', type: 'uint256' }, { name: '_numVotes', type: 'uint256' }, { name: '_voteSalt', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const

interface RevealFormProps {
  proposalId: number
  revealEndTime: Date
  onRevealSuccess: () => void
}

function formatTimeRemaining(targetTime: Date): string {
  const now = new Date()
  const diff = targetTime.getTime() - now.getTime()

  if (diff <= 0) return 'Ended'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

type RevealStatus = 'idle' | 'confirming' | 'processing' | 'success' | 'error'

export function RevealForm({ proposalId, revealEndTime, onRevealSuccess }: RevealFormProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [voteData, setVoteData] = useState<D2VoteData | null>(null)
  const [status, setStatus] = useState<RevealStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  const { writeContractAsync } = useWriteContract()

  // Load stored vote data
  useEffect(() => {
    if (address) {
      const stored = getD2VoteForReveal(BigInt(proposalId), address)
      setVoteData(stored)

      // Check if already revealed (localStorage)
      const revealedKey = `zk-d2-revealed-${address.toLowerCase()}-${proposalId}`
      setIsRevealed(localStorage.getItem(revealedKey) === 'true')
    }
  }, [address, proposalId])

  const handleReveal = useCallback(async () => {
    if (!voteData || !address || !publicClient) return

    setStatus('confirming')
    setError(null)
    setProgress(20)
    setProgressMessage('Please approve in wallet...')

    try {
      const hash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_REVEAL_ABI,
        functionName: 'revealVoteD2',
        args: [
          BigInt(proposalId),
          voteData.nullifier,
          BigInt(voteData.choice),
          voteData.numVotes,
          voteData.voteSalt,
        ],
        gas: BigInt(300000),
      })

      setStatus('processing')
      setProgress(50)
      setProgressMessage('Transaction sent, processing block...')
      console.log('Reveal tx:', hash)

      // Progress update interval
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 90))
      }, 1000)

      // Wait for transaction directly
      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        pollingInterval: 500,
      })

      clearInterval(progressInterval)
      setProgress(100)
      setProgressMessage('Reveal complete!')
      setStatus('success')

      // Mark as revealed
      const revealedKey = `zk-d2-revealed-${address.toLowerCase()}-${proposalId}`
      localStorage.setItem(revealedKey, 'true')
      setIsRevealed(true)
      onRevealSuccess()
    } catch (err) {
      setStatus('error')
      setProgress(0)
      const message = (err as Error).message
      if (message.includes('User rejected') || message.includes('denied')) {
        setError('Transaction cancelled')
      } else if (message.includes('AlreadyRevealed')) {
        setError('Already revealed')
        setIsRevealed(true)
      } else if (message.includes('NotInRevealPhase')) {
        setError('Not in reveal phase yet')
      } else if (message.includes('CommitmentNotFound')) {
        setError('You did not vote on this proposal')
      } else if (message.includes('InvalidReveal')) {
        setError('Vote data mismatch')
      } else {
        setError('Reveal failed: ' + message)
      }
    }
  }, [voteData, address, proposalId, writeContractAsync, publicClient, onRevealSuccess])

  // Not voted
  if (!voteData) {
    return (
      <div className="uv-reveal-form">
        <div className="uv-reveal-header">
          <span className="uv-reveal-icon">📢</span>
          <span>Reveal Phase</span>
        </div>
        <div className="uv-reveal-time">Time left: {formatTimeRemaining(revealEndTime)}</div>
        <div className="uv-reveal-empty">
          You did not vote on this proposal
        </div>
      </div>
    )
  }

  // Already revealed
  if (isRevealed || status === 'success') {
    return (
      <div className="uv-reveal-form">
        <div className="uv-reveal-header">
          <span className="uv-reveal-icon">✅</span>
          <span>Revealed</span>
        </div>
        <div className="uv-reveal-info">
          <div className="uv-reveal-info-row">
            <span className="uv-reveal-info-label">Vote:</span>
            <span className="uv-reveal-info-value">
              {voteData.choice === CHOICE_FOR ? 'For' : 'Against'} {Number(voteData.numVotes)} votes
            </span>
          </div>
        </div>
        <div className="uv-reveal-success-message">
          Your vote has been counted
        </div>
      </div>
    )
  }

  return (
    <div className="uv-reveal-form">
      <div className="uv-reveal-header">
        <span className="uv-reveal-icon">📢</span>
        <span>Reveal Phase</span>
      </div>
      <div className="uv-reveal-time">Time left: {formatTimeRemaining(revealEndTime)}</div>

      <div className="uv-reveal-info">
        <div className="uv-reveal-info-title">My Vote</div>
        <div className="uv-reveal-info-row">
          <span className="uv-reveal-info-label">Vote:</span>
          <span className="uv-reveal-info-value">
            {voteData.choice === CHOICE_FOR ? 'For' : 'Against'} {Number(voteData.numVotes)} votes
          </span>
        </div>
        <div className="uv-reveal-info-row">
          <span className="uv-reveal-info-label">Status:</span>
          <span className="uv-reveal-info-value uv-reveal-pending">Pending reveal</span>
        </div>
      </div>

      {error && <div className="uv-error">{error}</div>}

      {(status === 'confirming' || status === 'processing') ? (
        <div className="uv-reveal-loading">
          <FingerprintLoader progress={progress} />
          <span>{progressMessage}
          </span>
        </div>
      ) : (
        <button
          className="uv-reveal-button"
          onClick={handleReveal}
        >
          Reveal Vote
        </button>
      )}

      <div className="uv-reveal-warning">
        ⚠️ Unrevealed votes are excluded from the tally
      </div>
    </div>
  )
}
