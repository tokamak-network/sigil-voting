import { useState, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from './wagmi'
import { PRIVATE_VOTING_ADDRESS, PRIVATE_VOTING_ABI, CHOICE_FOR, CHOICE_AGAINST, CHOICE_ABSTAIN } from './contract'
import {
  prepareVote,
  generateVoteProof,
  storeVoteForReveal,
  getVoteForReveal,
  generateMerkleProofAsync,
  findVoterIndex,
  formatBigInt,
  getKeyInfo,
  type VoteChoice,
  type VoteData,
  type ProofGenerationProgress,
} from './zkproof'
import { Header, Footer, Toast, VoteConfirmModal, LandingPage, ProposalCard, QuadraticVotingDemo } from './components'
import { useProposals, useZkIdentity } from './hooks'
import { getTimeRemaining, getPhaseLabel, getPhaseColor, getVotePercentages } from './utils'
import type { Page, Proposal } from './types'
import './App.css'

function App() {
  const { address, isConnected, chainId } = useAccount()
  const { connect } = useConnect()
  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  useWaitForTransactionReceipt({ hash: txHash })

  // Page State
  const [currentPage, setCurrentPage] = useState<Page>('landing')
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [filter, setFilter] = useState<'all' | 'commit' | 'reveal' | 'ended'>('all')

  // ZK Identity
  const {
    keyPair,
    tokenNote,
    isVoterRegistered,
    setIsVoterRegistered,
    refetchRegisteredVoters,
  } = useZkIdentity(address, isConnected)

  // Proposals
  const { proposals, proposalCount, refetchProposals } = useProposals()

  // Voting State
  const [selectedChoice, setSelectedChoice] = useState<VoteChoice | null>(null)
  const [votingPhase, setVotingPhase] = useState<'select' | 'generating' | 'submitting' | 'committed' | 'revealing' | 'revealed'>('select')
  const [proofProgress, setProofProgress] = useState<ProofGenerationProgress | null>(null)
  const [currentVoteData, setCurrentVoteData] = useState<VoteData | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Create Proposal State
  const [newProposalTitle, setNewProposalTitle] = useState('')
  const [newProposalDescription, setNewProposalDescription] = useState('')
  const [isCreatingProposal, setIsCreatingProposal] = useState(false)
  const [createProposalStep, setCreateProposalStep] = useState<'idle' | 'registering' | 'waiting' | 'creating' | 'success' | 'error'>('idle')
  const [createProposalError, setCreateProposalError] = useState<string | null>(null)

  // Vote status
  const [hasAlreadyVoted, setHasAlreadyVoted] = useState(false)
  const [checkingVoteStatus, setCheckingVoteStatus] = useState(false)
  const [isEligible, setIsEligible] = useState(true)
  const [isRegisteringVoter, setIsRegisteringVoter] = useState(false)

  const isCorrectChain = chainId === sepolia.id

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleConnect = () => connect({ connector: injected() })

  const openProposal = async (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setCurrentPage('proposal-detail')
    setVotingPhase('select')
    setSelectedChoice(null)
    setProofProgress(null)
    setCurrentVoteData(null)
    setHasAlreadyVoted(false)
    setIsEligible(true)

    const storedVote = getVoteForReveal(BigInt(proposal.id), address)
    if (storedVote && proposal.phase === 'reveal') {
      setVotingPhase('committed')
    }

    if (keyPair && tokenNote && proposal.phase === 'commit') {
      setCheckingVoteStatus(true)
      try {
        const storedVoteData = getVoteForReveal(BigInt(proposal.id), address)
        if (storedVoteData) {
          setHasAlreadyVoted(true)
          setVotingPhase('committed')
        }
        setIsEligible(true)
      } catch (error) {
        console.error('Failed to check vote status:', error)
      } finally {
        setCheckingVoteStatus(false)
      }
    }
  }

  const handleCommitVote = useCallback(async () => {
    if (selectedChoice === null || !selectedProposal || !keyPair || !tokenNote) return

    setShowConfirmModal(false)
    setVotingPhase('generating')
    setProofProgress({ stage: 'preparing', progress: 0, message: 'Preparing vote...' })

    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      const proposalId = BigInt(selectedProposal.id)
      const voteData = prepareVote(keyPair, selectedChoice as VoteChoice, tokenNote.noteValue, proposalId)
      setCurrentVoteData(voteData)

      // Auto-register if not registered
      if (!isVoterRegistered) {
        setProofProgress({ stage: 'preparing', progress: 5, message: 'Registering as voter...' })
        await writeContractAsync({
          address: PRIVATE_VOTING_ADDRESS,
          abi: PRIVATE_VOTING_ABI,
          functionName: 'registerVoter',
          args: [tokenNote.noteHash],
          gas: BigInt(100000),
        })
        setIsVoterRegistered(true)
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      // Fetch current registered voters
      setProofProgress({ stage: 'preparing', progress: 10, message: 'Fetching voter list...' })
      const { data: allVoters } = await refetchRegisteredVoters()
      const registeredVoters = (allVoters as bigint[]) || []

      if (registeredVoters.length === 0) {
        throw new Error('No registered voters found')
      }

      let voterIndex = findVoterIndex(registeredVoters, tokenNote.noteHash)
      if (voterIndex === -1) {
        registeredVoters.push(tokenNote.noteHash)
        voterIndex = registeredVoters.length - 1
      }

      const { root: newMerkleRoot } = await generateMerkleProofAsync(registeredVoters, voterIndex)

      let proposalMerkleRoot = selectedProposal.merkleRoot
      if (newMerkleRoot !== proposalMerkleRoot) {
        setProofProgress({ stage: 'preparing', progress: 15, message: 'Updating proposal voters...' })
        await writeContractAsync({
          address: PRIVATE_VOTING_ADDRESS,
          abi: PRIVATE_VOTING_ABI,
          functionName: 'updateProposalVoters',
          args: [proposalId, newMerkleRoot],
          gas: BigInt(500000),
        })
        proposalMerkleRoot = newMerkleRoot
        await new Promise(resolve => setTimeout(resolve, 3000))
        await refetchProposals()
      }

      const { proof, nullifier, commitment } = await generateVoteProof(
        keyPair,
        tokenNote,
        voteData,
        proposalMerkleRoot,
        registeredVoters,
        voterIndex,
        setProofProgress
      )

      voteData.commitment = commitment
      voteData.nullifier = nullifier
      setCurrentVoteData({ ...voteData, commitment, nullifier })

      setVotingPhase('submitting')

      const hash = await writeContractAsync({
        address: PRIVATE_VOTING_ADDRESS,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'commitVote',
        args: [
          proposalId,
          commitment,
          tokenNote.noteValue,
          nullifier,
          proof.pA,
          proof.pB,
          proof.pC,
        ],
        gas: BigInt(1000000),
      })

      setTxHash(hash)
      storeVoteForReveal(proposalId, voteData, address)
      await refetchProposals()

      setVotingPhase('committed')
      showToast('Vote committed successfully! ZK proof verified on-chain.', 'success')
    } catch (error) {
      console.error('Commit failed:', error)
      setVotingPhase('select')
      showToast('Vote commit failed. Please try again.', 'error')
    }
  }, [selectedChoice, selectedProposal, keyPair, tokenNote, writeContractAsync, refetchProposals, refetchRegisteredVoters, isVoterRegistered, setIsVoterRegistered, address])

  const handleRevealVote = useCallback(async () => {
    if (!selectedProposal) return

    const proposalId = BigInt(selectedProposal.id)
    const storedVote = getVoteForReveal(proposalId, address)

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
        args: [proposalId, storedVote.nullifier, storedVote.choice, storedVote.voteSalt],
      })

      setTxHash(hash)
      await refetchProposals()

      setVotingPhase('revealed')
      showToast('Vote revealed! Your choice has been counted.', 'success')
    } catch (error) {
      console.error('Reveal failed:', error)
      setVotingPhase('committed')
      showToast('Vote reveal failed. Please try again.', 'error')
    }
  }, [selectedProposal, writeContractAsync, refetchProposals, address])

  const handleCreateProposal = async () => {
    if (!isConnected || !isCorrectChain) return

    setIsCreatingProposal(true)
    setCreateProposalError(null)
    setCreateProposalStep('registering')

    try {
      const { data: voters } = await refetchRegisteredVoters()
      const registeredVoters = voters as bigint[] | undefined

      if (!registeredVoters || registeredVoters.length === 0) {
        throw new Error('No registered voters. Please wait for voter registration to complete.')
      }

      const { root: computedMerkleRoot } = await generateMerkleProofAsync(registeredVoters, 0)

      const merkleRootHash = await writeContractAsync({
        address: PRIVATE_VOTING_ADDRESS,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'registerMerkleRoot',
        args: [computedMerkleRoot],
        gas: BigInt(100000),
      })

      setCreateProposalStep('waiting')
      await waitForTransaction(merkleRootHash)

      setCreateProposalStep('creating')
      const votingDuration = BigInt(3 * 24 * 60 * 60)
      const revealDuration = BigInt(1 * 24 * 60 * 60)

      const hash = await writeContractAsync({
        address: PRIVATE_VOTING_ADDRESS,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'createProposal',
        args: [newProposalTitle, newProposalDescription, computedMerkleRoot, votingDuration, revealDuration],
        gas: BigInt(500000),
      })

      setTxHash(hash)
      setCreateProposalStep('success')

      await waitForTransaction(hash)

      showToast('Proposal created successfully!', 'success')
      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      console.error('Failed to create proposal:', error)
      setCreateProposalStep('error')
      setCreateProposalError((error as Error).message || 'Failed to create proposal.')
    } finally {
      setIsCreatingProposal(false)
    }
  }

  const filteredProposals = proposals.filter(p => filter === 'all' || p.phase === filter)

  return (
    <div className="app">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showConfirmModal && selectedProposal && (
        <VoteConfirmModal
          proposal={selectedProposal}
          selectedChoice={selectedChoice}
          tokenNote={tokenNote}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleCommitVote}
        />
      )}

      <Header
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        keyPair={keyPair}
        tokenNote={tokenNote}
        isVoterRegistered={isVoterRegistered}
        isRegisteringVoter={isRegisteringVoter}
        setIsRegisteringVoter={setIsRegisteringVoter}
        setIsVoterRegistered={setIsVoterRegistered}
        showToast={showToast}
      />

      <main className="main">
        {currentPage === 'landing' && <LandingPage setCurrentPage={setCurrentPage} />}

        {currentPage === 'quadratic-voting' && (
          <QuadraticVotingDemo onBack={() => setCurrentPage('proposals')} />
        )}

        {currentPage === 'proposals' && (
          <div className="proposals-page">
            <div className="page-header">
              <div className="page-title-section">
                <h1>Proposals</h1>
                <p className="page-subtitle">Vote with ZK proofs in commit-reveal phases</p>
              </div>
              {isConnected && (
                <button className="create-proposal-btn" onClick={() => setCurrentPage('create-proposal')}>
                  + Create Proposal
                </button>
              )}
            </div>

            <div className="filter-bar">
              <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
              <button className={`filter-btn ${filter === 'commit' ? 'active' : ''}`} onClick={() => setFilter('commit')}>Commit Phase</button>
              <button className={`filter-btn ${filter === 'reveal' ? 'active' : ''}`} onClick={() => setFilter('reveal')}>Reveal Phase</button>
              <button className={`filter-btn ${filter === 'ended' ? 'active' : ''}`} onClick={() => setFilter('ended')}>Ended</button>
            </div>

            <div className="proposals-list">
              {proposalCount === undefined ? (
                <div className="empty-proposals"><p>Loading proposals from Sepolia...</p></div>
              ) : filteredProposals.length === 0 ? (
                <div className="empty-proposals">
                  <p>No proposals yet. {isConnected ? 'Create the first one!' : 'Connect wallet to create one.'}</p>
                </div>
              ) : (
                filteredProposals.map(proposal => (
                  <ProposalCard key={proposal.id} proposal={proposal} onClick={() => openProposal(proposal)} />
                ))
              )}
            </div>
          </div>
        )}

        {currentPage === 'create-proposal' && (
          <div className="create-proposal-page">
            <button className="back-btn" onClick={() => setCurrentPage('proposals')}>← Back</button>
            <div className="create-proposal-header">
              <h1>Create Proposal</h1>
              <p>Create a new governance proposal for ZK private voting</p>
            </div>
            <div className="create-proposal-form">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={newProposalTitle}
                  onChange={(e) => setNewProposalTitle(e.target.value)}
                  placeholder="Enter proposal title"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newProposalDescription}
                  onChange={(e) => setNewProposalDescription(e.target.value)}
                  placeholder="Describe your proposal in detail"
                  className="form-textarea"
                  rows={6}
                />
              </div>
              <div className="form-info">
                <div className="info-item">
                  <span className="info-icon">⏱️</span>
                  <div><strong>Commit Phase: 3 days</strong><p>Voters submit hidden commitments</p></div>
                </div>
                <div className="info-item">
                  <span className="info-icon">🔓</span>
                  <div><strong>Reveal Phase: 1 day</strong><p>Voters reveal their choices</p></div>
                </div>
              </div>

              {createProposalStep !== 'idle' && createProposalStep !== 'error' && (
                <div className="create-progress">
                  <div className="progress-steps">
                    <div className={`progress-step ${createProposalStep === 'registering' ? 'active' : 'done'}`}>
                      <div className="step-indicator">{createProposalStep === 'registering' ? <span className="spinner"></span> : '✓'}</div>
                      <span>Register Merkle Root</span>
                    </div>
                    <div className={`progress-step ${createProposalStep === 'waiting' ? 'active' : ['creating', 'success'].includes(createProposalStep) ? 'done' : ''}`}>
                      <div className="step-indicator">{createProposalStep === 'waiting' ? <span className="spinner"></span> : ['creating', 'success'].includes(createProposalStep) ? '✓' : '2'}</div>
                      <span>Confirm Transaction</span>
                    </div>
                    <div className={`progress-step ${createProposalStep === 'creating' ? 'active' : createProposalStep === 'success' ? 'done' : ''}`}>
                      <div className="step-indicator">{createProposalStep === 'creating' ? <span className="spinner"></span> : createProposalStep === 'success' ? '✓' : '3'}</div>
                      <span>Create Proposal</span>
                    </div>
                  </div>
                  {createProposalStep === 'registering' && <p className="progress-message">Please approve the Merkle Root registration in MetaMask.</p>}
                  {createProposalStep === 'waiting' && <p className="progress-message">Waiting for transaction to be included in block...</p>}
                  {createProposalStep === 'creating' && <p className="progress-message">Please approve the Proposal creation in MetaMask.</p>}
                  {createProposalStep === 'success' && <p className="progress-message success">Proposal created successfully!</p>}
                </div>
              )}

              {createProposalError && (
                <div className="create-error">
                  <p>{createProposalError}</p>
                  <button onClick={() => { setCreateProposalError(null); setCreateProposalStep('idle'); }}>Try Again</button>
                </div>
              )}

              <button
                className="submit-proposal-btn"
                disabled={!newProposalTitle || !newProposalDescription || isCreatingProposal || !isConnected || !isCorrectChain}
                onClick={handleCreateProposal}
              >
                {isCreatingProposal ? 'Creating...' : 'Create Proposal'}
              </button>
              <p className="demo-notice">Proposals are created on Sepolia testnet. Make sure you have Sepolia ETH.</p>
            </div>
          </div>
        )}

        {currentPage === 'proposal-detail' && selectedProposal && (
          <ProposalDetailView
            proposal={selectedProposal}
            keyPair={keyPair}
            tokenNote={tokenNote}
            isConnected={isConnected}
            selectedChoice={selectedChoice}
            setSelectedChoice={setSelectedChoice}
            votingPhase={votingPhase}
            proofProgress={proofProgress}
            currentVoteData={currentVoteData}
            txHash={txHash}
            hasAlreadyVoted={hasAlreadyVoted}
            checkingVoteStatus={checkingVoteStatus}
            isEligible={isEligible}
            onBack={() => setCurrentPage('proposals')}
            onConnect={handleConnect}
            onOpenConfirmModal={() => setShowConfirmModal(true)}
            onRevealVote={handleRevealVote}
            onCreateProposal={() => setCurrentPage('create-proposal')}
            address={address}
          />
        )}
      </main>

      <Footer />
    </div>
  )
}

