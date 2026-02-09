import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import {
  getOrCreateKeyPairAsync,
  createCreditNoteAsync,
  getStoredCreditNote,
  prepareD2VoteAsync,
  generateQuadraticProof,
  storeD2VoteForReveal,
  generateMerkleProofAsync,
  type KeyPair,
  type CreditNote,
  type VoteChoice,
  type ProofGenerationProgress,
  CHOICE_FOR,
  CHOICE_AGAINST,
} from '../zkproof'
import config from '../config.json'

const ZK_VOTING_FINAL_ADDRESS = (config.contracts.zkVotingFinal || '0x0000000000000000000000000000000000000000') as `0x${string}`

const ZK_VOTING_FINAL_ABI = [
  { type: 'function', name: 'mintTestTokens', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getAvailableCredits', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'registerCreditRoot', inputs: [{ name: '_creditRoot', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'registerCreditNote', inputs: [{ name: '_creditNoteHash', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getRegisteredCreditNotes', inputs: [], outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view' },
  { type: 'function', name: 'proposalCountD2', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'createProposalD2', inputs: [{ name: '_title', type: 'string' }, { name: '_description', type: 'string' }, { name: '_creditRoot', type: 'uint256' }, { name: '_votingDuration', type: 'uint256' }, { name: '_revealDuration', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'castVoteD2', inputs: [{ name: '_proposalId', type: 'uint256' }, { name: '_commitment', type: 'uint256' }, { name: '_numVotes', type: 'uint256' }, { name: '_creditsSpent', type: 'uint256' }, { name: '_nullifier', type: 'uint256' }, { name: '_pA', type: 'uint256[2]' }, { name: '_pB', type: 'uint256[2][2]' }, { name: '_pC', type: 'uint256[2]' }], outputs: [], stateMutability: 'nonpayable' },
] as const

interface QuadraticVotingDemoProps {
  onBack?: () => void
}

type Step = 'connect' | 'setup' | 'proposal' | 'vote' | 'success'

export function QuadraticVotingDemo({ onBack }: QuadraticVotingDemoProps) {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { writeContractAsync } = useWriteContract()

  const [currentStep, setCurrentStep] = useState<Step>('connect')
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null)
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null)
  const [selectedProposal, setSelectedProposal] = useState<{id: number, title: string} | null>(null)
  const [newProposalTitle, setNewProposalTitle] = useState('')

  // Voting state
  const [numVotes, setNumVotes] = useState(1)
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null)
  const [showIntensity, setShowIntensity] = useState(false) // Progressive disclosure
  const [isProcessing, setIsProcessing] = useState(false)
  const [proofProgress, setProofProgress] = useState<ProofGenerationProgress | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isContractDeployed = ZK_VOTING_FINAL_ADDRESS !== '0x0000000000000000000000000000000000000000'

  const { refetch: refetchCredits } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_FINAL_ABI,
    functionName: 'getAvailableCredits',
    args: address ? [address] : undefined,
    query: { enabled: isContractDeployed && !!address }
  })

  const { data: registeredCreditNotes, refetch: refetchCreditNotes } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_FINAL_ABI,
    functionName: 'getRegisteredCreditNotes',
    query: { enabled: isContractDeployed }
  })

  const totalCredits = creditNote?.totalCredits ? Number(creditNote.totalCredits) : 10000
  const quadraticCost = numVotes * numVotes
  const maxVotes = Math.floor(Math.sqrt(totalCredits))

  // Cost level for visual feedback (0-100)
  const costLevel = Math.min((quadraticCost / totalCredits) * 100, 100)
  const isHighCost = costLevel > 30
  const isDanger = costLevel > 70

  useEffect(() => {
    if (isConnected && address) {
      getOrCreateKeyPairAsync(address).then(setKeyPair)
      const stored = getStoredCreditNote(address)
      if (stored) setCreditNote(stored)
      setCurrentStep('setup')
    } else {
      setCurrentStep('connect')
    }
  }, [isConnected, address])

  useEffect(() => {
    if (currentStep === 'setup' && creditNote && registeredCreditNotes) {
      const notes = registeredCreditNotes as bigint[]
      if (notes.length > 0) setCurrentStep('proposal')
    }
  }, [currentStep, creditNote, registeredCreditNotes])

  const handleConnect = () => connect({ connector: injected() })

  const handleSetupCredits = useCallback(async () => {
    if (!keyPair || !address) return
    setIsProcessing(true)
    setError(null)

    try {
      const newCreditNote = await createCreditNoteAsync(keyPair, BigInt(10000), address)
      setCreditNote(newCreditNote)

      await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditNote',
        args: [newCreditNote.creditNoteHash],
      })

      await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'mintTestTokens',
        args: [BigInt(10000)],
      })

      await refetchCredits()
      await refetchCreditNotes()
      setCurrentStep('proposal')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }, [keyPair, address, writeContractAsync, refetchCredits, refetchCreditNotes])

  const handleCreateProposal = useCallback(async () => {
    if (!newProposalTitle.trim()) return
    setIsProcessing(true)
    setError(null)

    try {
      const creditNotes = (registeredCreditNotes as bigint[]) || []
      if (creditNotes.length === 0) throw new Error('크레딧을 먼저 초기화해주세요')

      const { root: creditRoot } = await generateMerkleProofAsync(creditNotes, 0)

      await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditRoot',
        args: [creditRoot],
      })

      await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'createProposalD2',
        args: [newProposalTitle, '', creditRoot, BigInt(86400), BigInt(86400)],
      })

      setSelectedProposal({ id: 1, title: newProposalTitle })
      setCurrentStep('vote')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }, [newProposalTitle, registeredCreditNotes, writeContractAsync])

  const handleVote = useCallback(async (choice: VoteChoice) => {
    if (!keyPair || !creditNote || !selectedProposal) return
    if (quadraticCost > totalCredits) {
      setError('크레딧이 부족합니다')
      return
    }

    setSelectedChoice(choice)
    setIsProcessing(true)
    setError(null)
    setProofProgress({ stage: 'preparing', progress: 0, message: '투표 준비 중...' })

    try {
      const proposalId = BigInt(selectedProposal.id)
      const voteData = await prepareD2VoteAsync(keyPair, choice, BigInt(numVotes), proposalId)
      const creditNotes = (registeredCreditNotes as bigint[]) || []

      if (creditNotes.length === 0) throw new Error('등록된 크레딧이 없습니다')

      const { root: creditRoot } = await generateMerkleProofAsync(creditNotes, 0)

      setProofProgress({ stage: 'preparing', progress: 10, message: '크레딧 루트 등록...' })
      await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditRoot',
        args: [creditRoot],
      })

      const { proof, nullifier, commitment } = await generateQuadraticProof(
        keyPair,
        creditNote,
        voteData,
        creditRoot,
        creditNotes,
        setProofProgress
      )

      setProofProgress({ stage: 'finalizing', progress: 95, message: '블록체인에 제출 중...' })

      const hash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'castVoteD2',
        args: [proposalId, commitment, BigInt(numVotes), voteData.creditsSpent, nullifier, proof.pA, proof.pB, proof.pC],
        gas: BigInt(1000000),
      })

      setTxHash(hash)
      storeD2VoteForReveal(proposalId, voteData, address)
      await refetchCredits()
      setCurrentStep('success')
    } catch (err) {
      console.error('Vote failed:', err)
      setError((err as Error).message)
    } finally {
      setIsProcessing(false)
      setProofProgress(null)
    }
  }, [keyPair, creditNote, selectedProposal, numVotes, quadraticCost, totalCredits, registeredCreditNotes, writeContractAsync, refetchCredits, address])

  // ============ STYLES ============
  const getIntensityColor = () => {
    if (isDanger) return { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#fca5a5' }
    if (isHighCost) return { bg: 'rgba(251, 191, 36, 0.15)', border: '#f59e0b', text: '#fcd34d' }
    return { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#86efac' }
  }

  const colors = getIntensityColor()

  // ============ RENDER ============
  return (
    <div className="unified-voting">
      {onBack && (
        <button className="uv-back" onClick={onBack}>← 뒤로</button>
      )}

      {/* STEP: Connect */}
      {currentStep === 'connect' && (
        <div className="uv-card uv-center">
          <div className="uv-icon">🗳️</div>
          <h1>Private Voting</h1>
          <p className="uv-subtitle">영지식 증명으로 보호되는 비밀 투표</p>
          <button className="uv-btn uv-btn-primary" onClick={handleConnect}>
            지갑 연결
          </button>
        </div>
      )}

      {/* STEP: Setup Credits */}
      {currentStep === 'setup' && (
        <div className="uv-card uv-center">
          <div className="uv-icon">💎</div>
          <h1>투표권 받기</h1>
          <p className="uv-subtitle">테스트용 10,000 크레딧을 받으세요</p>

          <div className="uv-credit-preview">
            <span className="uv-credit-amount">10,000</span>
            <span className="uv-credit-label">Credits</span>
          </div>

          {error && <div className="uv-error">{error}</div>}

          <button
            className="uv-btn uv-btn-primary"
            onClick={handleSetupCredits}
            disabled={isProcessing || !isContractDeployed}
          >
            {isProcessing ? '처리 중...' : '크레딧 받기'}
          </button>
        </div>
      )}

      {/* STEP: Create Proposal */}
      {currentStep === 'proposal' && (
        <div className="uv-card">
          <h1>새 제안</h1>
          <p className="uv-subtitle">커뮤니티에 의견을 물어보세요</p>

          <input
            type="text"
            className="uv-input"
            placeholder="제안 제목을 입력하세요"
            value={newProposalTitle}
            onChange={(e) => setNewProposalTitle(e.target.value)}
          />

          {error && <div className="uv-error">{error}</div>}

          <button
            className="uv-btn uv-btn-primary"
            onClick={handleCreateProposal}
            disabled={!newProposalTitle.trim() || isProcessing}
          >
            {isProcessing ? '생성 중...' : '제안 생성'}
          </button>
        </div>
      )}

      {/* STEP: Vote - Unified Single Flow */}
      {currentStep === 'vote' && selectedProposal && (
        <div
          className="uv-card uv-vote-card"
          style={{
            backgroundColor: colors.bg,
            borderColor: colors.border,
          }}
        >
          <h1>{selectedProposal.title}</h1>

          {/* Simple Vote Buttons */}
          <div className="uv-vote-buttons">
            <button
              className={`uv-vote-btn uv-vote-for ${selectedChoice === CHOICE_FOR ? 'selected' : ''}`}
              onClick={() => !isProcessing && handleVote(CHOICE_FOR)}
              disabled={isProcessing}
            >
              <span className="uv-vote-icon">👍</span>
              <span>찬성</span>
            </button>
            <button
              className={`uv-vote-btn uv-vote-against ${selectedChoice === CHOICE_AGAINST ? 'selected' : ''}`}
              onClick={() => !isProcessing && handleVote(CHOICE_AGAINST)}
              disabled={isProcessing}
            >
              <span className="uv-vote-icon">👎</span>
              <span>반대</span>
            </button>
          </div>

          {/* Current Vote Info */}
          <div className="uv-vote-info" style={{ color: colors.text }}>
            <span className="uv-vote-count">{numVotes}표</span>
            <span className="uv-vote-cost">{quadraticCost} 크레딧</span>
          </div>

          {/* Progressive Disclosure: Intensity Slider */}
          {!showIntensity ? (
            <button
              className="uv-intensity-toggle"
              onClick={() => setShowIntensity(true)}
            >
              더 강력한 의사표시를 원하시나요?
            </button>
          ) : (
            <div className="uv-intensity-panel">
              <div className="uv-intensity-header">
                <span>투표 강도</span>
                <button className="uv-intensity-close" onClick={() => { setShowIntensity(false); setNumVotes(1); }}>
                  ✕ 닫기
                </button>
              </div>

              <div className="uv-slider-container">
                <input
                  type="range"
                  min="1"
                  max={maxVotes}
                  value={numVotes}
                  onChange={(e) => setNumVotes(Number(e.target.value))}
                  className="uv-slider"
                  style={{
                    background: `linear-gradient(to right, ${colors.border} 0%, ${colors.border} ${(numVotes / maxVotes) * 100}%, #374151 ${(numVotes / maxVotes) * 100}%, #374151 100%)`
                  }}
                />
              </div>

              {/* Cost Visualization */}
              <div className="uv-cost-visual">
                <div className="uv-cost-bar-container">
                  <div
                    className="uv-cost-bar"
                    style={{
                      width: `${costLevel}%`,
                      backgroundColor: colors.border,
                    }}
                  />
                </div>
                <div className="uv-cost-labels">
                  <span>0</span>
                  <span>{totalCredits.toLocaleString()}</span>
                </div>
              </div>

              {/* Cost Table */}
              <div className="uv-cost-table">
                <div className={`uv-cost-row ${numVotes === 1 ? 'active' : ''}`}>
                  <span>1표</span><span>1 크레딧</span>
                </div>
                <div className={`uv-cost-row ${numVotes >= 5 && numVotes < 10 ? 'active' : ''}`}>
                  <span>5표</span><span>25 크레딧</span>
                </div>
                <div className={`uv-cost-row ${numVotes >= 10 && numVotes < 50 ? 'active' : ''}`}>
                  <span>10표</span><span>100 크레딧</span>
                </div>
                <div className={`uv-cost-row ${numVotes >= 50 ? 'active' : ''}`}>
                  <span>100표</span><span>10,000 크레딧</span>
                </div>
              </div>

              {isDanger && (
                <div className="uv-warning">
                  ⚠️ 크레딧의 {costLevel.toFixed(0)}%를 사용합니다
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {proofProgress && (
            <div className="uv-progress">
              <div className="uv-progress-bar">
                <div className="uv-progress-fill" style={{ width: `${proofProgress.progress}%` }} />
              </div>
              <p className="uv-progress-text">{proofProgress.message}</p>
            </div>
          )}

          {error && <div className="uv-error">{error}</div>}

          {/* Privacy Badge */}
          <div className="uv-privacy">
            🔐 투표 내용은 공개 전까지 암호화됩니다
          </div>
        </div>
      )}

      {/* STEP: Success */}
      {currentStep === 'success' && (
        <div className="uv-card uv-center uv-success">
          <div className="uv-icon uv-success-icon">✅</div>
          <h1>투표 완료!</h1>
          <p className="uv-subtitle">투표가 암호화되어 제출되었습니다</p>

          <div className="uv-result-summary">
            <div className="uv-result-row">
              <span>제안</span>
              <strong>{selectedProposal?.title}</strong>
            </div>
            <div className="uv-result-row">
              <span>투표 수</span>
              <strong>{numVotes}표</strong>
            </div>
            <div className="uv-result-row">
              <span>사용 크레딧</span>
              <strong>{quadraticCost}</strong>
            </div>
            <div className="uv-result-row uv-hidden">
              <span>선택</span>
              <strong>🔐 공개 대기 중</strong>
            </div>
          </div>

          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="uv-tx-link"
            >
              Etherscan에서 확인 ↗
            </a>
          )}

          <button
            className="uv-btn uv-btn-secondary"
            onClick={() => {
              setCurrentStep('proposal')
              setSelectedProposal(null)
              setNewProposalTitle('')
              setSelectedChoice(null)
              setNumVotes(1)
              setShowIntensity(false)
              setTxHash(null)
            }}
          >
            새 제안 만들기
          </button>
        </div>
      )}
    </div>
  )
}
