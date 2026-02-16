/**
 * MACIVotingDemo - Integrated MACI V2 Voting UI
 *
 * 2-step flow (auto-registration on first vote):
 *   Step 0: Vote (auto-registers if needed)
 *   Step 1: Result (Merging / Processing / Finalized)
 *
 * Unregistered users can still view results for ended proposals.
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
import { VoteFormV2, getLastVote } from './voting/VoteFormV2'
import { MergingStatus } from './voting/MergingStatus'
import { ProcessingStatus } from './voting/ProcessingStatus'
import { KeyManager } from './voting/KeyManager'
import { ResultsDisplay } from './voting/ResultsDisplay'
import { PollTimer } from './voting/PollTimer'
import { useTranslation } from '../i18n'
import { preloadCrypto } from '../crypto/preload'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

interface MACIVotingDemoProps {
  pollId: number
  onBack: () => void
}

export function MACIVotingDemo({ pollId: propPollId, onBack }: MACIVotingDemoProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { t } = useTranslation()

  const [phase, setPhase] = useState<V2Phase>(V2Phase.Voting)
  const [signedUp, setSignedUp] = useState(false)
  const [pollAddress, setPollAddress] = useState<`0x${string}` | null>(null)
  const [tallyAddress, setTallyAddress] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [isLoadingPoll, setIsLoadingPoll] = useState(true)
  const [pollTitle, setPollTitle] = useState<string | null>(null)
  const [isPollExpired, setIsPollExpired] = useState(false)

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
                { name: '_pollId', type: 'uint256', indexed: false },
                { name: 'pollAddr', type: 'address', indexed: true },
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

        for (const log of logs) {
          const args = log.args as { _pollId?: bigint; tallyAddr?: `0x${string}` }
          if (args._pollId !== undefined && Number(args._pollId) === propPollId && args.tallyAddr) {
            setTallyAddress(args.tallyAddr)
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
  const { data: voiceCreditsRaw } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: VOICE_CREDIT_PROXY_ABI,
    functionName: 'getVoiceCredits',
    args: address ? [address, '0x'] : undefined,
    query: { enabled: isConfigured && VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS && !!address, refetchInterval: 30000 },
  })
  const voiceCredits = voiceCreditsRaw !== undefined ? Number(voiceCreditsRaw) : 0

  // Auto-dismiss tx banner after 8 seconds
  useEffect(() => {
    if (!txHash) return
    const timer = setTimeout(() => setTxHash(null), 8000)
    return () => clearTimeout(timer)
  }, [txHash])

  // 2 steps: 0=Vote, 1=Result
  // Ended proposals → always show result (step 1), regardless of registration
  const currentStep = (hasPoll && phase !== V2Phase.Voting) ? 1 : 0

  // Read numSignUps from MACI
  const { data: _numSignUps, refetch: refetchSignUps } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'numSignUps',
    query: { enabled: isConfigured },
  })

  // Check if user already signed up (localStorage)
  useEffect(() => {
    if (!address) return
    const stored = localStorage.getItem(`maci-signup-${address}`)
    if (stored) setSignedUp(true)
  }, [address])

  // Determine phase from poll state (with Finalized detection)
  useEffect(() => {
    if (!pollAddress || !publicClient) return

    const checkPhase = async () => {
      try {
        // Parallel: fetch all poll state in one batch
        const [isOpen, stateMerged, msgMerged] = await Promise.all([
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
        ])

        if (isOpen) {
          setPhase(V2Phase.Voting)
          return
        }

        if (!stateMerged || !msgMerged) {
          setPhase(V2Phase.Merging)
          return
        }

        // Both queues merged — check if tally is verified
        if (tallyAddress && tallyAddress !== ZERO_ADDRESS) {
          try {
            const verified = await publicClient.readContract({
              address: tallyAddress,
              abi: TALLY_ABI,
              functionName: 'tallyVerified',
            })
            if (verified) {
              setPhase(V2Phase.Finalized)
              return
            }
          } catch {
            // Tally contract might not support tallyVerified
          }
        }

        setPhase(V2Phase.Processing)
      } catch {
        // Poll might not exist yet or read failed
      }
    }

    checkPhase()
    const interval = setInterval(checkPhase, 5000)
    return () => clearInterval(interval)
  }, [pollAddress, publicClient, tallyAddress])

  // === SignUp (called by VoteFormV2 via callback) ===
  const handleSignUp = useCallback(async () => {
    if (!address) return
    setError(null)
    setIsSigningUp(true)

    try {
      const cm = await preloadCrypto()
      const sk = cm.generateRandomPrivateKey()
      const pk = await cm.derivePublicKey(sk)

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

  // === Stepper labels (2 steps) ===
  const steps = [
    t.maci.stepper.vote,
    t.maci.stepper.result,
  ]

  // My vote info (for ended proposals)
  const myVote = address ? getLastVote(address, propPollId) : null

  // === Not configured ===
  if (!isConfigured) {
    return (
      <div className="maci-voting-demo">
        <div className="brutalist-card">
          <h2>{t.maci.title}</h2>
          <p>{t.maci.notDeployedDesc}</p>
        </div>
      </div>
    )
  }

  // === Not connected ===
  if (!isConnected) {
    return (
      <div className="maci-voting-demo">
        <div className="brutalist-card">
          <h2>{t.maci.title}</h2>
          <p>{t.maci.connectWallet}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="maci-voting-demo">
      <div className="brutalist-card">
        <button className="back-to-list-btn" onClick={onBack}>
          <span className="material-symbols-outlined">arrow_back</span>
          {t.proposals.backToList}
        </button>
        <h2>{pollTitle || `${t.maci.poll.active.replace('{id}', String(propPollId))}`}</h2>
        <p className="maci-description">{t.maci.description}</p>

        {/* Stepper - 2 steps */}
        <div className="stepper" role="navigation" aria-label="Voting steps">
          {steps.map((label, i) => (
            <div key={i} className="stepper-item-wrapper">
              <div
                className={`stepper-item ${
                  i < currentStep ? 'complete' : i === currentStep ? 'active' : 'pending'
                }`}
                aria-current={i === currentStep ? 'step' : undefined}
              >
                <div className="stepper-circle" aria-hidden="true">
                  {i < currentStep ? (
                    <span className="material-symbols-outlined stepper-check">check</span>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className="stepper-label">{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`stepper-line ${i < currentStep ? 'complete' : ''}`} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button className="retry-btn" onClick={() => setError(null)}>{t.maci.signup.retry}</button>
          </div>
        )}
        {txHash && (
          <div className="tx-banner" role="status">
            {t.maci.lastTx}{' '}
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </div>
        )}

        {/* === Step Cards === */}

        {/* Step 0: Vote (with auto-registration) */}
        <section
          className={`step-card ${currentStep === 0 ? 'active' : 'complete'}`}
          aria-label={t.maci.stepper.vote}
        >
          {currentStep === 0 ? (
            <div className="step-content">
              {isLoadingPoll ? (
                <div className="loading-spinner" role="status" aria-busy="true">
                  <span className="spinner" aria-hidden="true" />
                  <span>{t.maci.waiting.processing}</span>
                </div>
              ) : hasPoll && phase === V2Phase.Voting ? (
                <>
                  <div className="poll-info-card">
                    <PollTimer pollAddress={pollAddress!} onExpired={() => setIsPollExpired(true)} />
                  </div>
                  <VoteFormV2
                    pollId={propPollId}
                    pollAddress={pollAddress!}
                    coordinatorPubKeyX={coordPubKeyX}
                    coordinatorPubKeyY={coordPubKeyY}
                    voiceCredits={voiceCredits}
                    isExpired={isPollExpired}
                    isRegistered={signedUp}
                    onSignUp={handleSignUp}
                    onVoteSubmitted={() => setTxHash(null)}
                  />
                  <KeyManager
                    pollId={propPollId}
                    coordinatorPubKeyX={coordPubKeyX}
                    coordinatorPubKeyY={coordPubKeyY}
                    pollAddress={pollAddress!}
                  />
                </>
              ) : !hasPoll && !isLoadingPoll ? (
                <div className="no-poll-notice">
                  <p>{t.maci.stats.currentPoll}: {t.maci.stats.none}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="step-summary">
              <span className="step-check" aria-hidden="true">&#10003;</span> {t.maci.waiting.merging}
            </div>
          )}
        </section>

        {/* Step 1: Results */}
        {currentStep >= 1 && (
          <section className="step-card active" aria-label={t.maci.stepper.result}>
            <div className="step-content">
              {/* My Vote summary */}
              {myVote && (
                <div className="my-vote-banner">
                  <div className="my-vote-header">
                    <span className="material-symbols-outlined" aria-hidden="true">how_to_vote</span>
                    <span>{t.myVote.title}</span>
                  </div>
                  <div className="my-vote-details">
                    <span>{t.voteHistory.lastChoice}: <strong>{myVote.choice === 1 ? t.voteForm.for : t.voteForm.against}</strong></span>
                    <span>{t.voteHistory.lastWeight}: <strong>{myVote.weight}</strong></span>
                    <span>{t.voteHistory.lastCost}: <strong>{myVote.cost} {t.voteForm.credits}</strong></span>
                  </div>
                </div>
              )}
              {!myVote && address && (
                <div className="my-vote-banner my-vote-none">
                  <span className="material-symbols-outlined" aria-hidden="true">info</span>
                  <span>{t.myVote.noVote}</span>
                </div>
              )}

              {phase === V2Phase.Merging && pollAddress && (
                <MergingStatus pollAddress={pollAddress} />
              )}
              {phase === V2Phase.Processing && (
                <ProcessingStatus />
              )}
              {phase === V2Phase.Finalized && tallyAddress && tallyAddress !== ZERO_ADDRESS ? (
                <ResultsDisplay tallyAddress={tallyAddress} />
              ) : phase === V2Phase.Finalized ? (
                <>
                  <h3>{t.results.title}</h3>
                  <p>{t.results.desc}</p>
                </>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
