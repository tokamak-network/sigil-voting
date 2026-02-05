import { useState, useEffect, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from './wagmi'
import { PRIVATE_VOTING_ADDRESS, PRIVATE_VOTING_ABI, CHOICE_FOR, CHOICE_AGAINST, CHOICE_ABSTAIN } from './contract'
import {
  getOrCreateKeyPair,
  createTokenNote,
  getStoredNote,
  prepareVote,
  generateVoteProof,
  storeVoteForReveal,
  getVoteForReveal,
  buildMerkleTree,
  generateMerkleProof,
  formatBigInt,
  getKeyInfo,
  type KeyPair,
  type TokenNote,
  type VoteData,
  type VoteChoice,
  type ProofGenerationProgress,
} from './zkproof'
import './App.css'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}

type Page = 'landing' | 'proposals' | 'proposal-detail' | 'create-proposal'
type ProposalPhase = 'commit' | 'reveal' | 'ended'
type ProposalStatus = 'active' | 'reveal' | 'passed' | 'defeated'

interface Proposal {
  id: string
  title: string
  description: string
  proposer: string
  merkleRoot: bigint
  endTime: Date
  revealEndTime: Date
  forVotes: number
  againstVotes: number
  abstainVotes: number
  totalCommitments: number
  revealedVotes: number
  phase: ProposalPhase
  status: ProposalStatus
}

// Demo merkle root (in production, this comes from token snapshot)
const DEMO_MERKLE_ROOT = 12345678901234567890n

