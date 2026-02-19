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
import { storageKey } from '../storageKeys'
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
  totalVoters: number
  hasVoted: boolean
}

interface ProposalsListProps {
  onSelectPoll: (pollId: number) => void
}

type FilterTab = 'all' | 'voting' | 'processing' | 'ended'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

function loadCachedPolls(): PollInfo[] {
  try {
    const raw = localStorage.getItem(storageKey.pollsCache)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCachedPolls(polls: PollInfo[]): void {
  try { localStorage.setItem(storageKey.pollsCache, JSON.stringify(polls)) } catch { /* quota */ }
}

export function ProposalsList({ onSelectPoll }: ProposalsListProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()
  const [polls, setPolls] = useState<PollInfo[]>(() => loadCachedPolls())
  const [loading, setLoading] = useState(false)
  const [showCreatePoll, setShowCreatePoll] = useState(false)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [refreshKey, setRefreshKey] = useState(0)
  const [filter, setFilter] = useState<FilterTab>('all')

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS

  const { data: nextPollId } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'nextPollId',
    query: { enabled: isConfigured, refetchInterval: 15000 },
  })

  // Clock tick for timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10000)
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
          publicClient.readContract({ address: pollAddr, abi: POLL_ABI, functionName: 'title' }).catch(() => null),
        ]).then(async ([isOpen, timeData, numMsgs, onChainTitle]) => {
          let isFinalized = false
          let voters = 0
          const tallyAddr = tallyMap.get(i)
          if (tallyAddr && tallyAddr !== ZERO_ADDRESS && !(isOpen as boolean)) {
            try {
              const verified = await publicClient.readContract({
                address: tallyAddr, abi: TALLY_ABI, functionName: 'tallyVerified',
              })
              isFinalized = verified === true
              if (isFinalized) {
                const tv = await publicClient.readContract({
                  address: tallyAddr, abi: TALLY_ABI, functionName: 'totalVoters',
                })
                voters = Number(tv)
              }
            } catch { /* skip */ }
          }

          const td = timeData as [bigint, bigint]
          return {
            id: i,
            address: pollAddr,
            title: (onChainTitle as string) || localStorage.getItem(storageKey.pollTitle(i)) || `Proposal #${i + 1}`,
            isOpen: isOpen as boolean,
            isFinalized,
            deployTime: Number(td[0]),
            duration: Number(td[1]),
            numMessages: Number(numMsgs),
            totalVoters: voters,
            hasVoted: address ? localStorage.getItem(storageKey.lastVote(address, i)) !== null : false,
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

  const FAIL_THRESHOLD_S = 30 * 60 // 30 minutes after voting ends

  const getStatus = (poll: PollInfo): 'active' | 'ended' | 'finalized' | 'failed' => {
    if (poll.isOpen) return 'active'
    if (poll.isFinalized) return 'finalized'
    const votingEndTime = poll.deployTime + poll.duration
    if (now - votingEndTime > FAIL_THRESHOLD_S) return 'failed'
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

  const handlePollCreated = (newPollId: number, newPollAddress: `0x${string}`, title?: string, durationSeconds?: number) => {
    setShowCreatePoll(false)
    // Add the new poll to the list immediately and persist to cache
    const newPoll: PollInfo = {
      id: newPollId,
      address: newPollAddress,
      title: title || `Proposal #${newPollId + 1}`,
      isOpen: true,
      isFinalized: false,
      deployTime: Math.floor(Date.now() / 1000),
      duration: durationSeconds || 3600,
      numMessages: 0,
      totalVoters: 0,
      hasVoted: false,
    }
    setPolls(prev => {
      const updated = [newPoll, ...prev]
      saveCachedPolls(updated)
      return updated
    })
  }

  // Map internal status to filter category
  const getFilterCategory = (poll: PollInfo): FilterTab => {
    const status = getStatus(poll)
    if (status === 'active') return 'voting'
    if (status === 'ended') return 'processing' // ended but not finalized = processing/revealing
    return 'ended' // finalized or failed = ended
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
      return { label: t.proposals.statusVoting, className: 'bg-primary text-white' }
    }
    if (status === 'failed') {
      return { label: t.failed.title, className: 'bg-red-500 text-white' }
    }
    if (status === 'ended') {
      return { label: t.proposals.statusRevealing, className: 'bg-amber-400 text-black' }
    }
    return { label: t.proposals.statusEnded, className: 'bg-emerald-500 text-white' }
  }

  // Not configured fallback
  if (!isConfigured) {
    return (
      <div className="w-full px-4 py-16">
        <div className="bg-white p-8 technical-card">
          <h2 className="text-2xl font-display font-bold uppercase">{t.maci.notDeployed}</h2>
          <p className="mt-2 text-slate-600">{t.maci.notDeployedDesc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 py-12">
      {/* ── Header Section ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-6xl font-display font-black uppercase italic leading-none tracking-tighter">
              {t.proposals.title}
            </h1>
            <span className="bg-primary text-white text-xs font-bold px-3 py-1 uppercase tracking-widest">
              {t.proposals.daoGovernance}
            </span>
          </div>
          <p className="text-slate-500 font-medium text-lg">
            {t.proposals.subtitle}
          </p>
        </div>

        {/* ── Filter Tabs (desktop: inline with header) ── */}
        <div className="flex border-2 border-black font-bold text-sm bg-white overflow-hidden">
          {([
            { key: 'all' as FilterTab, label: t.proposals.filterAll, dot: null },
            { key: 'voting' as FilterTab, label: t.proposals.filterVoting, dot: 'bg-primary' },
            { key: 'processing' as FilterTab, label: t.proposals.filterProcessing, dot: 'bg-amber-400' },
            { key: 'ended' as FilterTab, label: t.proposals.filterEnded, dot: null },
          ]).map(({ key, label, dot }, idx) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-6 py-3 uppercase tracking-wider flex items-center gap-2 transition-colors duration-100 ${
                idx > 0 ? 'border-l-2 border-black' : ''
              } ${
                filter === key
                  ? 'bg-black text-white'
                  : 'hover:bg-slate-50'
              }`}
            >
              {dot && <span className={`w-2 h-2 rounded-full ${dot}`}></span>}
              {label} ({counts[key]})
            </button>
          ))}
        </div>
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

      {/* Filter tabs are now in the header section above */}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <span className="spinner" aria-hidden="true" />
          <span className="font-mono text-sm text-slate-500">{t.proposals.loading}</span>
        </div>
      ) : filteredPolls.length === 0 ? (
        <div className="bg-white p-12 technical-card text-center">
          <p className="text-xl font-display font-bold text-slate-400 uppercase">
            {filter === 'all' ? t.proposals.empty : t.proposals.noFiltered}
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
                  <div className="flex justify-between items-start mb-6">
                    <span className={`text-xs font-bold px-3 py-1.5 uppercase tracking-widest ${badge.className}`}>
                      {badge.label}
                    </span>
                    {poll.hasVoted && (
                      <div className="flex items-center gap-1.5 text-primary">
                        <span className="material-symbols-outlined text-sm font-bold">check</span>
                        <span className="text-xs font-bold uppercase tracking-widest">{t.proposals.voted}</span>
                      </div>
                    )}
                  </div>

                  {/* ── Title ── */}
                  <h3 className="text-3xl font-display font-bold uppercase leading-tight mb-8">
                    {poll.title}
                  </h3>
                </div>

                {/* ── Card Bottom Row ── */}
                <div className="flex items-end justify-between">
                  <div className="flex gap-12">
                    {/* Messages / Voters */}
                    <div>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposals.participants}</span>
                      <span className="text-2xl font-display font-bold">{poll.numMessages} <span className="text-sm font-normal text-slate-400">{t.proposals.messages}</span></span>
                    </div>

                    {/* Timer or Status */}
                    {status === 'active' && remaining > 0 && (
                      <div>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t.timer.remaining}</span>
                        <span className="text-2xl font-mono font-bold text-primary">{formatTime(remaining)}</span>
                      </div>
                    )}
                    {status === 'ended' && (
                      <div>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposalDetail.currentStatus}</span>
                        <span className="text-2xl font-display font-bold">{t.proposals.calculating}</span>
                      </div>
                    )}
                    {status === 'failed' && (
                      <div>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposalDetail.currentStatus}</span>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-red-500 text-xl">error</span>
                          <span className="text-2xl font-display font-bold text-red-500">{t.failed.title}</span>
                        </div>
                      </div>
                    )}
                    {status === 'finalized' && (
                      <div>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposals.result}</span>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-500 text-xl">check_circle</span>
                          <span className="text-2xl font-display font-bold text-emerald-500">{t.proposals.statusEnded}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="w-12 h-12 bg-black text-white flex items-center justify-center group-hover:bg-primary transition-colors">
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </div>
                </div>

                {/* ── Proposal # (absolute bottom-left) ── */}
                <div className="absolute bottom-4 left-8 text-xs font-bold text-slate-300 uppercase">
                  {t.proposals.title} #{poll.id}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
