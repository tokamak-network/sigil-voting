/**
 * ProposalsList - Browse all proposals with status, timer, vote count
 *
 * Reads all deployed polls from the MACI contract and displays them
 * as cards with real-time status (active/ended/finalized).
 *
 * UI: Brutalist / technical card design with Tailwind CSS.
 */

import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MACI_DEPLOY_BLOCK,
  MACI_ABI,
  POLL_ABI,
  TALLY_ABI,
} from '../contractV2'
import { useTranslation } from '../i18n'
import { CreatePollForm } from './CreatePollForm'

interface PollInfo {
  id: number
  address: `0x${string}`
  title: string
  isOpen: boolean
  isFinalized: boolean
  deployTime: number
  duration: number
  numMessages: number
  hasVoted: boolean
}

interface ProposalsListProps {
  onSelectPoll: (pollId: number) => void
}

type FilterTab = 'all' | 'voting' | 'processing' | 'ended'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

const POLLS_CACHE_KEY = 'maci-polls-cache'

function loadCachedPolls(): PollInfo[] {
  try {
    const raw = localStorage.getItem(POLLS_CACHE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCachedPolls(polls: PollInfo[]): void {
  try { localStorage.setItem(POLLS_CACHE_KEY, JSON.stringify(polls)) } catch { /* quota */ }
}

export function ProposalsList({ onSelectPoll }: ProposalsListProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()
  const [polls, setPolls] = useState<PollInfo[]>(() => loadCachedPolls())
  const [loading, setLoading] = useState(() => loadCachedPolls().length === 0)
  const [showCreatePoll, setShowCreatePoll] = useState(false)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [refreshKey, setRefreshKey] = useState(0)
  const [filter, setFilter] = useState<FilterTab>('all')

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS

  const { data: nextPollId } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'nextPollId',
    query: { enabled: isConfigured, refetchInterval: 5000 },
  })

  // Clock tick for timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  // Refresh poll data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  // Load all polls
  useEffect(() => {
    if (nextPollId === undefined || !publicClient) return
    const count = Number(nextPollId)
    if (count === 0) {
      setPolls([])
      saveCachedPolls([])
      setLoading(false)
      return
    }

    const loadPolls = async () => {
      // Pre-fetch DeployPoll events to get tally addresses
      const tallyMap = new Map<number, `0x${string}`>()
      try {
        const logs = await publicClient.getLogs({
          address: MACI_V2_ADDRESS,
          event: {
            type: 'event',
            name: 'DeployPoll',
            inputs: [
              { name: 'pollId', type: 'uint256', indexed: true },
              { name: 'pollAddr', type: 'address', indexed: false },
              { name: 'messageProcessorAddr', type: 'address', indexed: false },
              { name: 'tallyAddr', type: 'address', indexed: false },
            ],
          },
          fromBlock: MACI_DEPLOY_BLOCK,
          toBlock: 'latest',
        })
        for (const log of logs) {
          const args = log.args as { pollId?: bigint; tallyAddr?: `0x${string}` }
          if (args.pollId !== undefined && args.tallyAddr) {
            tallyMap.set(Number(args.pollId), args.tallyAddr)
          }
        }
      } catch {
        // Event reading may fail on some RPCs
      }

      // Parallel: fetch all poll addresses at once
      const addrPromises = Array.from({ length: count }, (_, i) =>
        publicClient.readContract({
          address: MACI_V2_ADDRESS,
          abi: MACI_ABI,
          functionName: 'polls',
          args: [BigInt(i)],
        }).catch(() => ZERO_ADDRESS)
      )
      const addrs = await Promise.all(addrPromises)

      // Parallel: fetch details for all valid polls at once
      const detailPromises = addrs.map((addr, i) => {
        const pollAddr = addr as `0x${string}`
        if (!pollAddr || pollAddr === ZERO_ADDRESS) return null

        return Promise.all([
          publicClient.readContract({ address: pollAddr, abi: POLL_ABI, functionName: 'isVotingOpen' }),
          publicClient.readContract({ address: pollAddr, abi: POLL_ABI, functionName: 'getDeployTimeAndDuration' }),
          publicClient.readContract({ address: pollAddr, abi: POLL_ABI, functionName: 'numMessages' }),
        ]).then(async ([isOpen, timeData, numMsgs]) => {
          let isFinalized = false
          const tallyAddr = tallyMap.get(i)
          if (tallyAddr && tallyAddr !== ZERO_ADDRESS && !(isOpen as boolean)) {
            try {
              const verified = await publicClient.readContract({
                address: tallyAddr, abi: TALLY_ABI, functionName: 'tallyVerified',
              })
              isFinalized = verified === true
            } catch { /* skip */ }
          }

          const td = timeData as [bigint, bigint]
          return {
            id: i,
            address: pollAddr,
            title: localStorage.getItem(`maci-poll-title-${i}`) || `Proposal #${i + 1}`,
            isOpen: isOpen as boolean,
            isFinalized,
            deployTime: Number(td[0]),
            duration: Number(td[1]),
            numMessages: Number(numMsgs),
            hasVoted: address ? parseInt(localStorage.getItem(`maci-nonce-${address}-${i}`) || '1', 10) > 1 : false,
          } as PollInfo
        }).catch(() => null)
      })

      const details = await Promise.all(detailPromises)
      const results = details.filter((d): d is PollInfo => d !== null)

      const sorted = [...results].reverse() // newest first
      setPolls(sorted)
      saveCachedPolls(sorted)
      setLoading(false)
    }

    loadPolls()
  }, [nextPollId, publicClient, address, refreshKey])

  const getStatus = (poll: PollInfo): 'active' | 'ended' | 'finalized' => {
    if (poll.isOpen) return 'active'
    if (poll.isFinalized) return 'finalized'
    return 'ended'
  }

  const getRemaining = (poll: PollInfo): number => {
    const deadline = poll.deployTime + poll.duration
    return deadline - now
  }

  const formatTime = (secs: number): string => {
    if (secs <= 0) return t.timer.ended
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    if (h > 0) return `${h}${t.timer.hours} ${pad(m)}${t.timer.minutes}`
    return `${pad(m)}${t.timer.minutes} ${pad(s)}${t.timer.seconds}`
  }

  const handlePollCreated = (newPollId: number, newPollAddress: `0x${string}`, title?: string) => {
    setShowCreatePoll(false)
    // Add the new poll to the list immediately
    setPolls(prev => [{
      id: newPollId,
      address: newPollAddress,
      title: title || `Proposal #${newPollId + 1}`,
      isOpen: true,
      isFinalized: false,
      deployTime: Math.floor(Date.now() / 1000),
      duration: 3600, // default, will be overridden on next load
      numMessages: 0,
      hasVoted: false,
    }, ...prev])
  }

  // Map internal status to filter category
  const getFilterCategory = (poll: PollInfo): FilterTab => {
    const status = getStatus(poll)
    if (status === 'active') return 'voting'
    if (status === 'ended') return 'processing' // ended but not finalized = processing/revealing
    return 'ended' // finalized = ended
  }

  // Compute counts for filter tabs
  const counts = useMemo(() => {
    const result = { all: polls.length, voting: 0, processing: 0, ended: 0 }
    for (const poll of polls) {
      const cat = getFilterCategory(poll)
      result[cat]++
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls, now])

  // Filtered polls
  const filteredPolls = useMemo(() => {
    if (filter === 'all') return polls
    return polls.filter(poll => getFilterCategory(poll) === filter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polls, filter, now])

  // Status badge styling
  const getStatusBadge = (poll: PollInfo) => {
    const status = getStatus(poll)
    if (status === 'active') {
      return { label: 'VOTING', className: 'bg-primary text-white' }
    }
    if (status === 'ended') {
      return { label: 'PROCESSING', className: 'bg-amber-100 text-amber-800 border border-amber-300' }
    }
    return { label: 'ENDED', className: 'bg-slate-200 text-slate-600' }
  }

  // Not configured fallback
  if (!isConfigured) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="bg-white p-8 technical-card">
          <h2 className="text-2xl font-display font-bold uppercase">{t.maci.notDeployed}</h2>
          <p className="mt-2 text-slate-600">{t.maci.notDeployedDesc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* ── Header Section ── */}
      <div className="mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <h1 className="text-5xl md:text-6xl font-display font-black uppercase italic tracking-tight">
            PROPOSALS
          </h1>
          <span className="inline-block bg-primary text-white text-xs font-mono font-bold uppercase tracking-widest px-3 py-1 border-2 border-black self-start sm:self-center">
            DAO GOVERNANCE
          </span>
        </div>
        <p className="text-lg text-slate-500 font-sans max-w-xl">
          Participate in a ZK-Proof based anonymous voting system.
        </p>
      </div>

      {/* ── Connect Wallet Notice ── */}
      {!isConnected && (
        <div className="bg-white p-6 technical-card mb-8">
          <p className="text-slate-600 font-sans">{t.maci.connectWallet}</p>
        </div>
      )}

      {/* ── Create Proposal Toggle ── */}
      {isConnected && (
        <div className="mb-8">
          <button
            onClick={() => setShowCreatePoll(!showCreatePoll)}
            className={`px-6 py-3 font-display font-bold uppercase text-sm tracking-wide border-2 border-black transition-all duration-100 ${
              showCreatePoll
                ? 'bg-slate-200 text-black'
                : 'bg-black text-white hover:bg-primary'
            } sharp-button`}
          >
            {showCreatePoll ? t.confirm.cancel : `+ ${t.proposals.createNew}`}
          </button>
        </div>
      )}

      {showCreatePoll && (
        <div className="bg-white p-8 technical-card mb-8">
          <CreatePollForm onPollCreated={handlePollCreated} onSelectPoll={onSelectPoll} />
        </div>
      )}

      {/* ── Filter Tabs ── */}
      <div className="flex flex-wrap gap-0 mb-10">
        {([
          { key: 'all' as FilterTab, label: 'ALL' },
          { key: 'voting' as FilterTab, label: 'VOTING' },
          { key: 'processing' as FilterTab, label: 'PROCESSING' },
          { key: 'ended' as FilterTab, label: 'ENDED' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-5 py-2.5 font-mono text-sm font-bold uppercase tracking-wide border-2 border-black -ml-[2px] first:ml-0 transition-colors duration-100 ${
              filter === key
                ? 'bg-black text-white'
                : 'bg-white text-black hover:bg-slate-100'
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <span className="spinner" aria-hidden="true" />
          <span className="font-mono text-sm text-slate-500">{t.proposals.loading}</span>
        </div>
      ) : filteredPolls.length === 0 ? (
        <div className="bg-white p-12 technical-card text-center">
          <p className="text-xl font-display font-bold text-slate-400 uppercase">
            {filter === 'all' ? t.proposals.empty : `No ${filter} proposals`}
          </p>
          {isConnected && filter === 'all' && (
            <p className="mt-2 text-sm text-slate-400 font-sans">{t.proposals.emptyHint}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {filteredPolls.map((poll) => {
            const status = getStatus(poll)
            const remaining = getRemaining(poll)
            const badge = getStatusBadge(poll)

            return (
              <button
                key={poll.id}
                onClick={() => onSelectPoll(poll.id)}
                className="bg-white p-8 technical-card min-h-[320px] relative flex flex-col justify-between text-left group hover:shadow-[6px_6px_0px_0px_rgba(0,82,255,0.35)] transition-shadow duration-150 cursor-pointer"
              >
                {/* ── Card Top Row ── */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className={`px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider ${badge.className}`}>
                      {badge.label}
                    </span>
                    {poll.hasVoted && (
                      <span className="text-primary text-sm font-mono font-bold flex items-center gap-1">
                        <span>&#10003;</span> {t.proposals.voted}
                      </span>
                    )}
                  </div>

                  {/* ── Title ── */}
                  <h3 className="text-2xl md:text-3xl font-display font-bold uppercase leading-tight pr-14">
                    {poll.title}
                  </h3>
                </div>

                {/* ── Card Bottom Row ── */}
                <div className="flex items-end justify-between mt-auto pt-6">
                  <div className="flex flex-col gap-1">
                    {/* Participants */}
                    <span className="text-sm text-slate-500 font-sans">
                      {poll.numMessages} {t.proposals.messages}
                    </span>

                    {/* Timer or Status */}
                    {status === 'active' && remaining > 0 && (
                      <span className="font-mono text-primary font-bold text-sm">
                        {formatTime(remaining)}
                      </span>
                    )}
                    {status === 'ended' && (
                      <span className="font-mono text-amber-600 font-bold text-sm">
                        {t.maci.waiting.processing}
                      </span>
                    )}
                    {status === 'finalized' && (
                      <span className="font-mono text-slate-400 font-bold text-sm">
                        {t.timer.ended}
                      </span>
                    )}
                  </div>

                  {/* Arrow Button */}
                  <div className="w-12 h-12 bg-black text-white flex items-center justify-center flex-shrink-0 group-hover:bg-primary transition-colors duration-150">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 10H16M16 10L11 5M16 10L11 15" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
                    </svg>
                  </div>
                </div>

                {/* ── Proposal # (absolute bottom-left) ── */}
                <span className="absolute bottom-2 left-3 text-[10px] font-mono text-slate-300 uppercase tracking-wider">
                  Proposal #{poll.id}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