// Helper function for waiting for transaction
async function waitForTransaction(hash: string) {
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    try {
      const receipt = await fetch('https://ethereum-sepolia-rpc.publicnode.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [hash],
          id: 1
        })
      }).then(r => r.json())
      if (receipt.result && receipt.result.blockNumber) break
    } catch { /* ignore */ }
  }
}

// Proposal Detail View Component
interface ProposalDetailViewProps {
  proposal: Proposal
  keyPair: any
  tokenNote: any
  isConnected: boolean
  selectedChoice: VoteChoice | null
  setSelectedChoice: (choice: VoteChoice | null) => void
  votingPhase: string
  proofProgress: ProofGenerationProgress | null
  currentVoteData: VoteData | null
  txHash: string | undefined
  hasAlreadyVoted: boolean
  checkingVoteStatus: boolean
  isEligible: boolean
  onBack: () => void
  onConnect: () => void
  onOpenConfirmModal: () => void
  onRevealVote: () => void
  onCreateProposal: () => void
  address: string | undefined
}

function ProposalDetailView({
  proposal,
  keyPair,
  tokenNote,
  isConnected,
  selectedChoice,
  setSelectedChoice,
  votingPhase,
  proofProgress,
  currentVoteData,
  txHash,
  hasAlreadyVoted,
  checkingVoteStatus,
  isEligible,
  onBack,
  onConnect,
  onOpenConfirmModal,
  onRevealVote,
  onCreateProposal,
  address,
}: ProposalDetailViewProps) {
  return (
    <div className="proposal-detail-page">
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="proposal-detail-header">
        <div className="proposal-detail-meta">
          <span className="proposal-id">#{proposal.id}</span>
          <span className={`proposal-phase ${getPhaseColor(proposal.phase)}`}>
            {getPhaseLabel(proposal.phase)}
          </span>
        </div>
        <h1 className="proposal-detail-title">{proposal.title}</h1>
        <div className="proposal-author">Proposer: <code>{proposal.proposer}</code></div>
      </div>

      <div className="proposal-detail-content">
        <div className="proposal-detail-main">
          <section className="detail-section">
            <h2>Description</h2>
            <p>{proposal.description}</p>
          </section>

          {proposal.phase === 'commit' && (
            <CommitPhaseSection
              proposal={proposal}
              keyPair={keyPair}
              tokenNote={tokenNote}
              isConnected={isConnected}
              selectedChoice={selectedChoice}
              setSelectedChoice={setSelectedChoice}
              votingPhase={votingPhase}
              proofProgress={proofProgress}
              currentVoteData={currentVoteData}
              txHash={txHash}
              hasAlreadyVoted={hasAlreadyVoted}
              checkingVoteStatus={checkingVoteStatus}
              isEligible={isEligible}
              onConnect={onConnect}
              onOpenConfirmModal={onOpenConfirmModal}
              onCreateProposal={onCreateProposal}
            />
          )}

          {proposal.phase === 'reveal' && (
            <RevealPhaseSection
              proposal={proposal}
              isConnected={isConnected}
              votingPhase={votingPhase}
              onConnect={onConnect}
              onRevealVote={onRevealVote}
              address={address}
            />
          )}

          {proposal.phase === 'ended' && (
            <section className="voting-closed">
              <h2>Voting Ended</h2>
              <div className="final-result">
                <span className={`result-badge ${proposal.forVotes > proposal.againstVotes ? 'passed' : 'defeated'}`}>
                  {proposal.forVotes > proposal.againstVotes ? '✅ Passed' : '❌ Defeated'}
                </span>
              </div>
            </section>
          )}
        </div>

        <ProposalSidebar proposal={proposal} />
      </div>
    </div>
  )
}

