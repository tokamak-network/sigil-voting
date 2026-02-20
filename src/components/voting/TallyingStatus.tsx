/**
 * TallyingStatus - Unified tallying phase UI
 *
 * Matches Stitch design #7: sigil_privacy-first_dao_voting_landing_page_7
 * Replaces MergingStatus + ProcessingStatus with a single 2-column layout.
 */

import { useState, useEffect } from 'react'
import { useReadContract } from 'wagmi'
import { POLL_ABI, MESSAGE_PROCESSOR_ABI, TALLY_ABI } from '../../contractV2'
import { useTranslation } from '../../i18n'

interface TallyingStatusProps {
  pollAddress?: `0x${string}`
  messageProcessorAddress?: `0x${string}`
  tallyAddress?: `0x${string}`
  votingEndTime?: number
  pollTitle: string
  pollDescription?: string | null
  pollId: number
  myVote?: { choice: number; weight: number; cost: number } | null
  numSignUps: number
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export function TallyingStatus({
  pollAddress,
  messageProcessorAddress,
  tallyAddress,
  votingEndTime,
  pollTitle,
  pollDescription,
  pollId,
  myVote,
  numSignUps,
}: TallyingStatusProps) {
  const { t } = useTranslation()
  const addr = pollAddress || ZERO_ADDRESS
  const mpAddr = messageProcessorAddress || ZERO_ADDRESS
  const tAddr = tallyAddress || ZERO_ADDRESS
  const hasValidPoll = addr !== ZERO_ADDRESS
  const hasValidMp = mpAddr !== ZERO_ADDRESS
  const hasValidTally = tAddr !== ZERO_ADDRESS

  // On-chain state polling
  const { data: stateAqMerged } = useReadContract({
    address: addr,
    abi: POLL_ABI,
    functionName: 'stateAqMerged',
    query: { enabled: hasValidPoll, refetchInterval: 10000 },
  })

  const { data: messageAqMerged } = useReadContract({
    address: addr,
    abi: POLL_ABI,
    functionName: 'messageAqMerged',
    query: { enabled: hasValidPoll, refetchInterval: 10000 },
  })

  const { data: processingComplete } = useReadContract({
    address: mpAddr,
    abi: MESSAGE_PROCESSOR_ABI,
    functionName: 'processingComplete',
    query: { enabled: hasValidMp, refetchInterval: 10000 },
  })

  const { data: tallyVerified } = useReadContract({
    address: tAddr,
    abi: TALLY_ABI,
    functionName: 'tallyVerified',
    query: { enabled: hasValidTally, refetchInterval: 10000 },
  })

  // Determine current step (1-based)
  const isProcessed = processingComplete === true
  const isFinalized = tallyVerified === true

  // Adaptive countdown: adjusts remaining time based on actual on-chain progress
  // Total ~3min: merge ~50s, processing ~50s, tally ~25s, publish ~20s
  const allMerged = stateAqMerged === true && messageAqMerged === true
  const remainingFromStep = isFinalized ? 0
    : isProcessed ? 45   // tally + publish remaining
    : allMerged ? 95     // processing + tally + publish
    : 180                // full pipeline

  // Track when each step was first detected to anchor the countdown
  const [stepAnchor, setStepAnchor] = useState<{ step: number; time: number }>({ step: 0, time: votingEndTime ? votingEndTime * 1000 : Date.now() })
  const currentStep = isFinalized ? 3 : isProcessed ? 2 : allMerged ? 1 : 0
  useEffect(() => {
    if (currentStep > stepAnchor.step) {
      setStepAnchor({ step: currentStep, time: Date.now() })
    }
  }, [currentStep, stepAnchor.step])

  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  const elapsedSinceAnchor = (now - stepAnchor.time) / 1000
  const remainingSec_raw = Math.max(0, remainingFromStep - elapsedSinceAnchor)
  const isOverdue = remainingSec_raw === 0 && !isFinalized

  const choiceLabel = myVote
    ? myVote.choice === 1
      ? t.voteForm.for.toUpperCase()
      : t.voteForm.against.toUpperCase()
    : '—'

  return (
    <div>
      {/* Top Banner */}
      <div className="w-full bg-black text-white px-6 py-4 mb-8">
        <div className="flex items-center justify-center gap-3">
          <span className="material-symbols-outlined font-bold">encrypted</span>
          <span className="font-display font-black text-lg italic uppercase tracking-widest">
            {t.processing.title}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Column */}
        <div className="lg:col-span-7">
          <div className="mb-12">
            {/* Badges */}
            <div className="flex items-center gap-4 mb-4">
              <span className="bg-black text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest">
                {t.proposalDetail.proposalPrefix} #{pollId + 1}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">
                {t.tallying.phase}
              </span>
            </div>

            {/* Title */}
            <h1 className="text-5xl lg:text-7xl font-display font-black uppercase italic leading-[0.9] tracking-tighter max-w-4xl mb-8">
              {pollTitle}
            </h1>

            {/* Proposal Context */}
            {pollDescription && (
              <div className="p-8 border-2 border-black bg-slate-50">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                  {t.tallying.proposalContext}
                </h4>
                <p className="text-lg font-medium leading-relaxed text-slate-700 italic">
                  {pollDescription}
                </p>
              </div>
            )}
          </div>

          {/* Privacy Assurance */}
          <div className="p-10 border-4 border-black bg-slate-900 text-white relative overflow-hidden" style={{ boxShadow: '6px 6px 0px 0px rgba(0,0,0,1)' }}>
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <span className="material-symbols-outlined text-8xl">verified_user</span>
            </div>
            <h3 className="text-primary font-bold text-xs uppercase tracking-[0.3em] mb-4">
              {t.tallying.privacyAssurance}
            </h3>
            <p className="text-3xl font-display font-black uppercase italic leading-tight relative z-10">
              {t.tallying.privacyDesc}
            </p>
            <div className="mt-6 flex items-center gap-4">
              <div className="h-[2px] flex-1 bg-primary/30"></div>
              <span className="material-symbols-outlined text-primary text-sm">verified_user</span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-5">
          <div className="flex flex-col gap-8">
            {/* Processing Status */}
            <div className="bg-white p-8 border-2 border-black" style={{ boxShadow: '6px 6px 0px 0px rgba(0,0,0,1)' }}>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                <span className="w-2 h-2 bg-primary"></span>
                {t.tallying.processingStatus}
              </h3>
              <div className="space-y-0 relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-4 bottom-4 w-1 bg-slate-100"></div>

                {/* Step 1: Voting Closed */}
                <div className="relative flex items-center gap-6 pb-10">
                  <div className="w-9 h-9 bg-black flex items-center justify-center z-10 border-2 border-black shrink-0">
                    <span className="material-symbols-outlined text-white text-xl">check</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.tallying.step01}</p>
                    <p className="font-bold text-lg uppercase italic">{t.timer.ended}</p>
                  </div>
                </div>

