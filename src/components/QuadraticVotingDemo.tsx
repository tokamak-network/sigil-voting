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
  ReferenceLine,
  Area,
  AreaChart,
  Line,
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

// Contract configuration - read from config.json
const ZK_VOTING_FINAL_ADDRESS = (config.contracts.zkVotingFinal || '0x0000000000000000000000000000000000000000') as `0x${string}`

const ZK_VOTING_FINAL_ABI = [
  {
    type: 'function',
    name: 'mintTestTokens',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getAvailableCredits',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'registerCreditRoot',
    inputs: [{ name: '_creditRoot', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerCreditNote',
    inputs: [{ name: '_creditNoteHash', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getRegisteredCreditNotes',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'proposalCountD2',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'castVoteD2',
    inputs: [
      { name: '_proposalId', type: 'uint256' },
      { name: '_commitment', type: 'uint256' },
      { name: '_numVotes', type: 'uint256' },
      { name: '_creditsSpent', type: 'uint256' },
      { name: '_nullifier', type: 'uint256' },
      { name: '_pA', type: 'uint256[2]' },
      { name: '_pB', type: 'uint256[2][2]' },
      { name: '_pC', type: 'uint256[2]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createProposalD2',
    inputs: [
      { name: '_title', type: 'string' },
      { name: '_description', type: 'string' },
      { name: '_creditRoot', type: 'uint256' },
      { name: '_votingDuration', type: 'uint256' },
      { name: '_revealDuration', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const

interface QuadraticVotingDemoProps {
  onBack?: () => void
}

export function QuadraticVotingDemo({ onBack }: QuadraticVotingDemoProps) {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { writeContractAsync } = useWriteContract()

  // ZK Identity State
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null)
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null)

  // Voting State
  const [numVotes, setNumVotes] = useState(10)
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null)
  const [isVoting, setIsVoting] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proofProgress, setProofProgress] = useState<ProofGenerationProgress | null>(null)

  // Contract deployed check
  const isContractDeployed = ZK_VOTING_FINAL_ADDRESS !== '0x0000000000000000000000000000000000000000'

  // Read user's available credits
  const { data: availableCredits, refetch: refetchCredits } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_FINAL_ABI,
    functionName: 'getAvailableCredits',
    args: address ? [address] : undefined,
    query: { enabled: isContractDeployed && !!address }
  })

  // Read registered credit notes
  const { data: registeredCreditNotes, refetch: refetchCreditNotes } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_FINAL_ABI,
    functionName: 'getRegisteredCreditNotes',
    query: { enabled: isContractDeployed }
  })

  const totalCredits = creditNote?.totalCredits ? Number(creditNote.totalCredits) : (availableCredits ? Number(availableCredits) : 10000)

  // Initialize ZK identity
  useEffect(() => {
    if (isConnected && address) {
      getOrCreateKeyPairAsync(address).then(setKeyPair)
      const stored = getStoredCreditNote(address)
      if (stored) setCreditNote(stored)
    }
  }, [isConnected, address])

  // Calculate quadratic cost
  const quadraticCost = numVotes * numVotes
  const remainingCredits = totalCredits - quadraticCost
  const maxVotes = Math.floor(Math.sqrt(totalCredits))

  // Generate chart data
  const chartData = useMemo(() => {
    const data = []
    for (let i = 1; i <= 100; i++) {
      data.push({
        votes: i,
        cost: i * i,
        linear: i * 100,
      })
    }
    return data
  }, [])

  // Whale comparison
  const whaleAnalysis = useMemo(() => {
    const smallHolder = {
      credits: 1000,
      maxVotes: Math.floor(Math.sqrt(1000)),
    }
    const whale = {
      credits: 100000,
      maxVotes: Math.floor(Math.sqrt(100000)),
    }
    return {
      smallHolder,
      whale,
      creditRatio: whale.credits / smallHolder.credits,
      voteRatio: whale.maxVotes / smallHolder.maxVotes,
    }
  }, [])

  // Initialize credits and create credit note
  const handleInitializeCredits = useCallback(async () => {
    if (!isConnected || !keyPair || !isContractDeployed) return

    setIsRegistering(true)
    setError(null)

    try {
      // Create credit note locally
      const newCreditNote = await createCreditNoteAsync(keyPair, BigInt(10000), address)
      setCreditNote(newCreditNote)

      // Register credit note on-chain
      await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditNote',
        args: [newCreditNote.creditNoteHash],
      })

      // Mint test tokens
      const hash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'mintTestTokens',
        args: [BigInt(10000)],
      })

      setTxHash(hash)
      await refetchCredits()
      await refetchCreditNotes()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRegistering(false)
    }
  }, [isConnected, keyPair, address, isContractDeployed, writeContractAsync, refetchCredits, refetchCreditNotes])

  // Cast D2 quadratic vote with ZK proof
  const handleCastVote = useCallback(async () => {
    if (!isConnected || selectedChoice === null || !keyPair || !creditNote) return
    if (quadraticCost > totalCredits) {
      setError('Insufficient credits')
      return
    }
    if (!isContractDeployed) {
      setError('Contract not deployed. Run: npm run deploy')
      return
    }

    setIsVoting(true)
    setError(null)
    setProofProgress({ stage: 'preparing', progress: 0, message: 'Preparing vote...' })

    try {
      const proposalId = BigInt(1) // Demo proposal

      // Prepare vote data
      const voteData = await prepareD2VoteAsync(keyPair, selectedChoice, BigInt(numVotes), proposalId)

      // Get registered credit notes
      const creditNotes = (registeredCreditNotes as bigint[]) || []

      if (creditNotes.length === 0) {
        throw new Error('No registered credit notes. Please initialize credits first.')
      }

      // Generate merkle root
      const { root: creditRoot } = await generateMerkleProofAsync(creditNotes, 0)

      // Register credit root if needed
      setProofProgress({ stage: 'preparing', progress: 10, message: 'Registering credit root...' })
      await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditRoot',
        args: [creditRoot],
      })

      // Generate ZK proof
      const { proof, nullifier, commitment } = await generateQuadraticProof(
        keyPair,
        creditNote,
        voteData,
        creditRoot,
        creditNotes,
        setProofProgress
      )

      // Submit vote to contract
      setProofProgress({ stage: 'finalizing', progress: 95, message: 'Submitting to blockchain...' })

      const hash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'castVoteD2',
        args: [
          proposalId,
          commitment,
          BigInt(numVotes),
          voteData.creditsSpent,
          nullifier,
          proof.pA,
          proof.pB,
          proof.pC,
        ],
        gas: BigInt(1000000),
      })

      setTxHash(hash)
      storeD2VoteForReveal(proposalId, voteData, address)
      await refetchCredits()

      setProofProgress({ stage: 'finalizing', progress: 100, message: 'Vote submitted!' })
    } catch (err) {
      console.error('D2 voting failed:', err)
      setError((err as Error).message)
      setProofProgress(null)
    } finally {
      setIsVoting(false)
    }
  }, [isConnected, selectedChoice, keyPair, creditNote, numVotes, quadraticCost, totalCredits, isContractDeployed, registeredCreditNotes, writeContractAsync, refetchCredits, address])

  const handleConnect = () => connect({ connector: injected() })

  return (
    <div className="quadratic-voting-demo">
      {onBack && (
        <button className="back-btn" onClick={onBack}>
          ← Back to Proposals
        </button>
      )}

      <div className="demo-header">
        <h1>D2: Quadratic Voting</h1>
        <p className="demo-subtitle">
          Prevent Whale Domination with Quadratic Costs
        </p>
        {!isContractDeployed && (
          <div className="contract-warning">
            Contract not deployed. Run: <code>npm run deploy</code>
          </div>
        )}
      </div>

      {/* Core Concept Section */}
      <section className="concept-section">
        <div className="concept-card highlight">
          <div className="concept-icon">
            <span style={{ fontSize: '2.5rem' }}>x²</span>
          </div>
          <h3>Core Formula</h3>
          <div className="formula-display">
            <code>Cost = Votes²</code>
          </div>
          <p>Each additional vote costs more than the last</p>
        </div>

        <div className="concept-examples">
          <div className="example-item">
            <span className="example-votes">1 Vote</span>
            <span className="example-arrow">→</span>
            <span className="example-cost">1 Credit</span>
          </div>
          <div className="example-item">
            <span className="example-votes">10 Votes</span>
            <span className="example-arrow">→</span>
            <span className="example-cost">100 Credits</span>
          </div>
          <div className="example-item whale-example">
            <span className="example-votes">100 Votes</span>
            <span className="example-arrow">→</span>
            <span className="example-cost danger">10,000 Credits</span>
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section className="interactive-section">
        <h2>Interactive Cost Calculator</h2>

        <div className="demo-layout">
          {/* Left: Slider and Calculator */}
          <div className="calculator-panel">
            {/* Wallet Connection */}
            {!isConnected ? (
              <div className="connect-prompt-qv">
                <p>Connect wallet to vote</p>
                <button className="connect-btn large" onClick={handleConnect}>
                  Connect Wallet
                </button>
              </div>
            ) : (
              <div className="wallet-info">
                <span className="wallet-label">Connected:</span>
                <code>{address?.slice(0, 6)}...{address?.slice(-4)}</code>
                {!creditNote && isContractDeployed && (
                  <button
                    className="mint-btn"
                    onClick={handleInitializeCredits}
                    disabled={isRegistering}
                  >
                    {isRegistering ? 'Initializing...' : 'Initialize 10,000 Credits'}
                  </button>
                )}
                {creditNote && (
                  <span className="credit-badge">Credits: {totalCredits.toLocaleString()}</span>
                )}
              </div>
            )}

            <div className="slider-container">
              <label className="slider-label">
                <span>Number of Votes</span>
                <span className="vote-count">{numVotes}</span>
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={numVotes}
                onChange={(e) => setNumVotes(Number(e.target.value))}
                className="vote-slider"
              />
              <div className="slider-marks">
                <span>1</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
            </div>

            <div className="cost-display">
              <div className="cost-main">
                <span className="cost-label">Required Cost</span>
                <span className={`cost-value ${quadraticCost > 5000 ? 'expensive' : ''}`}>
                  {quadraticCost.toLocaleString()} Credits
                </span>
              </div>
              <div className="cost-formula">
                <code>{numVotes} × {numVotes} = {quadraticCost}</code>
              </div>
            </div>

            <div className="credits-bar">
              <div className="credits-label">
                <span>Your Credits</span>
                <span>{totalCredits.toLocaleString()}</span>
              </div>
              <div className="credits-progress">
                <div
                  className={`credits-used ${quadraticCost > totalCredits ? 'overflow' : ''}`}
                  style={{ width: `${Math.min((quadraticCost / totalCredits) * 100, 100)}%` }}
                />
              </div>
              <div className="credits-info">
                <span className={remainingCredits < 0 ? 'negative' : ''}>
                  {remainingCredits >= 0
                    ? `${remainingCredits.toLocaleString()} remaining`
                    : `${Math.abs(remainingCredits).toLocaleString()} over budget!`}
                </span>
                <span className="max-votes">Max: {maxVotes} votes</span>
              </div>
            </div>

            {/* Vote Choice */}
            <div className="choice-preview">
              <h4>Select Your Choice</h4>
              <div className="choice-buttons">
                <button
                  className={`choice-btn for ${selectedChoice === CHOICE_FOR ? 'selected' : ''}`}
                  onClick={() => setSelectedChoice(CHOICE_FOR)}
                >
                  <span className="choice-icon">👍</span>
                  <span>For</span>
                </button>
                <button
                  className={`choice-btn against ${selectedChoice === CHOICE_AGAINST ? 'selected' : ''}`}
                  onClick={() => setSelectedChoice(CHOICE_AGAINST)}
                >
                  <span className="choice-icon">👎</span>
                  <span>Against</span>
                </button>
                <button
                  className={`choice-btn abstain ${selectedChoice === CHOICE_ABSTAIN ? 'selected' : ''}`}
                  onClick={() => setSelectedChoice(CHOICE_ABSTAIN)}
                >
                  <span className="choice-icon">⏸️</span>
                  <span>Abstain</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}

            {proofProgress && isVoting && (
              <div className="proof-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${proofProgress.progress}%` }}></div>
                </div>
                <p className="progress-message">{proofProgress.message}</p>
              </div>
            )}

            {txHash && !isVoting && (
              <div className="tx-success">
                <p>Vote submitted successfully!</p>
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Etherscan ↗
                </a>
              </div>
            )}

            {isConnected && selectedChoice !== null && quadraticCost <= totalCredits && creditNote && (
              <button
                className="submit-demo-btn active"
                onClick={handleCastVote}
                disabled={isVoting || !isContractDeployed}
              >
                {isVoting ? (
                  <>
                    <span className="spinner-small"></span>
                    Generating ZK Proof...
                  </>
                ) : (
                  <>
                    Cast {numVotes} Vote{numVotes > 1 ? 's' : ''} for {quadraticCost.toLocaleString()} Credits
                  </>
                )}
              </button>
            )}

            {(!isConnected || selectedChoice === null || quadraticCost > totalCredits || !creditNote) && (
              <button className="submit-demo-btn" disabled>
                {!isConnected
                  ? 'Connect Wallet to Vote'
                  : !creditNote
                  ? 'Initialize Credits First'
                  : selectedChoice === null
                  ? 'Select a Choice'
                  : 'Insufficient Credits'}
              </button>
            )}
          </div>

          {/* Right: Chart */}
          <div className="chart-panel">
            <h3>Cost Curve: Quadratic vs Linear</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="quadraticGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="votes"
                    stroke="#9ca3af"
                    label={{ value: 'Number of Votes', position: 'bottom', fill: '#9ca3af' }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    label={{ value: 'Cost (Credits)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    domain={[0, 10000]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#fff' }}
                    formatter={(value) => [
                      `${(value as number).toLocaleString()} Credits`,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="#ef4444"
                    strokeWidth={3}
                    fill="url(#quadraticGradient)"
                    name="cost"
                  />
                  <Line
                    type="monotone"
                    dataKey="linear"
                    stroke="#6b7280"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="linear"
                  />
                  <ReferenceLine
                    x={numVotes}
                    stroke="#fbbf24"
                    strokeWidth={2}
                    label={{
                      value: `${numVotes} votes`,
                      fill: '#fbbf24',
                      position: 'top',
                    }}
                  />
                  <ReferenceLine
                    y={quadraticCost}
                    stroke="#fbbf24"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-color quadratic"></span>
                <span>Quadratic Cost (x²) - D2 Spec</span>
              </div>
              <div className="legend-item">
                <span className="legend-color linear"></span>
                <span>Linear Cost (comparison)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color current"></span>
                <span>Your Selection</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Whale Comparison Section */}
      <section className="whale-section">
        <h2>Why Quadratic? Anti-Whale Protection</h2>

        <div className="whale-comparison">
          <div className="holder-card small-holder">
            <div className="holder-icon">👤</div>
            <h3>Small Holder</h3>
            <div className="holder-stats">
              <div className="stat">
                <span className="stat-label">Credits</span>
                <span className="stat-value">{whaleAnalysis.smallHolder.credits.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Max Votes</span>
                <span className="stat-value highlight">{whaleAnalysis.smallHolder.maxVotes}</span>
              </div>
            </div>
          </div>

          <div className="comparison-arrow">
            <div className="ratio-box">
              <div className="ratio-item">
                <span className="ratio-label">Credits</span>
                <span className="ratio-value">{whaleAnalysis.creditRatio}x</span>
              </div>
              <div className="ratio-item">
                <span className="ratio-label">Votes</span>
                <span className="ratio-value success">~{Math.round(whaleAnalysis.voteRatio)}x</span>
              </div>
            </div>
          </div>

          <div className="holder-card whale">
            <div className="holder-icon">🐋</div>
            <h3>Whale</h3>
            <div className="holder-stats">
              <div className="stat">
                <span className="stat-label">Credits</span>
                <span className="stat-value">{whaleAnalysis.whale.credits.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Max Votes</span>
                <span className="stat-value highlight">{whaleAnalysis.whale.maxVotes}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="whale-insight">
          <div className="insight-icon">💡</div>
          <div className="insight-text">
            <strong>Key Insight:</strong> A whale with 100x more credits only gets ~10x more votes!
            <br />
            This is the power of quadratic voting - it democratizes governance.
          </div>
        </div>
      </section>

      {/* ZK Privacy Section */}
      <section className="zk-section">
        <h2>ZK Privacy + Quadratic Voting</h2>
        <div className="zk-features">
          <div className="zk-feature">
            <div className="feature-icon">🔐</div>
            <h4>Hidden Choice</h4>
            <p>Your vote choice is encrypted until reveal</p>
          </div>
          <div className="zk-feature">
            <div className="feature-icon">✓</div>
            <h4>Verified Cost</h4>
            <p>ZK proof ensures cost = votes²</p>
          </div>
          <div className="zk-feature">
            <div className="feature-icon">🔥</div>
            <h4>Credit Burn</h4>
            <p>Spent credits are permanently burned</p>
          </div>
          <div className="zk-feature">
            <div className="feature-icon">🚫</div>
            <h4>No Double Vote</h4>
            <p>Nullifier prevents voting twice</p>
          </div>
        </div>
      </section>

      {/* D2 Spec Compliance */}
      <section className="spec-section">
        <h2>D2 Spec Compliance</h2>
        <div className="spec-checklist">
          <div className="spec-item">
            <span className="check">✓</span>
            <span>Quadratic cost calculation: voteCost = numVotes × numVotes</span>
          </div>
          <div className="spec-item">
            <span className="check">✓</span>
            <span>Credit note verification via Poseidon hash</span>
          </div>
          <div className="spec-item">
            <span className="check">✓</span>
            <span>Merkle proof for credit balance snapshot</span>
          </div>
          <div className="spec-item">
            <span className="check">✓</span>
            <span>Baby Jubjub ownership proof</span>
          </div>
          <div className="spec-item">
            <span className="check">✓</span>
            <span>Balance check: voteCost ≤ totalCredits</span>
          </div>
          <div className="spec-item">
            <span className="check">✓</span>
            <span>Nullifier = hash(sk, proposalId) for double-vote prevention</span>
          </div>
        </div>
      </section>
    </div>
  )
}
