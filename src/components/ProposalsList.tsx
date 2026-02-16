/**
 * ProposalsList - Browse all proposals with status, timer, vote count
 *
 * Reads all deployed polls from the MACI contract and displays them
 * as cards with real-time status (active/ended/finalized).
 */

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MACI_ABI,
  POLL_ABI,
} from '../contractV2'
import { useTranslation } from '../i18n'
import { CreatePollForm } from './CreatePollForm'

interface PollInfo {
  id: number
  address: `0x${string}`
  title: string
  isOpen: boolean
  deployTime: number
  duration: number
  numMessages: number
  hasVoted: boolean
}

interface ProposalsListProps {
  onSelectPoll: (pollId: number) => void
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export function ProposalsList({ onSelectPoll }: ProposalsListProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()
  const [polls, setPolls] = useState<PollInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreatePoll, setShowCreatePoll] = useState(false)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS

  const { data: nextPollId } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'nextPollId',
    query: { enabled: isConfigured },
  })

  const { data: numSignUps } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'numSignUps',
    query: { enabled: isConfigured },
  })

  // Clock tick for timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  // Load all polls
  useEffect(() => {
    if (!nextPollId || !publicClient) return
    const count = Number(nextPollId)
    if (count === 0) {
      setLoading(false)
      return
    }

    const loadPolls = async () => {
      const results: PollInfo[] = []

      for (let i = 0; i < count; i++) {
        try {
          const pollAddr = await publicClient.readContract({
            address: MACI_V2_ADDRESS,
            abi: MACI_ABI,
            functionName: 'polls',
            args: [BigInt(i)],
          }) as `0x${string}`

          if (!pollAddr || pollAddr === ZERO_ADDRESS) continue

          const [isOpen, timeData, numMsgs] = await Promise.all([
            publicClient.readContract({
              address: pollAddr,
              abi: POLL_ABI,
              functionName: 'isVotingOpen',
            }),
            publicClient.readContract({
              address: pollAddr,
              abi: POLL_ABI,
              functionName: 'getDeployTimeAndDuration',
            }),
            publicClient.readContract({
              address: pollAddr,
              abi: POLL_ABI,
              functionName: 'numMessages',
            }),
          ])

          const td = timeData as [bigint, bigint]
          const title = localStorage.getItem(`maci-poll-title-${i}`) || `Proposal #${i + 1}`

          // Check if user voted on this poll
          const hasVoted = address
            ? parseInt(localStorage.getItem(`maci-nonce-${address}-${i}`) || '1', 10) > 1
            : false

          results.push({
            id: i,
            address: pollAddr,
            title,
            isOpen: isOpen as boolean,
            deployTime: Number(td[0]),
            duration: Number(td[1]),
            numMessages: Number(numMsgs),
            hasVoted,
          })
        } catch {
          // Skip polls that fail to read
        }
      }

      setPolls(results.reverse()) // newest first
      setLoading(false)
    }

    loadPolls()
  }, [nextPollId, publicClient, address])

  const getStatus = (poll: PollInfo): 'active' | 'ended' | 'finalized' => {
    if (poll.isOpen) return 'active'
    return 'ended' // TODO: detect finalized from tally
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
      deployTime: Math.floor(Date.now() / 1000),
      duration: 3600, // default, will be overridden on next load
      numMessages: 0,
      hasVoted: false,
    }, ...prev])
  }

  if (!isConfigured) {
    return (
      <div className="proposals-list">
        <div className="brutalist-card">
          <h2>{t.maci.notDeployed}</h2>
          <p>{t.maci.notDeployedDesc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="proposals-list">
      <div className="proposals-header">
        <h2>{t.proposals.title}</h2>
        <div className="proposals-header-meta">
          {numSignUps !== undefined && (
            <span className="voter-count">{t.maci.stats.registered}: {Number(numSignUps)}</span>
          )}
          {isConnected && (
            <button className="brutalist-btn" onClick={() => setShowCreatePoll(!showCreatePoll)}>
              {showCreatePoll ? t.confirm.cancel : t.proposals.createNew}
            </button>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="brutalist-card">
          <p>{t.maci.connectWallet}</p>
        </div>
      )}

      {showCreatePoll && (
        <div className="brutalist-card">
          <CreatePollForm onPollCreated={handlePollCreated} onSelectPoll={onSelectPoll} />
        </div>
      )}

      {loading ? (
        <div className="loading-spinner" role="status" aria-busy="true">
          <span className="spinner" aria-hidden="true" />
          <span>{t.proposals.loading}</span>
        </div>
      ) : polls.length === 0 ? (
        <div className="brutalist-card proposals-empty">
          <p>{t.proposals.empty}</p>
          {isConnected && <p className="proposals-empty-hint">{t.proposals.emptyHint}</p>}
        </div>
      ) : (
        <div className="proposals-grid">
          {polls.map((poll) => {
            const status = getStatus(poll)
            const remaining = getRemaining(poll)
            return (
              <button
                key={poll.id}
                className={`proposal-card ${status}`}
                onClick={() => onSelectPoll(poll.id)}
              >
                <div className="proposal-card-header">
                  <span className={`proposal-status ${status}`}>
                    {t.proposals.status[status]}
                  </span>
                  {poll.hasVoted && (
                    <span className="proposal-voted-badge">{t.proposals.voted}</span>
                  )}
                </div>
                <h3 className="proposal-card-title">{poll.title}</h3>
                <div className="proposal-card-meta">
                  <span className="proposal-messages">
                    {poll.numMessages} {t.proposals.messages}
                  </span>
                  {status === 'active' && remaining > 0 && (
                    <span className="proposal-timer">{formatTime(remaining)}</span>
                  )}
                  {status === 'ended' && (
                    <span className="proposal-timer ended">{t.timer.ended}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
