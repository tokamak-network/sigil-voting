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

  if (diff <= 0) return '종료'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (days > 0) return `${days}일 ${hours}시간 ${minutes}분`
  if (hours > 0) return `${hours}시간 ${minutes}분`
  if (minutes > 0) return `${minutes}분 ${seconds}초`
  return `${seconds}초`
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

  // 저장된 투표 데이터 로드
  useEffect(() => {
    if (address) {
      const stored = getD2VoteForReveal(BigInt(proposalId), address)
      setVoteData(stored)

      // 이미 공개했는지 확인 (localStorage)
      const revealedKey = `zk-d2-revealed-${address.toLowerCase()}-${proposalId}`
      setIsRevealed(localStorage.getItem(revealedKey) === 'true')
    }
  }, [address, proposalId])

  const handleReveal = useCallback(async () => {
    if (!voteData || !address || !publicClient) return

    setStatus('confirming')
    setError(null)
    setProgress(20)
    setProgressMessage('지갑에서 승인해주세요...')

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
      setProgressMessage('트랜잭션 전송 완료, 블록 처리 중...')
      console.log('Reveal tx:', hash)

      // 진행 상태 업데이트를 위한 인터벌
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 90))
      }, 1000)

      // 직접 트랜잭션 대기
      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        pollingInterval: 500,
      })

      clearInterval(progressInterval)
      setProgress(100)
      setProgressMessage('공개 완료!')
      setStatus('success')

      // 공개 완료 마킹
      const revealedKey = `zk-d2-revealed-${address.toLowerCase()}-${proposalId}`
      localStorage.setItem(revealedKey, 'true')
      setIsRevealed(true)
      onRevealSuccess()
    } catch (err) {
      setStatus('error')
      setProgress(0)
      const message = (err as Error).message
      if (message.includes('User rejected') || message.includes('denied')) {
        setError('트랜잭션이 취소되었습니다')
      } else if (message.includes('AlreadyRevealed')) {
        setError('이미 공개되었습니다')
        setIsRevealed(true)
      } else if (message.includes('NotInRevealPhase')) {
        setError('아직 공개 기간이 아닙니다')
      } else if (message.includes('CommitmentNotFound')) {
        setError('이 제안에 투표하지 않았습니다')
      } else if (message.includes('InvalidReveal')) {
        setError('투표 데이터가 일치하지 않습니다')
      } else {
        setError('공개 실패: ' + message)
      }
    }
  }, [voteData, address, proposalId, writeContractAsync, publicClient, onRevealSuccess])

  // 투표하지 않은 경우
  if (!voteData) {
    return (
      <div className="uv-reveal-form">
        <div className="uv-reveal-header">
          <span className="uv-reveal-icon">📢</span>
          <span>공개 기간</span>
        </div>
        <div className="uv-reveal-time">남은 시간: {formatTimeRemaining(revealEndTime)}</div>
        <div className="uv-reveal-empty">
          이 제안에 투표하지 않았습니다
        </div>
      </div>
    )
  }

  // 이미 공개한 경우
  if (isRevealed || status === 'success') {
    return (
      <div className="uv-reveal-form">
        <div className="uv-reveal-header">
          <span className="uv-reveal-icon">✅</span>
          <span>공개 완료</span>
        </div>
        <div className="uv-reveal-info">
          <div className="uv-reveal-info-row">
            <span className="uv-reveal-info-label">투표:</span>
            <span className="uv-reveal-info-value">
              {voteData.choice === CHOICE_FOR ? '찬성' : '반대'} {Number(voteData.numVotes)}표
            </span>
          </div>
        </div>
        <div className="uv-reveal-success-message">
          투표가 집계에 반영되었습니다
        </div>
      </div>
    )
  }

  return (
    <div className="uv-reveal-form">
      <div className="uv-reveal-header">
        <span className="uv-reveal-icon">📢</span>
        <span>공개 기간</span>
      </div>
      <div className="uv-reveal-time">남은 시간: {formatTimeRemaining(revealEndTime)}</div>

      <div className="uv-reveal-info">
        <div className="uv-reveal-info-title">내 투표 정보</div>
        <div className="uv-reveal-info-row">
          <span className="uv-reveal-info-label">투표:</span>
          <span className="uv-reveal-info-value">
            {voteData.choice === CHOICE_FOR ? '찬성' : '반대'} {Number(voteData.numVotes)}표
          </span>
        </div>
        <div className="uv-reveal-info-row">
          <span className="uv-reveal-info-label">상태:</span>
          <span className="uv-reveal-info-value uv-reveal-pending">공개 대기 중</span>
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
          투표 공개하기
        </button>
      )}

      <div className="uv-reveal-warning">
        ⚠️ 공개하지 않으면 집계에서 제외됩니다
      </div>
    </div>
  )
}
