/**
 * MACIVotingDemo - Integrated MACI V2 Voting UI
 *
 * Stepper + Accordion layout:
 *   Step 0: Register (SignUp)
 *   Step 1: Create Proposal (CreatePollForm)
 *   Step 2: Vote (VoteFormV2 + KeyManager)
 *   Step 3: Result (Merging / Processing / Finalized)
 *
 * Only the current step is expanded. Completed steps show a summary.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MACI_ABI,
  POLL_ABI,
  V2Phase,
} from '../contractV2'
import { CreatePollForm } from './CreatePollForm'
import { VoteFormV2 } from './voting/VoteFormV2'
import { MergingStatus } from './voting/MergingStatus'
import { ProcessingStatus } from './voting/ProcessingStatus'
import { KeyManager } from './voting/KeyManager'
import { useTranslation } from '../i18n'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const COORD_PUB_KEY_X = 111n
const COORD_PUB_KEY_Y = 222n

export function MACIVotingDemo() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const { t } = useTranslation()

  const [phase, setPhase] = useState<V2Phase>(V2Phase.Voting)
  const [signedUp, setSignedUp] = useState(false)
  const [pollId, setPollId] = useState<number | null>(null)
  const [pollAddress, setPollAddress] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [isSigningUp, setIsSigningUp] = useState(false)

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS

  // Current step: 0=Register, 1=CreatePoll, 2=Vote, 3=Result
  const currentStep = !signedUp ? 0 : pollId === null ? 1 : phase === V2Phase.Voting ? 2 : 3

  // Voting mode for current poll (set at poll creation)
  const votingMode = pollId !== null
    ? (localStorage.getItem(`maci-poll-mode-${pollId}`) || 'd1') as 'd1' | 'd2'
    : 'd1'

  // Read numSignUps from MACI
  const { data: numSignUps, refetch: refetchSignUps } = useReadContract({
    address: MACI_V2_ADDRESS as `0x${string}`,
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

  // Load last poll from localStorage
  useEffect(() => {
    const storedPollId = localStorage.getItem('maci-last-poll-id')
    const storedPollAddr = localStorage.getItem('maci-last-poll-addr')
    if (storedPollId) setPollId(parseInt(storedPollId, 10))
    if (storedPollAddr) setPollAddress(storedPollAddr as `0x${string}`)
  }, [])

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
        address: MACI_V2_ADDRESS as `0x${string}`,
        abi: MACI_ABI,
        functionName: 'signUp',
        args: [pk[0], pk[1], '0x', '0x'],
      })

      localStorage.setItem(`maci-signup-${address}`, 'true')
      localStorage.setItem(`maci-sk-${address}`, sk.toString())
      localStorage.setItem(`maci-pk-${address}`, JSON.stringify([pk[0].toString(), pk[1].toString()]))

      setSignedUp(true)
      setTxHash(hash)
      refetchSignUps()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SignUp failed')
    } finally {
      setIsSigningUp(false)
    }
  }, [address, writeContractAsync, refetchSignUps])

  // === Poll created handler ===
  const handlePollCreated = useCallback((newPollId: number, newPollAddress: `0x${string}`) => {
    setPollId(newPollId)
    setPollAddress(newPollAddress)
  }, [])

  // === Stepper labels ===
  const steps = [
    t.maci.stepper.register,
    t.maci.stepper.createPoll,
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

        {/* Stepper - progress indicator */}
        <div className="stepper">
          {steps.map((label, i) => (
            <div key={i} className="stepper-item-wrapper">
              <div
                className={`stepper-item ${
                  i < currentStep ? 'complete' : i === currentStep ? 'active' : 'pending'
                }`}
              >
                <div className="stepper-circle">
                  {i < currentStep ? (
                    <span className="material-symbols-outlined stepper-check">check</span>
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span className="stepper-label">{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`stepper-line ${i < currentStep ? 'complete' : ''}`} />
              )}
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="maci-stats">
          <div className="stat">
            <span className="stat-label">{t.maci.stats.registered}</span>
            <span className="stat-value">{numSignUps?.toString() || '0'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">{t.maci.stats.currentPoll}</span>
            <span className="stat-value">{pollId !== null ? `#${pollId}` : t.maci.stats.none}</span>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {txHash && (
          <div className="tx-banner">
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

        {/* === Step Cards (Accordion) === */}

        {/* Step 0: Register */}
        <section className={`step-card ${currentStep === 0 ? 'active' : currentStep > 0 ? 'complete' : 'pending'}`}>
          {currentStep > 0 ? (
            <div className="step-summary">
              <span className="step-check">&#10003;</span> {t.maci.signup.complete}
            </div>
          ) : (
            <div className="step-content">
              <button
                onClick={handleSignUp}
                disabled={isSigningUp || isPending}
                className="brutalist-btn"
              >
                {isSigningUp ? t.maci.signup.loading : t.maci.signup.button}
              </button>
            </div>
          )}
        </section>

        {/* Step 1: Create Proposal */}
        {currentStep >= 1 && (
          <section className={`step-card ${currentStep === 1 ? 'active' : currentStep > 1 ? 'complete' : 'pending'}`}>
            {currentStep > 1 ? (
              <div className="step-summary">
                <span className="step-check">&#10003;</span>{' '}
                {t.maci.poll.active.replace('{id}', String(pollId))}
                {pollAddress && (
                  <span className="poll-addr"> ({pollAddress.slice(0, 8)}...{pollAddress.slice(-6)})</span>
                )}
              </div>
            ) : (
              <div className="step-content">
                <CreatePollForm onPollCreated={handlePollCreated} />
              </div>
            )}
          </section>
        )}

        {/* Step 2: Vote */}
        {currentStep >= 2 && (
          <section className={`step-card ${currentStep === 2 ? 'active' : 'complete'}`}>
            {currentStep === 2 && pollAddress ? (
              <div className="step-content">
                <div className="vote-mode-badge">
                  {votingMode === 'd1' ? t.voteForm.modeD1Label : t.voteForm.modeD2Label}
                </div>
                <VoteFormV2
                  pollId={pollId!}
                  isD2={votingMode === 'd2'}
                  coordinatorPubKeyX={COORD_PUB_KEY_X}
                  coordinatorPubKeyY={COORD_PUB_KEY_Y}
                  onVoteSubmitted={() => setTxHash(null)}
                />
                <KeyManager
                  pollId={pollId!}
                  coordinatorPubKeyX={COORD_PUB_KEY_X}
                  coordinatorPubKeyY={COORD_PUB_KEY_Y}
                  pollAddress={pollAddress}
                />
              </div>
            ) : (
              <div className="step-summary">
                <span className="step-check">&#10003;</span> {t.maci.waiting.merging}
              </div>
            )}
          </section>
        )}

        {/* Step 3: Results */}
        {currentStep >= 3 && (
          <section className="step-card active">
            <div className="step-content">
              {phase === V2Phase.Merging && pollAddress && (
                <MergingStatus pollAddress={pollAddress} />
              )}
              {phase === V2Phase.Processing && <ProcessingStatus />}
              {phase === V2Phase.Finalized && (
                <>
                  <h3>{t.maci.results.title}</h3>
                  <p>{t.maci.results.desc}</p>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
