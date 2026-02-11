import { useState, useRef, useCallback, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { decodeAbiParameters } from 'viem'
import config from '../config.json'

const ZK_VOTING_FINAL_ADDRESS = (config.contracts.zkVotingFinal || '0x0000000000000000000000000000000000000000') as `0x${string}`
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

const ZK_VOTING_ABI = [
  { type: 'function', name: 'proposalCountD2', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const

interface Proposal {
  id: number
  title: string
  phase: 'voting' | 'reveal' | 'ended'
  participants: number
}

// proposalsD2(uint256) selector = 0xb4e0d6af (QuadraticVotingDemo와 동일)
function getProposalSelector(proposalId: number): string {
  const selector = 'b4e0d6af'
  const paddedId = proposalId.toString(16).padStart(64, '0')
  return selector + paddedId
}

// viem의 decodeAbiParameters 사용 (QuadraticVotingDemo와 동일)
function decodeProposalResult(hex: string): { title: string; endTime: bigint; revealEndTime: bigint; totalVotes: bigint } {
  try {
    if (!hex || hex === '0x' || hex.length < 66) {
      return { title: '', endTime: 0n, revealEndTime: 0n, totalVotes: 0n }
    }

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
      endTime: decoded[5] as bigint,
      revealEndTime: decoded[6] as bigint,
      totalVotes: decoded[12] as bigint, // totalCommitments
    }
  } catch (e) {
    console.error('Decode error:', e)
    return { title: '', endTime: 0n, revealEndTime: 0n, totalVotes: 0n }
  }
}

interface ProposalCardProps {
  proposal: Proposal
  translateX: number
  translateY: number
  zIndex: number
  opacity: number
  onClick: () => void
}

function ProposalCard({ proposal, translateX, translateY, zIndex, opacity, onClick }: ProposalCardProps) {
  const phaseColors = {
    voting: { bg: '#3b82f6', label: '투표중', icon: '🗳️' },
    reveal: { bg: '#f59e0b', label: '공개중', icon: '📢' },
    ended: { bg: '#6b7280', label: '종료', icon: '✓' },
  }

  const { bg, label, icon } = phaseColors[proposal.phase]

  return (
    <div
      className="proposal-carousel-card-wrapper"
      style={{
        transform: `translateX(${translateX}px) translateY(${translateY}px)`,
        opacity,
        zIndex,
      }}
      onClick={onClick}
    >
      <div className="proposal-carousel-card" style={{ backgroundColor: bg }}>
        <div className="proposal-carousel-number">
          <span className="proposal-carousel-no">No</span>
          <span>{proposal.id}</span>
        </div>
        <div className="proposal-carousel-content">
          <span className="proposal-carousel-title">{proposal.title}</span>
          <span className="proposal-carousel-meta">
            {icon} {label} · {proposal.participants}명 참여
          </span>
        </div>
        {/* 호버시 보이는 상세 정보 */}
        <div className="proposal-carousel-hover-info">
          <div className="hover-info-title">{proposal.title}</div>
          <div className="hover-info-status">
            <span className="hover-info-phase">{icon} {label}</span>
            <span className="hover-info-participants">{proposal.participants}명 참여</span>
          </div>
          <div className="hover-info-action">클릭하여 상세보기 →</div>
        </div>
      </div>
    </div>
  )
}

function ScrollProgress({ progress }: { progress: number }) {
  return (
    <div className="proposal-carousel-progress">
      <div className="proposal-carousel-progress-track">
        <div
          className="proposal-carousel-progress-fill"
          style={{ width: `${Math.max(8, progress)}%` }}
        />
      </div>
    </div>
  )
}

const CARD_WIDTH = 280
const CARD_GAP = 40
const CARD_STEP = CARD_WIDTH + CARD_GAP

interface ProposalsCarouselProps {
  onProposalClick: (id: number) => void
}

export function ProposalsCarousel({ onProposalClick }: ProposalsCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [offset, setOffset] = useState(0)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // Drag state
  const isDragging = useRef(false)
  const hasDragged = useRef(false) // 드래그 여부 (클릭 구분용)
  const dragStartX = useRef(0)
  const dragStartOffset = useRef(0)

  // Momentum
  const velocityRef = useRef(0)
  const lastPointerX = useRef(0)
  const lastPointerTime = useRef(0)
  const rafRef = useRef<number>(0)

  // wagmi로 제안 개수 가져오기 (QuadraticVotingDemo와 동일)
  const { data: proposalCount } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_ABI,
    functionName: 'proposalCountD2',
  })

  // 제안 데이터 가져오기
  useEffect(() => {
    const fetchProposals = async () => {
      if (proposalCount === undefined) return

      const count = Number(proposalCount)
      if (count === 0) {
        setIsLoading(false)
        return
      }

      const fetched: Proposal[] = []

      for (let i = 1; i <= count; i++) {
        try {
          const response = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_call',
              params: [{
                to: ZK_VOTING_FINAL_ADDRESS,
                data: `0x${getProposalSelector(i)}`,
              }, 'latest'],
              id: i,
            }),
          })
          const data = await response.json()

          if (data.result && data.result !== '0x') {
            const decoded = decodeProposalResult(data.result)

            if (decoded.title) {
              const now = BigInt(Math.floor(Date.now() / 1000))
              let phase: 'voting' | 'reveal' | 'ended' = 'ended'
              if (now < decoded.endTime) phase = 'voting'
              else if (now < decoded.revealEndTime) phase = 'reveal'

              fetched.push({
                id: i,
                title: decoded.title,
                phase,
                participants: Number(decoded.totalVotes),
              })
            }
          }
        } catch (e) {
          console.error('Failed to fetch proposal', i, e)
        }
      }

      // 활성화 순서: 투표중 > 공개중 > 종료, 같은 상태면 최신순
      const phaseOrder = { voting: 0, reveal: 1, ended: 2 }
      setProposals(fetched.sort((a, b) => {
        const phaseDiff = phaseOrder[a.phase] - phaseOrder[b.phase]
        if (phaseDiff !== 0) return phaseDiff
        return b.id - a.id // 같은 상태면 최신순
      }))
      setIsLoading(false)
    }

    fetchProposals()
  }, [proposalCount])

  // Container width & 초기 offset 설정
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth
        setContainerWidth(width)
        // 초기 offset: 첫 카드가 왼쪽 여백을 두고 시작하도록
        if (!initialized && proposals.length > 0) {
          setOffset(40) // 왼쪽에서 40px 여백
          setInitialized(true)
        }
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [proposals.length, initialized])

  const totalWidth = proposals.length * CARD_STEP
  // 스크롤 범위: 왼쪽 끝 ~ 오른쪽 끝
  const minOffset = Math.min(0, -(totalWidth - containerWidth + 60)) // 오른쪽 여백 60px
  const maxOffset = 60 // 왼쪽 여백 60px

  const clamp = useCallback(
    (val: number) => {
      if (proposals.length === 0) return 0
      return Math.max(minOffset, Math.min(maxOffset, val))
    },
    [minOffset, maxOffset, proposals.length]
  )

  const startMomentum = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const decay = () => {
      velocityRef.current *= 0.94
      if (Math.abs(velocityRef.current) < 0.3) {
        velocityRef.current = 0
        return
      }
      setOffset((prev) => clamp(prev + velocityRef.current))
      rafRef.current = requestAnimationFrame(decay)
    }
    rafRef.current = requestAnimationFrame(decay)
  }, [clamp])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 카드 클릭은 별도 처리하므로 카드 위에서는 드래그 시작 안함
      if ((e.target as HTMLElement).closest('.proposal-carousel-card-wrapper')) {
        return
      }
      cancelAnimationFrame(rafRef.current)
      velocityRef.current = 0
      isDragging.current = true
      hasDragged.current = false
      dragStartX.current = e.clientX
      dragStartOffset.current = offset
      lastPointerX.current = e.clientX
      lastPointerTime.current = Date.now()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [offset]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStartX.current
      if (Math.abs(dx) > 5) {
        hasDragged.current = true
      }
      const now = Date.now()
      const dt = now - lastPointerTime.current
      if (dt > 0) {
        velocityRef.current = ((e.clientX - lastPointerX.current) / dt) * 16
      }
      lastPointerX.current = e.clientX
      lastPointerTime.current = now
      setOffset(clamp(dragStartOffset.current + dx))
    },
    [clamp]
  )

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    startMomentum()
  }, [startMomentum])

  // 카드 클릭 핸들러
  const handleCardClick = useCallback((proposalId: number) => {
    console.log('Card clicked, navigating to proposal:', proposalId)
    onProposalClick(proposalId)
  }, [onProposalClick])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaX !== 0 ? -e.deltaX : -e.deltaY
      setOffset((prev) => clamp(prev + delta * 0.8))
    },
    [clamp]
  )

  const getCardTransforms = useCallback(
    (index: number) => {
      const cardX = index * CARD_STEP + offset
      const staggerPattern = [10, 4, -2, -6, -2, 4, 8, 12, 6, 2, 8, 0]
      const translateY = staggerPattern[index % staggerPattern.length]

      const leftEdge = cardX
      const rightEdge = cardX + CARD_WIDTH
      let opacity = 1
      if (rightEdge < -40) opacity = 0
      else if (leftEdge < 0) opacity = Math.max(0.2, leftEdge / 40 + 1)
      if (leftEdge > containerWidth + 40) opacity = 0
      else if (rightEdge > containerWidth)
        opacity = Math.min(opacity, Math.max(0.2, (containerWidth + 40 - rightEdge) / 80))

      const zIndex = proposals.length - index

      return { translateX: cardX, translateY, zIndex, opacity }
    },
    [containerWidth, offset, proposals.length]
  )

  const progress = containerWidth
    ? Math.max(0, Math.min(100, ((maxOffset - offset) / (maxOffset - minOffset)) * 100))
    : 0

  // 로딩 중이거나 제안이 없으면 표시 안함
  if (isLoading || proposals.length === 0) {
    return null
  }

  return (
    <section className="proposal-carousel-section">
      <div className="proposal-carousel-header">
        <h2>
          <span className="proposal-carousel-count">{proposals.length}</span>
          <span>개의 제안이 진행 중</span>
        </h2>
        <p>드래그하거나 스크롤해서 제안을 둘러보세요</p>
      </div>

      <div
        ref={containerRef}
        className="proposal-carousel-container"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="proposal-carousel-fade-left" />
        <div className="proposal-carousel-fade-right" />

        {proposals.map((proposal, index) => {
          const t = getCardTransforms(index)
          return (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              translateX={t.translateX}
              translateY={t.translateY}
              zIndex={t.zIndex}
              opacity={t.opacity}
              onClick={() => handleCardClick(proposal.id)}
            />
          )
        })}
      </div>

      <ScrollProgress progress={progress} />
    </section>
  )
}
