'use client'

/**
 * useDelegation - Delegation state and undelegate action
 *
 * Extracted from MACIVotingDemo to reduce component complexity.
 * Reads delegation registry, computes derived flags, handles undelegate tx.
 */

import { useState, useCallback } from 'react'
import { useAccount, useReadContract, usePublicClient } from 'wagmi'
import { writeContract } from '../writeHelper'
import {
  VOICE_CREDIT_PROXY_ADDRESS,
  DELEGATING_VOICE_CREDIT_PROXY_ABI,
  DELEGATION_REGISTRY_ADDRESS,
  DELEGATION_REGISTRY_ABI,
} from '../contractV2'
import { useTranslation } from '../i18n'
import { estimateGasWithBuffer } from '../utils/gas'
import { storageKey } from '../storageKeys'
import { TX_TIMEOUT_MS } from '../constants/voting'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`

export interface UseDelegationResult {
  isDelegationConfigured: boolean
  isDelegating: boolean | undefined
  delegateDisplay: string | null
  delegatorList: string[]
  delegationEffectNote: string
  isDelegationEffective: boolean
  isDelegationLocked: boolean
  isUndelegating: boolean
  delegationError: string | null
  delegationSuccess: boolean
  delegationTxHash: string | null
  handleUndelegate: () => Promise<void>
}

export function useDelegation(): UseDelegationResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { t } = useTranslation()

  const isDelegationConfigured = DELEGATION_REGISTRY_ADDRESS !== ZERO_ADDRESS

  const { data: proxyDelegationRegistry, isError: proxyDelegationError } = useReadContract({
    address: VOICE_CREDIT_PROXY_ADDRESS,
    abi: DELEGATING_VOICE_CREDIT_PROXY_ABI,
    functionName: 'delegationRegistry',
    query: { enabled: VOICE_CREDIT_PROXY_ADDRESS !== ZERO_ADDRESS },
  })
  const { data: currentDelegate, refetch: refetchDelegate } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'getDelegate',
    args: address ? [address] : undefined,
    query: { enabled: isDelegationConfigured && !!address },
  })
  const { data: isDelegating, refetch: refetchIsDelegating } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'isDelegating',
    args: address ? [address] : undefined,
    query: { enabled: isDelegationConfigured && !!address },
  })
  const { data: delegators, refetch: refetchDelegators } = useReadContract({
    address: DELEGATION_REGISTRY_ADDRESS,
    abi: DELEGATION_REGISTRY_ABI,
    functionName: 'getDelegators',
    args: address ? [address] : undefined,
    query: { enabled: isDelegationConfigured && !!address, refetchInterval: 4000 },
  })

  const delegatorList = Array.isArray(delegators) ? (delegators as string[]) : []
  const delegateDisplay =
    typeof currentDelegate === 'string' && currentDelegate !== ZERO_ADDRESS
      ? currentDelegate
      : null
  const delegationRegistryMatch =
    typeof proxyDelegationRegistry === 'string' &&
    proxyDelegationRegistry !== ZERO_ADDRESS &&
    proxyDelegationRegistry.toLowerCase() === DELEGATION_REGISTRY_ADDRESS.toLowerCase()
  const isDelegationEffective = isDelegationConfigured && !proxyDelegationError && delegationRegistryMatch
  const isDelegationLocked = Boolean(isDelegationEffective && isDelegating)
  const delegationEffectNote = isDelegationEffective
    ? t.governance.delegation.effectNote
    : t.governance.delegation.effectNoteLimited

  const [isUndelegating, setIsUndelegating] = useState(false)
  const [delegationError, setDelegationError] = useState<string | null>(null)
  const [delegationSuccess, setDelegationSuccess] = useState(false)
  const [delegationTxHash, setDelegationTxHash] = useState<string | null>(null)

  const handleUndelegate = useCallback(async () => {
    if (!address) {
      setDelegationError(t.maci.connectWallet)
      return
    }
    setDelegationError(null)
    setDelegationSuccess(false)
    setDelegationTxHash(null)
    try {
      setIsUndelegating(true)
      const gas = await estimateGasWithBuffer({
        publicClient,
        address: DELEGATION_REGISTRY_ADDRESS,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'undelegate',
        args: [],
        account: address as `0x${string}`,
        fallbackGas: 200_000n,
      })
      const hash = await writeContract({
        address: DELEGATION_REGISTRY_ADDRESS,
        abi: DELEGATION_REGISTRY_ABI,
        functionName: 'undelegate',
        args: [],
        gas,
        account: address as `0x${string}`,
      })
      setDelegationTxHash(hash)
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: TX_TIMEOUT_MS })
        if (receipt.status !== 'success') throw new Error('tx reverted')
      }
      await Promise.all([refetchDelegate(), refetchIsDelegating(), refetchDelegators()])
      localStorage.setItem(storageKey.delegationChangedAt(address), String(Date.now()))
      setDelegationSuccess(true)
    } catch {
      setDelegationError(t.governance.delegation.error)
    } finally {
      setIsUndelegating(false)
    }
  }, [address, publicClient, refetchDelegate, refetchIsDelegating, refetchDelegators, t])

  return {
    isDelegationConfigured,
    isDelegating: isDelegating as boolean | undefined,
    delegateDisplay,
    delegatorList,
    delegationEffectNote,
    isDelegationEffective,
    isDelegationLocked,
    isUndelegating,
    delegationError,
    delegationSuccess,
    delegationTxHash,
    handleUndelegate,
  }
}
