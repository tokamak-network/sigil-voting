/**
 * MACIVotingDemo - Integrated MACI V2 Voting UI
 *
 * 3-step flow for all users:
 *   Step 0: Register (SignUp)
 *   Step 1: Vote (with optional poll creation if none exists)
 *   Step 2: Result (Merging / Processing / Finalized)
 *
 * Poll creation is NOT a mandatory step — voters can skip it
 * if an active poll already exists on-chain.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MACI_ABI,
  POLL_ABI,
  VOICE_CREDIT_PROXY_ADDRESS,
  VOICE_CREDIT_PROXY_ABI,
  V2Phase,
  DEFAULT_COORD_PUB_KEY_X,
  DEFAULT_COORD_PUB_KEY_Y,
} from '../contractV2'
import { CreatePollForm } from './CreatePollForm'
import { VoteFormV2 } from './voting/VoteFormV2'
import { MergingStatus } from './voting/MergingStatus'
import { ProcessingStatus } from './voting/ProcessingStatus'
import { KeyManager } from './voting/KeyManager'
import { ResultsDisplay } from './voting/ResultsDisplay'
import { PollTimer } from './voting/PollTimer'
import { useTranslation } from '../i18n'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export function MACIVotingDemo() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const { t } = useTranslation()

  const [phase, setPhase] = useState<V2Phase>(V2Phase.Voting)
  const [signedUp, setSignedUp] = useState(false)
  const [pollId, setPollId] = useState<number | null>(null)
  const [pollAddress, setPollAddress] = useState<`0x${string}` | null>(null)
  const [tallyAddress] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [showCreatePoll, setShowCreatePoll] = useState(false)
  const [isLoadingPoll, setIsLoadingPoll] = useState(false)
  const [pollTitle, setPollTitle] = useState<string | null>(null)

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS
  const hasPoll = pollId !== null && pollAddress !== null

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

  // Read voice credits from VoiceCreditProxy
  const { data: voiceCreditsRaw } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: VOICE_CREDIT_PROXY_ABI,
    functionName: 'creditAmount',
    query: { enabled: isConfigured && VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS },
  })
  const voiceCredits = voiceCreditsRaw ? Number(voiceCreditsRaw) : 100

  // Auto-dismiss tx banner after 8 seconds
  useEffect(() => {
    if (!txHash) return
    const timer = setTimeout(() => setTxHash(null), 8000)
    return () => clearTimeout(timer)
  }, [txHash])

  // 3 steps: 0=Register, 1=Vote, 2=Result
  const currentStep = !signedUp ? 0 : (hasPoll && phase !== V2Phase.Voting) ? 2 : 1

  // Read numSignUps from MACI
  const { data: _numSignUps, refetch: refetchSignUps } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'numSignUps',
    query: { enabled: isConfigured },
  })

  // Read nextPollId to auto-detect existing polls
  const { data: nextPollId } = useReadContract({
    address: MACI_V2_ADDRESS,
    abi: MACI_ABI,
    functionName: 'nextPollId',
    query: { enabled: isConfigured },
  })

  // Check if user already signed up (localStorage)
  useEffect(() => {
    if (!address) return
    const stored = localStorage.getItem(`maci-signup-${address}`)
    if (stored) setSignedUp(true)
  }, [address])

  // Load poll: first try localStorage, then auto-detect from contract
  useEffect(() => {
    const storedPollId = localStorage.getItem('maci-last-poll-id')
    const storedPollAddr = localStorage.getItem('maci-last-poll-addr')
    if (storedPollId && storedPollAddr) {
      const id = parseInt(storedPollId, 10)
      setPollId(id)
      setPollAddress(storedPollAddr as `0x${string}`)
      // Load poll title from localStorage
      const title = localStorage.getItem(`maci-poll-title-${id}`)
      if (title) setPollTitle(title)
      return
    }

    // Auto-detect latest poll from contract
    if (!nextPollId || !publicClient) return
    const latestId = Number(nextPollId)
    if (latestId <= 0) return

    setIsLoadingPoll(true)
    const targetPollId = latestId - 1
    publicClient
      .readContract({
        address: MACI_V2_ADDRESS,
        abi: MACI_ABI,
        functionName: 'polls',
        args: [BigInt(targetPollId)],
      })
      .then((addr) => {
        const pollAddr = addr as `0x${string}`
        if (pollAddr && pollAddr !== ZERO_ADDRESS) {
          setPollId(targetPollId)
          setPollAddress(pollAddr)
          localStorage.setItem('maci-last-poll-id', targetPollId.toString())
          localStorage.setItem('maci-last-poll-addr', pollAddr)
          const title = localStorage.getItem(`maci-poll-title-${targetPollId}`)
          if (title) setPollTitle(title)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingPoll(false))
  }, [nextPollId, publicClient])

  // Determine phase from poll state
  useEffect(() => {
    if (!pollAddress || !publicClient) return

    const checkPhase = async () => {
      try {
        const isOpen = await publicClient.readContract({
          address: pollAddress,
          abi: POLL_ABI,
          functionName: 'isVotingOpen',
        })
        if (isOpen) {
          setPhase(V2Phase.Voting)
          return
        }

        const stateMerged = await publicClient.readContract({
          address: pollAddress,
          abi: POLL_ABI,
          functionName: 'stateAqMerged',
        })
        const msgMerged = await publicClient.readContract({
          address: pollAddress,
          abi: POLL_ABI,
          functionName: 'messageAqMerged',
        })

        if (!stateMerged || !msgMerged) {
          setPhase(V2Phase.Merging)
          return
        }

        setPhase(V2Phase.Processing)
      } catch {
        // Poll might not exist yet or read failed
      }
    }

    checkPhase()
    const interval = setInterval(checkPhase, 15000)
    return () => clearInterval(interval)
  }, [pollAddress, publicClient])

  // === SignUp ===
  const handleSignUp = useCallback(async () => {
    if (!address) return
    setError(null)
    setIsSigningUp(true)

    try {
      const { generateRandomPrivateKey, derivePublicKey } = await import('../crypto')
      const sk = await generateRandomPrivateKey()
      const pk = await derivePublicKey(sk)

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

      const { storeEncrypted } = await import('../crypto/keyStore')
      localStorage.setItem(`maci-signup-${address}`, 'true')
      await storeEncrypted(`maci-sk-${address}`, sk.toString(), address)
      localStorage.setItem(`maci-pk-${address}`, JSON.stringify([pk[0].toString(), pk[1].toString()]))

      setSignedUp(true)
      setTxHash(hash)
      refetchSignUps()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('insufficient funds') || msg.includes('gas')) {
        setError(t.voteForm.errorGas)
      } else if (msg.includes('rejected') || msg.includes('denied')) {
        setError(t.voteForm.errorRejected)
      } else {
        setError(t.maci.signup.error)
      }
    } finally {
      setIsSigningUp(false)
    }
  }, [address, writeContractAsync, refetchSignUps, publicClient, t])

  // === Poll created handler ===
  const handlePollCreated = useCallback((newPollId: number, newPollAddress: `0x${string}`, title?: string) => {
    setPollId(newPollId)
    setPollAddress(newPollAddress)
    setShowCreatePoll(false)
    if (title) setPollTitle(title)
  }, [])

  // === Stepper labels (3 steps) ===
  const steps = [
    t.maci.stepper.register,
    t.maci.stepper.vote,
    t.maci.stepper.result,
  ]

  // === Not configured ===
  if (!isConfigured) {
    return (
      <div className="maci-voting-demo">
        <div className="brutalist-card">
          <h2>{t.maci.title} - {t.maci.notDeployed}</h2>
          <p>{t.maci.notDeployedDesc}</p>
          <code className="deploy-cmd">
            forge script script/DeployMACI.s.sol --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast
          </code>
          <p>{t.maci.notDeployedHint}</p>
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
        <h2>{t.maci.title}</h2>
        <p className="maci-description">{t.maci.description}</p>

        {/* Stepper - 3 steps */}
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

        {error && <div className="error-banner" role="alert">{error}</div>}
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

        {/* Step 0: Register */}
        <section
          className={`step-card ${currentStep === 0 ? 'active' : currentStep > 0 ? 'complete' : 'pending'}`}
          aria-label={t.maci.stepper.register}
        >
          {currentStep > 0 ? (
            <div className="step-summary">
              <span className="step-check" aria-hidden="true">&#10003;</span> {t.maci.signup.complete}
            </div>
          ) : (
            <div className="step-content">
              <button
                onClick={handleSignUp}
                disabled={isSigningUp || isPending}
                className="brutalist-btn"
                aria-busy={isSigningUp}
              >
                {isSigningUp ? t.maci.signup.loading : t.maci.signup.button}
              </button>
            </div>
          )}
        </section>

        {/* Step 1: Vote (+ optional poll creation) */}
        {currentStep >= 1 && (
          <section
            className={`step-card ${currentStep === 1 ? 'active' : 'complete'}`}
            aria-label={t.maci.stepper.vote}
          >
            {currentStep === 1 ? (
              <div className="step-content">
                {isLoadingPoll ? (
                  <div className="loading-spinner" role="status" aria-busy="true">
                    <span className="spinner" aria-hidden="true" />
                    <span>{t.maci.waiting.processing}</span>
                  </div>
                ) : hasPoll && phase === V2Phase.Voting ? (
                  <>
                    {/* Poll info card */}
                    <div className="poll-info-card">
                      <div className="poll-info-header">
                        <span className="step-check" aria-hidden="true">&#10003;</span>
                        <span className="poll-title">
                          {pollTitle || `${t.maci.poll.active.replace('{id}', String(pollId))}`}
                        </span>
                        <span className="poll-addr">({pollAddress!.slice(0, 8)}...{pollAddress!.slice(-6)})</span>
                      </div>
                      <PollTimer pollAddress={pollAddress!} />
                    </div>
                    <VoteFormV2
                      pollId={pollId!}
                      pollAddress={pollAddress!}
                      coordinatorPubKeyX={coordPubKeyX}
                      coordinatorPubKeyY={coordPubKeyY}
                      voiceCredits={voiceCredits}
                      onVoteSubmitted={() => setTxHash(null)}
                    />
                    <KeyManager
                      pollId={pollId!}
                      coordinatorPubKeyX={coordPubKeyX}
                      coordinatorPubKeyY={coordPubKeyY}
                      pollAddress={pollAddress!}
                    />
                  </>
                ) : (
                  <>
                    <div className="no-poll-notice">
                      <p>{t.maci.stats.currentPoll}: {t.maci.stats.none}</p>
                      {!showCreatePoll ? (
                        <button
                          onClick={() => setShowCreatePoll(true)}
                          className="brutalist-btn"
                        >
                          {t.createPoll.title}
                        </button>
                      ) : (
                        <CreatePollForm onPollCreated={handlePollCreated} />
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="step-summary">
                <span className="step-check" aria-hidden="true">&#10003;</span> {t.maci.waiting.merging}
              </div>
            )}
          </section>
        )}

        {/* Step 2: Results */}
        {currentStep >= 2 && (
          <section className="step-card active" aria-label={t.maci.stepper.result}>
            <div className="step-content">
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
