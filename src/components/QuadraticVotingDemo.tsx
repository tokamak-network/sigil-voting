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
import { PhaseIndicator, RevealForm, VoteResult } from './voting'
import config from '../config.json'

const ZK_VOTING_FINAL_ADDRESS = (config.contracts.zkVotingFinal || '0x0000000000000000000000000000000000000000') as `0x${string}`
const TON_TOKEN_ADDRESS = (config.contracts.tonToken || '0xa30fe40285B8f5c0457DbC3B7C8A280373c40044') as `0x${string}`

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
  // D2 Phase 관련 함수 (Reveal Phase 지원)
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
  revealEndTime: Date      // 공개 마감 시간
  totalVotes: number       // Total commitments (public)
  totalCreditsSpent: number  // Total TON spent (내부 용도)
  creditRoot: bigint
  // Phase 관련 필드
  phase: 0 | 1 | 2         // 0=Commit, 1=Reveal, 2=Ended
  forVotes: number         // 찬성 투표 수 (Reveal 후)
  againstVotes: number     // 반대 투표 수 (Reveal 후)
  revealedVotes: number    // 공개된 투표 수
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

  // Rule #3: Live countdown timer
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

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

  // Rule #1: Gatekeeping - 100 TON required for proposal creation
  const MIN_TON_FOR_PROPOSAL = 100
  const canCreateProposal = tonBalanceFormatted >= MIN_TON_FOR_PROPOSAL

  // Use contract credits for voting power (default 10000 if not initialized)
  const totalVotingPower = availableCredits ? Number(availableCredits) : 10000

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
              const endTime = new Date(Number(decoded.endTime) * 1000)
              const revealEndTime = new Date(Number(decoded.revealEndTime) * 1000)
              fetchedProposals.push({
                id: i,
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
    if (!newProposalTitle.trim() || !publicClient || !address || !keyPair) return
    setIsCreatingProposal(true)
    setError(null)
    setCreateStatus('준비 중...')

    try {
      // Get existing registered credit notes
      let creditNotes = [...((registeredCreditNotes as bigint[]) || [])]

      // Register creator's creditNote for creditRoot (but won't auto-vote)
      setCreateStatus('투표자 등록 확인 중...')
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      const noteHash = creditNote.creditNoteHash
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

      // Build creditRoot from all registered notes
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

      // Create proposal (NO auto-vote, creator votes separately if they want)
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
  }, [newProposalTitle, publicClient, writeContractAsync, refetchProposalCount, address, keyPair, totalVotingPower, registeredCreditNotes, refetchCreditNotes])

  const handleVote = useCallback(async (choice: VoteChoice) => {
    if (!keyPair || !selectedProposal || !hasTon || !address || !publicClient) return
    if (quadraticCost > totalVotingPower) {
      setError('TON이 부족합니다')
      return
    }

    // Check if already voted (local check to save gas)
    if (hasVotedOnProposal(address, selectedProposal.id)) {
      setError('이미 이 제안에 투표하셨습니다. 제안당 1번만 투표할 수 있습니다.')
      return
    }

    setSelectedChoice(choice)
    setError(null)
    startVote() // State: IDLE -> PROOFING

    try {
      const proposalId = BigInt(selectedProposal.id)

      // Step 1: Get or create creditNote
      updateProgress(5, '투표자 정보 확인 중...')
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        updateProgress(8, '투표자 등록 준비 중...')
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      // Step 2: Get current registered creditNotes
      let creditNotes = [...((registeredCreditNotes as bigint[]) || [])]
      const noteHash = creditNote.creditNoteHash

      // Step 3: Auto-register creditNote if needed
      if (!creditNotes.includes(noteHash)) {
        updateProgress(10, '투표자 등록 중...')
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

      // Step 4: Generate creditRoot with all registered notes
      updateProgress(15, '투표 권한 설정 중...')
      const { root: dynamicCreditRoot } = await generateMerkleProofAsync(creditNotes, creditNotes.indexOf(noteHash))

      // Step 5: Register creditRoot if not already registered
      const isCreditRootValid = await publicClient.readContract({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: [{ type: 'function', name: 'isCreditRootValid', inputs: [{ name: '_creditRoot', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' }] as const,
        functionName: 'isCreditRootValid',
        args: [dynamicCreditRoot],
      })

      if (!isCreditRootValid) {
        updateProgress(18, '투표 권한 등록 중...')
        const registerRootHash = await writeContractAsync({
          address: ZK_VOTING_FINAL_ADDRESS,
          abi: ZK_VOTING_FINAL_ABI,
          functionName: 'registerCreditRoot',
          args: [dynamicCreditRoot],
        })
        await publicClient.waitForTransactionReceipt({ hash: registerRootHash })
      }

      // Step 6: Prepare vote data
      updateProgress(20, '투표 데이터 준비 중...')
      const voteData = await prepareD2VoteAsync(keyPair, choice, BigInt(numVotes), proposalId)

      updateProgress(25, 'ZK 증명 준비 중...')

      // Step 7: Generate ZK proof using dynamic creditRoot
      const { proof, nullifier, commitment } = await generateQuadraticProof(
        keyPair,
        creditNote,
        voteData,
        dynamicCreditRoot,
        creditNotes,
        (progress) => updateProgress(30 + Math.floor(progress.progress * 0.25), progress.message)
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

      updateProgress(55, '투표 트랜잭션 서명 대기...')

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

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash })
      }

      storeD2VoteForReveal(proposalId, voteData, address)
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
        userMessage = '트랜잭션이 취소되었습니다'
      } else if (errorMsg.includes('NullifierAlreadyUsed') || errorMsg.includes('already used') || errorMsg.includes('0x3c712b18')) {
        userMessage = '이미 이 제안에 투표하셨습니다. 제안당 1번만 투표할 수 있습니다.'
      } else if (errorMsg.includes('NotInCommitPhase') || errorMsg.includes('commit phase')) {
        userMessage = '투표 기간이 종료되었습니다.'
      } else if (errorMsg.includes('ProposalNotFound')) {
        userMessage = '제안을 찾을 수 없습니다.'
      } else if (errorMsg.includes('InvalidProof')) {
        userMessage = 'ZK 증명 검증에 실패했습니다. 다시 시도해주세요.'
      } else if (errorMsg.includes('InsufficientCredits')) {
        userMessage = 'TON이 부족합니다.'
      } else if (errorMsg.includes('InvalidQuadraticCost')) {
        userMessage = '투표 비용 계산 오류입니다.'
      } else if (errorMsg.includes('insufficient funds')) {
        userMessage = 'Sepolia ETH가 부족합니다. Faucet에서 받아주세요.'
      } else if (errorMsg.includes('이전 버전') || errorMsg.includes('새 제안을 생성')) {
        userMessage = errorMsg // Already user-friendly from zkproof.ts
      } else if (errorMsg.includes('TON transfer failed') || errorMsg.includes('transfer failed')) {
        userMessage = 'TON 전송에 실패했습니다. 잔액을 확인해주세요.'
      } else if (errorMsg.includes('Only TON token can call')) {
        userMessage = '잘못된 컨트랙트 호출입니다.'
      } else if (errorMsg.includes('Insufficient approved amount')) {
        userMessage = 'TON 승인 금액이 부족합니다.'
      }

      setVotingError(userMessage)
      setError(userMessage)
    }
  }, [keyPair, selectedProposal, hasTon, address, numVotes, quadraticCost, totalVotingPower, registeredCreditNotes, writeContractAsync, refetchCredits, startVote, updateProgress, proofComplete, signed, txConfirmed, setVotingError, publicClient])

  const getIntensityColor = () => {
    if (isDanger) return { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#fca5a5' }
    if (isHighCost) return { bg: 'rgba(251, 191, 36, 0.15)', border: '#f59e0b', text: '#fcd34d' }
    return { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#86efac' }
  }

  const colors = getIntensityColor()

  // Check if current user is a registered voter
  const isRegisteredVoter = (() => {
    if (!address) return false
    const creditNote = getStoredCreditNote(address)
    if (!creditNote) return false
    const creditNotes = (registeredCreditNotes as bigint[]) || []
    return creditNotes.includes(creditNote.creditNoteHash)
  })()

  return (
    <div className="unified-voting">
      {/* TON Dashboard Header */}
      {isConnected && (
        <div className="uv-dashboard">
          <div className="uv-dashboard-row">
            <div className="uv-dashboard-item">
              <div className="uv-dashboard-label">내 잔액</div>
              <div className="uv-dashboard-value">
                <TonIcon size={20} /> {totalVotingPower.toLocaleString()} TON
              </div>
            </div>
            <div className="uv-dashboard-item">
              <div className="uv-dashboard-label">투표자 등록</div>
              <div className={`uv-dashboard-value ${isRegisteredVoter ? 'uv-status-active' : 'uv-status-inactive'}`}>
                {isRegisteredVoter ? '✓ 등록됨' : '미등록'}
              </div>
            </div>
            <div className="uv-dashboard-item">
              <div className="uv-dashboard-label">지갑</div>
              <div className="uv-dashboard-value uv-dashboard-address">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
              </div>
            </div>
          </div>
          {!hasTon && (
            <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-get-credits-btn">
              <TonIcon size={14} /> Faucet에서 TON 받기
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
              <div className="uv-create-btn-wrapper">
                <button
                  className={`uv-create-btn ${!canCreateProposal ? 'uv-btn-disabled' : ''}`}
                  onClick={() => canCreateProposal && setCurrentView('create')}
                  disabled={!canCreateProposal}
                >
                  + 새 제안
                </button>
                {!canCreateProposal && (
                  <span className="uv-tooltip">100 TON 이상 필요</span>
                )}
              </div>
            )}
          </div>

          {!isConnected ? (
            <div className="uv-card uv-center">
              <div className="uv-icon"><TonIcon size={48} /></div>
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
              <div className="uv-icon"><TonIcon size={48} /></div>
              <h2>아직 제안이 없습니다</h2>
              <p className="uv-subtitle">첫 번째 제안을 만들어보세요</p>
              {canCreateProposal ? (
                <button className="uv-btn uv-btn-primary" onClick={() => setCurrentView('create')}>
                  제안 만들기
                </button>
              ) : (
                <div className="uv-ineligible-notice">
                  <p><TonIcon size={14} /> 제안 생성에는 {MIN_TON_FOR_PROPOSAL} TON 이상이 필요합니다</p>
                  <p className="uv-balance-info">현재 잔액: {tonBalanceFormatted.toFixed(2)} TON</p>
                </div>
              )}
            </div>
          ) : (
            <div className="uv-proposals-grid">
              {proposals.map(proposal => {
                const phaseLabels = ['투표 중', '공개 중', '종료'] as const
                const phaseColors = ['#007aff', '#f59e0b', '#6b7280'] as const
                return (
                  <div
                    key={proposal.id}
                    className={`uv-proposal-card ${proposal.phase === 2 ? 'uv-proposal-expired' : ''}`}
                    onClick={() => {
                      setSelectedProposal(proposal)
                      setCurrentView('vote')
                    }}
                  >
                    <div className="uv-proposal-header">
                      <div className="uv-proposal-id">#{proposal.id}</div>
                      <div
                        className="uv-phase-badge"
                        style={{ background: phaseColors[proposal.phase] }}
                      >
                        {phaseLabels[proposal.phase]}
                      </div>
                    </div>
                    <h3>{proposal.title}</h3>
                    <div className="uv-proposal-stats">
                      <div className="uv-stat">
                        <span className="uv-stat-value">{proposal.totalVotes}</span>
                        <span className="uv-stat-label">참여</span>
                      </div>
                      {proposal.phase === 2 && (
                        <div className="uv-stat">
                          <span className="uv-stat-value">{proposal.forVotes > proposal.againstVotes ? '찬성' : proposal.againstVotes > proposal.forVotes ? '반대' : '동률'}</span>
                          <span className="uv-stat-label">결과</span>
                        </div>
                      )}
                    </div>
                    <div className="uv-proposal-meta">
                      <span>{proposal.creator.slice(0, 6)}...{proposal.creator.slice(-4)}</span>
                    </div>
                  </div>
                )
              })}
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

      {/* VIEW: Vote - New CEO-approved flow */}
      {currentView === 'vote' && selectedProposal && (
        <div className="uv-vote-view">
          {/* Loading Overlay (Rule #6) */}
          {isProcessing && (
            <div className="uv-loading-overlay">
              <div className="uv-loading-content">
                <div className="uv-spinner-large"></div>
                <p className="uv-loading-text">{votingContext.message}</p>
                <div className="uv-progress-bar">
                  <div className="uv-progress-fill" style={{ width: `${votingContext.progress}%` }} />
                </div>
              </div>
            </div>
          )}

          <button className="uv-back" onClick={() => { setCurrentView('list'); setSelectedProposal(null); setSelectedChoice(null); setError(null); resetVoting(); setVotes(1); }} disabled={isProcessing}>
            ← 목록으로
          </button>

          <div className="uv-card uv-vote-card">
            <h1>{selectedProposal.title}</h1>

            {/* Phase Indicator */}
            <PhaseIndicator
              phase={selectedProposal.phase}
              endTime={selectedProposal.endTime}
              revealEndTime={selectedProposal.revealEndTime}
            />

            {/* Public Stats - Total votes visible, For/Against hidden during Commit */}
            <div className="uv-vote-stats">
              <div className="uv-vote-stat">
                <span className="uv-vote-stat-value">{selectedProposal.totalVotes}</span>
                <span className="uv-vote-stat-label">참여자</span>
              </div>
              {selectedProposal.phase === 2 ? (
                <>
                  <div className="uv-vote-stat">
                    <span className="uv-vote-stat-value">{selectedProposal.forVotes}</span>
                    <span className="uv-vote-stat-label">찬성</span>
                  </div>
                  <div className="uv-vote-stat">
                    <span className="uv-vote-stat-value">{selectedProposal.againstVotes}</span>
                    <span className="uv-vote-stat-label">반대</span>
                  </div>
                </>
              ) : (
                <div className="uv-vote-stat uv-vote-stat-hidden">
                  <span className="uv-vote-stat-value">🔒</span>
                  <span className="uv-vote-stat-label">찬성/반대</span>
                </div>
              )}
            </div>

            <div className="uv-proposal-info">
              <span>제안자: {selectedProposal.creator.slice(0, 6)}...{selectedProposal.creator.slice(-4)}</span>
            </div>

            {/* Phase 2: Ended - Show Results */}
            {selectedProposal.phase === 2 ? (
              <VoteResult
                proposalId={selectedProposal.id}
                forVotes={selectedProposal.forVotes}
                againstVotes={selectedProposal.againstVotes}
                totalCommitments={selectedProposal.totalVotes}
                revealedVotes={selectedProposal.revealedVotes}
              />
            ) : selectedProposal.phase === 1 ? (
              /* Phase 1: Reveal Phase */
              <RevealForm
                proposalId={selectedProposal.id}
                revealEndTime={selectedProposal.revealEndTime}
                onRevealSuccess={() => {
                  // 제안 목록 새로고침
                  refetchProposalCount()
                }}
              />
            ) : address && hasVotedOnProposal(address, selectedProposal.id) ? (
              <div className="uv-voted-state">
                <div className="uv-voted-icon"><TonIcon size={32} /></div>
                <h2>투표 완료</h2>
                <p className="uv-encrypted-notice">투표 내용이 암호화되었습니다</p>
                <p className="uv-reveal-notice">공개 단계까지 비밀이 유지됩니다</p>
              </div>
            ) : !hasTon ? (
              /* No TON State */
              <div className="uv-no-token-notice">
                <p>투표하려면 TON이 필요합니다</p>
                <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-btn uv-btn-primary">
                  <TonIcon size={14} /> Faucet에서 TON 받기
                </a>
              </div>
            ) : (
              /* Voting Flow (Rule #3, #4) */
              <>
                {/* Section A: Direction Toggle */}
                <div className="uv-section">
                  <label className="uv-section-label">1. 투표 방향 선택</label>
                  <div className="uv-direction-toggle">
                    <button
                      className={`uv-toggle-btn uv-toggle-for ${selectedChoice === CHOICE_FOR ? 'active' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_FOR)}
                      disabled={isProcessing}
                    >
                      <TonIcon size={18} /> 찬성
                    </button>
                    <button
                      className={`uv-toggle-btn uv-toggle-against ${selectedChoice === CHOICE_AGAINST ? 'active' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_AGAINST)}
                      disabled={isProcessing}
                    >
                      <TonIcon size={18} /> 반대
                    </button>
                  </div>
                </div>

                {/* Section B: Intensity Slider (only enabled after direction selected) */}
                <div className={`uv-section ${selectedChoice === null ? 'disabled' : ''}`}>
                  <label className="uv-section-label">2. 투표 강도</label>
                  <div className="uv-intensity-section">
                    <div className="uv-slider-container">
                      <input
                        type="range"
                        min="1"
                        max={maxVotes}
                        value={numVotes}
                        onChange={(e) => setVotes(Number(e.target.value))}
                        className="uv-slider"
                        disabled={selectedChoice === null || isProcessing}
                        style={{
                          background: `linear-gradient(to right, ${colors.border} 0%, ${colors.border} ${(numVotes / maxVotes) * 100}%, #374151 ${(numVotes / maxVotes) * 100}%, #374151 100%)`
                        }}
                      />
                    </div>
                    <div className="uv-intensity-display">
                      <div className="uv-votes-display">
                        <span className="uv-votes-number">{numVotes}</span>
                        <span className="uv-votes-label">표</span>
                      </div>
                      <div className="uv-cost-display">
                        <TonIcon size={20} />
                        <span className="uv-cost-number">{quadraticCost}</span>
                        <span className="uv-cost-label">TON</span>
                      </div>
                    </div>
                    <div className="uv-cost-formula">
                      비용 = {numVotes} × {numVotes} = {quadraticCost} TON
                    </div>
                    {isDanger && <div className="uv-warning-text">잔액의 {costLevel.toFixed(0)}%를 사용합니다</div>}
                  </div>
                </div>

                {/* Section C: Single Cast Vote Button */}
                <div className="uv-section">
                  <button
                    className="uv-cast-vote-btn"
                    onClick={() => {
                      if (selectedChoice !== null) {
                        setPendingVoteChoice(selectedChoice)
                        setShowConfirmModal(true)
                      }
                    }}
                    disabled={selectedChoice === null || isProcessing || quadraticCost > totalVotingPower}
                  >
                    {selectedChoice === null ? '방향을 먼저 선택하세요' : '투표하기'}
                  </button>
                </div>

                {error && <div className="uv-error">{error}</div>}

                <div className="uv-privacy-notice">
                  <TonIcon size={14} /> 투표 내용은 공개 전까지 암호화됩니다
                </div>
              </>
            )}
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
            <div className="uv-icon uv-success-icon"><TonIcon size={48} /></div>
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
                <strong><TonIcon size={16} /> {quadraticCost} TON</strong>
              </div>
              <div className="uv-result-row uv-hidden">
                <span>선택</span>
                <strong><TonIcon size={14} /> 공개 대기 중</strong>
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
                resetVoting()
              }}
            >
              목록으로 돌아가기
            </button>
          </div>
        </div>
      )}

      {/* Rule #7 & #8: Pre-Flight Confirmation Modal */}
      {showConfirmModal && pendingVoteChoice !== null && (
        <div className="uv-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="uv-modal" onClick={(e) => e.stopPropagation()}>
            <h2>투표 확인</h2>

            <div className="uv-modal-content">
              <div className="uv-modal-vote-info">
                <div className="uv-modal-row">
                  <span>선택</span>
                  <strong className={pendingVoteChoice === CHOICE_FOR ? 'uv-for' : 'uv-against'}>
                    {pendingVoteChoice === CHOICE_FOR ? '찬성' : '반대'}
                  </strong>
                </div>
                <div className="uv-modal-row">
                  <span>투표 수</span>
                  <strong>{numVotes}표</strong>
                </div>
                <div className="uv-modal-row">
                  <span>사용 TON</span>
                  <strong><TonIcon size={16} /> {quadraticCost} TON</strong>
                </div>
              </div>

              {/* Rule #7: One-Shot Warning (Red) */}
              <div className="uv-modal-warning">
                <span className="uv-warning-icon">⚠️</span>
                <div className="uv-warning-text">
                  <strong>최종 결정입니다</strong>
                  <p>제안당 1번만 투표할 수 있습니다. 이 결정은 나중에 변경하거나 취소할 수 없습니다.</p>
                </div>
              </div>
            </div>

            <div className="uv-modal-buttons">
              <button
                className="uv-btn uv-btn-secondary"
                onClick={() => {
                  setShowConfirmModal(false)
                  setPendingVoteChoice(null)
                }}
              >
                취소
              </button>
              <button
                className="uv-btn uv-btn-primary"
                onClick={() => {
                  setShowConfirmModal(false)
                  handleVote(pendingVoteChoice)
                }}
              >
                확인 및 서명
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

// Phase 계산 함수 (로컬 시간 기반)
function calculatePhase(endTime: Date, revealEndTime: Date): 0 | 1 | 2 {
  const now = new Date()
  if (now <= endTime) return 0  // Commit Phase
  if (now <= revealEndTime) return 1  // Reveal Phase
  return 2  // Ended
}