function App() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  useWaitForTransactionReceipt({ hash: txHash })

  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [filter, setFilter] = useState<'all' | 'commit' | 'reveal' | 'ended'>('all')

  // ZK State
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null)
  const [tokenNote, setTokenNote] = useState<TokenNote | null>(null)
  const [votingPower, setVotingPower] = useState(350n) // Demo voting power

  // Voting State
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null)
  const [votingPhase, setVotingPhase] = useState<'select' | 'generating' | 'submitting' | 'committed' | 'revealing' | 'revealed'>('select')
  const [proofProgress, setProofProgress] = useState<ProofGenerationProgress | null>(null)
  const [currentVoteData, setCurrentVoteData] = useState<VoteData | null>(null)

  // Initialize ZK identity on connect
  useEffect(() => {
    if (isConnected && !keyPair) {
      const kp = getOrCreateKeyPair()
      setKeyPair(kp)

      // Create or restore token note
      let note = getStoredNote()
      if (!note) {
        note = createTokenNote(kp, votingPower)
      }
      setTokenNote(note)
    }
  }, [isConnected, keyPair, votingPower])

  // Demo proposals (in production, load from contract)
  useEffect(() => {
    const demoProposals: Proposal[] = [
      {
        id: '1',
        title: 'Increase Treasury Allocation',
        description: 'Proposal to increase treasury allocation from 10% to 15% of protocol fees.',
        proposer: '0x1234...5678',
        merkleRoot: DEMO_MERKLE_ROOT,
        endTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        revealEndTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        forVotes: 0,
        againstVotes: 0,
        abstainVotes: 0,
        totalCommitments: 12,
        revealedVotes: 0,
        phase: 'commit',
        status: 'active',
      },
      {
        id: '2',
        title: 'Add New Liquidity Pool',
        description: 'Add ETH/USDC liquidity pool to the protocol.',
        proposer: '0xabcd...ef01',
        merkleRoot: DEMO_MERKLE_ROOT,
        endTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
        revealEndTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        forVotes: 0,
        againstVotes: 0,
        abstainVotes: 0,
        totalCommitments: 45,
        revealedVotes: 23,
        phase: 'reveal',
        status: 'reveal',
      },
    ]
    setProposals(demoProposals)
  }, [])

  const handleSwitchNetwork = async () => {
    try {
      await switchChain({ chainId: sepolia.id })
    } catch (error) {
      console.error('Network switch failed:', error)
      if (window.ethereum) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0xaa36a7' }],
          })
        } catch (switchError: unknown) {
          if (switchError && typeof switchError === 'object' && 'code' in switchError && switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia',
                nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              }],
            })
          }
        }
      }
    }
  }

  const isCorrectChain = chainId === sepolia.id
  const shortenAddress = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)

  const getTimeRemaining = (endTime: Date) => {
    const now = new Date()
    const diff = endTime.getTime() - now.getTime()
    if (diff <= 0) return 'Ended'
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    if (days > 0) return `${days}d ${hours}h left`
    return `${hours}h left`
  }

  const getPhaseLabel = (phase: ProposalPhase) => {
    switch (phase) {
      case 'commit': return 'Commit Phase'
      case 'reveal': return 'Reveal Phase'
      case 'ended': return 'Ended'
    }
  }

  const getPhaseColor = (phase: ProposalPhase) => {
    switch (phase) {
      case 'commit': return 'phase-commit'
      case 'reveal': return 'phase-reveal'
      case 'ended': return 'phase-ended'
    }
  }

  const openProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setCurrentPage('proposal-detail')
    setVotingPhase('select')
    setSelectedChoice(null)
    setProofProgress(null)
    setCurrentVoteData(null)

    // Check if we have stored vote data for reveal
    const storedVote = getVoteForReveal(BigInt(proposal.id))
    if (storedVote && proposal.phase === 'reveal') {
      setVotingPhase('committed')
    }
  }

  // Commit Phase: Generate ZK proof and submit commitment
  const handleCommitVote = useCallback(async () => {
    if (!selectedChoice || !selectedProposal || !keyPair || !tokenNote) return

    setVotingPhase('generating')

    try {
      // Prepare vote data per D1 spec
      const proposalId = BigInt(selectedProposal.id)
      const choice = selectedChoice === 'for' ? CHOICE_FOR :
        selectedChoice === 'against' ? CHOICE_AGAINST : CHOICE_ABSTAIN

      // prepareVote now requires votingPower for commitment (D1 spec)
      const voteData = prepareVote(keyPair, choice as VoteChoice, tokenNote.noteValue, proposalId)
      setCurrentVoteData(voteData)

      // Build merkle tree and proof (demo: single note)
      const noteHashes = [tokenNote.noteHash]
      const { root } = buildMerkleTree(noteHashes)
      const { path, index } = generateMerkleProof(noteHashes, 0)

      // Generate ZK proof (4 public inputs per D1 spec)
      const { proof, nullifier } = await generateVoteProof(
        keyPair,
        tokenNote,
        voteData,
        root,
        path,
        index,
        setProofProgress
      )

      setVotingPhase('submitting')

      // Submit to contract
      const hash = await writeContractAsync({
        address: PRIVATE_VOTING_ADDRESS,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'commitVote',
        args: [
          proposalId,
          voteData.commitment,
          tokenNote.noteValue,
          voteData.nullifier,
          proof.pA,
          proof.pB,
          proof.pC,
        ],
      })

      setTxHash(hash)

      // Store vote data for reveal phase
      storeVoteForReveal(proposalId, voteData)

      setVotingPhase('committed')
    } catch (error) {
      console.error('Commit failed:', error)
      setVotingPhase('select')
      alert('Vote commit failed. Please try again.')
    }
  }, [selectedChoice, selectedProposal, keyPair, tokenNote, writeContractAsync])

  // Reveal Phase: Submit choice and salt
  const handleRevealVote = useCallback(async () => {
    if (!selectedProposal) return

    const proposalId = BigInt(selectedProposal.id)
    const storedVote = getVoteForReveal(proposalId)

    if (!storedVote) {
      alert('No committed vote found for this proposal.')
      return
    }

    setVotingPhase('revealing')

    try {
      const hash = await writeContractAsync({
        address: PRIVATE_VOTING_ADDRESS,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'revealVote',
        args: [
          proposalId,
          storedVote.nullifier,
          storedVote.choice,
          storedVote.voteSalt,
        ],
      })

      setTxHash(hash)
      setVotingPhase('revealed')
    } catch (error) {
      console.error('Reveal failed:', error)
      setVotingPhase('committed')
      alert('Vote reveal failed. Please try again.')
    }
  }, [selectedProposal, writeContractAsync])

  const filteredProposals = proposals.filter(p => {
    if (filter === 'all') return true
    return p.phase === filter
  })

  const handleConnect = () => connect({ connector: injected() })

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo" onClick={() => setCurrentPage('landing')}>
            <span className="logo-icon">🗳️</span>
            <span className="logo-text">ZK Vote</span>
            <span className="logo-badge">D1 Spec</span>
          </div>
          <nav className="nav">
            <button className={`nav-item ${currentPage === 'landing' ? 'active' : ''}`} onClick={() => setCurrentPage('landing')}>
              Home
            </button>
            <button className={`nav-item ${currentPage === 'proposals' ? 'active' : ''}`} onClick={() => setCurrentPage('proposals')}>
              Proposals
            </button>
          </nav>
        </div>

        <div className="header-right">
          {isConnected && keyPair && (
            <div className="identity-badge" title={`Public Key: ${formatBigInt(keyPair.pkX)}`}>
              <span className="identity-icon">🔑</span>
              <span className="identity-text">{getKeyInfo(keyPair).shortPk}</span>
            </div>
          )}
          {isConnected ? (
            <div className="wallet-connected">
              <span className={`chain-badge ${isCorrectChain ? 'correct' : 'wrong'}`}>
                {isCorrectChain ? 'Sepolia' : 'Wrong Network'}
              </span>
              {!isCorrectChain && (
                <button className="switch-btn" onClick={handleSwitchNetwork} disabled={isSwitching}>
                  {isSwitching ? 'Switching...' : 'Switch'}
                </button>
              )}
              <div className="wallet-info">
                <span className="voting-power-badge">{tokenNote ? tokenNote.noteValue.toString() : '0'} VP</span>
                <span className="wallet-address">{shortenAddress(address!)}</span>
              </div>
              <button className="disconnect-btn" onClick={() => disconnect()}>×</button>
            </div>
          ) : (
            <button className="connect-btn" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {/* Landing Page */}
        {currentPage === 'landing' && (
          <div className="landing-page">
            <section className="hero-section-new">
              <div className="hero-badge-new">D1 Private Voting Spec</div>
              <h1 className="hero-title-new">Commit-Reveal ZK Voting</h1>
              <p className="hero-subtitle-new">
                Zero-knowledge proofs for hidden ballot choices. Prevent vote buying and coercion while maintaining verifiable voting power.
              </p>

              <div className="stats-bar">
                <div className="stat-item-new">
                  <span className="stat-number">~150K</span>
                  <span className="stat-label-new">Circuit Constraints</span>
                </div>
                <div className="stat-divider"></div>
                <div className="stat-item-new">
                  <span className="stat-number">20</span>
                  <span className="stat-label-new">Merkle Depth</span>
                </div>
                <div className="stat-divider"></div>
                <div className="stat-item-new">
                  <span className="stat-number">6</span>
                  <span className="stat-label-new">Verification Stages</span>
                </div>
              </div>

              <div className="hero-cta-new">
                <button className="cta-primary-new" onClick={() => setCurrentPage('proposals')}>
                  Try Demo
                </button>
                <a href="https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md" target="_blank" rel="noopener noreferrer" className="cta-secondary-new">
                  View Spec
                </a>
              </div>
            </section>

            {/* Security Properties */}
            <section id="security" className="security-section">
              <h2>Security Properties</h2>
              <p className="section-subtitle">From the D1 specification</p>

              <div className="security-grid">
                <div className="security-card">
                  <div className="security-icon">🔒</div>
                  <h3>Ballot Privacy</h3>
                  <p>Choice hidden until reveal phase; observers cannot determine individual votes.</p>
                  <div className="security-tech">Commit-Reveal</div>
                </div>
                <div className="security-card">
                  <div className="security-icon">🛡️</div>
                  <h3>Anti-Coercion</h3>
                  <p>Voters cannot prove their selection to potential bribers.</p>
                  <div className="security-tech">ZK Proof</div>
                </div>
                <div className="security-card">
                  <div className="security-icon">🚫</div>
                  <h3>Double-Spend Prevention</h3>
                  <p>Nullifier derived from hash(sk, proposalId) prevents reuse.</p>
                  <div className="security-tech">Nullifier System</div>
                </div>
                <div className="security-card">
                  <div className="security-icon">📊</div>
                  <h3>Verifiable Voting Power</h3>
                  <p>Token ownership proven via merkle proof without revealing identity.</p>
                  <div className="security-tech">Snapshot Merkle Tree</div>
                </div>
                <div className="security-card">
                  <div className="security-icon">🔐</div>
                  <h3>Ownership Proof</h3>
                  <p>Secret key derives public key, proving note ownership.</p>
                  <div className="security-tech">Baby Jubjub</div>
                </div>
                <div className="security-card">
                  <div className="security-icon">✅</div>
                  <h3>On-Chain Verification</h3>
                  <p>Groth16 proofs verified by smart contract.</p>
                  <div className="security-tech">Groth16 Verifier</div>
                </div>
              </div>
            </section>

            {/* Circuit Verification Stages */}
            <section className="how-section">
              <h2>6 Verification Stages</h2>
              <div className="stages-grid">
                <div className="stage-card">
                  <div className="stage-number">1</div>
                  <h3>Token Verification</h3>
                  <p>Reconstruct note hash from key and value</p>
                  <code>noteHash = hash(pkX, pkY, value, salt)</code>
                </div>
                <div className="stage-card">
                  <div className="stage-number">2</div>
                  <h3>Snapshot Inclusion</h3>
                  <p>Validate token existence via merkle proof</p>
                  <code>verify(noteHash, merklePath, root)</code>
                </div>
                <div className="stage-card">
                  <div className="stage-number">3</div>
                  <h3>Ownership Proof</h3>
                  <p>Confirm secret key derives public key</p>
                  <code>pk = derive(sk)</code>
                </div>
                <div className="stage-card">
                  <div className="stage-number">4</div>
                  <h3>Power Consistency</h3>
                  <p>Ensure declared power matches note value</p>
                  <code>votingPower === noteValue</code>
                </div>
                <div className="stage-card">
                  <div className="stage-number">5</div>
                  <h3>Choice Validation</h3>
                  <p>Restrict vote to valid options</p>
                  <code>choice in [0, 1, 2]</code>
                </div>
                <div className="stage-card">
                  <div className="stage-number">6</div>
                  <h3>Commitment Creation</h3>
                  <p>Generate binding hash including proposal ID</p>
                  <code>commit = hash(choice, salt, id)</code>
                </div>
              </div>
            </section>

            {/* Commit-Reveal Flow */}
            <section className="compare-section">
              <h2>Commit-Reveal Flow</h2>
              <div className="flow-diagram">
                <div className="flow-phase">
                  <h3>Phase 1: Commit</h3>
                  <ul>
                    <li>Generate ZK proof of token ownership</li>
                    <li>Submit voteCommitment on-chain</li>
                    <li>Nullifier prevents double voting</li>
                    <li>Choice remains hidden</li>
                  </ul>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-phase">
                  <h3>Phase 2: Reveal</h3>
                  <ul>
                    <li>Submit choice and voteSalt</li>
                    <li>Contract verifies commitment</li>
                    <li>Vote counted in tally</li>
                    <li>Time-locked to prevent manipulation</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* CTA */}
            <section className="cta-section-new">
              <h2>Try the Demo</h2>
              <p>Experience ZK commit-reveal voting with the D1 specification.</p>
              <button className="cta-primary-new large" onClick={() => setCurrentPage('proposals')}>
                Launch Demo
              </button>
              <span className="network-note">Demo mode - Contract not yet deployed</span>
            </section>
          </div>
        )}

        {/* Proposals List */}
        {currentPage === 'proposals' && (
          <div className="proposals-page">
            <div className="page-header">
              <div className="page-title-section">
                <h1>Proposals</h1>
                <p className="page-subtitle">Vote with ZK proofs in commit-reveal phases</p>
              </div>
            </div>

            <div className="filter-bar">
              <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
              <button className={`filter-btn ${filter === 'commit' ? 'active' : ''}`} onClick={() => setFilter('commit')}>Commit Phase</button>
              <button className={`filter-btn ${filter === 'reveal' ? 'active' : ''}`} onClick={() => setFilter('reveal')}>Reveal Phase</button>
              <button className={`filter-btn ${filter === 'ended' ? 'active' : ''}`} onClick={() => setFilter('ended')}>Ended</button>
            </div>

            <div className="proposals-list">
              {filteredProposals.map(proposal => (
                <div key={proposal.id} className="proposal-card" onClick={() => openProposal(proposal)}>
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
              ))}
            </div>
          </div>
        )}

        {/* Proposal Detail */}
        {currentPage === 'proposal-detail' && selectedProposal && (
          <div className="proposal-detail-page">
            <button className="back-btn" onClick={() => setCurrentPage('proposals')}>← Back</button>

            <div className="proposal-detail-header">
              <div className="proposal-detail-meta">
                <span className="proposal-id">#{selectedProposal.id}</span>
                <span className={`proposal-phase ${getPhaseColor(selectedProposal.phase)}`}>
                  {getPhaseLabel(selectedProposal.phase)}
                </span>
              </div>
              <h1 className="proposal-detail-title">{selectedProposal.title}</h1>
              <div className="proposal-author">Proposer: <code>{selectedProposal.proposer}</code></div>
            </div>

            <div className="proposal-detail-content">
              <div className="proposal-detail-main">
                <section className="detail-section">
                  <h2>Description</h2>
                  <p>{selectedProposal.description}</p>
                </section>

                {/* Commit Phase UI */}
                {selectedProposal.phase === 'commit' && (
                  <section className="voting-section">
                    <h2>Commit Your Vote</h2>

                    <div className="phase-info">
                      <span className="phase-icon">📝</span>
                      <div>
                        <strong>Commit Phase</strong>
                        <p>Your choice is encrypted. Reveal it in the next phase.</p>
                      </div>
                      <span className="phase-timer">{getTimeRemaining(selectedProposal.endTime)}</span>
                    </div>

                    {!isConnected ? (
                      <div className="connect-prompt">
                        <p>Connect wallet to vote</p>
                        <button className="connect-btn large" onClick={handleConnect}>Connect Wallet</button>
                      </div>
                    ) : votingPhase === 'select' ? (
                      <>
                        {keyPair && (
                          <div className="identity-info">
                            <span className="identity-label">Your ZK Identity:</span>
                            <code>{getKeyInfo(keyPair).shortPk}</code>
                            <span className="identity-note">Voting Power: {tokenNote?.noteValue.toString() || '0'}</span>
                          </div>
                        )}

                        <div className="vote-options">
                          <button
                            className={`vote-option for ${selectedChoice === 'for' ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice('for' as unknown as VoteChoice)}
                          >
                            <span className="vote-icon">👍</span>
                            <span className="vote-label">For</span>
                          </button>
                          <button
                            className={`vote-option against ${selectedChoice === 'against' ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice('against' as unknown as VoteChoice)}
                          >
                            <span className="vote-icon">👎</span>
                            <span className="vote-label">Against</span>
                          </button>
                          <button
                            className={`vote-option abstain ${selectedChoice === 'abstain' ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice('abstain' as unknown as VoteChoice)}
                          >
                            <span className="vote-icon">⏸️</span>
                            <span className="vote-label">Abstain</span>
                          </button>
                        </div>

                        <div className="zk-notice">
                          <span className="zk-icon">🔐</span>
                          <div className="zk-text">
                            <strong>ZK Commit-Reveal</strong>
                            <p>Your choice will be hidden in a ZK proof. Reveal it in the next phase to be counted.</p>
                          </div>
                        </div>

                        <button
                          className="submit-vote-btn"
                          disabled={!selectedChoice}
                          onClick={handleCommitVote}
                        >
                          Generate Proof & Commit
                        </button>
                      </>
                    ) : votingPhase === 'generating' || votingPhase === 'submitting' ? (
                      <div className="proof-generation">
                        <div className="proof-animation">
                          <div className="proof-spinner"></div>
                        </div>
                        <h3>{votingPhase === 'generating' ? 'Generating ZK Proof' : 'Submitting Commitment'}</h3>
                        {proofProgress && (
                          <>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${proofProgress.progress}%` }}></div>
                            </div>
                            <p className="progress-message">{proofProgress.message}</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="vote-submitted">
                        <div className="success-icon">✅</div>
                        <h3>Vote Committed!</h3>
                        <div className="privacy-proof">
                          <div className="privacy-item">
                            <span className="privacy-label">Nullifier (public)</span>
                            <code>{currentVoteData ? formatBigInt(currentVoteData.nullifier) : 'N/A'}</code>
                          </div>
                          <div className="privacy-item secret">
                            <span className="privacy-label">Your choice (secret until reveal)</span>
                            <span className="secret-choice">Hidden</span>
                          </div>
                        </div>
                        <p className="reveal-reminder">Remember to reveal your vote in the next phase!</p>
                      </div>
                    )}
                  </section>
                )}

                {/* Reveal Phase UI */}
                {selectedProposal.phase === 'reveal' && (
                  <section className="voting-section">
                    <h2>Reveal Your Vote</h2>

                    <div className="phase-info reveal">
                      <span className="phase-icon">🔓</span>
                      <div>
                        <strong>Reveal Phase</strong>
                        <p>Reveal your committed vote to be counted in the tally.</p>
                      </div>
                      <span className="phase-timer">{getTimeRemaining(selectedProposal.revealEndTime)}</span>
                    </div>

                    {!isConnected ? (
                      <div className="connect-prompt">
                        <p>Connect wallet to reveal</p>
                        <button className="connect-btn large" onClick={handleConnect}>Connect Wallet</button>
                      </div>
                    ) : votingPhase === 'committed' || votingPhase === 'select' ? (
                      <>
                        {getVoteForReveal(BigInt(selectedProposal.id)) ? (
                          <>
                            <div className="reveal-info">
                              <p>You have a committed vote ready to reveal.</p>
                            </div>
                            <button className="submit-vote-btn" onClick={handleRevealVote}>
                              Reveal Vote
                            </button>
                          </>
                        ) : (
                          <div className="no-commitment">
                            <p>You did not commit a vote during the commit phase.</p>
                          </div>
                        )}
                      </>
                    ) : votingPhase === 'revealing' ? (
                      <div className="proof-generation">
                        <div className="proof-animation">
                          <div className="proof-spinner"></div>
                        </div>
                        <h3>Revealing Vote...</h3>
                      </div>
                    ) : (
                      <div className="vote-submitted">
                        <div className="success-icon">✅</div>
                        <h3>Vote Revealed!</h3>
                        <p>Your vote has been counted in the tally.</p>
                      </div>
                    )}
                  </section>
                )}

                {/* Ended Phase */}
                {selectedProposal.phase === 'ended' && (
                  <section className="voting-closed">
                    <h2>Voting Ended</h2>
                    <div className="final-result">
                      <span className={`result-badge ${selectedProposal.forVotes > selectedProposal.againstVotes ? 'passed' : 'defeated'}`}>
                        {selectedProposal.forVotes > selectedProposal.againstVotes ? '✅ Passed' : '❌ Defeated'}
                      </span>
                    </div>
                  </section>
                )}
              </div>

              {/* Sidebar */}
              <div className="proposal-detail-sidebar">
                <div className="sidebar-card">
                  <h3>Stats</h3>
                  <div className="info-list">
                    <div className="info-row">
                      <span className="info-label">Committed</span>
                      <span className="info-value">{selectedProposal.totalCommitments}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Revealed</span>
                      <span className="info-value">{selectedProposal.revealedVotes}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Commit Ends</span>
                      <span className="info-value">{selectedProposal.endTime.toLocaleDateString()}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Reveal Ends</span>
                      <span className="info-value">{selectedProposal.revealEndTime.toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {selectedProposal.phase === 'ended' && (
                  <div className="sidebar-card">
                    <h3>Results</h3>
                    <div className="results-breakdown">
                      <div className="result-row">
                        <span className="result-label">👍 For</span>
                        <span className="result-value">{selectedProposal.forVotes}</span>
                      </div>
                      <div className="result-row">
                        <span className="result-label">👎 Against</span>
                        <span className="result-value">{selectedProposal.againstVotes}</span>
                      </div>
                      <div className="result-row">
                        <span className="result-label">⏸️ Abstain</span>
                        <span className="result-value">{selectedProposal.abstainVotes}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="sidebar-card security-card">
                  <h3>🔐 D1 Spec</h3>
                  <div className="security-list">
                    <div className="security-item">
                      <span className="security-check">✓</span>
                      <span>Commit-Reveal</span>
                    </div>
                    <div className="security-item">
                      <span className="security-check">✓</span>
                      <span>ZK Proof of Ownership</span>
                    </div>
                    <div className="security-item">
                      <span className="security-check">✓</span>
                      <span>Nullifier System</span>
                    </div>
                    <div className="security-item">
                      <span className="security-check">✓</span>
                      <span>Merkle Snapshot</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <span>D1 Private Voting - tokamak-network/zk-dex</span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/tokamak-network/zk-dex" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="footer-divider">•</span>
          <a href="https://github.com/tokamak-network/zk-dex/blob/circom/docs/future/circuit-addons/d-governance/d1-private-voting.md" target="_blank" rel="noopener noreferrer">Spec</a>
        </div>
      </footer>
    </div>
  )
}

export default App
