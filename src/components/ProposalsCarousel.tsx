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

function getProposalSelector(proposalId: number): string {
  const selector = 'b4e0d6af'
  const paddedId = proposalId.toString(16).padStart(64, '0')
  return selector + paddedId
}

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
      totalVotes: decoded[12] as bigint,
    }
  } catch (e) {
    console.error('Decode error:', e)
    return { title: '', endTime: 0n, revealEndTime: 0n, totalVotes: 0n }
  }
}

interface ProposalCardProps {
  proposal: Proposal
  onClick: () => void
}

function ProposalCard({ proposal, onClick }: ProposalCardProps) {
  const phaseStyles = {
    voting: { bg: '#dcfce7', color: '#166534', border: '#166534', label: 'Voting' },
    reveal: { bg: '#fef3c7', color: '#92400e', border: '#92400e', label: 'Reveal' },
    ended: { bg: '#f1f5f9', color: '#475569', border: '#475569', label: 'Ended' },
  }

  const { bg, color, border, label } = phaseStyles[proposal.phase]

  return (
    <div className="brutalist-carousel-card" onClick={onClick}>
      <div className="brutalist-carousel-card-header">
        <span className="brutalist-carousel-proposal-id">PROPOSAL #{proposal.id}</span>
        <span
          className="brutalist-carousel-phase"
          style={{ background: bg, color: color, borderColor: border }}
        >
          {label}
        </span>
      </div>
      <h4 className="brutalist-carousel-title">{proposal.title}</h4>
      <div className="brutalist-carousel-footer">
        <div className="brutalist-carousel-participants">
          <span className="brutalist-carousel-label">Participants</span>
          <span className="brutalist-carousel-value">{proposal.participants.toLocaleString()}</span>
        </div>
        <span className="material-symbols-outlined brutalist-carousel-arrow">north_east</span>
      </div>
    </div>
  )
}

interface ProposalsCarouselProps {
  onProposalClick: (id: number) => void
}

export function ProposalsCarousel({ onProposalClick }: ProposalsCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const { data: proposalCount } = useReadContract({
    address: ZK_VOTING_FINAL_ADDRESS,
    abi: ZK_VOTING_ABI,
    functionName: 'proposalCountD2',
  })

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

      const phaseOrder = { voting: 0, reveal: 1, ended: 2 }
      setProposals(fetched.sort((a, b) => {
        const phaseDiff = phaseOrder[a.phase] - phaseOrder[b.phase]
        if (phaseDiff !== 0) return phaseDiff
        return b.id - a.id
      }))
      setIsLoading(false)
    }

    fetchProposals()
  }, [proposalCount])

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (containerRef.current) {
      const scrollAmount = 420
      containerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }, [])

  if (isLoading || proposals.length === 0) {
    return null
  }

  return (
    <section className="brutalist-carousel-section" id="proposals">
      <div className="brutalist-carousel-header">
        <div className="brutalist-carousel-header-left">
          <div className="brutalist-live-badge">
            <span className="brutalist-live-dot"></span>
            LIVE
          </div>
          <div>
            <h2>Proposals</h2>
            <p>Active Governance Cycles</p>
          </div>
        </div>
        <div className="brutalist-carousel-nav">
          <button onClick={() => scroll('left')}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button onClick={() => scroll('right')}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="brutalist-carousel-container" ref={containerRef}>
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            onClick={() => onProposalClick(proposal.id)}
          />
        ))}
      </div>
    </section>
  )
}