// Commit Phase Section
function CommitPhaseSection({
  proposal,
  keyPair,
  tokenNote,
  isConnected,
  selectedChoice,
  setSelectedChoice,
  votingPhase,
  proofProgress,
  currentVoteData,
  txHash,
  hasAlreadyVoted,
  checkingVoteStatus,
  isEligible,
  onConnect,
  onOpenConfirmModal,
  onCreateProposal,
}: any) {
  return (
    <section className="voting-section">
      <h2>Commit Your Vote</h2>
      <div className="phase-info">
        <span className="phase-icon">📝</span>
        <div><strong>Commit Phase</strong><p>Your choice is encrypted. Reveal it in the next phase.</p></div>
        <span className="phase-timer">{getTimeRemaining(proposal.endTime)}</span>
      </div>

      {!isConnected ? (
        <div className="connect-prompt">
          <p>Connect wallet to vote</p>
          <button className="connect-btn large" onClick={onConnect}>Connect Wallet</button>
        </div>
      ) : checkingVoteStatus ? (
        <div className="checking-status">
          <div className="proof-spinner"></div>
          <p>Checking vote status...</p>
        </div>
      ) : hasAlreadyVoted ? (
        <div className="vote-submitted">
          <div className="success-icon">✅</div>
          <h3>Already Voted</h3>
          <p className="success-subtitle">You have already committed a vote for this proposal.</p>
          <div className="next-steps">
            <h4>Next Steps</h4>
            <p>Come back during the <strong>Reveal Phase</strong> to reveal your choice.</p>
          </div>
        </div>
      ) : !isEligible ? (
        <div className="not-eligible">
          <div className="not-eligible-icon">🚫</div>
          <h3>Not Eligible</h3>
          <p className="not-eligible-subtitle">Your ZK identity is not in this proposal's voter snapshot.</p>
          <button className="submit-vote-btn" onClick={onCreateProposal}>Create Your Proposal</button>
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
            <button className={`vote-option for ${selectedChoice === CHOICE_FOR ? 'selected' : ''}`} onClick={() => setSelectedChoice(CHOICE_FOR)}>
              <span className="vote-icon">👍</span><span className="vote-label">For</span>
            </button>
            <button className={`vote-option against ${selectedChoice === CHOICE_AGAINST ? 'selected' : ''}`} onClick={() => setSelectedChoice(CHOICE_AGAINST)}>
              <span className="vote-icon">👎</span><span className="vote-label">Against</span>
            </button>
            <button className={`vote-option abstain ${selectedChoice === CHOICE_ABSTAIN ? 'selected' : ''}`} onClick={() => setSelectedChoice(CHOICE_ABSTAIN)}>
              <span className="vote-icon">⏸️</span><span className="vote-label">Abstain</span>
            </button>
          </div>
          <div className="zk-notice">
            <span className="zk-icon">🔐</span>
            <div className="zk-text"><strong>ZK Commit-Reveal</strong><p>Your choice will be hidden in a ZK proof.</p></div>
          </div>
          <button className="submit-vote-btn" disabled={selectedChoice === null} onClick={onOpenConfirmModal}>Continue to Vote</button>
        </>
      ) : votingPhase === 'generating' || votingPhase === 'submitting' ? (
        <div className="proof-generation">
          <div className="proof-animation"><div className="proof-spinner"></div></div>
          <h3>{votingPhase === 'generating' ? 'Generating ZK Proof' : 'Submitting Commitment'}</h3>
          {proofProgress && (
            <>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${proofProgress.progress}%` }}></div></div>
              <p className="progress-message">{proofProgress.message}</p>
            </>
          )}
        </div>
      ) : (
        <div className="vote-submitted">
          <div className="success-icon">✅</div>
          <h3>Vote Committed!</h3>
          <p className="success-subtitle">Your ZK proof was verified on-chain</p>
          <div className="privacy-proof">
            <div className="privacy-item"><span className="privacy-label">Voting Power</span><span className="privacy-value">{tokenNote?.noteValue.toString() || '0'}</span></div>
            <div className="privacy-item secret"><span className="privacy-label">Your Choice</span><span className="secret-choice">🔐 Hidden until reveal</span></div>
            <div className="privacy-item"><span className="privacy-label">Nullifier</span><code>{currentVoteData ? formatBigInt(currentVoteData.nullifier) : 'N/A'}</code></div>
            {txHash && (
              <div className="privacy-item"><span className="privacy-label">Transaction</span><a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="tx-link">View on Etherscan ↗</a></div>
            )}
          </div>
          <div className="next-steps"><h4>Next Steps</h4><p>Come back during the <strong>Reveal Phase</strong> to reveal your choice.</p></div>
        </div>
      )}
    </section>
  )
}

// Reveal Phase Section
function RevealPhaseSection({ proposal, isConnected, votingPhase, onConnect, onRevealVote, address }: any) {
  return (
    <section className="voting-section">
      <h2>Reveal Your Vote</h2>
      <div className="phase-info reveal">
        <span className="phase-icon">🔓</span>
        <div><strong>Reveal Phase</strong><p>Reveal your committed vote to be counted.</p></div>
        <span className="phase-timer">{getTimeRemaining(proposal.revealEndTime)}</span>
      </div>

      {!isConnected ? (
        <div className="connect-prompt">
          <p>Connect wallet to reveal</p>
          <button className="connect-btn large" onClick={onConnect}>Connect Wallet</button>
        </div>
      ) : votingPhase === 'committed' || votingPhase === 'select' ? (
        getVoteForReveal(BigInt(proposal.id), address) ? (
          <>
            <div className="reveal-info"><p>You have a committed vote ready to reveal.</p></div>
            <button className="submit-vote-btn" onClick={onRevealVote}>Reveal Vote</button>
          </>
        ) : (
          <div className="no-commitment"><p>You did not commit a vote during the commit phase.</p></div>
        )
      ) : votingPhase === 'revealing' ? (
        <div className="proof-generation"><div className="proof-animation"><div className="proof-spinner"></div></div><h3>Revealing Vote...</h3></div>
      ) : (
        <div className="vote-submitted"><div className="success-icon">✅</div><h3>Vote Revealed!</h3><p>Your vote has been counted.</p></div>
      )}
    </section>
  )
}

// Proposal Sidebar
function ProposalSidebar({ proposal }: { proposal: Proposal }) {
  return (
    <div className="proposal-detail-sidebar">
      <div className="sidebar-card">
        <h3>Stats</h3>
        <div className="info-list">
          <div className="info-row"><span className="info-label">Committed</span><span className="info-value">{proposal.totalCommitments}</span></div>
          <div className="info-row"><span className="info-label">Revealed</span><span className="info-value">{proposal.revealedVotes}</span></div>
          <div className="info-row"><span className="info-label">Commit Ends</span><span className="info-value">{proposal.endTime.toLocaleDateString()}</span></div>
          <div className="info-row"><span className="info-label">Reveal Ends</span><span className="info-value">{proposal.revealEndTime.toLocaleDateString()}</span></div>
        </div>
      </div>

      {proposal.phase === 'commit' && (
        <div className="sidebar-card results-card">
          <h3>Results</h3>
          <div className="privacy-shield">
            <div className="privacy-shield-icon">🔒</div>
            <h4>Results Hidden</h4>
            <p>Vote results will be revealed after the <strong>reveal phase ends</strong>.</p>
            <div className="reveal-progress"><span className="reveal-count">{proposal.totalCommitments}</span><span className="reveal-label">votes committed</span></div>
          </div>
        </div>
      )}

      {proposal.phase === 'reveal' && (
        <div className="sidebar-card results-card">
          <h3>Results</h3>
          <div className="privacy-shield">
            <div className="privacy-shield-icon">🔒</div>
            <h4>Results Hidden</h4>
            <p>Vote results are hidden until the <strong>reveal phase ends</strong>.</p>
            <div className="reveal-progress"><span className="reveal-count">{proposal.revealedVotes} / {proposal.totalCommitments}</span><span className="reveal-label">votes revealed</span></div>
            <p className="privacy-note">Participants must reveal their votes before the deadline.</p>
          </div>
        </div>
      )}

      {proposal.phase === 'ended' && (
        <div className="sidebar-card results-card">
          <h3>Final Results</h3>
          <div className="results-breakdown">
            <ResultItem label="👍 For" percent={getVotePercentages(proposal).for} count={proposal.forVotes} type="for" />
            <ResultItem label="👎 Against" percent={getVotePercentages(proposal).against} count={proposal.againstVotes} type="against" />
            <ResultItem label="⏸️ Abstain" percent={getVotePercentages(proposal).abstain} count={proposal.abstainVotes} type="abstain" />
          </div>
          <div className="results-total"><span>Total Votes</span><span>{proposal.forVotes + proposal.againstVotes + proposal.abstainVotes}</span></div>
          <div className="anonymity-set"><span className="anonymity-label">Total Committed</span><span className="anonymity-value">{proposal.totalCommitments}</span></div>
        </div>
      )}

      <div className="sidebar-card security-card">
        <h3>🔐 D1 Spec</h3>
        <div className="security-list">
          <div className="security-item"><span className="security-check">✓</span><span>Commit-Reveal</span></div>
          <div className="security-item"><span className="security-check">✓</span><span>ZK Proof of Ownership</span></div>
          <div className="security-item"><span className="security-check">✓</span><span>Nullifier System</span></div>
          <div className="security-item"><span className="security-check">✓</span><span>Merkle Snapshot</span></div>
        </div>
      </div>
    </div>
  )
}

function ResultItem({ label, percent, count, type }: { label: string; percent: number; count: number; type: string }) {
  return (
    <div className="result-item">
      <div className="result-header">
        <span className="result-label">{label}</span>
        <span className="result-stats"><span className="result-percent">{percent}%</span><span className="result-count">{count} votes</span></span>
      </div>
      <div className="result-bar"><div className={`result-bar-fill ${type}`} style={{ width: `${percent}%` }}></div></div>
    </div>
  )
}

export default App
