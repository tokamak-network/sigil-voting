'use client'

import { useEffect, useState } from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useTranslation } from '../../../../src/i18n'
import { storageKey } from '../../../../src/storageKeys'
import {
  MACI_V2_ADDRESS,
  MACI_ABI,
  POLL_ABI,
  TALLY_ABI,
} from '../../../../src/contractV2'

interface VoteHistoryItem {
  pollId: number
  pollAddress: `0x${string}`
  title: string
  description?: string
  votedAt: string
  choice: string
  weight: number
  cost: number
  status: 'active' | 'ended' | 'finalized'
  isOpen: boolean
  deployTime: number
  duration: number
  tallyAddress?: `0x${string}`
}

export default function VoteHistoryPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [votes, setVotes] = useState<VoteHistoryItem[]>([])
  const [now, setNow] = useState(0)

  const { data: nextPollId } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'nextPollId',
    query: { enabled: !!address },
  })

  // Clock tick
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000))
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!address || !publicClient || nextPollId === undefined) {
      setLoading(false)
      return
    }

    const loadVoteHistory = async () => {
      setLoading(true)
      const pollCount = Number(nextPollId)
      const historyItems: VoteHistoryItem[] = []

      // Check localStorage for votes
      for (let pollId = 0; pollId < pollCount; pollId++) {
        const voteData = localStorage.getItem(storageKey.lastVote(address, pollId))
        if (!voteData) continue

        try {
          const vote = JSON.parse(voteData)

          // Get poll address
          const pollAddress = await publicClient.readContract({
            address: MACI_V2_ADDRESS,
            abi: MACI_ABI,
            functionName: 'polls',
            args: [BigInt(pollId)],
          }).catch(() => null) as `0x${string}` | null

          if (!pollAddress || pollAddress === '0x0000000000000000000000000000000000000000') continue

          // Get poll details
          const [isOpen, timeData, onChainTitle] = await Promise.all([
            publicClient.readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'isVotingOpen' }),
            publicClient.readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'getDeployTimeAndDuration' }),
            publicClient.readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'title' }).catch(() => null),
          ])

          const td = timeData as [bigint, bigint]
          const deployTime = Number(td[0])
          const duration = Number(td[1])
          const title = (onChainTitle as string) || localStorage.getItem(storageKey.pollTitle(pollId)) || `#${pollId + 1}`
          const description = localStorage.getItem(storageKey.pollDesc(pollId)) || undefined

          // Determine status
          let status: 'active' | 'ended' | 'finalized' = 'ended'
          if (isOpen) {
            status = 'active'
          } else {
            // Check if finalized
            const tallyAddr = localStorage.getItem(storageKey.pollTitle(pollId) + ':tally') as `0x${string}` | null
            if (tallyAddr) {
              try {
                const verified = await publicClient.readContract({
                  address: tallyAddr,
                  abi: TALLY_ABI,
                  functionName: 'tallyVerified',
                })
                if (verified === true) {
                  status = 'finalized'
                }
              } catch { /* skip */ }
            }
          }

          historyItems.push({
            pollId,
            pollAddress,
            title,
            description,
            votedAt: new Date(vote.timestamp || Date.now()).toLocaleString(),
            choice: vote.choice === 0 ? t.voteForm.against : t.voteForm.for,
            weight: vote.weight || 0,
            cost: vote.cost || 0,
            status,
            isOpen: isOpen as boolean,
            deployTime,
            duration,
          })
        } catch (e) {
          console.error(`Failed to load vote history for poll ${pollId}:`, e)
        }
      }

      // Sort by poll ID descending (newest first)
      historyItems.sort((a, b) => b.pollId - a.pollId)
      setVotes(historyItems)
      setLoading(false)
    }

    loadVoteHistory()
  }, [address, publicClient, nextPollId, t.voteForm.against, t.voteForm.for])

  const getStatusBadge = (status: string) => {
    if (status === 'active') {
      return { label: t.proposals.statusVoting, className: 'bg-primary text-white' }
    }
    if (status === 'finalized') {
      return { label: t.proposals.statusEnded, className: 'bg-emerald-500 text-white' }
    }
    return { label: t.proposals.statusRevealing, className: 'bg-amber-400 text-black' }
  }

  const formatTime = (secs: number): string => {
    if (secs <= 0) return t.timer.ended
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }

  const getRemaining = (item: VoteHistoryItem): number => {
    const deadline = item.deployTime + item.duration
    return deadline - now
  }

  if (!isConnected) {
    return (
      <div className="container mx-auto px-6 py-16">
        <div className="bg-white p-8 technical-card">
          <h2 className="text-2xl font-display font-bold uppercase mb-4">{t.voteHistory.pageTitle}</h2>
          <p className="text-slate-600">{t.voteHistory.connectWallet}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8 sm:mb-12">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-display font-black uppercase italic leading-none tracking-tighter">
            {t.voteHistory.pageTitle}
          </h1>
        </div>
        <p className="text-slate-500 font-medium text-base sm:text-lg">
          {t.voteHistory.pageSubtitle}
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white p-6 technical-card animate-pulse">
              <div className="flex justify-between items-start mb-4">
                <div className="h-6 w-32 bg-gray-200 rounded" />
                <div className="h-6 w-24 bg-gray-200 rounded" />
              </div>
              <div className="h-8 w-3/4 bg-gray-200 rounded mb-3" />
              <div className="flex gap-8">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-4 w-24 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : votes.length === 0 ? (
        <div className="bg-white p-12 technical-card text-center">
          <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">
            how_to_vote
          </span>
          <h2 className="text-2xl font-display font-bold uppercase text-slate-400 mb-2">
            {t.voteHistory.emptyTitle}
          </h2>
          <p className="text-slate-500 mb-6">{t.voteHistory.emptyDesc}</p>
          <button
            onClick={() => router.push('/vote')}
            className="px-8 py-4 bg-black text-white font-display font-bold uppercase text-sm tracking-widest border-2 border-black hover:bg-primary transition-colors"
            style={{ boxShadow: '4px 4px 0px 0px rgba(0, 0, 0, 1)' }}
          >
            {t.voteHistory.goToProposals}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {votes.map((item) => {
            const badge = getStatusBadge(item.status)
            const remaining = getRemaining(item)

            return (
              <button
                key={item.pollId}
                onClick={() => router.push(`/vote/${item.pollId}`)}
                className="bg-white p-6 technical-card text-left hover:shadow-[6px_6px_0px_0px_rgba(0,82,255,0.35)] transition-shadow duration-150 cursor-pointer group"
              >
                {/* Top row: status and poll # */}
                <div className="flex justify-between items-start mb-4">
                  <span className={`text-xs font-bold px-3 py-1.5 uppercase tracking-widest ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs font-bold text-slate-300 uppercase">
                    {t.proposalDetail.proposalPrefix} #{item.pollId + 1}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xl sm:text-2xl font-display font-bold uppercase leading-tight mb-3 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>

                {/* Vote details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 mb-4">
                  <div>
                    <span className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                      {t.voteHistory.myVote}
                    </span>
                    <span className="text-base sm:text-lg font-display font-bold">{item.choice}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                      {t.voteHistory.lastWeight}
                    </span>
                    <span className="text-base sm:text-lg font-display font-bold">{item.weight}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                      {t.voteHistory.lastCost}
                    </span>
                    <span className="text-base sm:text-lg font-display font-bold">{item.cost} {t.voteForm.credits}</span>
                  </div>
                  {item.status === 'active' && remaining > 0 && (
                    <div>
                      <span className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                        {t.timer.remaining}
                      </span>
                      <span className="text-base sm:text-lg font-mono font-bold text-primary">{formatTime(remaining)}</span>
                    </div>
                  )}
                </div>

                {/* Bottom row: voted at + arrow */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-400">
                    {t.voteHistory.votedOn}: {item.votedAt}
                  </span>
                  <div className="w-8 h-8 bg-black text-white flex items-center justify-center group-hover:bg-primary transition-colors">
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
