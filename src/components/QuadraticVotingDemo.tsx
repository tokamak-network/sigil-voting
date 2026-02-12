import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatUnits, decodeAbiParameters, encodeAbiParameters } from 'viem'
import {
  getOrCreateKeyPairAsync,
  prepareD2VoteAsync,
  generateQuadraticProof,
  storeD2VoteForReveal,
  getD2VoteForReveal,
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
import { RevealForm, VoteResult } from './voting'
import { FingerprintLoader } from './FingerprintLoader'
import config from '../config.json'

const ZK_VOTING_FINAL_ADDRESS = (config.contracts.zkVotingFinal || '0x0000000000000000000000000000000000000000') as `0x${string}`
const TON_TOKEN_ADDRESS = (config.contracts.tonToken || '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044') as `0x${string}`

// Minimum TON balance required for proposal creation (not a fee, balance requirement)
const MIN_TON_FOR_PROPOSAL = 100

// Local storage helpers for tracking voted proposals
const VOTED_PROPOSALS_KEY = 'zk-voted-proposals'

function getVotedProposals(address: string): number[] {
  try {
    const key = `${VOTED_PROPOSALS_KEY}-${address.toLowerCase()}`
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function markProposalAsVoted(address: string, proposalId: number): void {
  try {
    const key = `${VOTED_PROPOSALS_KEY}-${address.toLowerCase()}`
    const voted = getVotedProposals(address)
    if (!voted.includes(proposalId)) {
      voted.push(proposalId)
      localStorage.setItem(key, JSON.stringify(voted))
    }
  } catch {
    // Ignore storage errors
  }
}

function hasVotedOnProposal(address: string, proposalId: number): boolean {
  return getVotedProposals(address).includes(proposalId)
}

const ZK_VOTING_FINAL_ABI = [
  { type: 'function', name: 'registerCreditRoot', inputs: [{ name: '_creditRoot', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'registerCreditNote', inputs: [{ name: '_creditNoteHash', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getRegisteredCreditNotes', inputs: [], outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view' },
  { type: 'function', name: 'proposalCountD2', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'createProposalD2', inputs: [{ name: '_title', type: 'string' }, { name: '_description', type: 'string' }, { name: '_creditRoot', type: 'uint256' }, { name: '_votingDuration', type: 'uint256' }, { name: '_revealDuration', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'castVoteD2', inputs: [{ name: '_proposalId', type: 'uint256' }, { name: '_commitment', type: 'uint256' }, { name: '_numVotes', type: 'uint256' }, { name: '_creditsSpent', type: 'uint256' }, { name: '_nullifier', type: 'uint256' }, { name: '_pA', type: 'uint256[2]' }, { name: '_pB', type: 'uint256[2][2]' }, { name: '_pC', type: 'uint256[2]' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'creditRootHistory', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getAvailableCredits', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  // D2 Phase functions (Reveal Phase support)
  { type: 'function', name: 'revealVoteD2', inputs: [{ name: '_proposalId', type: 'uint256' }, { name: '_nullifier', type: 'uint256' }, { name: '_choice', type: 'uint256' }, { name: '_numVotes', type: 'uint256' }, { name: '_voteSalt', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getPhaseD2', inputs: [{ name: '_proposalId', type: 'uint256' }], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'getProposalResultD2', inputs: [{ name: '_proposalId', type: 'uint256' }], outputs: [{ name: 'forVotes', type: 'uint256' }, { name: 'againstVotes', type: 'uint256' }, { name: 'totalRevealed', type: 'uint256' }], stateMutability: 'view' },
] as const

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'approveAndCall', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'data', type: 'bytes' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const

interface Proposal {
  id: number
  title: string
  creator: string
  endTime: Date
  revealEndTime: Date      // Reveal end time
  totalVotes: number       // Total commitments (public)
  totalCreditsSpent: number  // Total TON spent (internal use)
  creditRoot: bigint
  // Phase fields
  phase: 0 | 1 | 2         // 0=Commit, 1=Reveal, 2=Ended
  forVotes: number         // For votes (after reveal)
  againstVotes: number     // Against votes (after reveal)
  revealedVotes: number    // Revealed vote count
}

type View = 'list' | 'create' | 'vote' | 'success'

const FAUCET_URL = 'https://docs.tokamak.network/home/service-guide/faucet-testnet'

// Rule #5: TON Token Icon component
const TonIcon = ({ size = 16 }: { size?: number }) => (
  <img
    src="/assets/symbol.svg"
    alt="TON"
    width={size}
    height={size}
    style={{ verticalAlign: 'middle', marginRight: '4px' }}
  />
)


interface QuadraticVotingDemoProps {
  initialProposalId?: number | null
  onProposalViewed?: () => void
}

export function QuadraticVotingDemo({ initialProposalId, onProposalViewed }: QuadraticVotingDemoProps) {
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
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [pendingInitialProposalId, setPendingInitialProposalId] = useState<number | null>(initialProposalId ?? null)

  // Filter and search
  const [filterPhase, setFilterPhase] = useState<'all' | 0 | 1 | 2>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Detect initialProposalId prop changes
  useEffect(() => {
    if (initialProposalId !== null && initialProposalId !== undefined) {
      setPendingInitialProposalId(initialProposalId)
    }
  }, [initialProposalId])


  // Rule #3: Live countdown timer (update every second)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-update phase of selected proposal (vote→reveal→ended auto-transition)
  useEffect(() => {
    if (!selectedProposal) return

    const currentPhase = calculatePhase(selectedProposal.endTime, selectedProposal.revealEndTime)
    if (currentPhase !== selectedProposal.phase) {
      // Phase changed - update proposal data
      setSelectedProposal(prev => prev ? { ...prev, phase: currentPhase } : null)
      // Also refresh the list
      setRefreshTrigger(t => t + 1)
    }
  }, [selectedProposal, tick]) // tick dependency for checking every second

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
  // Removed: showIntensity (no longer needed with new UI flow)
  const [error, setError] = useState<string | null>(null)

  // Rule #7 & #8: Pre-Flight Modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingVoteChoice, setPendingVoteChoice] = useState<VoteChoice | null>(null)

  const numVotes = votingContext.numVotes
  const txHash = votingContext.txHash

  const isContractDeployed = ZK_VOTING_FINAL_ADDRESS !== '0x0000000000000000000000000000000000000000'

  // Read TON balance (for eligibility check)
  const { data: tonBalance } = useReadContract({
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

  // Fetch available credits from contract
  const { data: availableCredits, refetch: refetchCredits } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_FINAL_ABI,
    functionName: 'getAvailableCredits',
    args: address ? [address] : undefined,
    query: { enabled: isContractDeployed && !!address }
  })

  // TON balance for eligibility check
  const tonBalanceFormatted = tonBalance ? Number(formatUnits(tonBalance, 18)) : 0
  const hasTon = tonBalanceFormatted > 0

  // Use contract credits for voting power (default 10000 if not initialized)
  const totalVotingPower = availableCredits ? Number(availableCredits) : 10000

  const quadraticCost = numVotes * numVotes
  const maxVotes = Math.floor(Math.sqrt(totalVotingPower))

  const costLevel = totalVotingPower > 0 ? Math.min((quadraticCost / totalVotingPower) * 100, 100) : 0
  const isHighCost = costLevel > 30

  // Initialize key pair on connect
  useEffect(() => {
    if (isConnected && address) {
      getOrCreateKeyPairAsync(address).then(setKeyPair)
    }
  }, [isConnected, address])

  // Return to list when wallet disconnected
  useEffect(() => {
    if (!isConnected) {
      setCurrentView('list')
      setSelectedProposal(null)
      setSelectedChoice(null)
    }
  }, [isConnected])

  // Fetch proposals
  // Track first load
  const [isFirstLoad, setIsFirstLoad] = useState(true)

  // Helper: fetch single proposal
  const fetchSingleProposal = useCallback(async (id: number): Promise<Proposal | null> => {
    try {
      const response = await fetch('https://ethereum-sepolia-rpc.publicnode.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: ZK_VOTING_FINAL_ADDRESS,
            data: `0x${getProposalSelector(id)}`
          }, 'latest'],
          id
        })
      })
      const result = await response.json()
      if (result.result && result.result !== '0x') {
        const decoded = decodeProposalResult(result.result)
        if (decoded.title) {
          const endTime = new Date(Number(decoded.endTime) * 1000)
          const revealEndTime = new Date(Number(decoded.revealEndTime) * 1000)
          return {
            id,
            title: decoded.title,
            creator: decoded.creator,
            endTime,
            revealEndTime,
            totalVotes: Number(decoded.totalVotes),
            totalCreditsSpent: Number(decoded.totalCreditsSpent),
            creditRoot: decoded.creditRoot,
            phase: calculatePhase(endTime, revealEndTime),
            forVotes: Number(decoded.forVotes),
            againstVotes: Number(decoded.againstVotes),
            revealedVotes: Number(decoded.revealedVotes),
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch proposal', id, e)
    }
    return null
  }, [])

  // Load selected proposal first (navigate to detail view immediately)
  useEffect(() => {
    const loadInitialProposal = async () => {
      if (!pendingInitialProposalId || pendingInitialProposalId <= 0) return

      // If already in proposals, select it directly
      const existing = proposals.find(p => p.id === pendingInitialProposalId)
      if (existing) {
        setSelectedProposal(existing)
        setCurrentView('vote')
        setPendingInitialProposalId(null)
        onProposalViewed?.()
        return
      }

      // If not found, quickly fetch the proposal
      const proposal = await fetchSingleProposal(pendingInitialProposalId)
      if (proposal) {
        setSelectedProposal(proposal)
        setCurrentView('vote')
        setPendingInitialProposalId(null)
        onProposalViewed?.()
      }
    }

    loadInitialProposal()
  }, [pendingInitialProposalId, proposals, fetchSingleProposal, onProposalViewed])

  useEffect(() => {
    const fetchProposals = async () => {
      // Show loading only on first load (prevent flicker on refresh)
      if (isFirstLoad) {
        setIsLoadingProposals(true)
      }

      if (!proposalCount || proposalCount === 0n) {
        setIsLoadingProposals(false)
        setIsFirstLoad(false)
        return
      }

      const count = Number(proposalCount)

      // Fetch all proposals in parallel (faster)
      const proposalPromises = Array.from({ length: count }, (_, i) => fetchSingleProposal(i + 1))
      const results = await Promise.all(proposalPromises)
      const fetchedProposals = results.filter((p): p is Proposal => p !== null)

      setProposals(fetchedProposals)
      setIsLoadingProposals(false)
      setIsFirstLoad(false)
    }

    fetchProposals()
  }, [proposalCount, refreshTrigger, address, isFirstLoad, fetchSingleProposal])

  const handleConnect = () => connect({ connector: injected() })

  const [createStatus, setCreateStatus] = useState<string | null>(null)
  const [createProgress, setCreateProgress] = useState(0)
  const [isCreatingProposal, setIsCreatingProposal] = useState(false)

  // Helper: wait for transaction (optimized for faster UX)
  const waitForTx = useCallback(async (hash: `0x${string}`) => {
    return await publicClient?.waitForTransactionReceipt({
      hash,
      timeout: 60_000, // 60 second timeout
      confirmations: 1,
      pollingInterval: 500, // Fast polling at 500ms
    })
  }, [publicClient])

  // Check if proposal creation is allowed
  const canCreateProposal = totalVotingPower >= MIN_TON_FOR_PROPOSAL

  const handleCreateProposal = useCallback(async () => {
    if (!newProposalTitle.trim() || !publicClient || !address || !keyPair) return
    if (!canCreateProposal) {
      setError(`Minimum ${MIN_TON_FOR_PROPOSAL} TON balance required to create proposal`)
      return
    }
    setIsCreatingProposal(true)
    setError(null)
    setCreateStatus('Preparing...')
    setCreateProgress(10)

    try {
      // Get existing registered credit notes
      const creditNotes = [...((registeredCreditNotes as bigint[]) || [])]

      // Register creator's creditNote for creditRoot (but won't auto-vote)
      setCreateStatus('Creating credit note...')
      setCreateProgress(20)
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      const noteHash = creditNote.creditNoteHash
      if (!creditNotes.includes(noteHash)) {
        setCreateStatus('Registering credit note...')
        setCreateProgress(30)
        const registerNoteHash = await writeContractAsync({
          address: ZK_VOTING_FINAL_ADDRESS,
          abi: ZK_VOTING_FINAL_ABI,
          functionName: 'registerCreditNote',
          args: [noteHash],
        })
        await waitForTx(registerNoteHash)
        creditNotes.push(noteHash)
        await refetchCreditNotes()
      }

      // Build creditRoot from all registered notes
      setCreateStatus('Generating merkle root...')
      setCreateProgress(50)
      const { root: creditRoot } = await generateMerkleProofAsync(creditNotes, 0)

      // Register this creditRoot
      setCreateStatus('Registering root, wallet approval needed...')
      setCreateProgress(60)
      const registerRootHash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditRoot',
        args: [creditRoot],
      })
      setCreateStatus('Processing block...')
      setCreateProgress(70)
      await waitForTx(registerRootHash)

      // Create proposal (NO auto-vote, creator votes separately if they want)
      setCreateStatus('Creating proposal, wallet approval needed...')
      setCreateProgress(80)
      const createHash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'createProposalD2',
        args: [newProposalTitle, '', creditRoot, BigInt(180), BigInt(180)], // Test: 3min voting, 3min reveal
      })

      setCreateStatus('Processing block...')
      setCreateProgress(90)
      await waitForTx(createHash)

      setCreateProgress(100)
      setCreateStatus('Complete!')
      await refetchProposalCount()
      setNewProposalTitle('')

      // Navigate to list after a short delay
      setTimeout(() => {
        setCreateStatus(null)
        setCreateProgress(0)
        setCurrentView('list')
      }, 500)
    } catch (err) {
      console.error('[DEBUG] Create proposal error:', err)
      const errorMsg = (err as Error).message || ''
      if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected') || errorMsg.includes('denied')) {
        setError('Transaction cancelled')
      } else if (errorMsg.includes('insufficient funds')) {
        setError('Insufficient Sepolia ETH. Please get some from faucet.')
      } else if (errorMsg.includes('gas')) {
        setError('Gas error occurred. Please try again.')
      } else {
        setError('Failed to create proposal. Please try again.')
      }
      setCreateProgress(0)
    } finally {
      setIsCreatingProposal(false)
      if (!createStatus?.includes('Complete')) {
        setCreateStatus(null)
        setCreateProgress(0)
      }
    }
  }, [newProposalTitle, publicClient, writeContractAsync, refetchProposalCount, address, keyPair, totalVotingPower, registeredCreditNotes, refetchCreditNotes, waitForTx, createStatus])

  const handleVote = useCallback(async (choice: VoteChoice) => {
    if (!keyPair || !selectedProposal || !hasTon || !address || !publicClient) return
    if (quadraticCost > totalVotingPower) {
      setError('Insufficient TON')
      return
    }

    // Check if already voted (local check to save gas)
    if (hasVotedOnProposal(address, selectedProposal.id)) {
      setError('You have already voted on this proposal. Only one vote per proposal.')
      return
    }

    setSelectedChoice(choice)
    setError(null)
    startVote() // State: IDLE -> PROOFING

    try {
      const proposalId = BigInt(selectedProposal.id)

      // Step 1: Get or create creditNote
      updateProgress(5, 'Please wait...')
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        updateProgress(8, 'Please wait...')
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      // Step 2: Get current registered creditNotes
      const creditNotes = [...((registeredCreditNotes as bigint[]) || [])]
      const noteHash = creditNote.creditNoteHash

      // Step 3: Auto-register creditNote if needed
      if (!creditNotes.includes(noteHash)) {
        updateProgress(10, 'Please wait...')
        const registerNoteHash = await writeContractAsync({
          address: ZK_VOTING_FINAL_ADDRESS,
          abi: ZK_VOTING_FINAL_ABI,
          functionName: 'registerCreditNote',
          args: [noteHash],
        })
        await waitForTx(registerNoteHash)
        creditNotes.push(noteHash)
        await refetchCreditNotes()
      }

      // Step 4: Generate creditRoot with all registered notes
      updateProgress(15, 'Please wait...')
      const { root: dynamicCreditRoot } = await generateMerkleProofAsync(creditNotes, creditNotes.indexOf(noteHash))

      // Step 5: Register creditRoot if not already registered
      const isCreditRootValid = await publicClient.readContract({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: [{ type: 'function', name: 'isCreditRootValid', inputs: [{ name: '_creditRoot', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' }] as const,
        functionName: 'isCreditRootValid',
        args: [dynamicCreditRoot],
      })

      if (!isCreditRootValid) {
        updateProgress(18, 'Please wait...')
        const registerRootHash = await writeContractAsync({
          address: ZK_VOTING_FINAL_ADDRESS,
          abi: ZK_VOTING_FINAL_ABI,
          functionName: 'registerCreditRoot',
          args: [dynamicCreditRoot],
        })
        await waitForTx(registerRootHash)
      }

      // Step 6: Prepare vote data
      updateProgress(20, 'Preparing vote...')
      const voteData = await prepareD2VoteAsync(keyPair, choice, BigInt(numVotes), proposalId)

      updateProgress(25, 'Preparing vote...')

      // Step 7: Generate ZK proof using dynamic creditRoot
      const { proof, nullifier, commitment } = await generateQuadraticProof(
        keyPair,
        creditNote,
        voteData,
        dynamicCreditRoot,
        creditNotes,
        (progress) => updateProgress(30 + Math.floor(progress.progress * 0.25), 'Preparing vote...')
      )

      proofComplete() // State: PROOFING -> SIGNING

      // Encode vote data for approveAndCall (using dynamic creditRoot)
      const tonAmountNeeded = voteData.creditsSpent * BigInt(1e18) // 1 credit = 1 TON
      const voteCallData = encodeAbiParameters(
        [
          { name: 'proposalId', type: 'uint256' },
          { name: 'commitment', type: 'uint256' },
          { name: 'numVotes', type: 'uint256' },
          { name: 'creditsSpent', type: 'uint256' },
          { name: 'nullifier', type: 'uint256' },
          { name: 'creditRoot', type: 'uint256' },
          { name: 'pA', type: 'uint256[2]' },
          { name: 'pB', type: 'uint256[2][2]' },
          { name: 'pC', type: 'uint256[2]' },
        ],
        [proposalId, commitment, BigInt(numVotes), voteData.creditsSpent, nullifier, dynamicCreditRoot, proof.pA, proof.pB, proof.pC]
      )

      updateProgress(55, 'Please approve in wallet')

      // Single transaction: approveAndCall on TON token
      // This approves TON spending and calls our contract's onApprove callback in one tx
      const hash = await writeContractAsync({
        address: TON_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approveAndCall',
        args: [ZK_VOTING_FINAL_ADDRESS, tonAmountNeeded, voteCallData],
        gas: BigInt(2000000), // Rule #9: Sufficient gas buffer
      })

      signed() // State: SIGNING -> SUBMITTING

      // Wait for confirmation with retry
      await waitForTx(hash)

      storeD2VoteForReveal(proposalId, voteData, address, hash)
      markProposalAsVoted(address, selectedProposal.id) // Track locally to prevent re-voting
      await refetchCredits() // Refresh available credits after voting
      txConfirmed(hash) // State: SUBMITTING -> SUCCESS
      setCurrentView('success')
    } catch (err) {
      console.error('Vote failed:', err)
      const errorMsg = (err as Error).message || ''

      // User-friendly error messages
      let userMessage = errorMsg
      if (errorMsg.includes('User rejected') || errorMsg.includes('user rejected') || errorMsg.includes('denied')) {
        userMessage = 'Transaction cancelled'
      } else if (errorMsg.includes('NullifierAlreadyUsed') || errorMsg.includes('already used') || errorMsg.includes('0x3c712b18')) {
        userMessage = 'You have already voted on this proposal. Only one vote per proposal.'
      } else if (errorMsg.includes('NotInCommitPhase') || errorMsg.includes('commit phase')) {
        userMessage = 'Voting period has ended.'
      } else if (errorMsg.includes('ProposalNotFound')) {
        userMessage = 'Proposal not found.'
      } else if (errorMsg.includes('InvalidProof')) {
        userMessage = 'ZK proof verification failed. Please try again.'
      } else if (errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch') || errorMsg.includes('load')) {
        userMessage = 'Failed to load circuit files. Please refresh and try again.'
      } else if (errorMsg.includes('memory') || errorMsg.includes('Memory')) {
        userMessage = 'Out of memory. Please close other tabs and try again.'
      } else if (errorMsg.includes('InsufficientCredits')) {
        userMessage = 'Insufficient TON.'
      } else if (errorMsg.includes('InvalidQuadraticCost')) {
        userMessage = 'Vote cost calculation error.'
      } else if (errorMsg.includes('insufficient funds')) {
        userMessage = 'Insufficient Sepolia ETH. Please get some from faucet.'
      } else if (errorMsg.includes('old version') || errorMsg.includes('create new proposal')) {
        userMessage = errorMsg // Already user-friendly from zkproof.ts
      } else if (errorMsg.includes('TON transfer failed') || errorMsg.includes('transfer failed')) {
        userMessage = 'TON transfer failed. Please check your balance.'
      } else if (errorMsg.includes('Only TON token can call')) {
        userMessage = 'Invalid contract call.'
      } else if (errorMsg.includes('Insufficient approved amount')) {
        userMessage = 'Insufficient TON approval amount.'
      }

      setVotingError(userMessage)
      setError(userMessage)
    }
  }, [keyPair, selectedProposal, hasTon, address, numVotes, quadraticCost, totalVotingPower, registeredCreditNotes, writeContractAsync, refetchCredits, startVote, updateProgress, proofComplete, signed, txConfirmed, setVotingError, publicClient, waitForTx, refetchCreditNotes])

  return (
    <div className="unified-voting">
      {/* VIEW: Proposal List */}
      {currentView === 'list' && (
        <div className="uv-list-view">
          {/* Header Section - Matching proposal-list.html */}
          <div className="uv-list-header">
            <div className="uv-list-header-content">
              <div className="uv-list-header-title-row">
                <h1>Proposals</h1>
                <span className="uv-list-header-badge">DAO Governance</span>
              </div>
              <p className="uv-list-header-subtitle">Participate in a ZK-Proof based anonymous voting system.</p>
            </div>
            {isConnected && (
              <div className="uv-header-actions">
                <div className="uv-balance-card">
                  <div className="uv-balance-card-header">
                    <span className="uv-balance-card-label">Available Balance</span>
                    {!hasTon && (
                      <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-balance-card-link">
                        Get TON →
                      </a>
                    )}
                  </div>
                  <div className="uv-balance-card-content">
                    <span className="uv-balance-amount">{totalVotingPower.toLocaleString()} TON</span>
                    <span className="uv-balance-hint">Max {maxVotes} votes</span>
                  </div>
                </div>
                <button
                  className="uv-create-btn"
                  onClick={() => setCurrentView('create')}
                >
                  <span className="material-symbols-outlined">add</span>
                  New Proposal
                </button>
              </div>
            )}
          </div>

          {!isConnected ? (
            <div className="uv-empty-state">
              <div className="uv-empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'white' }}>fingerprint</span>
              </div>
              <h2>ZK Private Voting</h2>
              <p>Connect your wallet to participate</p>
              <button className="uv-create-btn" onClick={handleConnect}>
                <span className="material-symbols-outlined">account_balance_wallet</span>
                Connect Wallet
              </button>
            </div>
          ) : isLoadingProposals ? (
            <div className="uv-empty-state">
              <div className="uv-empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'white' }}>sync</span>
              </div>
              <FingerprintLoader progress={votingContext.progress} />
              <p>Loading proposals...</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="uv-empty-state">
              <div className="uv-empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'white' }}>inbox</span>
              </div>
              <h2>No proposals yet</h2>
              <p>Create the first proposal</p>
              <button className="uv-create-btn" onClick={() => setCurrentView('create')}>
                <span className="material-symbols-outlined">add</span>
                Create Proposal
              </button>
            </div>
          ) : (
            <>
              {/* Filter Bar - Matching proposal-list.html */}
              <div className="uv-filter-bar">
                <div className="uv-filter-tabs">
                  <button
                    className={`uv-filter-tab ${filterPhase === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterPhase('all')}
                  >
                    All ({proposals.length})
                  </button>
                  <button
                    className={`uv-filter-tab ${filterPhase === 0 ? 'active' : ''}`}
                    onClick={() => setFilterPhase(0)}
                  >
                    <span className="uv-filter-dot voting"></span>
                    Voting ({proposals.filter(p => p.phase === 0).length})
                  </button>
                  <button
                    className={`uv-filter-tab ${filterPhase === 1 ? 'active' : ''}`}
                    onClick={() => setFilterPhase(1)}
                  >
                    <span className="uv-filter-dot reveal"></span>
                    Revealing ({proposals.filter(p => p.phase === 1).length})
                  </button>
                  <button
                    className={`uv-filter-tab ${filterPhase === 2 ? 'active' : ''}`}
                    onClick={() => setFilterPhase(2)}
                  >
                    Ended ({proposals.filter(p => p.phase === 2).length})
                  </button>
                </div>
                <div className="uv-search-wrapper">
                  <span className="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    className="uv-search-input"
                    placeholder="Search proposals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Proposals Grid */}
              <div className="uv-proposals-grid">
              {(() => {
                const filtered = proposals.filter(p => {
                  if (filterPhase !== 'all' && p.phase !== filterPhase) return false
                  if (searchQuery && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
                  return true
                })

                filtered.sort((a, b) => {
                  if (a.phase < 2 && b.phase === 2) return -1
                  if (a.phase === 2 && b.phase < 2) return 1
                  return b.id - a.id
                })

                if (filtered.length === 0) {
                  return (
                    <div className="uv-empty-state" style={{ gridColumn: '1 / -1' }}>
                      <p>{searchQuery ? `No results for "${searchQuery}"` : 'No matching proposals'}</p>
                    </div>
                  )
                }

                return filtered.map(proposal => {
                const phaseLabels = ['Voting', 'Revealing', 'Ended'] as const
                const phaseClasses = ['voting', 'reveal', 'ended'] as const
                const hasVoted = address ? hasVotedOnProposal(address, proposal.id) : false

                const getTimeRemaining = () => {
                  const now = new Date()
                  const target = proposal.phase === 0 ? proposal.endTime : proposal.revealEndTime
                  const diff = target.getTime() - now.getTime()
                  if (diff <= 0) return null
                  const hours = Math.floor(diff / (1000 * 60 * 60))
                  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
                  const seconds = Math.floor((diff % (1000 * 60)) / 1000)
                  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                }
                const timeRemaining = getTimeRemaining()

                return (
                  <div
                    key={proposal.id}
                    className={`uv-proposal-card ${proposal.phase === 2 ? 'ended' : ''} ${proposal.phase === 0 ? 'voting-active' : ''}`}
                    onClick={() => {
                      setSelectedProposal(proposal)
                      setCurrentView('vote')
                    }}
                  >
                    <div className="uv-proposal-header">
                      <span className={`uv-phase-badge ${phaseClasses[proposal.phase]}`}>
                        {phaseLabels[proposal.phase]}
                      </span>
                      {hasVoted && <span className="uv-voted-badge">✓ Voted</span>}
                    </div>
                    <h3>{proposal.title}</h3>
                    <div className="uv-proposal-meta">
                      <div className="uv-proposal-meta-item">
                        <span className="uv-proposal-meta-label">Participants</span>
                        <span className="uv-proposal-meta-value">{proposal.totalVotes}</span>
                      </div>
                      {proposal.phase === 2 ? (
                        <div className="uv-proposal-meta-item time-item">
                          <span className="uv-proposal-meta-label">Result</span>
                          <span className={`uv-result-badge ${proposal.forVotes > proposal.againstVotes ? 'passed' : 'rejected'}`}>
                            {proposal.forVotes > proposal.againstVotes ? 'Passed' : proposal.againstVotes > proposal.forVotes ? 'Rejected' : 'Tie'}
                          </span>
                        </div>
                      ) : timeRemaining && (
                        <div className="uv-proposal-meta-item time-item">
                          <span className="uv-proposal-meta-label">Time left</span>
                          <span className={`uv-proposal-meta-value ${phaseClasses[proposal.phase]}`}>{timeRemaining}</span>
                        </div>
                      )}
                    </div>
                    <div className="uv-proposal-footer">
                      <span className="uv-proposal-id">PROPOSAL #{proposal.id}</span>
                      <div className="uv-proposal-arrow">
                        <span className="material-symbols-outlined">arrow_forward</span>
                      </div>
                    </div>
                  </div>
                )
              })
              })()}
            </div>
            </>
          )}

          {error && <div className="uv-error">{error}</div>}
        </div>
      )}

      {/* VIEW: Create Proposal - Matching create-proposal.html */}
      {currentView === 'create' && (
        <div className="uv-create-view">
          {/* Sidebar - Desktop Only */}
          <div className="uv-create-sidebar">
            <div className="uv-create-sidebar-top">
              <button className="uv-back-button" onClick={() => setCurrentView('list')} disabled={isCreatingProposal}>
                <span className="material-symbols-outlined">arrow_back</span>
                Back to List
              </button>
              <div className="uv-create-steps">
                <div className="uv-create-step active">
                  <p className="uv-create-step-label">Step 01</p>
                  <h3>Write Proposal</h3>
                </div>
                <div className="uv-create-step">
                  <p className="uv-create-step-label">Step 02</p>
                  <h3>Review & Publish</h3>
                </div>
              </div>
            </div>
            <div className="uv-create-balance">
              <p className="uv-create-balance-label">Account Balance</p>
              <p className="uv-create-balance-value">{totalVotingPower.toLocaleString()} TON</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="uv-create-content">
            <button className="uv-create-back-mobile" onClick={() => setCurrentView('list')} disabled={isCreatingProposal}>
              <span className="material-symbols-outlined">arrow_back</span>
              Back to List
            </button>

            <div className="uv-create-header">
              <h1>New Proposal</h1>
              <p>Ask the community for opinions</p>
            </div>

            <div className="uv-create-form">
              <div className="uv-create-input-group">
                <label className="uv-create-input-label">Proposal Title</label>
                <input
                  type="text"
                  className="uv-create-input"
                  placeholder="Enter proposal title"
                  value={newProposalTitle}
                  onChange={(e) => setNewProposalTitle(e.target.value)}
                  disabled={isCreatingProposal}
                />
              </div>

              <div className="uv-create-cards">
                <div className="uv-create-security-card">
                  <div className="uv-create-security-header">
                    <span className="material-symbols-outlined">security</span>
                    <span className="uv-create-security-badge">ZK-PROOF READY</span>
                  </div>
                  <p>All proposals are cryptographically protected and cannot be modified after creation. Please write carefully.</p>
                </div>
              </div>

              {createStatus && (
                <div className="uv-loading-overlay" style={{ position: 'fixed', inset: 0 }}>
                  <div className="uv-loading-content">
                    <FingerprintLoader progress={createProgress} />
                    <p className="uv-loading-text">{createStatus}</p>
                    <div className="uv-loading-progress">
                      <div className="uv-loading-progress-fill" style={{ width: `${createProgress}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {error && <div className="uv-error">{error}</div>}

              {!canCreateProposal && (
                <div className="uv-create-requirement">
                  <span className="material-symbols-outlined">info</span>
                  Minimum {MIN_TON_FOR_PROPOSAL} TON balance required to create proposal (Current: {totalVotingPower} TON)
                </div>
              )}

              <button
                className="uv-create-submit"
                onClick={handleCreateProposal}
                disabled={!newProposalTitle.trim() || isCreatingProposal || !canCreateProposal}
              >
                Create Proposal
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: Vote - Matching proposal-detail.html */}
      {currentView === 'vote' && selectedProposal && (
        <div className="uv-vote-view">
          {/* Loading Overlay */}
          {isProcessing && (
            <div className="uv-loading-overlay">
              <div className="uv-loading-content">
                <FingerprintLoader progress={votingContext.progress} />
                <p className="uv-loading-text">{votingContext.message}</p>
                <div className="uv-loading-progress">
                  <div className="uv-loading-progress-fill" style={{ width: `${votingContext.progress}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* Back Button */}
          <button className="uv-back-button" onClick={() => { setCurrentView('list'); setSelectedProposal(null); setSelectedChoice(null); setError(null); resetVoting(); setVotes(1); }} disabled={isProcessing}>
            <span className="material-symbols-outlined">arrow_back</span>
            Back to List
          </button>

          {/* Header Section */}
          <div className="uv-vote-header">
            <div className="uv-vote-header-content">
              <div className="uv-vote-header-left">
                <span className="uv-proposal-number">PROPOSAL #{selectedProposal.id}</span>
                <h1>{selectedProposal.title}</h1>
              </div>
              <div className="uv-vote-header-right">
                <p className="uv-status-label">Status</p>
                <span className={`uv-status-badge ${selectedProposal.phase === 0 ? 'commit' : selectedProposal.phase === 1 ? 'reveal' : 'ended'}`}>
                  {selectedProposal.phase === 0 ? 'Commit Phase' : selectedProposal.phase === 1 ? 'Reveal Phase' : 'Ended'}
                </span>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <div className="uv-progress-section">
            <div className="uv-progress-left">
              <div className="uv-progress-header">
                <h3>{selectedProposal.phase === 0 ? 'Voting in Progress' : selectedProposal.phase === 1 ? 'Reveal in Progress' : 'Vote Ended'}</h3>
                <span className="uv-progress-time">
                  {(() => {
                    const now = new Date()
                    const target = selectedProposal.phase === 0 ? selectedProposal.endTime : selectedProposal.revealEndTime
                    const diff = target.getTime() - now.getTime()
                    if (diff <= 0) return 'Ended'
                    const hours = Math.floor(diff / (1000 * 60 * 60))
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
                    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
                    return `Time left: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                  })()}
                </span>
              </div>
              <div className="uv-progress-bar">
                <div className="uv-progress-fill" style={{
                  width: `${Math.max(0, Math.min(100,
                    selectedProposal.phase === 2 ? 100 :
                    (() => {
                      const now = new Date().getTime()
                      const start = selectedProposal.endTime.getTime() - 180000 // 3 minutes ago
                      const end = selectedProposal.phase === 0 ? selectedProposal.endTime.getTime() : selectedProposal.revealEndTime.getTime()
                      return ((now - start) / (end - start)) * 100
                    })()
                  ))}%`
                }} />
              </div>
              <div className="uv-progress-labels">
                <span>Phase: {selectedProposal.phase === 0 ? 'Commit' : selectedProposal.phase === 1 ? 'Reveal' : 'Ended'}</span>
                <span>{selectedProposal.phase === 0 ? 'Next: Reveal' : selectedProposal.phase === 1 ? 'Next: Ended' : 'Completed'}</span>
              </div>
            </div>
            <div className="uv-progress-right">
              <p>
                {selectedProposal.phase === 0
                  ? 'Currently in commit phase. Your choice is encrypted and recorded on the blockchain. No one can verify it until the reveal phase.'
                  : selectedProposal.phase === 1
                  ? 'Currently in reveal phase. You must reveal your vote to be counted in the final tally.'
                  : 'Voting has ended.'}
              </p>
            </div>
          </div>

          {/* Vote Counts (Hidden during commit phase) */}
          <div className="uv-vote-counts">
            <div className="uv-vote-count-item">
              <h3>For</h3>
              {selectedProposal.phase === 2 ? (
                <span className="uv-proposal-meta-value">{selectedProposal.forVotes} votes</span>
              ) : (
                <div className="uv-vote-count-hidden">
                  <span className="material-symbols-outlined">lock</span>
                  <div className="uv-vote-count-bar"></div>
                  <span className="uv-vote-count-label">Hidden</span>
                </div>
              )}
            </div>
            <div className="uv-vote-count-item">
              <h3>Against</h3>
              {selectedProposal.phase === 2 ? (
                <span className="uv-proposal-meta-value">{selectedProposal.againstVotes} votes</span>
              ) : (
                <div className="uv-vote-count-hidden">
                  <span className="material-symbols-outlined">lock</span>
                  <div className="uv-vote-count-bar"></div>
                  <span className="uv-vote-count-label">Hidden</span>
                </div>
              )}
            </div>
          </div>

          {/* Phase 2: Ended - Show Results */}
          {selectedProposal.phase === 2 ? (
            <div className="uv-voting-form">
              <div className="uv-voting-form-left">
                <VoteResult
                  proposalId={selectedProposal.id}
                  forVotes={selectedProposal.forVotes}
                  againstVotes={selectedProposal.againstVotes}
                  totalCommitments={selectedProposal.totalVotes}
                  revealedVotes={selectedProposal.revealedVotes}
                />
              </div>
              <div className="uv-voting-form-right">
                <div className="uv-proposal-details">
                  <h4>Proposal Details</h4>
                  <div className="uv-proposal-meta-list">
                    <div className="uv-proposal-meta-row">
                      <span className="label">Author</span>
                      <span className="value">{selectedProposal.creator.slice(0, 6)}...{selectedProposal.creator.slice(-4)}</span>
                    </div>
                    <div className="uv-proposal-meta-row">
                      <span className="label">Total Votes</span>
                      <span className="value">{selectedProposal.totalVotes}</span>
                    </div>
                  </div>
                </div>
                <div className="uv-zk-badge">
                  <span className="material-symbols-outlined">verified_user</span>
                  <p>Zero Knowledge Verification Active</p>
                </div>
              </div>
            </div>
          ) : selectedProposal.phase === 1 ? (
            /* Phase 1: Reveal Phase */
            <div className="uv-voting-form">
              <div className="uv-voting-form-left">
                <RevealForm
                  proposalId={selectedProposal.id}
                  revealEndTime={selectedProposal.revealEndTime}
                  onRevealSuccess={() => {
                    refetchProposalCount()
                  }}
                />
              </div>
              <div className="uv-voting-form-right">
                <div className="uv-proposal-details">
                  <h4>Proposal Details</h4>
                  <div className="uv-proposal-meta-list">
                    <div className="uv-proposal-meta-row">
                      <span className="label">Author</span>
                      <span className="value">{selectedProposal.creator.slice(0, 6)}...{selectedProposal.creator.slice(-4)}</span>
                    </div>
                    <div className="uv-proposal-meta-row">
                      <span className="label">Total Votes</span>
                      <span className="value">{selectedProposal.totalVotes}</span>
                    </div>
                  </div>
                </div>
                <div className="uv-zk-badge">
                  <span className="material-symbols-outlined">verified_user</span>
                  <p>Zero Knowledge Verification Active</p>
                </div>
              </div>
            </div>
          ) : address && hasVotedOnProposal(address, selectedProposal.id) ? (
            (() => {
              const myVote = getD2VoteForReveal(BigInt(selectedProposal.id), address)
              return (
                <div className="uv-voting-form">
                  <div className="uv-voting-form-left">
                    <h2>Vote Complete</h2>
                    {myVote && (
                      <div className="uv-success-stats" style={{ marginTop: '32px' }}>
                        <div className={`uv-success-stat ${myVote.choice === CHOICE_FOR ? 'primary' : ''}`}>
                          <p className="label">My Choice</p>
                          <p className="value">{myVote.choice === CHOICE_FOR ? 'For' : 'Against'}</p>
                        </div>
                        <div className="uv-success-stat">
                          <p className="label">Votes</p>
                          <p className="value">{Number(myVote.numVotes)} votes</p>
                        </div>
                        <div className="uv-success-stat">
                          <p className="label">TON Used</p>
                          <p className="value">{Number(myVote.creditsSpent)} TON</p>
                        </div>
                      </div>
                    )}
                    {myVote?.txHash && (
                      <a
                        href={`https://sepolia.etherscan.io/tx/${myVote.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="uv-tx-link"
                        style={{ marginTop: '32px', display: 'inline-flex' }}
                      >
                        View Transaction
                        <span className="material-symbols-outlined">north_east</span>
                      </a>
                    )}
                    <div className="uv-reveal-hint" style={{ marginTop: '48px' }}>
                      <span className="material-symbols-outlined">info</span>
                      <div className="uv-reveal-hint-content">
                        <p className="label">Reveal Hint</p>
                        <p>Vote results can be finalized on the blockchain within 24 hours after the reveal phase begins.</p>
                      </div>
                    </div>
                  </div>
                  <div className="uv-voting-form-right">
                    <div className="uv-proposal-details">
                      <h4>Proposal Details</h4>
                      <div className="uv-proposal-meta-list">
                        <div className="uv-proposal-meta-row">
                          <span className="label">Author</span>
                          <span className="value">{selectedProposal.creator.slice(0, 6)}...{selectedProposal.creator.slice(-4)}</span>
                        </div>
                        <div className="uv-proposal-meta-row">
                          <span className="label">Total Votes</span>
                          <span className="value">{selectedProposal.totalVotes}</span>
                        </div>
                      </div>
                    </div>
                    <div className="uv-zk-badge">
                      <span className="material-symbols-outlined">verified_user</span>
                      <p>Zero Knowledge Verification Active</p>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : !hasTon ? (
            <div className="uv-voting-form">
              <div className="uv-voting-form-left">
                <h2>Cast Your Vote</h2>
                <p style={{ marginTop: '24px', opacity: 0.7 }}>You need TON to vote</p>
                <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-submit-btn" style={{ marginTop: '24px', display: 'inline-flex', textDecoration: 'none' }}>
                  <TonIcon size={24} /> Get TON from Faucet
                </a>
              </div>
              <div className="uv-voting-form-right">
                <div className="uv-proposal-details">
                  <h4>Proposal Details</h4>
                  <div className="uv-proposal-meta-list">
                    <div className="uv-proposal-meta-row">
                      <span className="label">Author</span>
                      <span className="value">{selectedProposal.creator.slice(0, 6)}...{selectedProposal.creator.slice(-4)}</span>
                    </div>
                  </div>
                </div>
                <div className="uv-zk-badge">
                  <span className="material-symbols-outlined">verified_user</span>
                  <p>Zero Knowledge Verification Active</p>
                </div>
              </div>
            </div>
          ) : (
            /* Voting Flow - Matching proposal-detail.html */
            <div className="uv-voting-form">
              <div className="uv-voting-form-left">
                <h2>Cast Your Vote</h2>

                {/* Step 1: Direction */}
                <div className="uv-step">
                  <label className="uv-step-label">Step 1: Select Direction</label>
                  <div className="uv-direction-toggle">
                    <button
                      className={`uv-direction-btn for-btn ${selectedChoice === CHOICE_FOR ? 'active' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_FOR)}
                      disabled={isProcessing}
                    >
                      <span className="material-symbols-outlined">thumb_up</span>
                      <span>For</span>
                      <span className="uv-direction-btn-label">TON</span>
                    </button>
                    <button
                      className={`uv-direction-btn against-btn ${selectedChoice === CHOICE_AGAINST ? 'active' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_AGAINST)}
                      disabled={isProcessing}
                    >
                      <span className="material-symbols-outlined">thumb_down</span>
                      <span>Against</span>
                      <span className="uv-direction-btn-label">TON</span>
                    </button>
                  </div>
                </div>

                {/* Step 2: Intensity */}
                <div className="uv-step">
                  <div className="uv-intensity-header">
                    <label className="uv-step-label">Step 2: Intensity (Quadratic)</label>
                    <span className="uv-intensity-value">{numVotes} <span>votes</span></span>
                  </div>
                  <div className="uv-slider-container">
                    <div
                      className="uv-slider-value-tooltip"
                      style={{ left: `${((numVotes - 1) / Math.max(maxVotes - 1, 1)) * 100}%` }}
                    >
                      {numVotes} votes
                    </div>
                    <input
                      type="range"
                      min="1"
                      max={maxVotes}
                      value={numVotes}
                      onChange={(e) => setVotes(Number(e.target.value))}
                      className="uv-slider"
                      disabled={selectedChoice === null || isProcessing}
                    />
                  </div>
                  <div className="uv-slider-labels">
                    <span>1 vote</span>
                    <span>MAX {maxVotes} votes</span>
                  </div>
                </div>

                {/* Cost Display */}
                <div className="uv-cost-box">
                  <div className="uv-cost-content">
                    <div>
                      <p className="uv-cost-formula-label">Cost Formula</p>
                      <p className="uv-cost-formula">
                        Cost = {numVotes} × {numVotes} = <span className="highlight">{quadraticCost} TON</span>
                      </p>
                    </div>
                    {isHighCost && (
                      <div className="uv-cost-warning">
                        <span className="material-symbols-outlined">warning</span>
                        <p>High Cost Warning:<br />Using {costLevel.toFixed(0)}% of your balance</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  className="uv-submit-btn"
                  onClick={() => {
                    if (selectedChoice !== null) {
                      setPendingVoteChoice(selectedChoice)
                      setShowConfirmModal(true)
                    }
                  }}
                  disabled={selectedChoice === null || isProcessing || quadraticCost > totalVotingPower}
                >
                  Submit Vote
                </button>

                {error && <div className="uv-error">{error}</div>}
              </div>

              {/* Right Sidebar */}
              <div className="uv-voting-form-right">
                <div className="uv-proposal-details">
                  <h4>Proposal Details</h4>
                  <div className="uv-proposal-meta-list">
                    <div className="uv-proposal-meta-row">
                      <span className="label">Author</span>
                      <span className="value">{selectedProposal.creator.slice(0, 6)}...{selectedProposal.creator.slice(-4)}</span>
                    </div>
                    <div className="uv-proposal-meta-row">
                      <span className="label">Total Votes</span>
                      <span className="value">{selectedProposal.totalVotes}</span>
                    </div>
                  </div>
                </div>
                <div className="uv-zk-badge">
                  <span className="material-symbols-outlined">verified_user</span>
                  <p>Zero Knowledge Verification Active</p>
                </div>
              </div>
            </div>
          )}

          {/* Privacy Notice Footer */}
          {selectedProposal.phase === 0 && !hasVotedOnProposal(address || '', selectedProposal.id) && hasTon && (
            <div className="uv-privacy-notice">
              <span className="material-symbols-outlined">lock</span>
              Your choice is kept private and secure
            </div>
          )}
        </div>
      )}

      {/* VIEW: Success - Matching vote-complete.html */}
      {currentView === 'success' && (
        <div className="uv-success-view">
          {/* Confetti Overlay */}
          <div className="uv-confetti-overlay"></div>

          {/* Decorative corner squares */}
          <div className="uv-deco-square uv-deco-top-left"></div>
          <div className="uv-deco-square uv-deco-bottom-right"></div>

          <div className="uv-success-card">
            {/* Diamond Icon */}
            <div className="uv-success-icon">
              <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'white' }}>diamond</span>
            </div>

            <h1>Vote Complete!</h1>
            <p>Your vote has been securely submitted</p>

            {/* Vote Summary */}
            <div className="uv-success-summary">
              <div className="uv-success-proposal">
                <span className="label">Proposal</span>
                <span className="value">{selectedProposal?.title}</span>
              </div>
              <div className="uv-success-stats">
                <div className="uv-success-stat primary">
                  <p className="label">My Choice</p>
                  <p className="value">{selectedChoice === CHOICE_FOR ? 'For' : 'Against'}</p>
                </div>
                <div className="uv-success-stat">
                  <p className="label">Votes</p>
                  <p className="value">{numVotes} votes</p>
                </div>
                <div className="uv-success-stat">
                  <p className="label">TON Used</p>
                  <p className="value">{quadraticCost} TON</p>
                </div>
              </div>
            </div>

            {/* Transaction Link */}
            {txHash && (
              <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="uv-tx-link">
                View Transaction
                <span className="material-symbols-outlined">north_east</span>
              </a>
            )}

            {/* Reveal Hint Box */}
            <div className="uv-reveal-hint">
              <span className="material-symbols-outlined">info</span>
              <div className="uv-reveal-hint-content">
                <p className="label">Reveal Hint</p>
                <p>Vote results can be finalized on the blockchain within 24 hours after the reveal phase begins.</p>
              </div>
            </div>

            {/* Back Button */}
            <button
              className="uv-success-button"
              onClick={() => {
                setRefreshTrigger(prev => prev + 1)
                setCurrentView('list')
                setSelectedProposal(null)
                setSelectedChoice(null)
                resetVoting()
              }}
            >
              Back to List
            </button>
          </div>
        </div>
      )}

      {/* Pre-Flight Confirmation Modal - Brutalist Style */}
      {showConfirmModal && pendingVoteChoice !== null && (
        <div className="uv-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="uv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="uv-modal-header">
              <h2>Confirm Vote</h2>
            </div>

            <div className="uv-modal-content">
              <div className="uv-modal-vote-info">
                <div className="uv-modal-row">
                  <span>Choice</span>
                  <strong className={pendingVoteChoice === CHOICE_FOR ? 'uv-for' : 'uv-against'}>
                    {pendingVoteChoice === CHOICE_FOR ? 'For' : 'Against'}
                  </strong>
                </div>
                <div className="uv-modal-row">
                  <span>Votes</span>
                  <strong>{numVotes} votes</strong>
                </div>
                <div className="uv-modal-row">
                  <span>TON Used</span>
                  <strong>{quadraticCost} TON</strong>
                </div>
              </div>

              <div className="uv-modal-warning">
                <span className="material-symbols-outlined">warning</span>
                <div className="uv-modal-warning-text">
                  <strong>This is final</strong>
                  <p>You can only vote once per proposal. This decision cannot be changed or cancelled later.</p>
                </div>
              </div>
            </div>

            <div className="uv-modal-buttons">
              <button
                className="uv-modal-btn uv-modal-btn-secondary"
                onClick={() => {
                  setShowConfirmModal(false)
                  setPendingVoteChoice(null)
                }}
              >
                Cancel
              </button>
              <button
                className="uv-modal-btn uv-modal-btn-primary"
                onClick={() => {
                  setShowConfirmModal(false)
                  handleVote(pendingVoteChoice)
                }}
              >
                Confirm & Sign
              </button>
            </div>
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

interface DecodedProposal {
  title: string
  creator: string
  endTime: bigint
  revealEndTime: bigint
  totalVotes: bigint
  totalCreditsSpent: bigint
  creditRoot: bigint
  forVotes: bigint
  againstVotes: bigint
  revealedVotes: bigint
}

function decodeProposalResult(hex: string): DecodedProposal {
  try {
    if (!hex || hex === '0x' || hex.length < 66) {
      return { title: '', creator: '', endTime: 0n, revealEndTime: 0n, totalVotes: 0n, totalCreditsSpent: 0n, creditRoot: 0n, forVotes: 0n, againstVotes: 0n, revealedVotes: 0n }
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
      revealEndTime: decoded[6] as bigint,
      totalVotes: decoded[12] as bigint,  // totalCommitments
      totalCreditsSpent: decoded[11] as bigint,
      creditRoot: decoded[7] as bigint,
      forVotes: decoded[8] as bigint,
      againstVotes: decoded[9] as bigint,
      revealedVotes: decoded[13] as bigint,
    }
  } catch (e) {
    console.error('Failed to decode proposal:', e)
    return { title: '', creator: '', endTime: 0n, revealEndTime: 0n, totalVotes: 0n, totalCreditsSpent: 0n, creditRoot: 0n, forVotes: 0n, againstVotes: 0n, revealedVotes: 0n }
  }
}

// Phase calculation function (based on local time)
function calculatePhase(endTime: Date, revealEndTime: Date): 0 | 1 | 2 {
  const now = new Date()
  if (now <= endTime) return 0  // Commit Phase
  if (now <= revealEndTime) return 1  // Reveal Phase
  return 2  // Ended
}
