import { useState, useEffect, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract, useReadContracts } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { sepolia } from './wagmi'
import { PRIVATE_VOTING_ADDRESS, PRIVATE_VOTING_ABI, CHOICE_FOR, CHOICE_AGAINST, CHOICE_ABSTAIN } from './contract'
import {
  getOrCreateKeyPairAsync,
  createTokenNoteAsync,
  getStoredNote,
  prepareVote,
  generateVoteProof,
  storeVoteForReveal,
  getVoteForReveal,
  generateMerkleProofAsync,
  findVoterIndex,
  formatBigInt,
  getKeyInfo,
  preloadCrypto,
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
  const votingPower = 350n // Demo voting power

  // Voting State - using bigint VoteChoice directly
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

  // Already voted state
  const [hasAlreadyVoted, setHasAlreadyVoted] = useState(false)
  const [checkingVoteStatus, setCheckingVoteStatus] = useState(false)

  // Eligibility state (merkle root match) - reset when proposal changes
  const [isEligible, setIsEligible] = useState(true)

  // Reset eligibility when proposal changes
  useEffect(() => {
    setIsEligible(true)
  }, [selectedProposal?.id])

  // Voter registration state
  const [isVoterRegistered, setIsVoterRegistered] = useState(false)
  const [isRegisteringVoter, setIsRegisteringVoter] = useState(false)

  // Pre-load crypto on mount
  useEffect(() => {
    preloadCrypto()
  }, [])

  // Track current address for change detection
  const [currentAddress, setCurrentAddress] = useState<string | undefined>()

  // Reset ZK identity when wallet address changes
  useEffect(() => {
    if (address !== currentAddress) {
      setKeyPair(null)
      setTokenNote(null)
      setIsVoterRegistered(false)
      setIsEligible(true)
      setCurrentAddress(address)
    }
  }, [address, currentAddress])

  // Initialize ZK identity on connect or address change
  useEffect(() => {
    if (isConnected && address && !keyPair) {
      // Use async initialization to get proper pkX, pkY
      const initIdentity = async () => {
        // Pass wallet address to get wallet-specific keypair
        const kp = await getOrCreateKeyPairAsync(address)
        setKeyPair(kp)
        console.log('[App] KeyPair initialized for', address, ', pkX:', kp.pkX.toString().slice(0, 20) + '...')

        // Try to restore existing note for this wallet, or create new one
        let note = getStoredNote(address)

        // Verify the stored note matches current keypair
        if (note && note.pkX === kp.pkX && note.pkY === kp.pkY) {
          console.log('[App] Token note restored from storage, noteHash:', note.noteHash.toString().slice(0, 20) + '...')
        } else {
          // Create new note (stored note missing or keypair changed)
          note = await createTokenNoteAsync(kp, votingPower, 1n, address)
          console.log('[App] Token note created, noteHash:', note.noteHash.toString().slice(0, 20) + '...')
        }
        setTokenNote(note)
      }
      initIdentity()
    }
  }, [isConnected, keyPair, votingPower, address])

  // Load proposals from on-chain contract
  // Read proposal count from contract
  const { data: proposalCount, refetch: refetchProposalCount } = useReadContract({
    address: PRIVATE_VOTING_ADDRESS,
    abi: PRIVATE_VOTING_ABI,
    functionName: 'proposalCount',
  })

  // Read registered voters from contract
  const { refetch: refetchRegisteredVoters } = useReadContract({
    address: PRIVATE_VOTING_ADDRESS,
    abi: PRIVATE_VOTING_ABI,
    functionName: 'getRegisteredVoters',
  })

  // Check if current user's noteHash is registered
  const { data: isUserRegistered, refetch: refetchIsUserRegistered } = useReadContract({
    address: PRIVATE_VOTING_ADDRESS,
    abi: PRIVATE_VOTING_ABI,
    functionName: 'isVoterRegistered',
    args: tokenNote ? [tokenNote.noteHash] : undefined,
    query: { enabled: !!tokenNote && tokenNote.noteHash !== 0n },
  })

  // Generate contract calls for all proposals
  const proposalCalls = proposalCount && Number(proposalCount) > 0
    ? Array.from({ length: Number(proposalCount) }, (_, i) => ({
        address: PRIVATE_VOTING_ADDRESS as `0x${string}`,
        abi: PRIVATE_VOTING_ABI,
        functionName: 'getProposal' as const,
        args: [BigInt(i + 1)],
      }))
    : []

  // Read all proposals
  const { data: proposalsData, refetch: refetchProposals } = useReadContracts({
    contracts: proposalCalls,
  })

  // Convert on-chain data to Proposal type
  useEffect(() => {
    if (proposalsData && proposalsData.length > 0) {
      const loadedProposals: Proposal[] = proposalsData
        .filter((result) => result.status === 'success' && result.result !== undefined)
        .map((result) => {
          const data = result.result as [
            bigint, string, string, string, bigint, bigint, bigint,
            bigint, bigint, bigint, bigint, bigint, number
          ]
          const [
            id, title, description, proposer, merkleRoot, endTime, revealEndTime,
            forVotes, againstVotes, abstainVotes, totalCommitments, revealedVotes, phaseNum
          ] = data

          const now = Date.now()
          const endTimeMs = Number(endTime) * 1000
          const revealEndTimeMs = Number(revealEndTime) * 1000

          let phase: ProposalPhase
          if (phaseNum === 0 || now < endTimeMs) {
            phase = 'commit'
          } else if (phaseNum === 1 || now < revealEndTimeMs) {
            phase = 'reveal'
          } else {
            phase = 'ended'
          }

          let status: ProposalStatus
          if (phase === 'commit') {
            status = 'active'
          } else if (phase === 'reveal') {
            status = 'reveal'
          } else {
            status = Number(forVotes) > Number(againstVotes) ? 'passed' : 'defeated'
          }

          return {
            id: id.toString(),
            title,
            description,
            proposer,
            merkleRoot,
            endTime: new Date(endTimeMs),
            revealEndTime: new Date(revealEndTimeMs),
            forVotes: Number(forVotes),
            againstVotes: Number(againstVotes),
            abstainVotes: Number(abstainVotes),
            totalCommitments: Number(totalCommitments),
            revealedVotes: Number(revealedVotes),
            phase,
            status,
          }
        })
      setProposals(loadedProposals)
    }
  }, [proposalsData])

  // Refresh proposals after transaction
  const _refreshProposals = useCallback(() => {
    refetchProposalCount()
    refetchProposals()
  }, [refetchProposalCount, refetchProposals])
  void _refreshProposals // suppress unused warning

  const isCorrectChain = chainId === sepolia.id

  // Update voter registration status
  useEffect(() => {
    if (isUserRegistered !== undefined) {
      setIsVoterRegistered(isUserRegistered as boolean)
    }
  }, [isUserRegistered])

  // Check if voter is already registered on mount/address change
  useEffect(() => {
    const checkRegistration = async () => {
      if (!tokenNote || tokenNote.noteHash === 0n) {
        console.log('[App] No tokenNote, skipping registration check')
        return
      }
      console.log('[App] Checking registration for noteHash:', tokenNote.noteHash.toString().slice(0, 20) + '...')
      const { data: alreadyRegistered } = await refetchIsUserRegistered()
      console.log('[App] Registration status:', alreadyRegistered)
      if (alreadyRegistered) {
        setIsVoterRegistered(true)
      } else {
        setIsVoterRegistered(false)
      }
    }
    checkRegistration()
  }, [tokenNote, refetchIsUserRegistered])

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

  // Calculate vote percentages
  const getVotePercentages = (proposal: Proposal) => {
    const total = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes
    if (total === 0) return { for: 0, against: 0, abstain: 0 }
    return {
      for: Math.round((proposal.forVotes / total) * 100),
      against: Math.round((proposal.againstVotes / total) * 100),
      abstain: Math.round((proposal.abstainVotes / total) * 100)
    }
  }

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Get choice label
  const getChoiceLabel = (choice: VoteChoice | null) => {
    if (choice === CHOICE_FOR) return 'For'
    if (choice === CHOICE_AGAINST) return 'Against'
    if (choice === CHOICE_ABSTAIN) return 'Abstain'
    return 'None'
  }

  const openProposal = async (proposal: Proposal) => {
    setSelectedProposal(proposal)
    setCurrentPage('proposal-detail')
    setVotingPhase('select')
    setSelectedChoice(null)
    setProofProgress(null)
    setCurrentVoteData(null)
    setHasAlreadyVoted(false)
    setIsEligible(true) // Reset eligibility

    // Check if we have stored vote data for reveal
    const storedVote = getVoteForReveal(BigInt(proposal.id), address)
    if (storedVote && proposal.phase === 'reveal') {
      setVotingPhase('committed')
    }

    // Check vote status (eligibility check happens during proof generation)
    if (keyPair && tokenNote && proposal.phase === 'commit') {
      setCheckingVoteStatus(true)
      try {
        // Quick check: if there's stored vote data, user has already voted
        const storedVoteData = getVoteForReveal(BigInt(proposal.id), address)
        if (storedVoteData) {
          setHasAlreadyVoted(true)
          setVotingPhase('committed')
        }
        // Skip slow merkle root computation - eligibility checked during proof generation
        setIsEligible(true)
      } catch (error) {
        console.error('Failed to check vote status:', error)
      } finally {
        setCheckingVoteStatus(false)
      }
    }
  }

  // Open confirmation modal before voting
  const openVoteConfirmation = () => {
    if (selectedChoice === null) return
    setShowConfirmModal(true)
  }

  // Commit Phase: Generate ZK proof and submit commitment
  const handleCommitVote = useCallback(async () => {
    if (selectedChoice === null || !selectedProposal || !keyPair || !tokenNote) return

    setShowConfirmModal(false)
    setVotingPhase('generating')
    setProofProgress({ stage: 'preparing', progress: 0, message: 'Preparing vote...' })

    // UI가 업데이트될 시간을 줌
    await new Promise(resolve => setTimeout(resolve, 100))

    try {
      // Prepare vote data per D1 spec
      const proposalId = BigInt(selectedProposal.id)
      // selectedChoice is already VoteChoice (bigint: 0n, 1n, 2n)
      const choice = selectedChoice

      // prepareVote now requires votingPower for commitment (D1 spec)
      const voteData = prepareVote(keyPair, choice as VoteChoice, tokenNote.noteValue, proposalId)
      setCurrentVoteData(voteData)

      // Step 1: Auto-register if not registered
      if (!isVoterRegistered) {
        setProofProgress({ stage: 'preparing', progress: 5, message: 'Registering as voter...' })
        console.log('[Vote] Auto-registering voter...')
        await writeContractAsync({
          address: PRIVATE_VOTING_ADDRESS,
          abi: PRIVATE_VOTING_ABI,
          functionName: 'registerVoter',
          args: [tokenNote.noteHash],
          gas: BigInt(100000),
        })
        setIsVoterRegistered(true)
        // Wait for tx confirmation
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      // Step 2: Fetch current registered voters
      setProofProgress({ stage: 'preparing', progress: 10, message: 'Fetching voter list...' })
      const { data: allVoters } = await refetchRegisteredVoters()
      const registeredVoters = (allVoters as bigint[]) || []

      console.log('[Vote] All registered voters:', registeredVoters.length)

      if (registeredVoters.length === 0) {
        throw new Error('No registered voters found')
      }

      // Step 3: Check if user is in the list
      let voterIndex = findVoterIndex(registeredVoters, tokenNote.noteHash)

      if (voterIndex === -1) {
        // User just registered, add to list manually
        registeredVoters.push(tokenNote.noteHash)
        voterIndex = registeredVoters.length - 1
      }

      // Step 4: Compute new merkle root from ALL current voters
      const { root: newMerkleRoot } = await generateMerkleProofAsync(registeredVoters, voterIndex)
      console.log('[Vote] Computed merkle root:', newMerkleRoot.toString())

      // Step 5: Update proposal if merkle root doesn't match
      let proposalMerkleRoot = selectedProposal.merkleRoot
      if (newMerkleRoot !== proposalMerkleRoot) {
        setProofProgress({ stage: 'preparing', progress: 15, message: 'Updating proposal voters...' })
        console.log('[Vote] Updating proposal voter snapshot...')
        await writeContractAsync({
          address: PRIVATE_VOTING_ADDRESS,
          abi: PRIVATE_VOTING_ABI,
          functionName: 'updateProposalVoters',
          args: [proposalId, newMerkleRoot],
          gas: BigInt(500000),
        })
        proposalMerkleRoot = newMerkleRoot
        // Wait for tx confirmation
        await new Promise(resolve => setTimeout(resolve, 3000))
        // Refresh proposal data
        await refetchProposals()
      }

      console.log('[Vote] Proposal merkle root:', proposalMerkleRoot.toString())
      console.log('[Vote] User noteHash:', tokenNote.noteHash.toString())
      console.log('[Vote] Voter index:', voterIndex)
      console.log('[Vote] Total voters:', registeredVoters.length)

      console.log('[Vote] Proposal merkle root:', proposalMerkleRoot.toString())
      console.log('[Vote] User noteHash:', tokenNote.noteHash.toString())
      console.log('[Vote] Voter index:', voterIndex)
      console.log('[Vote] Total registered voters:', registeredVoters.length)

      // Generate ZK proof with registered voters list
      const { proof, nullifier, commitment } = await generateVoteProof(
        keyPair,
        tokenNote,
        voteData,
        proposalMerkleRoot,
        registeredVoters, // Pass all registered voters
        voterIndex,
        setProofProgress
      )

      // Update voteData with actual computed values
      voteData.commitment = commitment
      voteData.nullifier = nullifier
      setCurrentVoteData({ ...voteData, commitment, nullifier })

      setVotingPhase('submitting')

      // Submit to contract
      console.log('[Vote] Submitting to contract:', {
        proposalId: proposalId.toString(),
        commitment: commitment.toString(),
        votingPower: tokenNote.noteValue.toString(),
        nullifier: nullifier.toString(),
      })

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
        gas: BigInt(1000000), // Explicit gas limit
      })

      setTxHash(hash)

      // Store vote data for reveal phase (per wallet address)
      storeVoteForReveal(proposalId, voteData, address)

      // Refresh on-chain data
      await refetchProposals()

      setVotingPhase('committed')
      showToast('Vote committed successfully! ZK proof verified on-chain.', 'success')
    } catch (error) {
      console.error('Commit failed:', error)
      setVotingPhase('select')
      showToast('Vote commit failed. Please try again.', 'error')
    }
  }, [selectedChoice, selectedProposal, keyPair, tokenNote, writeContractAsync, refetchProposals, refetchRegisteredVoters, isVoterRegistered, address])

  // Reveal Phase: Submit choice and salt
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
        args: [
          proposalId,
          storedVote.nullifier,
          storedVote.choice,
          storedVote.voteSalt,
        ],
      })

      setTxHash(hash)

      // Refresh on-chain data to show updated results
      await refetchProposals()

      setVotingPhase('revealed')
      showToast('Vote revealed! Your choice has been counted.', 'success')
    } catch (error) {
      console.error('Reveal failed:', error)
      setVotingPhase('committed')
      showToast('Vote reveal failed. Please try again.', 'error')
    }
  }, [selectedProposal, writeContractAsync, refetchProposals])

  const filteredProposals = proposals.filter(p => {
    if (filter === 'all') return true
    return p.phase === filter
  })

  const handleConnect = () => connect({ connector: injected() })

  return (
    <div className="app">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* Vote Confirmation Modal */}
      {showConfirmModal && selectedProposal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Your Vote</h3>
              <button className="modal-close" onClick={() => setShowConfirmModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="confirm-proposal">
                <span className="confirm-label">Proposal</span>
                <span className="confirm-value">{selectedProposal.title}</span>
              </div>
              <div className="confirm-choice">
                <span className="confirm-label">Your Choice</span>
                <span className={`confirm-value choice-${getChoiceLabel(selectedChoice).toLowerCase()}`}>
                  {selectedChoice === CHOICE_FOR && '👍 '}
                  {selectedChoice === CHOICE_AGAINST && '👎 '}
                  {selectedChoice === CHOICE_ABSTAIN && '⏸️ '}
                  {getChoiceLabel(selectedChoice)}
                </span>
              </div>
              <div className="confirm-power">
                <span className="confirm-label">Voting Power</span>
                <span className="confirm-value">{tokenNote?.noteValue.toString() || '0'}</span>
              </div>
              <div className="confirm-warning">
                <span className="warning-icon">⚠️</span>
                <div className="warning-text">
                  <strong>ZK Proof Generation</strong>
                  <p>This process takes 30-60 seconds. Please do not close the browser.</p>
                </div>
              </div>
              <div className="confirm-privacy">
                <span className="privacy-icon">🔐</span>
                <div className="privacy-text">
                  <strong>Privacy Protected</strong>
                  <p>Your choice is hidden until the reveal phase. No one can see how you voted.</p>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="modal-btn confirm" onClick={handleCommitVote}>
                Generate Proof & Vote
              </button>
            </div>
          </div>
        </div>
      )}

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
              {isVoterRegistered && <span className="registered-badge" title="Registered Voter">✓</span>}
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
              <button
                className="reset-btn"
                title="Reset ZK Identity"
                onClick={() => {
                  if (confirm('ZK Identity 초기화하시겠습니까?')) {
                    localStorage.clear()
                    window.location.reload()
                  }
                }}
              >↺</button>
              {!isVoterRegistered && !isRegisteringVoter && tokenNote && tokenNote.noteHash !== 0n && (
                <button
                  className="register-voter-btn"
                  onClick={async () => {
                    if (!tokenNote || tokenNote.noteHash === 0n) return
                    setIsRegisteringVoter(true)
                    try {
                      await writeContractAsync({
                        address: PRIVATE_VOTING_ADDRESS,
                        abi: PRIVATE_VOTING_ABI,
                        functionName: 'registerVoter',
                        args: [tokenNote.noteHash],
                        gas: BigInt(100000),
                      })
                      setIsVoterRegistered(true)
                      showToast('Voter registered successfully!', 'success')
                    } catch (error) {
                      if (!(error as Error).message?.includes('User rejected')) {
                        showToast('Registration failed', 'error')
                      }
                    } finally {
                      setIsRegisteringVoter(false)
                    }
                  }}
                >
                  Register to Vote
                </button>
              )}
              {isRegisteringVoter && (
                <span className="registering-status">Registering...</span>
              )}
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
                <div className="empty-proposals">
                  <p>Loading proposals from Sepolia...</p>
                </div>
              ) : filteredProposals.length === 0 ? (
                <div className="empty-proposals">
                  <p>No proposals yet. {isConnected ? 'Create the first one!' : 'Connect wallet to create one.'}</p>
                </div>
              ) : (
                filteredProposals.map(proposal => (
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
                ))
              )}
            </div>
          </div>
        )}

        {/* Create Proposal */}
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
                  <div>
                    <strong>Commit Phase: 3 days</strong>
                    <p>Voters submit hidden commitments</p>
                  </div>
                </div>
                <div className="info-item">
                  <span className="info-icon">🔓</span>
                  <div>
                    <strong>Reveal Phase: 1 day</strong>
                    <p>Voters reveal their choices</p>
                  </div>
                </div>
              </div>

              {/* Progress UI */}
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

              {/* Error UI */}
              {createProposalError && (
                <div className="create-error">
                  <p>{createProposalError}</p>
                  <button onClick={() => { setCreateProposalError(null); setCreateProposalStep('idle'); }}>Try Again</button>
                </div>
              )}

              <button
                className="submit-proposal-btn"
                disabled={!newProposalTitle || !newProposalDescription || isCreatingProposal || !isConnected || !isCorrectChain}
                onClick={async () => {
                  if (!isConnected || !isCorrectChain) return

                  setIsCreatingProposal(true)
                  setCreateProposalError(null)
                  setCreateProposalStep('registering')

                  try {
                    // Fetch all registered voters
                    const { data: voters } = await refetchRegisteredVoters()
                    const registeredVoters = voters as bigint[] | undefined

                    if (!registeredVoters || registeredVoters.length === 0) {
                      throw new Error('No registered voters. Please wait for voter registration to complete.')
                    }

                    console.log('[Proposal] Registered voters:', registeredVoters.length)

                    // Compute merkle root from ALL registered voters
                    const { root: computedMerkleRoot } = await generateMerkleProofAsync(registeredVoters, 0)
                    console.log('[Proposal] Merkle root (from all voters):', computedMerkleRoot.toString())

                    // Step 1: Register the merkle root first
                    const merkleRootHash = await writeContractAsync({
                      address: PRIVATE_VOTING_ADDRESS,
                      abi: PRIVATE_VOTING_ABI,
                      functionName: 'registerMerkleRoot',
                      args: [computedMerkleRoot],
                      gas: BigInt(100000),
                    })

                    // Wait for merkle root registration to be confirmed
                    setCreateProposalStep('waiting')
                    for (let i = 0; i < 30; i++) {
                      await new Promise(resolve => setTimeout(resolve, 1000))
                      try {
                        const receipt = await fetch('https://ethereum-sepolia-rpc.publicnode.com', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_getTransactionReceipt',
                            params: [merkleRootHash],
                            id: 1
                          })
                        }).then(r => r.json())
                        if (receipt.result && receipt.result.blockNumber) break
                      } catch { /* ignore */ }
                    }

                    // Step 2: Create the proposal
                    setCreateProposalStep('creating')
                    const votingDuration = BigInt(3 * 24 * 60 * 60) // 3 days in seconds
                    const revealDuration = BigInt(1 * 24 * 60 * 60) // 1 day in seconds

                    const hash = await writeContractAsync({
                      address: PRIVATE_VOTING_ADDRESS,
                      abi: PRIVATE_VOTING_ABI,
                      functionName: 'createProposal',
                      args: [
                        newProposalTitle,
                        newProposalDescription,
                        computedMerkleRoot, // Merkle root of ALL registered voters
                        votingDuration,
                        revealDuration,
                      ],
                      gas: BigInt(500000),
                    })

                    setTxHash(hash)
                    setCreateProposalStep('success')

                    // Wait for transaction to be mined
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

                    showToast('Proposal created successfully!', 'success')

                    // Force page reload to show new proposal
                    setTimeout(() => {
                      window.location.reload()
                    }, 1000)

                  } catch (error) {
                    console.error('Failed to create proposal:', error)
                    setCreateProposalStep('error')
                    setCreateProposalError((error as Error).message || 'Failed to create proposal.')
                  } finally {
                    setIsCreatingProposal(false)
                  }
                }}
              >
                {isCreatingProposal ? 'Creating...' : 'Create Proposal'}
              </button>

              <p className="demo-notice">
                Proposals are created on Sepolia testnet. Make sure you have Sepolia ETH.
              </p>
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
                          <p>Come back during the <strong>Reveal Phase</strong> to reveal your choice. Your vote won't count until revealed.</p>
                        </div>
                      </div>
                    ) : !isEligible ? (
                      <div className="not-eligible">
                        <div className="not-eligible-icon">🚫</div>
                        <h3>Not Eligible</h3>
                        <p className="not-eligible-subtitle">Your ZK identity is not in this proposal's voter snapshot.</p>
                        <div className="not-eligible-info">
                          <p>Each proposal has a specific merkle root (voter snapshot). Only users whose identity is included in that snapshot can vote.</p>
                          <p><strong>Solution:</strong> Create your own proposal to test voting with your identity.</p>
                        </div>
                        <button className="submit-vote-btn" onClick={() => setCurrentPage('create-proposal')}>
                          Create Your Proposal
                        </button>
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
                            className={`vote-option for ${selectedChoice === CHOICE_FOR ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice(CHOICE_FOR)}
                          >
                            <span className="vote-icon">👍</span>
                            <span className="vote-label">For</span>
                          </button>
                          <button
                            className={`vote-option against ${selectedChoice === CHOICE_AGAINST ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice(CHOICE_AGAINST)}
                          >
                            <span className="vote-icon">👎</span>
                            <span className="vote-label">Against</span>
                          </button>
                          <button
                            className={`vote-option abstain ${selectedChoice === CHOICE_ABSTAIN ? 'selected' : ''}`}
                            onClick={() => setSelectedChoice(CHOICE_ABSTAIN)}
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
                          disabled={selectedChoice === null}
                          onClick={openVoteConfirmation}
                        >
                          Continue to Vote
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
                        <p className="success-subtitle">Your ZK proof was verified on-chain</p>
                        <div className="privacy-proof">
                          <div className="privacy-item">
                            <span className="privacy-label">Voting Power</span>
                            <span className="privacy-value">{tokenNote?.noteValue.toString() || '0'}</span>
                          </div>
                          <div className="privacy-item secret">
                            <span className="privacy-label">Your Choice</span>
                            <span className="secret-choice">🔐 Hidden until reveal</span>
                          </div>
                          <div className="privacy-item">
                            <span className="privacy-label">Nullifier</span>
                            <code>{currentVoteData ? formatBigInt(currentVoteData.nullifier) : 'N/A'}</code>
                          </div>
                          {txHash && (
                            <div className="privacy-item">
                              <span className="privacy-label">Transaction</span>
                              <a
                                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tx-link"
                              >
                                View on Etherscan ↗
                              </a>
                            </div>
                          )}
                        </div>
                        <div className="next-steps">
                          <h4>Next Steps</h4>
                          <p>Come back during the <strong>Reveal Phase</strong> to reveal your choice. Your vote won't count until revealed.</p>
                        </div>
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
                        {getVoteForReveal(BigInt(selectedProposal.id), address) ? (
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

                {/* Results hidden during commit and reveal phases - privacy first */}
                {selectedProposal.phase === 'commit' && (
                  <div className="sidebar-card results-card">
                    <h3>Results</h3>
                    <div className="privacy-shield">
                      <div className="privacy-shield-icon">🔒</div>
                      <h4>Results Hidden</h4>
                      <p>Vote results will be revealed after the <strong>reveal phase ends</strong>.</p>
                      <div className="reveal-progress">
                        <span className="reveal-count">{selectedProposal.totalCommitments}</span>
                        <span className="reveal-label">votes committed</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedProposal.phase === 'reveal' && (
                  <div className="sidebar-card results-card">
                    <h3>Results</h3>
                    <div className="privacy-shield">
                      <div className="privacy-shield-icon">🔒</div>
                      <h4>Results Hidden</h4>
                      <p>Vote results are hidden until the <strong>reveal phase ends</strong> to prevent vote influence.</p>
                      <div className="reveal-progress">
                        <span className="reveal-count">{selectedProposal.revealedVotes} / {selectedProposal.totalCommitments}</span>
                        <span className="reveal-label">votes revealed</span>
                      </div>
                      <p className="privacy-note">
                        Participants must reveal their votes before the deadline.
                        Results will be shown when voting ends.
                      </p>
                    </div>
                  </div>
                )}

                {selectedProposal.phase === 'ended' && (
                  <div className="sidebar-card results-card">
                    <h3>Final Results</h3>
                    <div className="results-breakdown">
                      <div className="result-item">
                        <div className="result-header">
                          <span className="result-label">👍 For</span>
                          <span className="result-stats">
                            <span className="result-percent">{getVotePercentages(selectedProposal).for}%</span>
                            <span className="result-count">{selectedProposal.forVotes} votes</span>
                          </span>
                        </div>
                        <div className="result-bar">
                          <div className="result-bar-fill for" style={{ width: `${getVotePercentages(selectedProposal).for}%` }}></div>
                        </div>
                      </div>
                      <div className="result-item">
                        <div className="result-header">
                          <span className="result-label">👎 Against</span>
                          <span className="result-stats">
                            <span className="result-percent">{getVotePercentages(selectedProposal).against}%</span>
                            <span className="result-count">{selectedProposal.againstVotes} votes</span>
                          </span>
                        </div>
                        <div className="result-bar">
                          <div className="result-bar-fill against" style={{ width: `${getVotePercentages(selectedProposal).against}%` }}></div>
                        </div>
                      </div>
                      <div className="result-item">
                        <div className="result-header">
                          <span className="result-label">⏸️ Abstain</span>
                          <span className="result-stats">
                            <span className="result-percent">{getVotePercentages(selectedProposal).abstain}%</span>
                            <span className="result-count">{selectedProposal.abstainVotes} votes</span>
                          </span>
                        </div>
                        <div className="result-bar">
                          <div className="result-bar-fill abstain" style={{ width: `${getVotePercentages(selectedProposal).abstain}%` }}></div>
                        </div>
                      </div>
                    </div>
                    <div className="results-total">
                      <span>Total Votes</span>
                      <span>{selectedProposal.forVotes + selectedProposal.againstVotes + selectedProposal.abstainVotes}</span>
                    </div>
                    <div className="anonymity-set">
                      <span className="anonymity-label">Total Committed</span>
                      <span className="anonymity-value">{selectedProposal.totalCommitments}</span>
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
