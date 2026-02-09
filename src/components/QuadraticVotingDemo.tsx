import { useState, useMemo, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
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
  CHOICE_ABSTAIN,
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

type Step = 'connect' | 'setup' | 'proposal' | 'vote' | 'confirm' | 'success'

export function QuadraticVotingDemo({ onBack }: QuadraticVotingDemoProps) {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { writeContractAsync } = useWriteContract()

  // Step-based flow (Gitcoin style)
  const [currentStep, setCurrentStep] = useState<Step>('connect')

  // ZK Identity
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null)
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null)

  // Proposal State
  const [selectedProposal, setSelectedProposal] = useState<{id: number, title: string} | null>(null)
  const [newProposalTitle, setNewProposalTitle] = useState('')

  // Voting State
  const [numVotes, setNumVotes] = useState(1)
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [proofProgress, setProofProgress] = useState<ProofGenerationProgress | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isContractDeployed = ZK_VOTING_FINAL_ADDRESS !== '0x0000000000000000000000000000000000000000'

  // Read credits
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
  const remainingCredits = totalCredits - quadraticCost
  const maxVotes = Math.floor(Math.sqrt(totalCredits))
  const costEfficiency = numVotes > 0 ? (quadraticCost / numVotes).toFixed(1) : '0'

  // Initialize on connect
  useEffect(() => {
    if (isConnected && address) {
      getOrCreateKeyPairAsync(address).then(setKeyPair)
      const stored = getStoredCreditNote(address)
      if (stored) {
        setCreditNote(stored)
        setCurrentStep('proposal')
      } else {
        setCurrentStep('setup')
      }
    } else {
      setCurrentStep('connect')
    }
  }, [isConnected, address])

  // Chart data for cost visualization
  const chartData = useMemo(() => {
    const data = []
    for (let i = 1; i <= maxVotes + 10; i++) {
      data.push({ votes: i, cost: i * i })
    }
    return data
  }, [maxVotes])

  const handleConnect = () => connect({ connector: injected() })

  // Step 1: Initialize Credits
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

  // Step 2: Create or Select Proposal
  const handleCreateProposal = useCallback(async () => {
    if (!newProposalTitle.trim()) return
    setIsProcessing(true)
    setError(null)

    try {
      const creditNotes = (registeredCreditNotes as bigint[]) || []
      if (creditNotes.length === 0) throw new Error('No credit notes registered')

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
        args: [newProposalTitle, 'Quadratic voting proposal', creditRoot, BigInt(86400), BigInt(86400)],
      })

      setSelectedProposal({ id: 1, title: newProposalTitle })
      setCurrentStep('vote')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsProcessing(false)
    }
  }, [newProposalTitle, registeredCreditNotes, writeContractAsync])

  // Step 3: Cast Vote
  const handleCastVote = useCallback(async () => {
    if (selectedChoice === null || !keyPair || !creditNote || !selectedProposal) return
    if (quadraticCost > totalCredits) {
      setError('Insufficient credits')
      return
    }

    setIsProcessing(true)
    setError(null)
    setProofProgress({ stage: 'preparing', progress: 0, message: 'Preparing vote data...' })

    try {
      const proposalId = BigInt(selectedProposal.id)
      const voteData = await prepareD2VoteAsync(keyPair, selectedChoice, BigInt(numVotes), proposalId)
      const creditNotes = (registeredCreditNotes as bigint[]) || []

      if (creditNotes.length === 0) throw new Error('No registered credit notes')

      const { root: creditRoot } = await generateMerkleProofAsync(creditNotes, 0)

      setProofProgress({ stage: 'preparing', progress: 10, message: 'Registering credit root...' })
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

      setProofProgress({ stage: 'finalizing', progress: 95, message: 'Submitting to blockchain...' })

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
  }, [selectedChoice, keyPair, creditNote, selectedProposal, numVotes, quadraticCost, totalCredits, registeredCreditNotes, writeContractAsync, refetchCredits, address])

  // ============ RENDER ============
  return (
    <div className="qv-container">
      {onBack && (
        <button className="qv-back-btn" onClick={onBack}>← Back to Proposals</button>
      )}

      {/* Header with Voting Power (Snapshot style) */}
      <header className="qv-header">
        <div className="qv-header-left">
          <h1>D2: Quadratic Voting</h1>
          <p className="qv-tagline">Fair governance through quadratic costs</p>
        </div>
        {isConnected && creditNote && (
          <div className="qv-voting-power">
            <div className="qv-power-label">Your Voting Power</div>
            <div className="qv-power-value">{totalCredits.toLocaleString()}</div>
            <div className="qv-power-unit">credits</div>
          </div>
        )}
      </header>

      {/* Progress Steps */}
      <div className="qv-steps">
        <div className={`qv-step ${currentStep === 'connect' ? 'active' : creditNote ? 'done' : ''}`}>
          <div className="qv-step-num">{creditNote ? '✓' : '1'}</div>
          <div className="qv-step-label">Connect</div>
        </div>
        <div className="qv-step-line" />
        <div className={`qv-step ${currentStep === 'setup' ? 'active' : creditNote ? 'done' : ''}`}>
          <div className="qv-step-num">{creditNote ? '✓' : '2'}</div>
          <div className="qv-step-label">Setup</div>
        </div>
        <div className="qv-step-line" />
        <div className={`qv-step ${currentStep === 'proposal' ? 'active' : selectedProposal ? 'done' : ''}`}>
          <div className="qv-step-num">{selectedProposal ? '✓' : '3'}</div>
          <div className="qv-step-label">Proposal</div>
        </div>
        <div className="qv-step-line" />
        <div className={`qv-step ${currentStep === 'vote' || currentStep === 'confirm' ? 'active' : currentStep === 'success' ? 'done' : ''}`}>
          <div className="qv-step-num">{currentStep === 'success' ? '✓' : '4'}</div>
          <div className="qv-step-label">Vote</div>
        </div>
      </div>

      {/* Main Content */}
      <main className="qv-main">
        {/* Step: Connect Wallet */}
        {currentStep === 'connect' && (
          <div className="qv-step-content qv-connect">
            <div className="qv-card qv-card-center">
              <div className="qv-icon-large">🔗</div>
              <h2>Connect Your Wallet</h2>
              <p>Connect to participate in quadratic voting on Sepolia testnet</p>
              <button className="qv-btn qv-btn-primary qv-btn-large" onClick={handleConnect}>
                Connect Wallet
              </button>
            </div>
          </div>
        )}

        {/* Step: Setup Credits */}
        {currentStep === 'setup' && (
          <div className="qv-step-content qv-setup">
            <div className="qv-card qv-card-center">
              <div className="qv-icon-large">💰</div>
              <h2>Initialize Your Credits</h2>
              <p>Get 10,000 test credits to participate in quadratic voting</p>

              <div className="qv-credit-preview">
                <div className="qv-credit-amount">10,000</div>
                <div className="qv-credit-label">Test Credits</div>
              </div>

              <div className="qv-info-box">
                <div className="qv-info-row">
                  <span>Max votes with 10,000 credits:</span>
                  <strong>100 votes</strong>
                </div>
                <div className="qv-info-row">
                  <span>Cost formula:</span>
                  <strong>votes² = credits</strong>
                </div>
              </div>

              {error && <div className="qv-error">{error}</div>}

              <button
                className="qv-btn qv-btn-primary qv-btn-large"
                onClick={handleSetupCredits}
                disabled={isProcessing || !isContractDeployed}
              >
                {isProcessing ? 'Initializing...' : 'Get 10,000 Credits'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Create/Select Proposal */}
        {currentStep === 'proposal' && (
          <div className="qv-step-content qv-proposal">
            <div className="qv-card">
              <h2>Create a Proposal</h2>
              <p>What would you like the community to vote on?</p>

              <div className="qv-form-group">
                <label>Proposal Title</label>
                <input
                  type="text"
                  className="qv-input"
                  placeholder="e.g., Fund community development"
                  value={newProposalTitle}
                  onChange={(e) => setNewProposalTitle(e.target.value)}
                />
              </div>

              <div className="qv-info-box qv-info-box-muted">
                <p><strong>Voting Duration:</strong> 24 hours</p>
                <p><strong>Reveal Duration:</strong> 24 hours</p>
              </div>

              {error && <div className="qv-error">{error}</div>}

              <button
                className="qv-btn qv-btn-primary"
                onClick={handleCreateProposal}
                disabled={!newProposalTitle.trim() || isProcessing}
              >
                {isProcessing ? 'Creating...' : 'Create Proposal & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Vote with Quadratic Cost Visualization */}
        {currentStep === 'vote' && selectedProposal && (
          <div className="qv-step-content qv-vote">
            <div className="qv-vote-layout">
              {/* Left: Voting Panel */}
              <div className="qv-card qv-vote-panel">
                <div className="qv-proposal-badge">
                  <span className="qv-badge-id">#{selectedProposal.id}</span>
                  <span className="qv-badge-status">Active</span>
                </div>
                <h2>{selectedProposal.title}</h2>

                {/* Choice Selection */}
                <div className="qv-choice-section">
                  <h3>Your Choice</h3>
                  <div className="qv-choices">
                    <button
                      className={`qv-choice ${selectedChoice === CHOICE_FOR ? 'selected for' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_FOR)}
                    >
                      <span className="qv-choice-icon">👍</span>
                      <span>For</span>
                    </button>
                    <button
                      className={`qv-choice ${selectedChoice === CHOICE_AGAINST ? 'selected against' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_AGAINST)}
                    >
                      <span className="qv-choice-icon">👎</span>
                      <span>Against</span>
                    </button>
                    <button
                      className={`qv-choice ${selectedChoice === CHOICE_ABSTAIN ? 'selected abstain' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_ABSTAIN)}
                    >
                      <span className="qv-choice-icon">⏸️</span>
                      <span>Abstain</span>
                    </button>
                  </div>
                </div>

                {/* Vote Amount Slider */}
                <div className="qv-amount-section">
                  <h3>Number of Votes</h3>
                  <div className="qv-slider-container">
                    <input
                      type="range"
                      min="1"
                      max={maxVotes}
                      value={numVotes}
                      onChange={(e) => setNumVotes(Number(e.target.value))}
                      className="qv-slider"
                    />
                    <div className="qv-slider-value">{numVotes}</div>
                  </div>
                </div>

                {/* GITCOIN STYLE: Cost vs Voice Comparison */}
                <div className="qv-cost-voice-comparison">
                  <div className="qv-metric qv-metric-cost">
                    <div className="qv-metric-label">Your Cost</div>
                    <div className={`qv-metric-value ${quadraticCost > totalCredits * 0.5 ? 'warning' : ''} ${quadraticCost > totalCredits ? 'danger' : ''}`}>
                      {quadraticCost.toLocaleString()}
                    </div>
                    <div className="qv-metric-unit">credits</div>
                  </div>
                  <div className="qv-metric-divider">
                    <span className="qv-vs">vs</span>
                  </div>
                  <div className="qv-metric qv-metric-voice">
                    <div className="qv-metric-label">Your Voice</div>
                    <div className="qv-metric-value">{numVotes}</div>
                    <div className="qv-metric-unit">votes</div>
                  </div>
                </div>

                {/* Efficiency Warning (Gitcoin style pain point) */}
                <div className={`qv-efficiency ${Number(costEfficiency) > 10 ? 'inefficient' : ''}`}>
                  <div className="qv-efficiency-icon">
                    {Number(costEfficiency) > 10 ? '⚠️' : '💡'}
                  </div>
                  <div className="qv-efficiency-text">
                    <strong>{costEfficiency} credits per vote</strong>
                    {Number(costEfficiency) > 10 && (
                      <span className="qv-efficiency-warning">
                        High concentration! Consider spreading votes across proposals.
                      </span>
                    )}
                  </div>
                </div>

                {/* Credits Bar */}
                <div className="qv-credits-section">
                  <div className="qv-credits-header">
                    <span>Credit Usage</span>
                    <span>{remainingCredits.toLocaleString()} / {totalCredits.toLocaleString()} remaining</span>
                  </div>
                  <div className="qv-credits-bar">
                    <div
                      className={`qv-credits-fill ${quadraticCost > totalCredits ? 'overflow' : ''}`}
                      style={{ width: `${Math.min((quadraticCost / totalCredits) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* ZK Privacy Notice (Snapshot style) */}
                <div className="qv-privacy-notice">
                  <div className="qv-privacy-icon">🔐</div>
                  <div className="qv-privacy-text">
                    <strong>Private Vote</strong>
                    <span>Your choice is encrypted until reveal phase</span>
                  </div>
                </div>

                {error && <div className="qv-error">{error}</div>}

                {proofProgress && (
                  <div className="qv-progress">
                    <div className="qv-progress-bar">
                      <div className="qv-progress-fill" style={{ width: `${proofProgress.progress}%` }} />
                    </div>
                    <p className="qv-progress-text">{proofProgress.message}</p>
                  </div>
                )}

                <button
                  className="qv-btn qv-btn-primary qv-btn-large"
                  disabled={selectedChoice === null || quadraticCost > totalCredits || isProcessing}
                  onClick={handleCastVote}
                >
                  {isProcessing
                    ? 'Generating ZK Proof...'
                    : selectedChoice === null
                      ? 'Select a choice'
                      : quadraticCost > totalCredits
                        ? 'Insufficient Credits'
                        : `Cast ${numVotes} Vote${numVotes > 1 ? 's' : ''} for ${quadraticCost} Credits`
                  }
                </button>
              </div>

              {/* Right: Cost Curve Chart */}
              <div className="qv-card qv-chart-panel">
                <h3>Quadratic Cost Curve</h3>
                <p className="qv-chart-subtitle">See how costs grow exponentially</p>

                <div className="qv-chart-container">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="votes" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value) => [`${value} credits`, 'Cost']}
                        labelFormatter={(label) => `${label} votes`}
                      />
                      <Area type="monotone" dataKey="cost" stroke="#ef4444" fill="url(#costGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Quick Reference */}
                <div className="qv-quick-ref">
                  <h4>Quick Reference</h4>
                  <div className="qv-ref-grid">
                    <div className="qv-ref-item"><span>1 vote</span><span>1 credit</span></div>
                    <div className="qv-ref-item"><span>5 votes</span><span>25 credits</span></div>
                    <div className="qv-ref-item"><span>10 votes</span><span>100 credits</span></div>
                    <div className="qv-ref-item"><span>50 votes</span><span>2,500 credits</span></div>
                    <div className="qv-ref-item highlight"><span>100 votes</span><span>10,000 credits</span></div>
                  </div>
                </div>

                {/* Anti-Whale Explanation */}
                <div className="qv-antiwhale">
                  <h4>Why Quadratic?</h4>
                  <p>
                    A whale with <strong>100x more credits</strong> only gets <strong>~10x more votes</strong>.
                    This prevents plutocracy and encourages broad participation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Success */}
        {currentStep === 'success' && (
          <div className="qv-step-content qv-success">
            <div className="qv-card qv-card-center">
              <div className="qv-success-icon">✅</div>
              <h2>Vote Committed!</h2>
              <p className="qv-success-subtitle">Your vote has been encrypted and submitted</p>

              <div className="qv-success-details">
                <div className="qv-detail-row">
                  <span className="qv-detail-label">Proposal</span>
                  <span className="qv-detail-value">{selectedProposal?.title}</span>
                </div>
                <div className="qv-detail-row">
                  <span className="qv-detail-label">Votes Cast</span>
                  <span className="qv-detail-value">{numVotes}</span>
                </div>
                <div className="qv-detail-row">
                  <span className="qv-detail-label">Credits Spent</span>
                  <span className="qv-detail-value">{quadraticCost}</span>
                </div>
                <div className="qv-detail-row qv-detail-hidden">
                  <span className="qv-detail-label">Your Choice</span>
                  <span className="qv-detail-value">🔐 Hidden until reveal</span>
                </div>
              </div>

              {txHash && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="qv-tx-link"
                >
                  View on Etherscan ↗
                </a>
              )}

              <div className="qv-next-steps">
                <h4>What's Next?</h4>
                <p>Return during the <strong>Reveal Phase</strong> to reveal your vote and see the results.</p>
              </div>

              <button
                className="qv-btn qv-btn-secondary"
                onClick={() => {
                  setCurrentStep('proposal')
                  setSelectedProposal(null)
                  setNewProposalTitle('')
                  setSelectedChoice(null)
                  setNumVotes(1)
                  setTxHash(null)
                }}
              >
                Create Another Proposal
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