                {/* Step 2: Generating ZK-Proofs */}
                <div className="relative flex items-center gap-6 pb-10">
                  <div className={`w-9 h-9 flex items-center justify-center z-10 border-2 border-black shrink-0 ${
                    isProcessed ? 'bg-black' : 'bg-primary'
                  }`} style={!isProcessed ? { animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' } : undefined}>
                    <span className="material-symbols-outlined text-white text-xl">
                      {isProcessed ? 'check' : 'settings_b_roll'}
                    </span>
                  </div>
                  {!isProcessed && <div className="absolute left-4 top-9 w-1 h-10 bg-primary"></div>}
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${isProcessed ? 'text-slate-400' : 'text-primary'}`}>
                      {isProcessed ? t.tallying.step02 : t.tallying.currentPhase}
                    </p>
                    <p className={`font-bold text-lg uppercase italic ${isProcessed ? 'text-black' : 'text-primary'}`}>
                      {t.processing.step2}
                    </p>
                  </div>
                </div>

                {/* Step 3: Final Tally Published */}
                <div className="relative flex items-center gap-6">
                  <div className={`w-9 h-9 flex items-center justify-center z-10 border-2 shrink-0 ${
                    isFinalized ? 'bg-black border-black' : 'bg-white border-slate-200'
                  }`}>
                    <span className={`material-symbols-outlined text-xl ${isFinalized ? 'text-white' : 'text-slate-300'}`}>
                      {isFinalized ? 'check' : 'publish'}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.tallying.finalStep}</p>
                    <p className={`font-bold text-lg uppercase italic ${isFinalized ? 'text-black' : 'text-slate-300'}`}>
                      {t.processing.step3}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Estimated Completion */}
            <div className="bg-slate-50 p-8 border-2 border-black" style={{ boxShadow: '6px 6px 0px 0px rgba(0,0,0,1)' }}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                {t.tallying.estimatedRemaining}
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-mono font-bold leading-none ${isOverdue ? 'text-amber-500' : 'text-primary'}`}>
                  {isOverdue
                    ? t.tallying.processing
                    : `~${new Date(Date.now() + remainingSec_raw * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                </span>
                <span className="text-xs font-bold text-slate-400">UTC</span>
              </div>
            </div>

            {/* My Vote Summary + Participation */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 border-2 border-black bg-slate-50">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                  {t.tallying.myVoteSummary}
                </span>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{t.tallying.choice}</span>
                    <span className="text-sm font-black italic text-primary">{choiceLabel}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{t.tallying.spent}</span>
                    <span className="text-sm font-mono font-bold">{myVote ? (Number.isInteger(myVote.cost) ? myVote.cost : myVote.cost.toFixed(2)) : '—'}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 border-2 border-black bg-white">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                  {t.tallying.participation}
                </span>
                <div className="flex flex-col">
                  <span className="text-3xl font-display font-black italic leading-none">{numSignUps}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase mt-1">{t.tallying.totalUsers}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
