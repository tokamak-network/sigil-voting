'use client'

/**
 * useVotingPhase - Poll phase detection with auto-polling
 *
 * Extracted from MACIVotingDemo. Reads on-chain state to determine
 * which phase a poll is in (Voting / Merging / Processing / Finalized / Failed / NoVotes).
 *
 * Calls setTallyAddress / setMessageProcessorAddress when they are discovered
 * as a side-effect during phase detection (fallback discovery path).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PublicClient } from 'viem'
import { POLL_ABI, TALLY_ABI, MACI_V2_ADDRESS, MACI_DEPLOY_BLOCK, V2Phase } from '../contractV2'
import { getLogsChunked } from '../utils/viemLogs'
import { storageKey } from '../storageKeys'
import { FAIL_THRESHOLD_S } from '../constants/voting'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

interface UseVotingPhaseParams {
  pollAddress: `0x${string}` | null
  publicClient: PublicClient | undefined
  pollId: number
  isPollExpired: boolean
  phaseCheckTrigger: number
  tallyAddress: `0x${string}` | null
  setTallyAddress: Dispatch<SetStateAction<`0x${string}` | null>>
  setMessageProcessorAddress: Dispatch<SetStateAction<`0x${string}` | null>>
}

export interface UseVotingPhaseResult {
  phase: V2Phase
  phaseLoaded: boolean
  pollDeployTime: number | null
  votingEndTime: number | null
}

export function useVotingPhase({
  pollAddress,
  publicClient,
  pollId,
  isPollExpired,
  phaseCheckTrigger,
  tallyAddress,
  setTallyAddress,
  setMessageProcessorAddress,
}: UseVotingPhaseParams): UseVotingPhaseResult {
  const [phase, setPhase] = useState<V2Phase>(V2Phase.Voting)
  const [phaseLoaded, setPhaseLoaded] = useState(false)
  const [pollDeployTime, setPollDeployTime] = useState<number | null>(null)
  const [votingEndTime, setVotingEndTime] = useState<number | null>(null)
  const cancelledRef = useRef(false)

  // Reset phase state when switching polls
  useEffect(() => {
    setPhase(V2Phase.Voting)
    setPhaseLoaded(false)
    setPollDeployTime(null)
    setVotingEndTime(null)
  }, [pollId])

  const checkPhase = useCallback(async () => {
    if (!pollAddress || !publicClient) return

    try {
      const [isOpen, stateMerged, msgMerged, deployTimeAndDuration, numMessages] = await Promise.all([
        publicClient.readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'isVotingOpen' }),
        publicClient.readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'stateAqMerged' }),
        publicClient.readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'messageAqMerged' }),
        publicClient
          .readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'getDeployTimeAndDuration' })
          .catch(() => null),
        publicClient
          .readContract({ address: pollAddress, abi: POLL_ABI, functionName: 'numMessages' })
          .catch(() => 0n),
      ])

      if (cancelledRef.current) return

      if (deployTimeAndDuration) {
        const [deployTime, duration] = deployTimeAndDuration as [bigint, bigint]
        setPollDeployTime(Number(deployTime))
        setVotingEndTime(Number(deployTime) + Number(duration))
      }

      if (isOpen) {
        setPhase(isPollExpired ? V2Phase.Merging : V2Phase.Voting)
        setPhaseLoaded(true)
        return
      }

      if (Number(numMessages) === 0) {
        setPhase(V2Phase.NoVotes)
        setPhaseLoaded(true)
        return
      }

      // Resolve tally address if not yet known
      let checkTallyAddr = tallyAddress
      if (!checkTallyAddr || checkTallyAddr === ZERO_ADDRESS) {
        const cachedTally = localStorage.getItem(
          storageKey.pollTitle(pollId) + ':tally',
        ) as `0x${string}` | null
        if (cachedTally && cachedTally !== ZERO_ADDRESS) {
          checkTallyAddr = cachedTally
          setTallyAddress(a => a ?? cachedTally)
        } else {
          // Fallback: query DeployPoll events
          try {
            const deployLogs = await getLogsChunked(
              publicClient,
              {
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
              },
              MACI_DEPLOY_BLOCK,
              'latest',
            )
            for (const dl of deployLogs) {
              const dArgs = (dl as unknown as {
                args: {
                  pollId?: bigint
                  tallyAddr?: `0x${string}`
                  messageProcessorAddr?: `0x${string}`
                }
              }).args
              if (dArgs.pollId !== undefined && Number(dArgs.pollId) === pollId) {
                if (dArgs.tallyAddr) {
                  checkTallyAddr = dArgs.tallyAddr
                  setTallyAddress(a => a ?? dArgs.tallyAddr!)
                  localStorage.setItem(storageKey.pollTitle(pollId) + ':tally', dArgs.tallyAddr)
                }
                if (dArgs.messageProcessorAddr) {
                  setMessageProcessorAddress(a => a ?? dArgs.messageProcessorAddr!)
                  localStorage.setItem(storageKey.pollTitle(pollId) + ':mp', dArgs.messageProcessorAddr)
                }
                break
              }
            }
          } catch (e) {
            if (process.env.NODE_ENV === 'development') console.warn('[checkPhase] getLogs failed:', e)
          }
        }
      }

      // Check if tally is verified (Finalized)
      if (checkTallyAddr && checkTallyAddr !== ZERO_ADDRESS) {
        try {
          const verified = await publicClient.readContract({
            address: checkTallyAddr,
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
        const endTime = Number(deployTime) + Number(duration)
        if (Math.floor(Date.now() / 1000) - endTime > FAIL_THRESHOLD_S) {
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
      setPhaseLoaded(true)
    }
  }, [pollAddress, publicClient, tallyAddress, setTallyAddress, setMessageProcessorAddress, pollId, isPollExpired])

  useEffect(() => {
    if (!pollAddress || !publicClient) return

    cancelledRef.current = false
    checkPhase()
    if (phase === V2Phase.Finalized) return

    const ms = phase === V2Phase.Voting ? 5000 : 8000
    const interval = setInterval(checkPhase, ms)
    return () => {
      cancelledRef.current = true
      clearInterval(interval)
    }
  }, [pollAddress, publicClient, phase, phaseCheckTrigger, checkPhase])

  return { phase, phaseLoaded, pollDeployTime, votingEndTime }
}
