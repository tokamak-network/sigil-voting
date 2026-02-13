/**
 * MACIVotingDemo - Integrated MACI V2 Voting UI
 *
 * Full flow: SignUp → Deploy Poll → Vote → Phase Status
 * Uses MACI contract for registration, Poll for encrypted voting.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import {
  MACI_V2_ADDRESS,
  MOCK_VERIFIER_ADDRESS,
  VK_REGISTRY_ADDRESS,
  MACI_ABI,
  POLL_ABI,
  V2Phase,
} from '../contractV2'
import { VoteFormV2 } from './voting/VoteFormV2'
import { MergingStatus } from './voting/MergingStatus'
import { ProcessingStatus } from './voting/ProcessingStatus'
import { KeyManager } from './voting/KeyManager'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// Coordinator keys (demo placeholder)
const COORD_PUB_KEY_X = 111n
const COORD_PUB_KEY_Y = 222n

export function MACIVotingDemo() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()

  const [phase, setPhase] = useState<V2Phase>(V2Phase.Voting)
  const [signedUp, setSignedUp] = useState(false)
  const [pollId, setPollId] = useState<number | null>(null)
  const [pollAddress, setPollAddress] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [isDeployingPoll, setIsDeployingPoll] = useState(false)

  const isConfigured = MACI_V2_ADDRESS !== ZERO_ADDRESS

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

        // If merged, check processing/tally (simplified — these are dynamic addresses)
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
      // Generate EdDSA key pair
      const { generateRandomPrivateKey, derivePublicKey } = await import('../crypto')
      const sk = await generateRandomPrivateKey()
      const pk = await derivePublicKey(sk)

      const hash = await writeContractAsync({
        address: MACI_V2_ADDRESS as `0x${string}`,
        abi: MACI_ABI,
        functionName: 'signUp',
        args: [pk[0], pk[1], '0x', '0x'],
      })

      // Store keys locally
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

  // === Deploy Poll ===
  const handleDeployPoll = useCallback(async () => {
    if (!address) return
    setError(null)
    setIsDeployingPoll(true)

    try {
      const hash = await writeContractAsync({
        address: MACI_V2_ADDRESS as `0x${string}`,
        abi: MACI_ABI,
        functionName: 'deployPoll',
        args: [
          'Demo Poll',
          BigInt(3600), // 1 hour duration
          COORD_PUB_KEY_X,
          COORD_PUB_KEY_Y,
          MOCK_VERIFIER_ADDRESS as `0x${string}`,
          VK_REGISTRY_ADDRESS as `0x${string}`,
          10, // messageTreeDepth
        ],
      })

      setTxHash(hash)

      // Wait for tx and parse PollDeployed event
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        // Find DeployPoll event log
        for (const log of receipt.logs) {
          // DeployPoll(uint256 indexed pollId, address pollAddr, address messageProcessorAddr, address tallyAddr)
          if (log.topics.length >= 2) {
            const newPollId = parseInt(log.topics[1] as string, 16)
            // pollAddr is in log data (first 32 bytes, address is last 20)
            if (log.data && log.data.length >= 66) {
              const pollAddr = ('0x' + log.data.slice(26, 66)) as `0x${string}`
              setPollId(newPollId)
              setPollAddress(pollAddr)
              localStorage.setItem('maci-last-poll-id', newPollId.toString())
              localStorage.setItem('maci-last-poll-addr', pollAddr)
            }
            break
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy Poll failed')
    } finally {
      setIsDeployingPoll(false)
    }
  }, [address, writeContractAsync, publicClient])

  // === Render ===

  if (!isConfigured) {
    return (
      <div className="maci-voting-demo">
        <div className="brutalist-card">
          <h2>MACI V2 - Not Deployed</h2>
          <p>
            MACI V2 contracts have not been deployed yet. Run the deploy script:
          </p>
          <code className="deploy-cmd">
            forge script script/DeployMACI.s.sol --rpc-url $SEPOLIA_RPC_URL --private-key $PRIVATE_KEY --broadcast
          </code>
          <p>Then update <code>src/config.json</code> with the deployed addresses.</p>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="maci-voting-demo">
        <div className="brutalist-card">
          <h2>MACI V2 - Anti-Collusion Voting</h2>
          <p>Connect your wallet to participate in MACI voting.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="maci-voting-demo">
      <div className="brutalist-card">
        <h2>MACI V2 - Anti-Collusion Voting</h2>
        <p className="maci-description">
          Minimal Anti-Collusion Infrastructure. Votes are encrypted and cannot be
          revealed. Key changes invalidate previous votes, preventing coercion.
        </p>

        {/* Phase Indicator */}
        <div className="phase-bar">
          {Object.values(V2Phase).map((p) => (
            <div
              key={p}
              className={`phase-step ${phase === p ? 'active' : ''} ${
                Object.values(V2Phase).indexOf(p) < Object.values(V2Phase).indexOf(phase)
                  ? 'complete'
                  : ''
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="maci-stats">
          <div className="stat">
            <span className="stat-label">Registered Voters</span>
            <span className="stat-value">{numSignUps?.toString() || '0'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Current Poll</span>
            <span className="stat-value">{pollId !== null ? `#${pollId}` : 'None'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Phase</span>
            <span className="stat-value">{phase}</span>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {txHash && (
          <div className="tx-banner">
            Last Tx:{' '}
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </a>
          </div>
        )}

        {/* Step 1: SignUp */}
        <section className="maci-section">
          <h3>1. Register (SignUp)</h3>
          {signedUp ? (
            <div className="step-complete">
              Registered with EdDSA key
            </div>
          ) : (
            <button
              onClick={handleSignUp}
              disabled={isSigningUp || isPending}
              className="brutalist-btn"
            >
              {isSigningUp ? 'Generating Key & Signing Up...' : 'Sign Up with EdDSA Key'}
            </button>
          )}
        </section>

        {/* Step 2: Deploy Poll */}
        <section className="maci-section">
          <h3>2. Create Poll</h3>
          {pollId !== null ? (
            <div className="step-complete">
              Poll #{pollId} active
              {pollAddress && (
                <span className="poll-addr"> ({pollAddress.slice(0, 8)}...{pollAddress.slice(-6)})</span>
              )}
            </div>
          ) : (
            <button
              onClick={handleDeployPoll}
              disabled={!signedUp || isDeployingPoll || isPending}
              className="brutalist-btn"
            >
              {isDeployingPoll ? 'Deploying Poll...' : 'Deploy New Poll (1 hour)'}
            </button>
          )}
        </section>

        {/* Step 3: Vote (only during Voting phase) */}
        {pollId !== null && phase === V2Phase.Voting && pollAddress && (
          <section className="maci-section">
            <h3>3. Cast Vote</h3>
            <VoteFormV2
              pollId={pollId}
              coordinatorPubKeyX={COORD_PUB_KEY_X}
              coordinatorPubKeyY={COORD_PUB_KEY_Y}
              onVoteSubmitted={() => setTxHash(null)}
            />
          </section>
        )}

        {/* Key Management (during Voting) */}
        {pollId !== null && phase === V2Phase.Voting && pollAddress && (
          <section className="maci-section">
            <KeyManager
              pollId={pollId}
              coordinatorPubKeyX={COORD_PUB_KEY_X}
              coordinatorPubKeyY={COORD_PUB_KEY_Y}
              pollAddress={pollAddress}
            />
          </section>
        )}

        {/* Merging Phase */}
        {pollAddress && phase === V2Phase.Merging && (
          <section className="maci-section">
            <MergingStatus pollAddress={pollAddress} />
          </section>
        )}

        {/* Processing Phase */}
        {phase === V2Phase.Processing && (
          <section className="maci-section">
            <ProcessingStatus />
          </section>
        )}

        {/* Finalized */}
        {phase === V2Phase.Finalized && (
          <section className="maci-section">
            <h3>Results Finalized</h3>
            <p>Vote tallying is complete. Results have been verified on-chain.</p>
          </section>
        )}
      </div>
    </div>
  )
}
