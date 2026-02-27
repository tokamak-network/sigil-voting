'use client'

/**
 * usePollData - Poll address, title, addresses, credits, and coordinator keys
 *
 * Extracted from MACIVotingDemo. Loads poll data from the MACI contract
 * and caches tally/mp addresses in localStorage for the phase hook.
 *
 * Exposes setTallyAddress / setMessageProcessorAddress (stable React setState refs)
 * so the phase hook can update them when discovered mid-flow.
 */

import { useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useReadContract } from 'wagmi'
import type { PublicClient } from 'viem'
import {
  MACI_V2_ADDRESS,
  MACI_ABI,
  POLL_ABI,
  VOICE_CREDIT_PROXY_ADDRESS,
  VOICE_CREDIT_PROXY_ABI,
} from '../contractV2'
import { storageKey, parseOnChainTitle } from '../storageKeys'
import { useDeployPollLogs } from './useDeployPollLogs'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export interface UsePollDataResult {
  pollAddress: `0x${string}` | null
  pollTitle: string | null
  pollDescription: string | null
  tallyAddress: `0x${string}` | null
  setTallyAddress: Dispatch<SetStateAction<`0x${string}` | null>>
  messageProcessorAddress: `0x${string}` | null
  setMessageProcessorAddress: Dispatch<SetStateAction<`0x${string}` | null>>
  voiceCredits: number
  numMessages: number
  isLoadingPoll: boolean
}

export function usePollData(
  pollId: number,
  publicClient: PublicClient | undefined,
  isConfigured: boolean,
  address: string | undefined,
): UsePollDataResult {
  const [pollAddress, setPollAddress] = useState<`0x${string}` | null>(null)
  const [pollTitle, setPollTitle] = useState<string | null>(null)
  const [pollDescription, setPollDescription] = useState<string | null>(null)
  const [tallyAddress, setTallyAddress] = useState<`0x${string}` | null>(null)
  const [messageProcessorAddress, setMessageProcessorAddress] = useState<`0x${string}` | null>(null)
  const [isLoadingPoll, setIsLoadingPoll] = useState(true)

  // Shared DeployPoll log cache
  const { logs: deployPollLogs } = useDeployPollLogs(publicClient)

  // Reset when switching proposals
  useEffect(() => {
    setPollAddress(null)
    setPollTitle(null)
    setPollDescription(null)
    setTallyAddress(null)
    setMessageProcessorAddress(null)
    setIsLoadingPoll(true)
  }, [pollId])

  useEffect(() => {
    if (!publicClient || !isConfigured) return
    setIsLoadingPoll(true)
    let cancelled = false

    const loadPoll = async () => {
      try {
        const addr = await publicClient.readContract({
          address: MACI_V2_ADDRESS,
          abi: MACI_ABI,
          functionName: 'polls',
          args: [BigInt(pollId)],
        })

        if (cancelled) return
        const pollAddr = addr as `0x${string}`
        if (pollAddr && pollAddr !== ZERO_ADDRESS) {
          setPollAddress(pollAddr)

          try {
            const onChainTitle = await publicClient.readContract({
              address: pollAddr,
              abi: POLL_ABI,
              functionName: 'title',
            }) as string
            if (onChainTitle) {
              const parsed = parseOnChainTitle(onChainTitle)
              setPollTitle(parsed.title)
              localStorage.setItem(storageKey.pollTitle(pollId), parsed.title)
              if (parsed.description) {
                setPollDescription(parsed.description)
                localStorage.setItem(storageKey.pollDesc(pollId), parsed.description)
              }
            }
          } catch {
            const title = localStorage.getItem(storageKey.pollTitle(pollId))
            if (title) setPollTitle(title)
          }
        }

        // Description fallback (functional update to avoid stale closure)
        const desc = localStorage.getItem(storageKey.pollDesc(pollId))
        if (desc) setPollDescription(d => d ?? desc)

        // Discover tally/mp addresses from shared DeployPoll logs
        const entry = deployPollLogs.find(e => e.pollId === pollId)
        if (entry) {
          if (entry.tallyAddr) {
            setTallyAddress(entry.tallyAddr)
            localStorage.setItem(storageKey.pollTitle(pollId) + ':tally', entry.tallyAddr)
          }
          if (entry.messageProcessorAddr) {
            setMessageProcessorAddress(entry.messageProcessorAddr)
            localStorage.setItem(storageKey.pollTitle(pollId) + ':mp', entry.messageProcessorAddr)
          }
        }

        // Fallback: restore from localStorage if events returned nothing
        const cachedTally = localStorage.getItem(storageKey.pollTitle(pollId) + ':tally') as `0x${string}` | null
        if (cachedTally) setTallyAddress(a => a ?? cachedTally)
        const cachedMp = localStorage.getItem(storageKey.pollTitle(pollId) + ':mp') as `0x${string}` | null
        if (cachedMp) setMessageProcessorAddress(a => a ?? cachedMp)
      } catch {
        // Poll doesn't exist yet
      } finally {
        if (!cancelled) setIsLoadingPoll(false)
      }
    }

    loadPoll()
    return () => { cancelled = true }
  }, [pollId, publicClient, isConfigured, deployPollLogs])

  const hasPoll = pollAddress !== null

  const { data: voiceCreditsRaw } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: VOICE_CREDIT_PROXY_ABI,
    functionName: 'getVoiceCredits',
    args: address ? [address as `0x${string}`, '0x' as `0x${string}`] : undefined,
    query: {
      enabled: isConfigured && VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS && !!address,
      refetchInterval: 30000,
    },
  })
  const voiceCredits = voiceCreditsRaw !== undefined ? Number(voiceCreditsRaw) : 0

  const { data: numMessagesRaw } = useReadContract({
    address: pollAddress ?? ZERO_ADDRESS,
    abi: POLL_ABI,
    functionName: 'numMessages',
    query: { enabled: hasPoll, refetchInterval: 30000 },
  })
  const numMessages = numMessagesRaw !== undefined ? Number(numMessagesRaw) : 0

  return {
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
  }
}
