import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatUnits, decodeAbiParameters } from 'viem'
import {
  getOrCreateKeyPairAsync,
  prepareD2VoteAsync,
  generateQuadraticProof,
  storeD2VoteForReveal,
  generateMerkleProofAsync,
  createCreditNoteAsync,
  getStoredCreditNote,
  type KeyPair,
  type CreditNote,
  type VoteChoice,
  CHOICE_FOR,
  CHOICE_AGAINST,
} from '../zkproof'
import { useVotingMachine } from '../hooks/useVotingMachine'
import config from '../config.json'

const ZK_VOTING_FINAL_ADDRESS = (config.contracts.zkVotingFinal || '0x0000000000000000000000000000000000000000') as `0x${string}`
const TON_TOKEN_ADDRESS = (config.contracts.tonToken || '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044') as `0x${string}`

const ZK_VOTING_FINAL_ABI = [
  { type: 'function', name: 'registerCreditRoot', inputs: [{ name: '_creditRoot', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'registerCreditNote', inputs: [{ name: '_creditNoteHash', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getRegisteredCreditNotes', inputs: [], outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view' },
  { type: 'function', name: 'proposalCountD2', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'createProposalD2', inputs: [{ name: '_title', type: 'string' }, { name: '_description', type: 'string' }, { name: '_creditRoot', type: 'uint256' }, { name: '_votingDuration', type: 'uint256' }, { name: '_revealDuration', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'castVoteD2', inputs: [{ name: '_proposalId', type: 'uint256' }, { name: '_commitment', type: 'uint256' }, { name: '_numVotes', type: 'uint256' }, { name: '_creditsSpent', type: 'uint256' }, { name: '_nullifier', type: 'uint256' }, { name: '_pA', type: 'uint256[2]' }, { name: '_pB', type: 'uint256[2][2]' }, { name: '_pC', type: 'uint256[2]' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'creditRootHistory', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
] as const

interface Proposal {
  id: number
  title: string
  creator: string
  endTime: Date
  totalVotes: number
  creditRoot: bigint
}

type View = 'list' | 'create' | 'vote' | 'success'

const FAUCET_URL = 'https://docs.tokamak.network/home/service-guide/faucet-testnet'

export function QuadraticVotingDemo() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

  const [currentView, setCurrentView] = useState<View>('list')
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isLoadingProposals, setIsLoadingProposals] = useState(true)
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [newProposalTitle, setNewProposalTitle] = useState('')

  // Voting state machine
  const {
    context: votingContext,
    isProcessing,
    setVotes,
    startVote,
    updateProgress,
    proofComplete,
    signed,
    txConfirmed,
    setError: setVotingError,
    reset: resetVoting,
  } = useVotingMachine()

  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null)
  const [showIntensity, setShowIntensity] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numVotes = votingContext.numVotes
  const txHash = votingContext.txHash

  const isContractDeployed = ZK_VOTING_FINAL_ADDRESS !== '0x0000000000000000000000000000000000000000'

  // Read TON balance
  const { data: tonBalance, refetch: refetchTonBalance } = useReadContract({
    address: TON_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  })

  const { data: proposalCount, refetch: refetchProposalCount } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_FINAL_ABI,
    functionName: 'proposalCountD2',
    query: { enabled: isContractDeployed }
  })

  const { data: registeredCreditNotes, refetch: refetchCreditNotes } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_FINAL_ABI,
    functionName: 'getRegisteredCreditNotes',
    query: { enabled: isContractDeployed }
  })

  // Convert TON balance to voting power (1 TON = 1 voting power unit)
  const tonBalanceFormatted = tonBalance ? Number(formatUnits(tonBalance, 18)) : 0
  const totalVotingPower = Math.floor(tonBalanceFormatted)
  const hasTon = totalVotingPower > 0

  const quadraticCost = numVotes * numVotes
  const maxVotes = Math.floor(Math.sqrt(totalVotingPower))

  const costLevel = totalVotingPower > 0 ? Math.min((quadraticCost / totalVotingPower) * 100, 100) : 0
  const isHighCost = costLevel > 30
  const isDanger = costLevel > 70

  // Initialize key pair on connect
  useEffect(() => {
    if (isConnected && address) {
      getOrCreateKeyPairAsync(address).then(setKeyPair)
    }
  }, [isConnected, address])

  // Fetch proposals
  useEffect(() => {
    const fetchProposals = async () => {
      setIsLoadingProposals(true)

      if (!proposalCount || proposalCount === 0n) {
        setIsLoadingProposals(false)
        return
      }

      const count = Number(proposalCount)
      const fetchedProposals: Proposal[] = []

      for (let i = 1; i <= count; i++) {
        try {
          const response = await fetch('https://ethereum-sepolia-rpc.publicnode.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_call',
              params: [{
                to: ZK_VOTING_FINAL_ADDRESS,
                data: `0x${getProposalSelector(i)}`
              }, 'latest'],
              id: i
            })
          })
          const result = await response.json()
          if (result.result && result.result !== '0x') {
            const decoded = decodeProposalResult(result.result)
            if (decoded.title) {
              fetchedProposals.push({
                id: i,
                title: decoded.title,
                creator: decoded.creator,
                endTime: new Date(Number(decoded.endTime) * 1000),
                totalVotes: Number(decoded.totalVotes),
                creditRoot: decoded.creditRoot,
              })
            }
          }
        } catch (e) {
          console.error('Failed to fetch proposal', i, e)
        }
      }

      setProposals(fetchedProposals)
      setIsLoadingProposals(false)
    }

    fetchProposals()
  }, [proposalCount])

  const handleConnect = () => connect({ connector: injected() })

  const [createStatus, setCreateStatus] = useState<string | null>(null)
  const [isCreatingProposal, setIsCreatingProposal] = useState(false)

  const handleCreateProposal = useCallback(async () => {
    if (!newProposalTitle.trim() || !publicClient || !keyPair || !address) return
    setIsCreatingProposal(true)
    setError(null)
    setCreateStatus('준비 중...')

    try {
      // Ensure creator's creditNote is registered
      setCreateStatus('투표자 등록 확인 중...')
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      const noteHash = creditNote.creditNoteHash
      let creditNotes = [...((registeredCreditNotes as bigint[]) || [])]

      if (!creditNotes.includes(noteHash)) {
        setCreateStatus('투표자 등록 중...')
        const registerNoteHash = await writeContractAsync({
          address: ZK_VOTING_FINAL_ADDRESS,
          abi: ZK_VOTING_FINAL_ABI,
          functionName: 'registerCreditNote',
          args: [noteHash],
        })
        await publicClient.waitForTransactionReceipt({ hash: registerNoteHash })
        creditNotes.push(noteHash)
        await refetchCreditNotes()
      }

      // Build merkle tree from registered credit notes to get the proper root
      setCreateStatus('투표자 목록 설정 중...')
      const { root: creditRoot } = await generateMerkleProofAsync(creditNotes, 0)

      // Register this creditRoot
      const registerRootHash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditRoot',
        args: [creditRoot],
      })
      await publicClient.waitForTransactionReceipt({ hash: registerRootHash })

      // Create proposal with proper creditRoot
      setCreateStatus('제안 생성 중...')
      const createHash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'createProposalD2',
        args: [newProposalTitle, '', creditRoot, BigInt(86400), BigInt(86400)],
      })

      setCreateStatus('블록 확인 대기 중...')
      await publicClient.waitForTransactionReceipt({ hash: createHash })

      await refetchProposalCount()
      setNewProposalTitle('')
      setCreateStatus(null)
      setCurrentView('list')
    } catch (err) {
      console.error('[DEBUG] Create proposal error:', err)
      const errorMsg = (err as Error).message || ''
      if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected') || errorMsg.includes('denied')) {
        setError('트랜잭션이 취소되었습니다')
      } else if (errorMsg.includes('insufficient funds')) {
        setError('Sepolia ETH가 부족합니다. Faucet에서 받아주세요.')
      } else if (errorMsg.includes('gas')) {
        setError('가스 오류가 발생했습니다. 다시 시도해주세요.')
      } else {
        setError('제안 생성에 실패했습니다. 다시 시도해주세요.')
      }
    } finally {
      setIsCreatingProposal(false)
      setCreateStatus(null)
    }
  }, [newProposalTitle, publicClient, writeContractAsync, refetchProposalCount, keyPair, address, totalVotingPower, registeredCreditNotes, refetchCreditNotes])

  const handleVote = useCallback(async (choice: VoteChoice) => {
    if (!keyPair || !selectedProposal || !hasTon || !address) return
    if (quadraticCost > totalVotingPower) {
      setError('TON이 부족합니다')
      return
    }

    setSelectedChoice(choice)
    setError(null)
    startVote() // State: IDLE -> PROOFING

    try {
      const proposalId = BigInt(selectedProposal.id)
      updateProgress(5, '투표 데이터 준비 중...')
      const voteData = await prepareD2VoteAsync(keyPair, choice, BigInt(numVotes), proposalId)

      // Get or create credit note with proper Poseidon hash
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      const noteHash = creditNote.creditNoteHash
      let creditNotes = [...((registeredCreditNotes as bigint[]) || [])]

      if (!creditNotes.includes(noteHash)) {
        updateProgress(10, '투표자 등록 중...')
        await writeContractAsync({
          address: ZK_VOTING_FINAL_ADDRESS,
          abi: ZK_VOTING_FINAL_ABI,
          functionName: 'registerCreditNote',
          args: [noteHash],
        })
        creditNotes.push(noteHash)
        await refetchCreditNotes()
      }

      // Use the proposal's creditRoot for proof generation (must match contract verification)
      const proposalCreditRoot = selectedProposal.creditRoot
      updateProgress(15, 'ZK 증명 준비 중...')

      // Generate ZK proof using proposal's creditRoot
      const { proof, nullifier, commitment } = await generateQuadraticProof(
        keyPair,
        creditNote,
        voteData,
        proposalCreditRoot,
        creditNotes,
        (progress) => updateProgress(20 + Math.floor(progress.progress * 0.3), progress.message)
      )

      proofComplete() // State: PROOFING -> SIGNING

      // Wait for user to sign
      const hash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'castVoteD2',
        args: [proposalId, commitment, BigInt(numVotes), voteData.creditsSpent, nullifier, proof.pA, proof.pB, proof.pC],
        gas: BigInt(1000000),
      })

      signed() // State: SIGNING -> SUBMITTING

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash })
      }

      storeD2VoteForReveal(proposalId, voteData, address)
      await refetchTonBalance()
      txConfirmed(hash) // State: SUBMITTING -> SUCCESS
      setCurrentView('success')
    } catch (err) {
      console.error('Vote failed:', err)
      const errorMsg = (err as Error).message || ''
      if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected') || errorMsg.includes('denied')) {
        setVotingError('트랜잭션이 취소되었습니다')
        setError('트랜잭션이 취소되었습니다')
      } else {
        setVotingError(errorMsg)
        setError(errorMsg)
      }
    }
  }, [keyPair, selectedProposal, hasTon, address, numVotes, quadraticCost, totalVotingPower, registeredCreditNotes, writeContractAsync, refetchCreditNotes, refetchTonBalance, startVote, updateProgress, proofComplete, signed, txConfirmed, setVotingError, publicClient])

  const getIntensityColor = () => {
    if (isDanger) return { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#fca5a5' }
    if (isHighCost) return { bg: 'rgba(251, 191, 36, 0.15)', border: '#f59e0b', text: '#fcd34d' }
    return { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#86efac' }
  }

  const colors = getIntensityColor()

  return (
    <div className="unified-voting">
      {/* Header with TON balance */}
      {isConnected && (
        <div className="uv-header-bar">
          {hasTon ? (
            <div className="uv-credits-badge">
              💎 {totalVotingPower.toLocaleString()} TON
            </div>
          ) : (
            <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-get-credits-btn">
              💎 TON 받으러 가기
            </a>
          )}
        </div>
      )}

      {/* VIEW: Proposal List */}
      {currentView === 'list' && (
        <div className="uv-list-view">
          <div className="uv-list-header">
            <h1>제안 목록</h1>
            {isConnected && (
              <button className="uv-create-btn" onClick={() => setCurrentView('create')}>
                + 새 제안
              </button>
            )}
          </div>

          {!isConnected ? (
            <div className="uv-card uv-center">
              <div className="uv-icon">🗳️</div>
              <h2>ZK Private Voting</h2>
              <p className="uv-subtitle">지갑을 연결하고 투표에 참여하세요</p>
              <button className="uv-btn uv-btn-primary" onClick={handleConnect}>
                지갑 연결
              </button>
            </div>
          ) : isLoadingProposals ? (
            <div className="uv-card uv-center">
              <div className="uv-loading">
                <div className="uv-spinner"></div>
                <span>제안 목록 불러오는 중...</span>
              </div>
            </div>
          ) : proposals.length === 0 ? (
            <div className="uv-card uv-center">
              <div className="uv-icon">📭</div>
              <h2>아직 제안이 없습니다</h2>
              <p className="uv-subtitle">첫 번째 제안을 만들어보세요</p>
              <button className="uv-btn uv-btn-primary" onClick={() => setCurrentView('create')}>
                제안 만들기
              </button>
            </div>
          ) : (
            <div className="uv-proposals-grid">
              {proposals.map(proposal => (
                <div
                  key={proposal.id}
                  className="uv-proposal-card"
                  onClick={() => {
                    setSelectedProposal(proposal)
                    setCurrentView('vote')
                  }}
                >
                  <div className="uv-proposal-id">#{proposal.id}</div>
                  <h3>{proposal.title}</h3>
                  <div className="uv-proposal-meta">
                    <span>👤 {proposal.creator.slice(0, 6)}...{proposal.creator.slice(-4)}</span>
                    <span>🗳️ {proposal.totalVotes}표</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <div className="uv-error">{error}</div>}
        </div>
      )}

      {/* VIEW: Create Proposal */}
      {currentView === 'create' && (
        <div className="uv-create-view">
          <button className="uv-back" onClick={() => setCurrentView('list')} disabled={isCreatingProposal}>← 목록으로</button>

          <div className="uv-card">
            <h1>새 제안</h1>
            <p className="uv-subtitle">커뮤니티에 의견을 물어보세요</p>

            <input
              type="text"
              className="uv-input"
              placeholder="제안 제목을 입력하세요"
              value={newProposalTitle}
              onChange={(e) => setNewProposalTitle(e.target.value)}
              disabled={isCreatingProposal}
            />

            {createStatus && (
              <div className="uv-loading">
                <div className="uv-spinner"></div>
                <span>{createStatus}</span>
              </div>
            )}

            {error && <div className="uv-error">{error}</div>}

            <button
              className="uv-btn uv-btn-primary"
              onClick={handleCreateProposal}
              disabled={!newProposalTitle.trim() || isCreatingProposal}
            >
              {isCreatingProposal ? '처리 중...' : '제안 생성'}
            </button>
          </div>
        </div>
      )}

      {/* VIEW: Vote */}
      {currentView === 'vote' && selectedProposal && (
        <div className="uv-vote-view">
          <button className="uv-back" onClick={() => { setCurrentView('list'); setSelectedProposal(null); setShowIntensity(false); setError(null); resetVoting(); }}>
            ← 목록으로
          </button>

          <div
            className="uv-card uv-vote-card"
            style={{ backgroundColor: hasTon ? colors.bg : 'rgba(255,255,255,0.03)', borderColor: hasTon ? colors.border : 'rgba(255,255,255,0.08)' }}
          >
            <h1>{selectedProposal.title}</h1>

            <div className="uv-proposal-info">
              <span>👤 {selectedProposal.creator.slice(0, 6)}...{selectedProposal.creator.slice(-4)}</span>
              <span>🗳️ {selectedProposal.totalVotes}표</span>
            </div>

            {!hasTon && (
              <div className="uv-no-token-notice">
                <p>투표하려면 TON이 필요합니다</p>
                <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-btn uv-btn-primary">
                  💎 Faucet에서 TON 받기
                </a>
              </div>
            )}

            <div className="uv-vote-buttons">
              <button
                className={`uv-vote-btn uv-vote-for ${selectedChoice === CHOICE_FOR ? 'selected' : ''}`}
                onClick={() => {
                  if (!hasTon) {
                    setError('투표하려면 TON이 필요합니다. Faucet에서 받아주세요.')
                    return
                  }
                  if (!isProcessing) handleVote(CHOICE_FOR)
                }}
                disabled={isProcessing || !hasTon}
              >
                <span className="uv-vote-icon">👍</span>
                <span>찬성</span>
              </button>
              <button
                className={`uv-vote-btn uv-vote-against ${selectedChoice === CHOICE_AGAINST ? 'selected' : ''}`}
                onClick={() => {
                  if (!hasTon) {
                    setError('투표하려면 TON이 필요합니다. Faucet에서 받아주세요.')
                    return
                  }
                  if (!isProcessing) handleVote(CHOICE_AGAINST)
                }}
                disabled={isProcessing || !hasTon}
              >
                <span className="uv-vote-icon">👎</span>
                <span>반대</span>
              </button>
            </div>

            {hasTon && (
              <>
                <div className="uv-vote-info" style={{ color: colors.text }}>
                  <span className="uv-vote-count">{numVotes}표</span>
                  <span className="uv-vote-cost">{quadraticCost} TON</span>
                </div>

                {!showIntensity ? (
                  <button className="uv-intensity-toggle" onClick={() => setShowIntensity(true)}>
                    더 강력한 의사표시를 원하시나요?
                  </button>
                ) : (
                  <div className="uv-intensity-panel">
                    <div className="uv-intensity-header">
                      <span>투표 강도</span>
                      <button className="uv-intensity-close" onClick={() => { setShowIntensity(false); setVotes(1); }}>
                        ✕ 닫기
                      </button>
                    </div>

                    <div className="uv-slider-container">
                      <input
                        type="range"
                        min="1"
                        max={maxVotes}
                        value={numVotes}
                        onChange={(e) => setVotes(Number(e.target.value))}
                        className="uv-slider"
                        style={{
                          background: `linear-gradient(to right, ${colors.border} 0%, ${colors.border} ${(numVotes / maxVotes) * 100}%, #374151 ${(numVotes / maxVotes) * 100}%, #374151 100%)`
                        }}
                      />
                    </div>

                    <div className="uv-cost-visual">
                      <div className="uv-cost-bar-container">
                        <div className="uv-cost-bar" style={{ width: `${costLevel}%`, backgroundColor: colors.border }} />
                      </div>
                      <div className="uv-cost-labels">
                        <span>0</span>
                        <span>{totalVotingPower.toLocaleString()} TON</span>
                      </div>
                    </div>

                    <div className="uv-cost-table">
                      <div className={`uv-cost-row ${numVotes === 1 ? 'active' : ''}`}><span>1표</span><span>1 TON</span></div>
                      <div className={`uv-cost-row ${numVotes >= 5 && numVotes < 10 ? 'active' : ''}`}><span>5표</span><span>25 TON</span></div>
                      <div className={`uv-cost-row ${numVotes >= 10 && numVotes < 50 ? 'active' : ''}`}><span>10표</span><span>100 TON</span></div>
                      <div className={`uv-cost-row ${numVotes >= 50 ? 'active' : ''}`}><span>100표</span><span>10,000 TON</span></div>
                    </div>

                    {isDanger && <div className="uv-warning">⚠️ TON의 {costLevel.toFixed(0)}%를 사용합니다</div>}
                  </div>
                )}
              </>
            )}

            {isProcessing && (
              <div className="uv-progress">
                <div className="uv-progress-bar">
                  <div className="uv-progress-fill" style={{ width: `${votingContext.progress}%` }} />
                </div>
                <p className="uv-progress-text">
                  {votingContext.state === 'PROOFING' && '🔐 '}
                  {votingContext.state === 'SIGNING' && '✍️ '}
                  {votingContext.state === 'SUBMITTING' && '⏳ '}
                  {votingContext.message}
                </p>
              </div>
            )}

            {error && <div className="uv-error">{error}</div>}

            <div className="uv-privacy">🔐 투표 내용은 공개 전까지 암호화됩니다</div>
          </div>
        </div>
      )}

      {/* VIEW: Success */}
      {currentView === 'success' && (
        <div className="uv-success-view">
          {/* Confetti Animation */}
          <div className="uv-confetti">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="uv-confetti-piece" />
            ))}
          </div>

          <div className="uv-card uv-center uv-success">
            <div className="uv-icon uv-success-icon">🎉</div>
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
                <span>사용 TON</span>
                <strong>{quadraticCost} TON</strong>
              </div>
              <div className="uv-result-row uv-hidden">
                <span>선택</span>
                <strong>🔐 공개 대기 중</strong>
              </div>
            </div>

            {txHash && (
              <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="uv-tx-link">
                Etherscan에서 확인 ↗
              </a>
            )}

            <button
              className="uv-btn uv-btn-secondary"
              onClick={() => {
                setCurrentView('list')
                setSelectedProposal(null)
                setSelectedChoice(null)
                setShowIntensity(false)
                resetVoting()
              }}
            >
              목록으로 돌아가기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// proposalsD2(uint256) selector = 0xb4e0d6af
function getProposalSelector(proposalId: number): string {
  const selector = 'b4e0d6af'
  const paddedId = proposalId.toString(16).padStart(64, '0')
  return selector + paddedId
}

function decodeProposalResult(hex: string): { title: string; creator: string; endTime: bigint; totalVotes: bigint; creditRoot: bigint } {
  try {
    if (!hex || hex === '0x' || hex.length < 66) {
      return { title: '', creator: '', endTime: 0n, totalVotes: 0n, creditRoot: 0n }
    }

    // ProposalD2 struct: id, title, description, proposer, startTime, endTime, ...
    const decoded = decodeAbiParameters(
      [
        { name: 'id', type: 'uint256' },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'proposer', type: 'address' },
        { name: 'startTime', type: 'uint256' },
        { name: 'endTime', type: 'uint256' },
        { name: 'revealEndTime', type: 'uint256' },
        { name: 'creditRoot', type: 'uint256' },
        { name: 'forVotes', type: 'uint256' },
        { name: 'againstVotes', type: 'uint256' },
        { name: 'abstainVotes', type: 'uint256' },
        { name: 'totalCreditsSpent', type: 'uint256' },
        { name: 'totalCommitments', type: 'uint256' },
        { name: 'revealedVotes', type: 'uint256' },
        { name: 'exists', type: 'bool' },
      ],
      hex as `0x${string}`
    )

    return {
      title: decoded[1] as string,
      creator: decoded[3] as string,
      endTime: decoded[5] as bigint,
      totalVotes: (decoded[8] as bigint) + (decoded[9] as bigint),
      creditRoot: decoded[7] as bigint,
    }
  } catch (e) {
    console.error('Failed to decode proposal:', e)
    return { title: '', creator: '', endTime: 0n, totalVotes: 0n, creditRoot: 0n }
  }
}
