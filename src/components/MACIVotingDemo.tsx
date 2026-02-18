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

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MACI_DEPLOY_BLOCK,
  MACI_ABI,
  POLL_ABI,
  TALLY_ABI,
  VOICE_CREDIT_PROXY_ADDRESS,
  VOICE_CREDIT_PROXY_ABI,
  V2Phase,
  DEFAULT_COORD_PUB_KEY_X,
  DEFAULT_COORD_PUB_KEY_Y,
} from '../contractV2'
import { VoteFormV2 } from './voting/VoteFormV2'
import { getLastVote } from './voting/voteUtils'
import { MergingStatus } from './voting/MergingStatus'
import { ProcessingStatus } from './voting/ProcessingStatus'
import { KeyManager } from './voting/KeyManager'
import { ResultsDisplay } from './voting/ResultsDisplay'
import { PollTimer } from './voting/PollTimer'
import { useTranslation } from '../i18n'
import { preloadCrypto } from '../crypto/preload'

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

export function MACIVotingDemo({ pollId: propPollId, onBack, onVoteSubmitted }: MACIVotingDemoProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { t } = useTranslation()

  const [phase, setPhase] = useState<V2Phase>(V2Phase.Voting)
  const [phaseLoaded, setPhaseLoaded] = useState(false)
  const [signedUp, setSignedUp] = useState(false)
  const [pollAddress, setPollAddress] = useState<`0x${string}` | null>(null)
  const [tallyAddress, setTallyAddress] = useState<`0x${string}` | null>(null)
  const [messageProcessorAddress, setMessageProcessorAddress] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [, setIsSigningUp] = useState(false)
  const [isLoadingPoll, setIsLoadingPoll] = useState(true)
  const [pollTitle, setPollTitle] = useState<string | null>(null)
  const [pollDescription, setPollDescription] = useState<string | null>(null)
  const [isPollExpired, setIsPollExpired] = useState(false)
  const [showReVoteForm, setShowReVoteForm] = useState(false)

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS
  const hasPoll = pollAddress !== null

  // Load poll address from contract using propPollId
  useEffect(() => {
    if (!publicClient || !isConfigured) return
    setIsLoadingPoll(true)

    const loadPoll = async () => {
      try {
        // Parallel: fetch poll address + event logs simultaneously
        const [addr, logs] = await Promise.all([
          publicClient.readContract({
            address: MACI_V2_ADDRESS,
            abi: MACI_ABI,
            functionName: 'polls',
            args: [BigInt(propPollId)],
          }),
          publicClient.getLogs({
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
          }).catch(() => [] as any[]),
        ])

        const pollAddr = addr as `0x${string}`
        if (pollAddr && pollAddr !== ZERO_ADDRESS) {
          setPollAddress(pollAddr)
        }
        const title = localStorage.getItem(`maci-poll-title-${propPollId}`)
        if (title) setPollTitle(title)
        const desc = localStorage.getItem(`maci-poll-desc-${propPollId}`)
        if (desc) setPollDescription(desc)

        for (const log of logs) {
          const args = log.args as { pollId?: bigint; pollAddr?: `0x${string}`; messageProcessorAddr?: `0x${string}`; tallyAddr?: `0x${string}` }
          if (args.pollId !== undefined && Number(args.pollId) === propPollId) {
            if (args.tallyAddr) setTallyAddress(args.tallyAddr)
            if (args.messageProcessorAddr) setMessageProcessorAddress(args.messageProcessorAddr)
            break
          }
        }
      } catch {
        // Poll doesn't exist
      } finally {
        setIsLoadingPoll(false)
      }
    }

    loadPoll()
  }, [propPollId, publicClient, isConfigured])

  // Read coordinator keys from Poll contract (on-chain, not hardcoded)
  const { data: coordPubKeyXRaw } = useReadContract({
    address: pollAddress || ZERO_ADDRESS,
    abi: POLL_ABI,
    functionName: 'coordinatorPubKeyX',
    query: { enabled: hasPoll },
  })
  const { data: coordPubKeyYRaw } = useReadContract({
    address: pollAddress || ZERO_ADDRESS,
    abi: POLL_ABI,
    functionName: 'coordinatorPubKeyY',
    query: { enabled: hasPoll },
  })

  const coordPubKeyX = coordPubKeyXRaw ? BigInt(coordPubKeyXRaw as any) : DEFAULT_COORD_PUB_KEY_X
  const coordPubKeyY = coordPubKeyYRaw ? BigInt(coordPubKeyYRaw as any) : DEFAULT_COORD_PUB_KEY_Y

  // Read voice credits from VoiceCreditProxy (user's token balance = credits)
  const { data: voiceCreditsRaw, isLoading: isLoadingCredits } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: VOICE_CREDIT_PROXY_ABI,
    functionName: 'getVoiceCredits',
    args: address ? [address, '0x'] : undefined,
    query: { enabled: isConfigured && VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS && !!address, refetchInterval: 30000 },
  })
  const voiceCredits = voiceCreditsRaw !== undefined ? Number(voiceCreditsRaw) : (isLoadingCredits ? 100 : 0)

  // Read numMessages from Poll contract for stats
  const { data: numMessagesRaw } = useReadContract({
    address: pollAddress || ZERO_ADDRESS,
    abi: POLL_ABI,
    functionName: 'numMessages',
    query: { enabled: hasPoll, refetchInterval: 30000 },
  })
  const numMessages = numMessagesRaw !== undefined ? Number(numMessagesRaw) : 0

  // Auto-dismiss tx banner after 30 seconds
  useEffect(() => {
    if (!txHash) return
    const timer = setTimeout(() => setTxHash(null), 30000)
    return () => clearTimeout(timer)
  }, [txHash])

  // 2 steps: 0=Vote, 1=Result
  // Ended proposals -> always show result (step 1), regardless of registration
  const currentStep = (hasPoll && phase !== V2Phase.Voting) ? 1 : 0

  // Read numSignUps from MACI
  const { refetch: refetchSignUps } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'numSignUps',
    query: { enabled: isConfigured },
  })

  // Check if user already signed up (multiple signals)
  useEffect(() => {
    if (!address) return
    const hasSignupFlag = localStorage.getItem(`maci-signup-${address}`)
    const hasGlobalKey = localStorage.getItem(`maci-pk-${address}`)
    const hasPollKey = localStorage.getItem(`maci-pubkey-${address}-${propPollId}`)
    const hasVoted = parseInt(localStorage.getItem(`maci-nonce-${address}-${propPollId}`) || '1', 10) > 1
    if (hasSignupFlag || hasGlobalKey || hasPollKey || hasVoted) {
      setSignedUp(true)
      // Ensure signup flag is set for future checks
      if (!hasSignupFlag) localStorage.setItem(`maci-signup-${address}`, 'true')
    }
  }, [address, propPollId])

  // Determine phase from poll state (with Finalized detection)
  useEffect(() => {
    if (!pollAddress || !publicClient) return

    const FAIL_THRESHOLD_S = 30 * 60 // 30 minutes after voting ends

    const checkPhase = async () => {
      try {
        // Parallel: fetch all poll state in one batch
        const [isOpen, stateMerged, msgMerged, deployTimeAndDuration] = await Promise.all([
          publicClient.readContract({
            address: pollAddress,
            abi: POLL_ABI,
            functionName: 'isVotingOpen',
          }),
          publicClient.readContract({
            address: pollAddress,
            abi: POLL_ABI,
            functionName: 'stateAqMerged',
          }),
          publicClient.readContract({
            address: pollAddress,
            abi: POLL_ABI,
            functionName: 'messageAqMerged',
          }),
          publicClient.readContract({
            address: pollAddress,
            abi: POLL_ABI,
            functionName: 'getDeployTimeAndDuration',
          }).catch(() => null),
        ])

        if (isOpen) {
          setPhase(V2Phase.Voting)
          setPhaseLoaded(true)
          return
        }

        // Check if tally is verified first (success path)
        if (tallyAddress && tallyAddress !== ZERO_ADDRESS) {
          try {
            const verified = await publicClient.readContract({
              address: tallyAddress,
              abi: TALLY_ABI,
              functionName: 'tallyVerified',
            })
            if (verified) {
              setPhase(V2Phase.Finalized)
              setPhaseLoaded(true)
              return
            }
          } catch {
            // Tally contract might not support tallyVerified
          }
        }

        // Check if stuck too long → Failed
        if (deployTimeAndDuration) {
          const [deployTime, duration] = deployTimeAndDuration as [bigint, bigint]
          const votingEndTime = Number(deployTime) + Number(duration)
          const now = Math.floor(Date.now() / 1000)
          if (now - votingEndTime > FAIL_THRESHOLD_S) {
            setPhase(V2Phase.Failed)
            setPhaseLoaded(true)
            return
          }
        }

        if (!stateMerged || !msgMerged) {
          setPhase(V2Phase.Merging)
          setPhaseLoaded(true)
          return
        }

        setPhase(V2Phase.Processing)
        setPhaseLoaded(true)
      } catch {
        // Poll might not exist yet or read failed
        setPhaseLoaded(true)
      }
    }

    checkPhase()
    // Voting phase: slow poll (15s). Merging/Processing: faster (8s). Finalized: stop.
    if (phase === V2Phase.Finalized) return
    const ms = phase === V2Phase.Voting ? 15000 : 8000
    const interval = setInterval(checkPhase, ms)
    return () => clearInterval(interval)
  }, [pollAddress, publicClient, tallyAddress, phase])

  // === SignUp (called by VoteFormV2 via callback) ===
  const handleSignUp = useCallback(async () => {
    if (!address) return
    setError(null)
    setIsSigningUp(true)

    try {
      const cm = await preloadCrypto()
      const sk = cm.generateRandomPrivateKey()
      const pk = await cm.eddsaDerivePublicKey(sk)

      const hash = await writeContractAsync({
        address: MACI_V2_ADDRESS,
        abi: MACI_ABI,
        functionName: 'signUp',
        args: [pk[0], pk[1], '0x', '0x'],
      })

      // Parse SignUp event to get stateIndex
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash })
          for (const log of receipt.logs) {
            if (log.topics.length >= 2 && log.topics[0]) {
              const stateIndex = parseInt(log.topics[1] as string, 16)
              if (!isNaN(stateIndex) && stateIndex > 0) {
                localStorage.setItem(`maci-stateIndex-${address}`, String(stateIndex))
              }
            }
          }
        } catch {
          localStorage.setItem(`maci-stateIndex-${address}`, '1')
        }
      }

      localStorage.setItem(`maci-signup-${address}`, 'true')
      await cm.storeEncrypted(`maci-sk-${address}`, sk.toString(), address)
      localStorage.setItem(`maci-pk-${address}`, JSON.stringify([pk[0].toString(), pk[1].toString()]))

      setSignedUp(true)
      setTxHash(hash)
      refetchSignUps()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('insufficient funds') || msg.includes('gas')) {
        throw new Error('signup:' + t.voteForm.errorGas)
      } else if (msg.includes('rejected') || msg.includes('denied')) {
        throw new Error('signup:' + t.voteForm.errorRejected)
      } else {
        throw new Error('signup:' + t.maci.signup.error)
      }
    } finally {
      setIsSigningUp(false)
    }
  }, [address, writeContractAsync, refetchSignUps, publicClient, t])

  // My vote info
  const myVote = address ? getLastVote(address, propPollId) : null
  const hasVoted = myVote !== null

  // Generate a pseudo receipt ID from the vote data
  const receiptId = myVote
    ? String(propPollId * 1000 + myVote.choice * 500 + myVote.weight * 100 + myVote.cost).padStart(4, '0')
    : null

  // === Not configured ===
  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-white">
        <div className="w-full px-6 py-20">
          <div className="technical-card-heavy bg-white p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-slate-300 mb-4" aria-hidden="true">settings</span>
            <h2 className="font-display text-3xl font-black uppercase mb-4">{t.maci.title}</h2>
            <p className="text-slate-600">{t.maci.notDeployedDesc}</p>
          </div>
        </div>
      </div>
    )
  }

  // === Not connected ===
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-white">
        <div className="w-full px-6 py-20">
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
        <div className="w-full px-6 py-20">
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
        <div className="w-full px-6 py-20">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-black transition-colors mb-6 group"
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

  const displayTitle = pollTitle || `Proposal #${propPollId + 1}`

  // === Voting Phase (Page 5 / Page 6) ===
  if (currentStep === 0 && phase === V2Phase.Voting) {
    return (
      <div className="min-h-screen bg-white">
        {/* Re-vote banner - only shown if user has already voted and not in re-vote mode */}
        {hasVoted && !showReVoteForm && (
          <div className="w-full px-6 mt-8">
            <div className="p-4 border-2 border-black bg-slate-900 text-white flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">info</span>
                <span className="text-sm font-bold uppercase tracking-wider">{t.proposalDetail.alreadyVotedBanner}</span>
              </div>
              <button
                onClick={() => setShowReVoteForm(true)}
                className="bg-white text-black px-6 py-2 text-[10px] font-bold uppercase tracking-widest border-2 border-black hover:bg-slate-100 transition-colors whitespace-nowrap"
              >
                {t.proposalDetail.reVote}
              </button>
            </div>
          </div>
        )}

        {/* Error / Tx banners */}
        {error && (
          <div className="bg-red-50 border-b-2 border-red-500">
            <div className="w-full px-6 py-3 flex items-center justify-between">
              <span className="text-red-700 text-sm">{error}</span>
              <button className="text-red-700 text-xs font-bold underline" onClick={() => setError(null)}>{t.maci.signup.retry}</button>
            </div>
          </div>
        )}
        {txHash && (
          <div className="bg-green-50 border-b-2 border-green-500">
            <div className="w-full px-6 py-3 flex items-center gap-2">
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

        <div className="w-full px-6 py-8 lg:py-12">
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-black transition-colors mb-6 group"
          >
            <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
            {t.proposals.backToList}
          </button>

          {/* Proposal Header */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <span className="bg-black text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest">
                  Proposal #{propPollId + 1}
                </span>
              </div>
              <h1 className="font-display text-5xl lg:text-7xl font-black uppercase italic leading-[0.9] tracking-tighter max-w-4xl">
                {displayTitle}
              </h1>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposalDetail.currentStatus}</span>
              <span className="px-6 py-3 bg-white text-black border-4 border-black font-black text-xl italic uppercase tracking-tighter">{t.proposalDetail.votingOpen}</span>
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
                <PollTimer pollAddress={pollAddress!} onExpired={() => setIsPollExpired(true)} />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-6">
                <div className="p-8 border-2 border-black bg-white flex flex-col justify-between aspect-video">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.proposalDetail.totalParticipants}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-display font-black italic">{numMessages}</span>
                    <span className="text-sm font-bold text-slate-400">{t.proposalDetail.users}</span>
                  </div>
                </div>
                <div className="p-8 border-2 border-black bg-white flex flex-col justify-between aspect-video">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{t.proposalDetail.currentWeight}</span>
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

              {/* Key Manager (advanced, collapsible) */}
              <KeyManager
                pollId={propPollId}
                coordinatorPubKeyX={coordPubKeyX}
                coordinatorPubKeyY={coordPubKeyY}
                pollAddress={pollAddress!}
                isRegistered={signedUp}
              />
            </div>

            {/* Right Column - Vote Form or Voted Summary */}
            <div className="lg:col-span-5">
              <div>
                {/* Show vote form if: no vote yet, OR user clicked re-vote */}
                {(!hasVoted || showReVoteForm) ? (
                  <VoteFormV2
                    pollId={propPollId}
                    pollAddress={pollAddress!}
                    coordinatorPubKeyX={coordPubKeyX}
                    coordinatorPubKeyY={coordPubKeyY}
                    voiceCredits={voiceCredits}
                    isExpired={isPollExpired}
                    isRegistered={signedUp}
                    onSignUp={handleSignUp}
                    onVoteSubmitted={(voteTxHash) => {
                      setTxHash(voteTxHash)
                      setShowReVoteForm(false)
                      // Notify parent with vote data
                      if (onVoteSubmitted && address) {
                        const vote = getLastVote(address, propPollId)
                        if (vote) {
                          onVoteSubmitted({
                            pollId: propPollId,
                            pollTitle: displayTitle,
                            choice: vote.choice,
                            weight: vote.weight,
                            cost: vote.cost,
                            txHash: voteTxHash,
                          })
                        }
                      }
                    }}
                  />
                ) : (
                  /* Voted Summary Card (Page 6) */
                  <div className="bg-white border-4 border-black sticky top-32" style={{ boxShadow: '6px 6px 0px 0px rgba(0, 0, 0, 1)' }}>
                    {/* Card Header */}
                    <div className="p-8 border-b-2 border-black bg-slate-50 flex items-center justify-between">
                      <h3 className="text-xl font-display font-black text-primary tracking-tight italic flex items-center gap-2">
                        <span className="material-symbols-outlined font-bold" aria-hidden="true">check_circle</span>
                        {t.proposalDetail.voteSubmitted}
                      </h3>
                      {receiptId && (
                        <span className="text-[10px] font-mono font-bold bg-black text-white px-2 py-1 uppercase">
                          Receipt ID: {receiptId}
                        </span>
                      )}
                    </div>

                    {/* Vote Details */}
                    <div className="p-8 space-y-8">
                      <div className="space-y-6">
                        {/* Your Selection */}
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">{t.proposalDetail.yourSelection}</span>
                          <div className={`text-4xl font-display font-black italic ${myVote!.choice === 1 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {myVote!.choice === 1 ? t.voteForm.for : t.voteForm.against}
                          </div>
                        </div>

                        {/* Intensity + Cost */}
                        <div className="grid grid-cols-2 gap-8 pt-6 border-t border-black/10">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">{t.proposalDetail.intensity}</span>
                            <div className="text-3xl font-mono font-bold text-black">{myVote!.weight}</div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">{t.proposalDetail.totalCost}</span>
                            <div className="text-3xl font-mono font-bold text-primary">{myVote!.cost}</div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase mt-1">{t.voteForm.credits}</span>
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
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t.proposalDetail.encryptedProof}</p>
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
          <div className="w-full px-6 py-3 flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <button className="text-red-700 text-xs font-bold underline" onClick={() => setError(null)}>{t.maci.signup.retry}</button>
          </div>
        </div>
      )}
      {txHash && (
        <div className="bg-green-50 border-b-2 border-green-500">
          <div className="w-full px-6 py-3 flex items-center gap-2">
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

      <div className="w-full px-6 py-8 lg:py-12">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-black transition-colors mb-6 group"
        >
          <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
          {t.proposals.backToList}
        </button>

        {/* Proposal Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <span className="bg-black text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest">
                Proposal #{propPollId + 1}
              </span>
            </div>
            <h1 className="font-display text-5xl lg:text-7xl font-black uppercase italic leading-[0.9] tracking-tighter max-w-4xl">
              {displayTitle}
            </h1>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.proposalDetail.currentStatus}</span>
            <span className={`px-6 py-3 bg-white border-4 border-black font-black text-xl italic uppercase tracking-tighter ${
              phase === V2Phase.Finalized ? 'text-green-600' : phase === V2Phase.Failed ? 'text-red-600' : 'text-amber-600'
            }`}>
              {phase === V2Phase.Merging && t.merging.title.toUpperCase()}
              {phase === V2Phase.Processing && t.processing.title.toUpperCase()}
              {phase === V2Phase.Failed && (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">error</span>
                  {t.failed.title.toUpperCase()}
                </span>
              )}
              {phase === V2Phase.Finalized && (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">check_circle</span>
                  {t.proposals.status.finalized.toUpperCase()}
                </span>
              )}
            </span>
          </div>
        </div>

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
        {!myVote && address && (
          <div className="border-2 border-slate-200 bg-slate-50 p-4 mb-8 flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-400" aria-hidden="true">info</span>
            <span className="text-sm text-slate-500">{t.myVote.noVote}</span>
          </div>
        )}

        {/* Phase Content */}
        <div className="max-w-3xl">
          {phase === V2Phase.Merging && pollAddress && (
            <div className="technical-card-heavy bg-white p-8">
              <MergingStatus pollAddress={pollAddress} />
            </div>
          )}
          {phase === V2Phase.Processing && (
            <div className="technical-card-heavy bg-white p-8">
              <ProcessingStatus messageProcessorAddress={messageProcessorAddress || undefined} tallyAddress={tallyAddress || undefined} />
            </div>
          )}
          {phase === V2Phase.Failed && (
            <div className="technical-card-heavy bg-white p-8">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 bg-red-100 border-2 border-red-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl text-red-500">error</span>
                </div>
                <h3 className="font-display text-2xl font-black uppercase tracking-tight text-red-600">
                  {t.failed.title}
                </h3>
                <p className="text-sm text-slate-600 max-w-lg">{t.failed.desc}</p>
                <div className="mt-2 p-4 bg-red-50 border border-red-200 text-left w-full">
                  <p className="text-xs text-red-700">{t.failed.reason}</p>
                </div>
                <p className="text-sm font-bold text-slate-500 mt-2">{t.failed.newPollHint}</p>
                <button
                  onClick={onBack}
                  className="mt-4 bg-black text-white px-8 py-3 font-bold text-xs uppercase tracking-widest border-2 border-black hover:bg-slate-800 transition-colors"
                >
                  {t.proposals.backToList}
                </button>
              </div>
            </div>
          )}
          {phase === V2Phase.Finalized && tallyAddress && tallyAddress !== ZERO_ADDRESS ? (
            <div className="technical-card-heavy bg-white p-8">
              <ResultsDisplay tallyAddress={tallyAddress} />
            </div>
          ) : phase === V2Phase.Finalized ? (
            <div className="technical-card-heavy bg-white p-8 text-center">
              <h3 className="font-display text-2xl font-black uppercase mb-2">{t.results.title}</h3>
              <p className="text-slate-600">{t.results.desc}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
