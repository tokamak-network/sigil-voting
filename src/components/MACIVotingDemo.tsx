'use client'

/**
 * MACIVotingDemo - Integrated MACI V2 Voting UI
 *
 * 2-step flow (auto-registration on first vote):
 *   Step 0: Vote (auto-registers if needed)
 *   Step 1: Result (Merging / Processing / Finalized)
 *
 * Unregistered users can still view results for ended proposals.
 *
 * Layout matches mockup pages 5 (voting) and 6 (voted).
 */

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MACI_ABI,
  TALLY_ABI,
  V2Phase,
} from '../contractV2'
import { VoteFormV2 } from './voting/VoteFormV2'
import { getLastVote } from './voting/voteUtils'
import { TallyingStatus } from './voting/TallyingStatus'
import { ResultsDisplay } from './voting/ResultsDisplay'
import { PollTimer } from './voting/PollTimer'
import { useTranslation } from '../i18n'
import { useDelegation } from '../hooks/useDelegation'
import { usePollData } from '../hooks/usePollData'
import { useVotingPhase } from '../hooks/useVotingPhase'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

interface VoteSubmittedData {
  pollId: number
  pollTitle: string
  choice: number
  weight: number
  cost: number
  txHash: string
}

interface MACIVotingDemoProps {
  pollId: number
  onBack: () => void
  onVoteSubmitted?: (data: VoteSubmittedData) => void
}

