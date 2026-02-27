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
import { POLL_ABI, TALLY_ABI, V2Phase } from '../contractV2'
import { storageKey } from '../storageKeys'
import { FAIL_THRESHOLD_S } from '../constants/voting'
import { useDeployPollLogs } from './useDeployPollLogs'

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

  // Shared DeployPoll log cache (use ref to avoid re-creating checkPhase on every update)
  const { logs: deployPollLogs } = useDeployPollLogs(publicClient)
  const deployPollLogsRef = useRef(deployPollLogs)
  deployPollLogsRef.current = deployPollLogs
  // Caches last known endTime so FAIL_THRESHOLD works even when deployTimeAndDuration call
  // temporarily fails (network blip) or the contract is an older version.
  const endTimeRef = useRef<number | null>(null)
  // Tracks when we first detected the poll is stuck (merged but not finalized, no timing data).
  const stuckDetectedRef = useRef<number | null>(null)

  // Reset phase state when switching polls
  useEffect(() => {
    setPhase(V2Phase.Voting)
    setPhaseLoaded(false)
    setPollDeployTime(null)
    setVotingEndTime(null)
    endTimeRef.current = null
    stuckDetectedRef.current = null
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
        const endTime = Number(deployTime) + Number(duration)
        setPollDeployTime(Number(deployTime))
        setVotingEndTime(endTime)
        endTimeRef.current = endTime  // cache for FAIL_THRESHOLD fallback
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
          // Fallback: look up from shared DeployPoll log cache
          const entry = deployPollLogsRef.current.find(e => e.pollId === pollId)
          if (entry) {
            if (entry.tallyAddr) {
              checkTallyAddr = entry.tallyAddr
              setTallyAddress(a => a ?? entry.tallyAddr)
              localStorage.setItem(storageKey.pollTitle(pollId) + ':tally', entry.tallyAddr)
            }
            if (entry.messageProcessorAddr) {
              setMessageProcessorAddress(a => a ?? entry.messageProcessorAddr)
              localStorage.setItem(storageKey.pollTitle(pollId) + ':mp', entry.messageProcessorAddr)
            }
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
      // endTimeRef is set above when deployTimeAndDuration succeeds; it also retains the last
      // successful value across calls so a single RPC blip doesn't clear it.
      const nowSec = Math.floor(Date.now() / 1000)
      if (endTimeRef.current !== null && nowSec - endTimeRef.current > FAIL_THRESHOLD_S) {
        setPhase(V2Phase.Failed)
        setPhaseLoaded(true)
        return
      }
      // Last resort: no timing data at all + poll is merged → wall-clock fallback
      if (endTimeRef.current === null && stateMerged && msgMerged) {
        if (stuckDetectedRef.current === null) {
          stuckDetectedRef.current = Date.now()
        } else if (Date.now() - stuckDetectedRef.current > FAIL_THRESHOLD_S * 1000) {
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
