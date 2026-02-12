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

// 제안 생성에 필요한 최소 TON 잔액 (수수료 아님, 잔액 요구사항)
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

  // 필터 및 검색
  const [filterPhase, setFilterPhase] = useState<'all' | 0 | 1 | 2>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // initialProposalId prop 변경 감지
  useEffect(() => {
    if (initialProposalId !== null && initialProposalId !== undefined) {
      setPendingInitialProposalId(initialProposalId)
    }
  }, [initialProposalId])


  // Rule #3: Live countdown timer (1초마다 업데이트)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  // 선택된 제안의 phase 자동 업데이트 (투표→공개→종료 자동 전환)
  useEffect(() => {
    if (!selectedProposal) return

    const currentPhase = calculatePhase(selectedProposal.endTime, selectedProposal.revealEndTime)
    if (currentPhase !== selectedProposal.phase) {
      // Phase가 변경됨 - 제안 데이터 업데이트
      setSelectedProposal(prev => prev ? { ...prev, phase: currentPhase } : null)
      // 목록도 새로고침
      setRefreshTrigger(t => t + 1)
    }
  }, [selectedProposal, tick]) // tick 의존성 추가로 매초 체크

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

  // 지갑 연결 해제 시 리스트로 돌아가기
  useEffect(() => {
    if (!isConnected) {
      setCurrentView('list')
      setSelectedProposal(null)
      setSelectedChoice(null)
    }
  }, [isConnected])

  // Fetch proposals
  // 첫 로딩 여부 추적
  const [isFirstLoad, setIsFirstLoad] = useState(true)

  // Helper: 단일 제안 fetch
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

  // 선택된 제안 우선 로드 (즉시 상세 화면으로 이동)
  useEffect(() => {
    const loadInitialProposal = async () => {
      if (!pendingInitialProposalId || pendingInitialProposalId <= 0) return

      // 이미 proposals에 있으면 바로 선택
      const existing = proposals.find(p => p.id === pendingInitialProposalId)
      if (existing) {
        setSelectedProposal(existing)
        setCurrentView('vote')
        setPendingInitialProposalId(null)
        onProposalViewed?.()
        return
      }

      // 없으면 해당 제안만 빠르게 fetch
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
      // 첫 로딩일 때만 로딩 표시 (새로고침 시 깜빡임 방지)
      if (isFirstLoad) {
        setIsLoadingProposals(true)
      }

      if (!proposalCount || proposalCount === 0n) {
        setIsLoadingProposals(false)
        setIsFirstLoad(false)
        return
      }

      const count = Number(proposalCount)

      // 병렬로 모든 제안 fetch (더 빠름)
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
      timeout: 60_000, // 60초 타임아웃
      confirmations: 1,
      pollingInterval: 500, // 500ms로 빠르게 폴링
    })
  }, [publicClient])

  // 제안 생성 가능 여부
  const canCreateProposal = totalVotingPower >= MIN_TON_FOR_PROPOSAL

  const handleCreateProposal = useCallback(async () => {
    if (!newProposalTitle.trim() || !publicClient || !address || !keyPair) return
    if (!canCreateProposal) {
      setError(`제안 생성에는 최소 ${MIN_TON_FOR_PROPOSAL} TON 잔액이 필요합니다`)
      return
    }
    setIsCreatingProposal(true)
    setError(null)
    setCreateStatus('준비 중...')
    setCreateProgress(10)

    try {
      // Get existing registered credit notes
      const creditNotes = [...((registeredCreditNotes as bigint[]) || [])]

      // Register creator's creditNote for creditRoot (but won't auto-vote)
      setCreateStatus('크레딧 노트 생성 중...')
      setCreateProgress(20)
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      const noteHash = creditNote.creditNoteHash
      if (!creditNotes.includes(noteHash)) {
        setCreateStatus('크레딧 노트 등록 중...')
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
      setCreateStatus('머클 루트 생성 중...')
      setCreateProgress(50)
      const { root: creditRoot } = await generateMerkleProofAsync(creditNotes, 0)

      // Register this creditRoot
      setCreateStatus('루트 등록 중, 지갑 승인 필요...')
      setCreateProgress(60)
      const registerRootHash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'registerCreditRoot',
        args: [creditRoot],
      })
      setCreateStatus('블록 처리 중...')
      setCreateProgress(70)
      await waitForTx(registerRootHash)

      // Create proposal (NO auto-vote, creator votes separately if they want)
      setCreateStatus('제안 생성 중, 지갑 승인 필요...')
      setCreateProgress(80)
      const createHash = await writeContractAsync({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: ZK_VOTING_FINAL_ABI,
        functionName: 'createProposalD2',
        args: [newProposalTitle, '', creditRoot, BigInt(240), BigInt(240)], // 테스트: 4분 투표, 4분 공개
      })

      setCreateStatus('블록 처리 중...')
      setCreateProgress(90)
      await waitForTx(createHash)

      setCreateProgress(100)
      setCreateStatus('완료!')
      await refetchProposalCount()
      setNewProposalTitle('')

      // 잠시 후 목록으로 이동
      setTimeout(() => {
        setCreateStatus(null)
        setCreateProgress(0)
        setCurrentView('list')
      }, 500)
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
      setCreateProgress(0)
    } finally {
      setIsCreatingProposal(false)
      if (!createStatus?.includes('완료')) {
        setCreateStatus(null)
        setCreateProgress(0)
      }
    }
  }, [newProposalTitle, publicClient, writeContractAsync, refetchProposalCount, address, keyPair, totalVotingPower, registeredCreditNotes, refetchCreditNotes, waitForTx, createStatus])

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
      updateProgress(5, '잠시만 기다려주세요...')
      let creditNote: CreditNote | null = getStoredCreditNote(address)
      if (!creditNote) {
        updateProgress(8, '잠시만 기다려주세요...')
        creditNote = await createCreditNoteAsync(keyPair, BigInt(totalVotingPower), address)
      }

      // Step 2: Get current registered creditNotes
      const creditNotes = [...((registeredCreditNotes as bigint[]) || [])]
      const noteHash = creditNote.creditNoteHash

      // Step 3: Auto-register creditNote if needed
      if (!creditNotes.includes(noteHash)) {
        updateProgress(10, '잠시만 기다려주세요...')
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
      updateProgress(15, '잠시만 기다려주세요...')
      const { root: dynamicCreditRoot } = await generateMerkleProofAsync(creditNotes, creditNotes.indexOf(noteHash))

      // Step 5: Register creditRoot if not already registered
      const isCreditRootValid = await publicClient.readContract({
        address: ZK_VOTING_FINAL_ADDRESS,
        abi: [{ type: 'function', name: 'isCreditRootValid', inputs: [{ name: '_creditRoot', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' }] as const,
        functionName: 'isCreditRootValid',
        args: [dynamicCreditRoot],
      })

      if (!isCreditRootValid) {
        updateProgress(18, '잠시만 기다려주세요...')
        const registerRootHash = await writeContractAsync({
          address: ZK_VOTING_FINAL_ADDRESS,
          abi: ZK_VOTING_FINAL_ABI,
          functionName: 'registerCreditRoot',
          args: [dynamicCreditRoot],
        })
        await waitForTx(registerRootHash)
      }

      // Step 6: Prepare vote data
      updateProgress(20, '투표 준비 중...')
      const voteData = await prepareD2VoteAsync(keyPair, choice, BigInt(numVotes), proposalId)

      updateProgress(25, '투표 준비 중...')

      // Step 7: Generate ZK proof using dynamic creditRoot
      const { proof, nullifier, commitment } = await generateQuadraticProof(
        keyPair,
        creditNote,
        voteData,
        dynamicCreditRoot,
        creditNotes,
        (progress) => updateProgress(30 + Math.floor(progress.progress * 0.25), '투표 준비 중...')
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

      updateProgress(55, '지갑에서 승인해주세요')

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
        userMessage = '트랜잭션이 취소되었습니다'
      } else if (errorMsg.includes('NullifierAlreadyUsed') || errorMsg.includes('already used') || errorMsg.includes('0x3c712b18')) {
        userMessage = '이미 이 제안에 투표하셨습니다. 제안당 1번만 투표할 수 있습니다.'
      } else if (errorMsg.includes('NotInCommitPhase') || errorMsg.includes('commit phase')) {
        userMessage = '투표 기간이 종료되었습니다.'
      } else if (errorMsg.includes('ProposalNotFound')) {
        userMessage = '제안을 찾을 수 없습니다.'
      } else if (errorMsg.includes('InvalidProof')) {
        userMessage = 'ZK 증명 검증에 실패했습니다. 다시 시도해주세요.'
      } else if (errorMsg.includes('fetch') || errorMsg.includes('Failed to fetch') || errorMsg.includes('로드할 수 없')) {
        userMessage = '회로 파일을 로드할 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.'
      } else if (errorMsg.includes('memory') || errorMsg.includes('Memory')) {
        userMessage = '메모리 부족. 다른 탭을 닫고 다시 시도해주세요.'
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
                <h1>제안 목록</h1>
                <span className="uv-list-header-badge">DAO Governance</span>
              </div>
              <p className="uv-list-header-subtitle">ZK-Proof 기반의 익명 투표 시스템에 참여하세요.</p>
            </div>
            {isConnected && (
              <div className="uv-header-actions">
                <div className="uv-balance-card">
                  <div className="uv-balance-card-header">
                    <span className="uv-balance-card-label">Available Balance</span>
                    {!hasTon && (
                      <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-balance-card-link">
                        TON 받기 →
                      </a>
                    )}
                  </div>
                  <div className="uv-balance-card-content">
                    <span className="uv-balance-amount">{totalVotingPower.toLocaleString()} TON</span>
                    <span className="uv-balance-hint">최대 {maxVotes}표 가능</span>
                  </div>
                </div>
                <button
                  className="uv-create-btn"
                  onClick={() => setCurrentView('create')}
                >
                  <span className="material-symbols-outlined">add</span>
                  새 제안
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
              <p>지갑을 연결하고 투표에 참여하세요</p>
              <button className="uv-create-btn" onClick={handleConnect}>
                <span className="material-symbols-outlined">account_balance_wallet</span>
                지갑 연결
              </button>
            </div>
          ) : isLoadingProposals ? (
            <div className="uv-empty-state">
              <div className="uv-empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'white' }}>sync</span>
              </div>
              <FingerprintLoader progress={votingContext.progress} />
              <p>제안 목록 불러오는 중...</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="uv-empty-state">
              <div className="uv-empty-icon">
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'white' }}>inbox</span>
              </div>
              <h2>아직 제안이 없습니다</h2>
              <p>첫 번째 제안을 만들어보세요</p>
              <button className="uv-create-btn" onClick={() => setCurrentView('create')}>
                <span className="material-symbols-outlined">add</span>
                제안 만들기
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
                    전체 ({proposals.length})
                  </button>
                  <button
                    className={`uv-filter-tab ${filterPhase === 0 ? 'active' : ''}`}
                    onClick={() => setFilterPhase(0)}
                  >
                    <span className="uv-filter-dot voting"></span>
                    투표 중 ({proposals.filter(p => p.phase === 0).length})
                  </button>
                  <button
                    className={`uv-filter-tab ${filterPhase === 1 ? 'active' : ''}`}
                    onClick={() => setFilterPhase(1)}
                  >
                    <span className="uv-filter-dot reveal"></span>
                    공개 중 ({proposals.filter(p => p.phase === 1).length})
                  </button>
                  <button
                    className={`uv-filter-tab ${filterPhase === 2 ? 'active' : ''}`}
                    onClick={() => setFilterPhase(2)}
                  >
                    종료 ({proposals.filter(p => p.phase === 2).length})
                  </button>
                </div>
                <div className="uv-search-wrapper">
                  <span className="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    className="uv-search-input"
                    placeholder="제안 검색..."
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
                      <p>{searchQuery ? `"${searchQuery}" 검색 결과가 없습니다` : '해당하는 제안이 없습니다'}</p>
                    </div>
                  )
                }

                return filtered.map(proposal => {
                const phaseLabels = ['투표 중', '공개 중', '종료'] as const
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
                      {hasVoted && <span className="uv-voted-badge">✓ 참여완료</span>}
                    </div>
                    <h3>{proposal.title}</h3>
                    <div className="uv-proposal-meta">
                      <div className="uv-proposal-meta-item">
                        <span className="uv-proposal-meta-label">참여자</span>
                        <span className="uv-proposal-meta-value">{proposal.totalVotes}</span>
                      </div>
                      {proposal.phase === 2 ? (
                        <div className="uv-proposal-meta-item time-item">
                          <span className="uv-proposal-meta-label">결과</span>
                          <span className={`uv-result-badge ${proposal.forVotes > proposal.againstVotes ? 'passed' : 'rejected'}`}>
                            {proposal.forVotes > proposal.againstVotes ? '가결' : proposal.againstVotes > proposal.forVotes ? '부결' : '동률'}
                          </span>
                        </div>
                      ) : timeRemaining && (
                        <div className="uv-proposal-meta-item time-item">
                          <span className="uv-proposal-meta-label">남은 시간</span>
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
                목록으로
              </button>
              <div className="uv-create-steps">
                <div className="uv-create-step active">
                  <p className="uv-create-step-label">Step 01</p>
                  <h3>제안 작성</h3>
                </div>
                <div className="uv-create-step">
                  <p className="uv-create-step-label">Step 02</p>
                  <h3>검토 및 게시</h3>
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
              목록으로
            </button>

            <div className="uv-create-header">
              <h1>새 제안</h1>
              <p>커뮤니티에 의견을 물어보세요</p>
            </div>

            <div className="uv-create-form">
              <div className="uv-create-input-group">
                <label className="uv-create-input-label">Proposal Title / 제안 제목</label>
                <input
                  type="text"
                  className="uv-create-input"
                  placeholder="제안 제목을 입력하세요"
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
                  <p>모든 제안은 암호학적으로 보호되며, 생성 후 수정이 불가능합니다. 신중하게 작성해 주세요.</p>
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
                  제안 생성에는 최소 {MIN_TON_FOR_PROPOSAL} TON 잔액이 필요합니다 (현재: {totalVotingPower} TON)
                </div>
              )}

              <button
                className="uv-create-submit"
                onClick={handleCreateProposal}
                disabled={!newProposalTitle.trim() || isCreatingProposal || !canCreateProposal}
              >
                제안 생성
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
            목록으로
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
                <h3>{selectedProposal.phase === 0 ? '투표 진행 중' : selectedProposal.phase === 1 ? '공개 진행 중' : '투표 종료'}</h3>
                <span className="uv-progress-time">
                  {(() => {
                    const now = new Date()
                    const target = selectedProposal.phase === 0 ? selectedProposal.endTime : selectedProposal.revealEndTime
                    const diff = target.getTime() - now.getTime()
                    if (diff <= 0) return '종료됨'
                    const hours = Math.floor(diff / (1000 * 60 * 60))
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
                    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
                    return `남은 시간: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                  })()}
                </span>
              </div>
              <div className="uv-progress-bar">
                <div className="uv-progress-fill" style={{
                  width: `${Math.max(0, Math.min(100,
                    selectedProposal.phase === 2 ? 100 :
                    (() => {
                      const now = new Date().getTime()
                      const start = selectedProposal.endTime.getTime() - 240000 // 4분 전
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
                  ? '현재 커밋 단계입니다. 당신의 선택은 암호화되어 블록체인에 기록되며, 리빌 단계 전까지는 누구도 확인할 수 없습니다.'
                  : selectedProposal.phase === 1
                  ? '공개 단계입니다. 투표를 공개해야 최종 집계에 반영됩니다.'
                  : '투표가 종료되었습니다.'}
              </p>
            </div>
          </div>

          {/* Vote Counts (Hidden during commit phase) */}
          <div className="uv-vote-counts">
            <div className="uv-vote-count-item">
              <h3>찬성</h3>
              {selectedProposal.phase === 2 ? (
                <span className="uv-proposal-meta-value">{selectedProposal.forVotes}표</span>
              ) : (
                <div className="uv-vote-count-hidden">
                  <span className="material-symbols-outlined">lock</span>
                  <div className="uv-vote-count-bar"></div>
                  <span className="uv-vote-count-label">Hidden</span>
                </div>
              )}
            </div>
            <div className="uv-vote-count-item">
              <h3>반대</h3>
              {selectedProposal.phase === 2 ? (
                <span className="uv-proposal-meta-value">{selectedProposal.againstVotes}표</span>
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
                    <h2>투표 완료</h2>
                    {myVote && (
                      <div className="uv-success-stats" style={{ marginTop: '32px' }}>
                        <div className={`uv-success-stat ${myVote.choice === CHOICE_FOR ? 'primary' : ''}`}>
                          <p className="label">내 선택</p>
                          <p className="value">{myVote.choice === CHOICE_FOR ? '찬성 (FOR)' : '반대 (AGAINST)'}</p>
                        </div>
                        <div className="uv-success-stat">
                          <p className="label">투표 수</p>
                          <p className="value">{Number(myVote.numVotes)}표</p>
                        </div>
                        <div className="uv-success-stat">
                          <p className="label">사용 TON</p>
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
                        거래 영수증 보기
                        <span className="material-symbols-outlined">north_east</span>
                      </a>
                    )}
                    <div className="uv-reveal-hint" style={{ marginTop: '48px' }}>
                      <span className="material-symbols-outlined">info</span>
                      <div className="uv-reveal-hint-content">
                        <p className="label">Reveal Hint</p>
                        <p>투표 결과는 공개 단계(Reveal Phase)가 시작된 후 24시간 이내에 블록체인에서 최종 확인이 가능합니다.</p>
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
                <p style={{ marginTop: '24px', opacity: 0.7 }}>투표하려면 TON이 필요합니다</p>
                <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="uv-submit-btn" style={{ marginTop: '24px', display: 'inline-flex', textDecoration: 'none' }}>
                  <TonIcon size={24} /> Faucet에서 TON 받기
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
                      <span>찬성 (For)</span>
                      <span className="uv-direction-btn-label">TON</span>
                    </button>
                    <button
                      className={`uv-direction-btn against-btn ${selectedChoice === CHOICE_AGAINST ? 'active' : ''}`}
                      onClick={() => setSelectedChoice(CHOICE_AGAINST)}
                      disabled={isProcessing}
                    >
                      <span className="material-symbols-outlined">thumb_down</span>
                      <span>반대 (Against)</span>
                      <span className="uv-direction-btn-label">TON</span>
                    </button>
                  </div>
                </div>

                {/* Step 2: Intensity */}
                <div className="uv-step">
                  <div className="uv-intensity-header">
                    <label className="uv-step-label">Step 2: Intensity (Quadratic)</label>
                    <span className="uv-intensity-value">{numVotes} <span>표</span></span>
                  </div>
                  <div className="uv-slider-container">
                    <div
                      className="uv-slider-value-tooltip"
                      style={{ left: `${((numVotes - 1) / Math.max(maxVotes - 1, 1)) * 100}%` }}
                    >
                      {numVotes}표
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
                    <span>1 표</span>
                    <span>MAX {maxVotes} 표</span>
                  </div>
                </div>

                {/* Cost Display */}
                <div className="uv-cost-box">
                  <div className="uv-cost-content">
                    <div>
                      <p className="uv-cost-formula-label">Cost Formula</p>
                      <p className="uv-cost-formula">
                        비용 = {numVotes} × {numVotes} = <span className="highlight">{quadraticCost} TON</span>
                      </p>
                    </div>
                    {isHighCost && (
                      <div className="uv-cost-warning">
                        <span className="material-symbols-outlined">warning</span>
                        <p>High Cost Warning:<br />잔액의 {costLevel.toFixed(0)}%를 사용합니다</p>
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
                  투표하기 (Submit Vote)
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
              내 선택은 비공개로 안전하게 보호됩니다
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

            <h1>투표 완료!</h1>
            <p>투표가 안전하게 제출되었습니다</p>

            {/* Vote Summary */}
            <div className="uv-success-summary">
              <div className="uv-success-proposal">
                <span className="label">안건</span>
                <span className="value">{selectedProposal?.title}</span>
              </div>
              <div className="uv-success-stats">
                <div className="uv-success-stat primary">
                  <p className="label">내 선택</p>
                  <p className="value">{selectedChoice === CHOICE_FOR ? '찬성 (FOR)' : '반대 (AGAINST)'}</p>
                </div>
                <div className="uv-success-stat">
                  <p className="label">투표 수</p>
                  <p className="value">{numVotes}표</p>
                </div>
                <div className="uv-success-stat">
                  <p className="label">사용 TON</p>
                  <p className="value">{quadraticCost} TON</p>
                </div>
              </div>
            </div>

            {/* Transaction Link */}
            {txHash && (
              <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="uv-tx-link">
                거래 영수증 보기
                <span className="material-symbols-outlined">north_east</span>
              </a>
            )}

            {/* Reveal Hint Box */}
            <div className="uv-reveal-hint">
              <span className="material-symbols-outlined">info</span>
              <div className="uv-reveal-hint-content">
                <p className="label">Reveal Hint</p>
                <p>투표 결과는 공개 단계(Reveal Phase)가 시작된 후 24시간 이내에 블록체인에서 최종 확인이 가능합니다.</p>
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
              목록으로 돌아가기
            </button>
          </div>
        </div>
      )}

      {/* Pre-Flight Confirmation Modal - Brutalist Style */}
      {showConfirmModal && pendingVoteChoice !== null && (
        <div className="uv-modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="uv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="uv-modal-header">
              <h2>투표 확인</h2>
            </div>

            <div className="uv-modal-content">
              <div className="uv-modal-vote-info">
                <div className="uv-modal-row">
                  <span>선택</span>
                  <strong className={pendingVoteChoice === CHOICE_FOR ? 'uv-for' : 'uv-against'}>
                    {pendingVoteChoice === CHOICE_FOR ? '찬성 (FOR)' : '반대 (AGAINST)'}
                  </strong>
                </div>
                <div className="uv-modal-row">
                  <span>투표 수</span>
                  <strong>{numVotes}표</strong>
                </div>
                <div className="uv-modal-row">
                  <span>사용 TON</span>
                  <strong>{quadraticCost} TON</strong>
                </div>
              </div>

              <div className="uv-modal-warning">
                <span className="material-symbols-outlined">warning</span>
                <div className="uv-modal-warning-text">
                  <strong>최종 결정입니다</strong>
                  <p>제안당 1번만 투표할 수 있습니다. 이 결정은 나중에 변경하거나 취소할 수 없습니다.</p>
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
                취소
              </button>
              <button
                className="uv-modal-btn uv-modal-btn-primary"
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