export default function MACIVotingDemo({ pollId: propPollId, onBack, onVoteSubmitted }: MACIVotingDemoProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()

  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [isPollExpired, setIsPollExpired] = useState(false)
  const [showReVoteForm, setShowReVoteForm] = useState(false)
  const [phaseCheckTrigger, setPhaseCheckTrigger] = useState(0)

  // Reset transient state when switching between proposals
  useEffect(() => {
    setError(null)
    setTxHash(null)
    setIsPollExpired(false)
    setShowReVoteForm(false)
  }, [propPollId])

  // Reset vote form when account changes (e.g. MetaMask account switch)
  useEffect(() => {
    setShowReVoteForm(false)
    setError(null)
    setTxHash(null)
  }, [address])

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS

  // === Delegation ===
  const {
    isDelegationConfigured,
    isDelegating,
    delegateDisplay,
    delegatorList,
    delegationEffectNote,
    isDelegationLocked,
    isUndelegating,
    delegationError,
    delegationSuccess,
    delegationTxHash,
    handleUndelegate,
  } = useDelegation()

  // === Poll Data (address, title, tally/mp addresses, credits) ===
  const {
    pollAddress,
    pollTitle,
    pollDescription,
    tallyAddress,
    setTallyAddress,
    messageProcessorAddress,
    setMessageProcessorAddress,
    voiceCredits,
    numMessages,
    isLoadingPoll,
  } = usePollData(propPollId, publicClient, isConfigured, address)

  // === Phase Detection ===
  const { phase, phaseLoaded, votingEndTime } = useVotingPhase({
    pollAddress,
    publicClient,
    pollId: propPollId,
    isPollExpired,
    phaseCheckTrigger,
    tallyAddress,
    setTallyAddress,
    setMessageProcessorAddress,
  })

  // Read tally results for dynamic PASSED/REJECTED badge
  const hasPoll = pollAddress !== null
  const tallyReady = !!tallyAddress && tallyAddress !== ZERO_ADDRESS && phase === V2Phase.Finalized
  const { data: tallyFor } = useReadContract({
    address: tallyAddress!,
    abi: TALLY_ABI,
    functionName: 'forVotes',
    query: { enabled: tallyReady },
  })
  const { data: tallyAgainst } = useReadContract({
    address: tallyAddress!,
    abi: TALLY_ABI,
    functionName: 'againstVotes',
    query: { enabled: tallyReady },
  })
  const forNum = Number(tallyFor || 0n)
  const againstNum = Number(tallyAgainst || 0n)
  const isTied = forNum === againstNum && forNum > 0
  const isPassed = forNum > againstNum

  // Auto-dismiss tx banner after 30 seconds
  useEffect(() => {
    if (!txHash) return
    const timer = setTimeout(() => setTxHash(null), 30000)
    return () => clearTimeout(timer)
  }, [txHash])

  // 2 steps: 0=Vote, 1=Result
  // Ended proposals -> always show result (step 1), regardless of registration
  const currentStep = hasPoll && (phase !== V2Phase.Voting || isPollExpired) ? 1 : 0

  // Read numSignUps from MACI
  const { data: numSignUpsRaw } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'numSignUps',
    query: { enabled: isConfigured, refetchInterval: 30000 },
  })
  const numSignUps = numSignUpsRaw !== undefined ? Number(numSignUpsRaw) : 0


  // My vote info
  const myVote = address ? getLastVote(address, propPollId) : null
  const hasVoted = myVote !== null

  // Receipt ID: use the actual tx hash stored in localStorage (real on-chain proof)
  const receiptId = txHash ? `${txHash.slice(0, 8)}...${txHash.slice(-6)}` : null

  const shorten = (addr: string) => addr.slice(0, 6) + '...' + addr.slice(-4)

  const delegationPanel = (isDelegationConfigured && address) ? (
    <div className="border-2 border-black bg-white p-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t.governance.delegation.title}
          </p>
          {isDelegating ? (
            <p className="text-sm font-bold text-slate-700">
              {t.governance.delegation.currentDelegate}: {delegateDisplay ? shorten(delegateDisplay) : '—'}
            </p>
          ) : (
            <p className="text-sm text-slate-500">{t.governance.delegation.notDelegating}</p>
          )}
          {delegateDisplay && (
            <p className="text-[10px] text-slate-400 mt-1 break-all font-mono">
              {delegateDisplay}
            </p>
          )}
          {delegatorList.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              {t.governance.delegation.received} {delegatorList.length}
            </p>
          )}
        </div>
        <a
          href="/vote/delegate"
          className="text-xs font-bold uppercase tracking-widest underline"
        >
          {t.governance.delegation.manage}
        </a>
      </div>
      {isDelegationLocked && (
        <div className="mt-3 text-xs text-slate-600">
          <span className="font-bold">{t.governance.delegation.lockedTitle}.</span>{' '}
          {t.governance.delegation.lockedDesc}
        </div>
      )}
      <div className="mt-2 text-[10px] text-slate-400">
        {delegationEffectNote}
      </div>
      {delegatorList.length > 0 && (
        <div className="mt-3 text-[10px] font-mono text-slate-500">
          {delegatorList.slice(0, 4).map((d) => shorten(d as string)).join(', ')}
          {delegatorList.length > 4 ? ` +${delegatorList.length - 4}` : ''}
        </div>
      )}
      {delegationError && (
        <p className="mt-3 text-xs text-red-600">{delegationError}</p>
      )}
      {delegationSuccess && (
        <p className="mt-3 text-xs text-emerald-600">{t.governance.delegation.undelegateSuccess}</p>
      )}
      {delegationTxHash && (
        <div className="mt-2 text-[10px] font-mono text-slate-500">
          Pending: {delegationTxHash.slice(0, 10)}...{delegationTxHash.slice(-8)}
        </div>
      )}
    </div>
  ) : null

  // === Not configured ===
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-6 py-20">
          <div className="technical-card-heavy bg-white p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-300 mb-4" aria-hidden="true">settings</span>
            <h2 className="font-display text-3xl font-black uppercase mb-4">{t.maci.title}</h2>
            <p className="text-slate-600">{t.maci.notDeployedDesc}</p>
          </div>
        </div>
      </div>
    )
  }

  // === Not connected: show connect prompt only during Voting phase ===
  // Ended polls (Merging/Processing/Finalized/Failed) are viewable without connection
  if (!isConnected && (!hasPoll || phase === V2Phase.Voting)) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-6 py-20">
          <div className="technical-card-heavy bg-white p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-300 mb-4" aria-hidden="true">account_balance_wallet</span>
            <h2 className="font-display text-3xl font-black uppercase mb-4">{t.maci.title}</h2>
            <p className="text-slate-600">{t.maci.connectWallet}</p>
          </div>
        </div>
      </div>
    )
  }

  // === Loading (poll data or phase check) ===
  if (isLoadingPoll || (hasPoll && !phaseLoaded)) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4" role="status" aria-busy="true">
            <span className="spinner" aria-hidden="true" />
            <span className="text-sm font-mono text-slate-500 uppercase tracking-wider">{t.maci.waiting.processing}</span>
          </div>
        </div>
      </div>
    )
  }

  // === No poll found ===
  if (!hasPoll) {
    return (
      <div className="min-h-screen bg-white">
        <div className="container mx-auto px-6 py-20">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-black transition-colors mb-6 group"
          >
            <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
            {t.proposals.backToList}
          </button>
          <div className="technical-card-heavy bg-white p-12 text-center">
            <h2 className="font-display text-3xl font-black uppercase mb-4">{t.maci.stats.currentPoll}</h2>
            <p className="text-slate-600">{t.maci.stats.none}</p>
          </div>
        </div>
      </div>
    )
  }

  const displayTitle = pollTitle || `${t.proposalDetail.proposalPrefix} #${propPollId + 1}`

  // === Voting Phase (Page 5 / Page 6) ===
  // Note: Vote confirmation (Page 4) is handled by VoteSubmitted component in App.tsx
  if (currentStep === 0 && phase === V2Phase.Voting) {
    return (
      <div className="min-h-screen bg-white">
        {/* Re-vote banner - only shown if user has already voted and not in re-vote mode */}
        {hasVoted && !showReVoteForm && (
          <div className="container mx-auto px-6 mt-8">
            <div className="p-4 border-2 border-black bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">info</span>
                <span className="text-sm font-bold uppercase tracking-wider">{t.proposalDetail.alreadyVotedBanner}</span>
              </div>
              {isDelegationLocked ? (
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <button
                    onClick={handleUndelegate}
                    disabled={isUndelegating}
                    className="bg-black text-white px-6 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-black hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {isUndelegating ? t.governance.delegation.undelegating : t.governance.delegation.lockedCta}
                  </button>
                  <a
                    href="/vote/delegate"
                    className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-black hover:bg-slate-100 transition-colors whitespace-nowrap text-center"
                  >
                    {t.governance.delegation.manage}
                  </a>
                </div>
              ) : (
                <button
                  onClick={() => setShowReVoteForm(true)}
                  className="bg-primary text-white px-6 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-black hover:bg-blue-600 transition-colors whitespace-nowrap"
                >
                  {t.proposalDetail.reVote}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error / Tx banners */}
        {error && (
          <div className="bg-red-50 border-b-2 border-red-500">
            <div className="container mx-auto px-6 py-3 flex items-center justify-between">
              <span className="text-red-700 text-sm">{error}</span>
              <button className="text-red-700 text-xs font-bold underline" onClick={() => setError(null)}>{t.maci.signup.retry}</button>
            </div>
          </div>
        )}
        {txHash && (
          <div className="bg-green-50 border-b-2 border-green-500">
            <div className="container mx-auto px-6 py-3 flex items-center gap-2">
              <span className="text-green-700 text-sm">{t.maci.lastTx}</span>
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 text-sm font-mono underline"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </div>
          </div>
        )}

        <div className="container mx-auto px-6 py-8 lg:py-12">
          {delegationPanel}
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-black transition-colors mb-6 group"
          >
            <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
            {t.proposals.backToList}
          </button>

          {/* Proposal Header */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
            <div className="flex-1 max-w-3xl">
              <div className="flex items-center gap-4 mb-4">
                <span className="bg-black text-white text-xs font-bold px-3 py-1 uppercase tracking-widest">
                  {t.proposalDetail.proposalPrefix} #{propPollId + 1}
                </span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-black uppercase italic leading-tight tracking-tighter">
                {displayTitle}
              </h1>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposalDetail.currentStatus}</span>
              <span className="px-6 py-3 bg-white text-black border-2 border-black font-black text-xl italic uppercase tracking-tighter">{t.proposalDetail.votingOpen}</span>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Left Column - Info */}
            <div className="lg:col-span-7 space-y-8">
              {/* Description */}
              {pollDescription && (
                <div className="prose prose-slate max-w-none">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                    <span className="w-2 h-2 bg-primary"></span> {t.proposalDetail.proposalDesc}
                  </h4>
                  <p className="text-slate-600 leading-relaxed text-lg">{pollDescription}</p>
                </div>
              )}

              {/* Timer */}
              <div className="p-10 border-4 border-black bg-white" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>
                <PollTimer pollAddress={pollAddress!} onExpired={() => { setIsPollExpired(true); setPhaseCheckTrigger(n => n + 1) }} />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 border-2 border-black bg-white flex flex-col justify-between">
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t.proposals.participants}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-display font-black italic">{numMessages}</span>
                    <span className="text-sm font-bold text-slate-400">{t.proposals.messages}</span>
                  </div>
                </div>
                <div className="p-6 border-2 border-black bg-white flex flex-col justify-between">
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{t.proposalDetail.currentWeight}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-display font-black italic">{voiceCredits.toLocaleString()}</span>
                    <span className="text-sm font-bold text-slate-400">{t.voteForm.credits}</span>
                  </div>
                </div>
              </div>

              {/* Privacy Trust Badge */}
              <div className="border-2 border-emerald-200 bg-emerald-50 p-6 flex items-start gap-4">
                <span className="material-symbols-outlined text-emerald-600 text-2xl shrink-0">verified_user</span>
                <div>
                  <h4 className="text-sm font-bold text-emerald-800 uppercase tracking-wider mb-1">{t.footer.secured}</h4>
                  <p className="text-xs text-emerald-700 leading-relaxed">
                    {t.maci.description}
                  </p>
                </div>
              </div>

            </div>

            {/* Right Column - Vote Form or Voted Summary */}
            <div className="lg:col-span-5">
              <div>
                {/* Show vote form if: no vote yet, OR user clicked re-vote */}
                {(!hasVoted || showReVoteForm) ? (
                  isDelegationLocked ? (
                    <div className="bg-white border-4 border-black p-8" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>
                      <h3 className="text-xl font-display font-black text-slate-800 mb-2">
                        {t.governance.delegation.lockedTitle}
                      </h3>
                      <p className="text-sm text-slate-600 mb-6">{t.governance.delegation.lockedDesc}</p>
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <button
                          onClick={handleUndelegate}
                          disabled={isUndelegating}
                          className="bg-black text-white text-xs font-bold uppercase tracking-widest px-4 py-3 disabled:opacity-50"
                        >
                          {isUndelegating ? t.governance.delegation.undelegating : t.governance.delegation.lockedCta}
                        </button>
                        <a
                          href="/vote/delegate"
                          className="inline-block border-2 border-black text-xs font-bold uppercase tracking-widest px-4 py-3 text-center"
                        >
                          {t.governance.delegation.manage}
                        </a>
                      </div>
                    </div>
                  ) : (
                    <VoteFormV2
                      pollId={propPollId}
                      pollAddress={pollAddress!}
                      voiceCredits={voiceCredits}
                      isExpired={isPollExpired}
                      onVoteSubmitted={(voteTxHash) => {
                        setTxHash(voteTxHash)
                        setShowReVoteForm(false)
                        // Notify parent to navigate to VoteSubmitted page
                        const vote = address ? getLastVote(address, propPollId) : null
                        if (onVoteSubmitted && address && vote) {
                          onVoteSubmitted({
                            pollId: propPollId,
                            pollTitle: displayTitle,
                            choice: vote.choice,
                            weight: vote.weight,
                            cost: vote.cost,
                            txHash: voteTxHash,
                          })
                        }
                      }}
                    />
                  )
                ) : (
                  /* Voted Summary Card (Page 6) */
                  <div className="bg-white border-4 border-black static md:sticky md:top-32" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>
                    {/* Card Header */}
                    <div className="p-8 border-b-2 border-black bg-slate-50 flex items-center justify-between">
                      <h3 className="text-xl font-display font-black text-primary tracking-tight italic flex items-center gap-2">
                        <span className="material-symbols-outlined font-bold" aria-hidden="true">check_circle</span>
                        {t.proposalDetail.voteSubmitted}
                      </h3>
                      {receiptId && (
                        <span className="text-xs font-mono font-bold bg-black text-white px-2 py-1 uppercase">
                          {t.proposalDetail.receiptId}: {receiptId}
                        </span>
                      )}
                    </div>

                    {/* Vote Details */}
                    <div className="p-8 space-y-8">
                      <div className="space-y-6">
                        {/* Your Selection */}
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">{t.proposalDetail.yourSelection}</span>
                          <div className="text-4xl font-display font-black italic text-black">
                            {myVote!.choice === 1 ? t.voteForm.for : t.voteForm.against}
                          </div>
                        </div>

                        {/* Intensity + Cost */}
                        <div className="grid grid-cols-2 gap-8 pt-6 border-t border-black/10">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">{t.proposalDetail.intensity}</span>
                            <div className="text-3xl font-mono font-bold text-black">{myVote!.weight}</div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">{t.proposalDetail.totalCost}</span>
                            <div className="text-3xl font-mono font-bold text-primary">{myVote!.cost}</div>
                            <span className="text-xs font-bold text-slate-400 uppercase mt-1">{t.voteForm.credits}</span>
                          </div>
                        </div>
                      </div>

                      {/* Re-vote Section */}
                      <div className="pt-8 border-t-2 border-black">
                        <div className="flex flex-col items-center gap-4 text-center">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t.proposalDetail.changedMind}</p>
                          <button
                            onClick={() => setShowReVoteForm(true)}
                            className="w-full bg-white text-black py-4 font-display font-black uppercase italic text-lg tracking-widest border-2 border-black hover:bg-slate-50 transition-all"
                            style={{ boxShadow: '4px 4px 0px 0px rgba(0, 0, 0, 1)' }}
                          >
                            {t.proposalDetail.reVote}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Encrypted Bar */}
                    <div className="p-4 bg-slate-900 flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">lock</span>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.proposalDetail.encryptedProof}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === Result Phase (Merging / Processing / Finalized) ===
  return (
    <div className="min-h-screen bg-white">
      {/* Error / Tx banners */}
      {error && (
        <div className="bg-red-50 border-b-2 border-red-500">
          <div className="container mx-auto px-6 py-3 flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <button className="text-red-700 text-xs font-bold underline" onClick={() => setError(null)}>{t.maci.signup.retry}</button>
          </div>
        </div>
      )}
      {txHash && (
        <div className="bg-green-50 border-b-2 border-green-500">
          <div className="container mx-auto px-6 py-3 flex items-center gap-2">
            <span className="text-green-700 text-sm">{t.maci.lastTx}</span>
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 text-sm font-mono underline"
            >
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </div>
        </div>
      )}

      {/* Tallying phases (Merging/Processing) use full-page TallyingStatus layout */}
      {phase !== V2Phase.Failed && phase !== V2Phase.Finalized && phase !== V2Phase.NoVotes ? (
        <TallyingStatus
          pollAddress={pollAddress || undefined}
          messageProcessorAddress={messageProcessorAddress || undefined}
          tallyAddress={tallyAddress || undefined}
          votingEndTime={votingEndTime ?? undefined}
          pollTitle={displayTitle}
          pollDescription={pollDescription}
          pollId={propPollId}
          myVote={myVote}
          numSignUps={numSignUps}
          onBack={onBack}
        />
      ) : (
      <div className="container mx-auto px-6 py-8 lg:py-12">
        {delegationPanel}
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-black transition-colors mb-6 group"
        >
          <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
          {t.proposals.backToList}
        </button>

        {/* Proposal Header — Finalized uses Page 2 layout (COMPLETED RESULTS + PASSED badge) */}
        {phase === V2Phase.Finalized ? (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-black text-white text-[10px] font-bold px-2 py-1 uppercase font-mono">
                {t.proposalDetail.proposalPrefix} #{propPollId + 1}
              </span>
              <span className={`${isTied ? 'bg-amber-500' : isPassed ? 'bg-green-500' : 'bg-red-500'} text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest`}>
                {isTied ? t.results.tied : isPassed ? t.results.passed : t.results.rejected}
              </span>
            </div>
            <h1 className="text-5xl font-display font-black uppercase italic leading-none tracking-tighter">
              {t.completedResults.title}
            </h1>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
            <div className="flex-1 max-w-3xl">
              <div className="flex items-center gap-4 mb-4">
                <span className="bg-black text-white text-xs font-bold px-3 py-1 uppercase tracking-widest">
                  {t.proposalDetail.proposalPrefix} #{propPollId + 1}
                </span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-black uppercase italic leading-tight tracking-tighter">
                {displayTitle}
              </h1>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposalDetail.currentStatus}</span>
              <span className={`px-6 py-3 bg-white border-2 border-black font-black text-xl italic uppercase tracking-tighter ${
                phase === V2Phase.Failed ? 'text-red-600' : 'text-slate-500'
              }`}>
                {phase === V2Phase.NoVotes && t.noVotes.title.toUpperCase()}
                {phase === V2Phase.Failed && (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">schedule</span>
                    {t.failed.title.toUpperCase()}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* My Vote Summary Banner */}
        {myVote && (
          <div className="border-2 border-black bg-slate-50 p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">how_to_vote</span>
              <div>
                <span className="font-display font-bold uppercase text-sm">{t.myVote.title}</span>
                <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                  <span>{t.voteHistory.lastChoice}: <strong className={myVote.choice === 1 ? 'text-emerald-500' : 'text-red-500'}>{myVote.choice === 1 ? t.voteForm.for : t.voteForm.against}</strong></span>
                  <span>{t.voteHistory.lastWeight}: <strong>{myVote.weight}</strong></span>
                  <span>{t.voteHistory.lastCost}: <strong>{myVote.cost} {t.voteForm.credits}</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}
        {!myVote && isConnected && (
          <div className="border-2 border-slate-200 bg-slate-50 p-4 mb-8 flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-400" aria-hidden="true">info</span>
            <span className="text-sm text-slate-500">{t.myVote.noVote}</span>
          </div>
        )}

        {/* Phase Content */}
        {phase === V2Phase.Failed ? (
          /* Failed Phase: Full-width grid layout matching CompletedResults */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Error Details + Status Bar */}
            <div className="lg:col-span-2 space-y-6">
              {/* Error Details Card */}
              <div className="technical-border bg-white p-8">
                <div className="flex items-start gap-6 mb-8">
                  <div className="w-16 h-16 bg-amber-500 border-2 border-black flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-3xl text-white">schedule</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-bold text-black uppercase">
                      {t.failed.errorDetails}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">{t.failed.desc}</p>
                  </div>
                </div>

                {/* Error Reason */}
                <div className="bg-amber-50 border-2 border-amber-200 p-6 mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-amber-500 text-base">schedule</span>
                    <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">
                      {t.failed.processingError}
                    </span>
                  </div>
                  <p className="text-sm text-amber-700 leading-relaxed font-mono">
                    {t.failed.reason}
                  </p>
                  <p className="text-xs text-amber-600 mt-2">
                    {t.failed.coordinatorHint}
                  </p>
                </div>

                {/* Suggested Action */}
                <div className="border-t-2 border-black pt-8">
                  <h3 className="text-sm font-bold uppercase tracking-widest mb-4">
                    {t.failed.suggestedAction}
                  </h3>
                  <p className="text-sm text-slate-600 mb-6">{t.failed.newPollHint}</p>
                  <button
                    onClick={onBack}
                    className="bg-black text-white px-8 py-4 font-display font-black uppercase italic text-sm tracking-widest border-2 border-black hover:bg-slate-800 transition-colors"
                    style={{ boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}
                  >
                    {t.failed.createNew}
                  </button>
                </div>
              </div>

              {/* Error Status Bar */}
              <div className="bg-black text-white p-6 technical-border flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 border border-white/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-500 text-2xl">schedule</span>
                  </div>
                  <div>
                    <h4 className="font-bold uppercase italic text-sm">
                      {t.failed.processingError}
                    </h4>
                    <p className="text-xs text-slate-400 font-mono">
                      POLL: {pollAddress ? `${pollAddress.slice(0, 6)}...${pollAddress.slice(-4)}` : '—'}
                    </p>
                  </div>
                </div>
                {pollAddress && (
                  <a
                    href={`https://sepolia.etherscan.io/address/${pollAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white text-black px-6 py-2 text-xs font-bold uppercase tracking-widest hover:bg-primary hover:text-white transition-colors flex items-center gap-2"
                  >
                    {t.completedResults.viewOnExplorer}
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                  </a>
                )}
              </div>
            </div>

            {/* Right Column: Proposal Details + Metadata */}
            <div className="space-y-6">
              {/* Proposal Details Card */}
              <div className="technical-border bg-white p-8 h-fit">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 mb-8 border-b-2 border-slate-100 pb-2">
                  {t.completedResults.proposalDetails}
                </h2>

                <div className="space-y-4 mb-6">
                  <div>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                      {t.completedResults.titleLabel}
                    </p>
                    <p className="text-base font-display font-bold text-black">
                      {displayTitle}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                      {t.proposalDetail.currentStatus}
                    </p>
                    <span className="inline-block px-3 py-1 bg-amber-500 text-white text-xs font-mono font-bold uppercase tracking-wider">
                      {t.failed.statusFailed}
                    </span>
                  </div>

                  {pollDescription && (
                    <div>
                      <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
                        {t.completedResults.description}
                      </p>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {pollDescription}
                      </p>
                    </div>
                  )}
                </div>

                {/* Back to List Button */}
                <button
                  onClick={onBack}
                  className="w-full bg-black text-white px-4 py-3 text-sm font-mono font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
                >
                  {t.proposals.backToList}
                </button>
              </div>

            </div>
          </div>
        ) : phase === V2Phase.Finalized ? (
          /* Finalized Phase: Full-width 3-column grid layout matching Page 2 mockup */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Voting Breakdown + ZK Verification */}
            <div className="lg:col-span-2">
              {tallyAddress && tallyAddress !== ZERO_ADDRESS ? (
                <ResultsDisplay tallyAddress={tallyAddress} pollAddress={pollAddress || undefined} pollId={propPollId} />
              ) : (
                <div className="border-2 border-black bg-white p-8 text-center">
                  <h3 className="font-display text-2xl font-black uppercase mb-2">{t.results.title}</h3>
                  <p className="text-slate-600">{t.results.desc}</p>
                </div>
              )}
            </div>

            {/* Right Column: Proposal Details + Metadata */}
            <div className="space-y-6">
              {/* Proposal Details Card */}
              <div className="border-2 border-black bg-white p-8 h-fit">
                <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 mb-8 border-b-2 border-slate-100 pb-2">
                  {t.completedResults.proposalDetails}
                </h2>

                <div className="space-y-6 mb-6">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                      {t.completedResults.titleLabel}
                    </p>
                    <p className="text-xl font-display font-bold uppercase leading-tight">
                      {displayTitle}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                      {t.proposalDetail.currentStatus}
                    </p>
                    <span className="inline-block px-3 py-1 bg-green-500 text-white text-xs font-mono font-bold uppercase tracking-wider">
                      {t.proposals.status.finalized}
                    </span>
                  </div>

                  {pollDescription && (
                    <div className="pt-6 border-t-2 border-black">
                      <p className="text-xs text-slate-500 leading-relaxed mb-6">
                        {pollDescription}
                      </p>
                    </div>
                  )}
                </div>

                {/* Back to List Button */}
                <button
                  onClick={onBack}
                  className="w-full bg-black text-white px-4 py-3 text-sm font-mono font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
                >
                  {t.proposals.backToList}
                </button>
              </div>

            </div>
          </div>
        ) : phase === V2Phase.NoVotes ? (
          <div className="w-full">
            <div className="bg-white p-12 border-2 border-black text-center">
              <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">how_to_vote</span>
              <h2 className="font-display text-3xl font-black uppercase italic mb-4">{t.noVotes?.title || '투표 없음'}</h2>
              <p className="text-slate-500 text-lg mb-8">{t.noVotes?.desc || '이 제안에 투표한 사람이 없어 집계할 결과가 없습니다.'}</p>
              <button
                onClick={onBack}
                className="bg-black text-white px-8 py-4 font-display font-black uppercase italic text-sm tracking-widest border-2 border-black hover:bg-slate-800 transition-colors"
                style={{ boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}
              >
                {t.proposals.backToList}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      )}
    </div>
  )
}
