'use client'

/**
 * useDeployPollLogs - Shared DeployPoll event log fetcher
 *
 * Both usePollData and useVotingPhase need DeployPoll logs.
 * This hook caches the result in a module-level map keyed by
 * (chainId, MACI_V2_ADDRESS) so duplicate RPC calls are avoided.
 */

import { useState, useEffect, useRef } from 'react'
import type { PublicClient } from 'viem'
import { MACI_V2_ADDRESS, MACI_DEPLOY_BLOCK } from '../contractV2'
import { getLogsChunked } from '../utils/viemLogs'

export interface DeployPollLogEntry {
  pollId: number
  pollAddr: `0x${string}`
  messageProcessorAddr: `0x${string}`
  tallyAddr: `0x${string}`
}

const DEPLOY_POLL_EVENT = {
  type: 'event' as const,
  name: 'DeployPoll' as const,
  inputs: [
    { name: 'pollId', type: 'uint256', indexed: true },
    { name: 'pollAddr', type: 'address', indexed: false },
    { name: 'messageProcessorAddr', type: 'address', indexed: false },
    { name: 'tallyAddr', type: 'address', indexed: false },
  ],
}

// Module-level cache: promise + resolved entries
let cachedPromise: Promise<DeployPollLogEntry[]> | null = null
let cachedEntries: DeployPollLogEntry[] | null = null
let cacheKey: string | null = null

function getCacheKey(client: PublicClient): string {
  return `${client.chain?.id ?? 0}:${MACI_V2_ADDRESS}`
}

function fetchLogs(client: PublicClient): Promise<DeployPollLogEntry[]> {
  const key = getCacheKey(client)
  if (cachedPromise && cacheKey === key) return cachedPromise

  cacheKey = key
  cachedPromise = getLogsChunked(
    client,
    { address: MACI_V2_ADDRESS, event: DEPLOY_POLL_EVENT },
    MACI_DEPLOY_BLOCK,
    'latest',
  ).then(logs => {
    const entries: DeployPollLogEntry[] = []
    for (const log of logs) {
      const args = (log as unknown as {
        args: {
          pollId?: bigint
          pollAddr?: `0x${string}`
          messageProcessorAddr?: `0x${string}`
          tallyAddr?: `0x${string}`
        }
      }).args
      if (args.pollId !== undefined) {
        entries.push({
          pollId: Number(args.pollId),
          pollAddr: args.pollAddr!,
          messageProcessorAddr: args.messageProcessorAddr!,
          tallyAddr: args.tallyAddr!,
        })
      }
    }
    cachedEntries = entries
    return entries
  }).catch(err => {
    // Clear cache on failure so next call retries
    if (cacheKey === key) {
      cachedPromise = null
      cacheKey = null
    }
    throw err
  })

  return cachedPromise
}

/** Invalidate cache so the next call re-fetches from RPC */
export function invalidateDeployPollCache(): void {
  cachedPromise = null
  cachedEntries = null
  cacheKey = null
}

export function useDeployPollLogs(
  publicClient: PublicClient | undefined,
): { logs: DeployPollLogEntry[]; isLoading: boolean } {
  const [logs, setLogs] = useState<DeployPollLogEntry[]>(cachedEntries ?? [])
  const [isLoading, setIsLoading] = useState(cachedEntries === null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!publicClient) return

    // If we already have cached entries for this key, use them immediately
    if (cachedEntries && cacheKey === getCacheKey(publicClient)) {
      setLogs(cachedEntries)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    fetchLogs(publicClient)
      .then(entries => {
        if (mountedRef.current) {
          setLogs(entries)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setIsLoading(false)
        }
      })
  }, [publicClient])

  return { logs, isLoading }
}
